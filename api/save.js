const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

function ghRequest(token, method, path, bodyObj) {
  return new Promise(function(resolve, reject) {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const opts = {
      hostname: 'api.github.com',
      port: 443,
      path: '/repos/' + owner + '/' + repo + '/contents/' + path,
      method: method,
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'brill-banana/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch(e) {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });
    req.setTimeout(10000, function() { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });

  try {
    const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newState = JSON.parse(JSON.stringify(body.state));

    // Upload any base64 images as separate files
    for (var key of Object.keys(newState.customImgs || {})) {
      var src = newState.customImgs[key];
      if (!src || !src.startsWith('data:')) continue;
      var m = src.match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!m) continue;
      var ext     = m[1] === 'jpeg' ? 'jpg' : m[1];
      var imgPath = 'images/custom_' + key.replace(/[^a-z0-9]/gi, '_') + '.' + ext;

      // Get SHA if exists
      var existing = await ghRequest(token, 'GET', imgPath, null);
      var sha      = existing.status === 200 ? existing.data.sha : undefined;

      var putBody  = { message: 'Upload image ' + key, content: m[2] };
      if (sha) putBody.sha = sha;
      var putRes   = await ghRequest(token, 'PUT', imgPath, putBody);

      if (putRes.status === 200 || putRes.status === 201) {
        newState.customImgs[key] = '/api/img?p=' + encodeURIComponent(imgPath);
      }
    }

    // Save state.json
    var stateContent = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    var existing2    = await ghRequest(token, 'GET', 'state.json', null);
    var sha2         = existing2.status === 200 ? existing2.data.sha : undefined;
    var putBody2     = { message: 'Update state', content: stateContent };
    if (sha2) putBody2.sha = sha2;
    var result       = await ghRequest(token, 'PUT', 'state.json', putBody2);

    if (result.status !== 200 && result.status !== 201) {
      return res.status(500).json({ error: 'GitHub ' + result.status + ': ' + JSON.stringify(result.data).substring(0, 200) });
    }

    res.status(200).json({ ok: true, state: newState });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
