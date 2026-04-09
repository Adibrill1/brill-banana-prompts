const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function ghGet(token, filePath) {
  return new Promise(function(resolve) {
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
    var req = https.request(opts, function(r) {
      var chunks = [];
      r.on('data', function(c) { chunks.push(c); });
      r.on('end', function() {
        try { resolve({ status: r.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { resolve({ status: r.statusCode, data: {} }); }
      });
    });
    req.setTimeout(8000, function() { req.destroy(); resolve({ status: 0, data: {} }); });
    req.on('error', function() { resolve({ status: 0, data: {} }); });
    req.end();
  });
}

function ghPut(token, filePath, content, sha, message) {
  return new Promise(function(resolve) {
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
    var req = https.request(opts, function(r) {
      var chunks = [];
      r.on('data', function(c) { chunks.push(c); });
      r.on('end', function() {
        try { resolve({ status: r.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch(e) { resolve({ status: r.statusCode, data: {} }); }
      });
    });
    req.setTimeout(8000, function() { req.destroy(); resolve({ status: 0, data: {} }); });
    req.on('error', function() { resolve({ status: 0, data: {} }); });
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });

  // Hard timeout at 8s (Vercel Hobby limit is 10s)
  let done = false;
  const hard = setTimeout(function() {
    if (!done) { done = true; res.status(504).json({ error: 'timeout - retry' }); }
  }, 8000);

  try {
    var body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || !body.state) {
      clearTimeout(hard); done = true;
      return res.status(400).json({ error: 'missing state' });
    }
    var newState = JSON.parse(JSON.stringify(body.state));

    // Helper: upload one base64 image, return the /images/ path
    async function uploadImg(key, src) {
      var m = src.match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!m) return src;
      var ext     = m[1] === 'jpeg' ? 'jpg' : m[1];
      var imgPath = 'images/custom_' + key.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
      var existing = await ghGet(token, imgPath);
      var sha      = existing.status === 200 ? existing.data.sha : undefined;
      var putRes   = await ghPut(token, imgPath, m[2], sha, 'Upload image ' + key);
      return (putRes.status === 200 || putRes.status === 201)
        ? '/images/' + imgPath.split('/').pop()
        : src;
    }

    // Upload base64 images from customImgs
    var imgKeys = Object.keys(newState.customImgs || {}).filter(function(k) {
      return (newState.customImgs[k] || '').startsWith('data:');
    });
    await Promise.all(imgKeys.map(async function(key) {
      newState.customImgs[key] = await uploadImg(key, newState.customImgs[key]);
    }));

    // Upload base64 images from added items (prevents state.json from growing huge)
    for (var addedItem of (newState.added || [])) {
      if (!addedItem.images) continue;
      addedItem.images = await Promise.all(addedItem.images.map(function(imgSrc, idx) {
        if (!imgSrc || !imgSrc.startsWith('data:')) return imgSrc;
        return uploadImg((addedItem.key || 'added') + '_img' + idx, imgSrc);
      }));
    }

    // Save state.json
    var stateContent = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    var existing2    = await ghGet(token, 'state.json');
    var sha2         = existing2.status === 200 ? existing2.data.sha : undefined;
    var result       = await ghPut(token, 'state.json', stateContent, sha2, 'Update state');

    // Retry once on 409 (stale SHA from concurrent save)
    if (result.status === 409) {
      var fresh = await ghGet(token, 'state.json');
      var sha3  = fresh.status === 200 ? fresh.data.sha : undefined;
      result    = await ghPut(token, 'state.json', stateContent, sha3, 'Update state');
    }

    if (done) return;
    clearTimeout(hard); done = true;

    if (result.status !== 200 && result.status !== 201) {
      return res.status(500).json({ error: 'GitHub ' + result.status + ': ' + JSON.stringify(result.data).substring(0, 200) });
    }
    res.status(200).json({ ok: true, state: newState });
  } catch(e) {
    if (!done) { clearTimeout(hard); done = true; res.status(500).json({ error: e.message }); }
  }
};
