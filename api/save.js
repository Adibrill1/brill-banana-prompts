const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function ghGet(token, filePath) {
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: 'api.github.com',
      port: 443,
      path: '/repos/' + owner + '/' + repo + '/contents/' + filePath,
      method: 'GET',
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'brill-banana/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    var req = https.request(opts, function(res2) {
      var chunks = [];
      res2.on('data', function(c) { chunks.push(c); });
      res2.on('end', function() {
        try { resolve({ status: res2.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { resolve({ status: res2.statusCode, data: {} }); }
      });
      res2.on('error', function() { resolve({ status: 0, data: {} }); });
    });
    req.setTimeout(7000, function() { req.destroy(new Error('GitHub GET timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function ghPut(token, filePath, content, sha, message) {
  return new Promise(function(resolve, reject) {
    var bodyObj = { message: message, content: content };
    if (sha) bodyObj.sha = sha;
    var bodyStr = JSON.stringify(bodyObj);
    var opts = {
      hostname: 'api.github.com',
      port: 443,
      path: '/repos/' + owner + '/' + repo + '/contents/' + filePath,
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'brill-banana/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    var req = https.request(opts, function(res2) {
      var chunks = [];
      res2.on('data', function(c) { chunks.push(c); });
      res2.on('end', function() {
        try { resolve({ status: res2.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { resolve({ status: res2.statusCode, data: {} }); }
      });
      res2.on('error', function() { resolve({ status: 0, data: {} }); });
    });
    req.setTimeout(7000, function() { req.destroy(new Error('GitHub PUT timeout')); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  console.log('[save] invoked method=' + req.method + ' time=' + new Date().toISOString());
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });

  // Hard safety net: always respond before Vercel's function timeout kills us silently
  let responded = false;
  const hardTimeout = setTimeout(function() {
    if (!responded) {
      responded = true;
      console.log('[save] hard timeout fired');
      res.status(504).json({ error: 'timeout - please try again' });
    }
  }, 25000);

  try {
    var body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || !body.state) {
      clearTimeout(hardTimeout); responded = true;
      return res.status(400).json({ error: 'missing state' });
    }
    var newState = JSON.parse(JSON.stringify(body.state));

    // Upload any base64 images as files
    for (var key of Object.keys(newState.customImgs || {})) {
      var src = newState.customImgs[key];
      if (!src || !src.startsWith('data:')) continue;
      var m = src.match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!m) continue;
      var ext     = m[1] === 'jpeg' ? 'jpg' : m[1];
      var imgPath = 'images/custom_' + key.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
      var existing = await ghGet(token, imgPath);
      var sha      = existing.status === 200 ? existing.data.sha : undefined;
      var putRes   = await ghPut(token, imgPath, m[2], sha, 'Upload image ' + key);
      if (putRes.status === 200 || putRes.status === 201) {
        newState.customImgs[key] = '/images/' + imgPath.split('/').pop();
      }
    }

    // Save state.json
    var stateContent = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    var existing2    = await ghGet(token, 'state.json');
    var sha2         = existing2.status === 200 ? existing2.data.sha : undefined;
    var result       = await ghPut(token, 'state.json', stateContent, sha2, 'Update state');

    // Retry once on 409 conflict (concurrent save caused stale SHA)
    if (result.status === 409) {
      console.log('[save] 409 conflict, retrying with fresh SHA');
      existing2 = await ghGet(token, 'state.json');
      sha2      = existing2.status === 200 ? existing2.data.sha : undefined;
      result    = await ghPut(token, 'state.json', stateContent, sha2, 'Update state');
    }

    if (responded) return;
    clearTimeout(hardTimeout); responded = true;

    if (result.status !== 200 && result.status !== 201) {
      console.log('[save] GitHub error status=' + result.status);
      return res.status(500).json({ error: 'GitHub ' + result.status + ': ' + JSON.stringify(result.data).substring(0, 200) });
    }

    console.log('[save] success');
    res.status(200).json({ ok: true, state: newState });
  } catch(e) {
    console.error('[save] exception:', e.message);
    if (!responded) {
      clearTimeout(hardTimeout); responded = true;
      res.status(500).json({ error: e.message });
    }
  }
};
