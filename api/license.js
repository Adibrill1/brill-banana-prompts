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

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  var license_key = (req.body && req.body.license_key) ? req.body.license_key.trim() : '';
  if (!license_key) {
    res.status(400).json({ valid: false, error: 'Missing license_key' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) { res.status(500).json({ valid: false, error: 'Server config error' }); return; }

  try {
    var result = await ghGet(token, 'keys.json');
    if (result.status !== 200 || !result.data.content) {
      res.status(500).json({ valid: false, error: 'Could not load keys' });
      return;
    }
    var keysData = JSON.parse(Buffer.from(result.data.content, 'base64').toString('utf8'));
    var keys = keysData.keys || {};

    if (keys[license_key]) {
      res.status(200).json({ valid: true, name: keys[license_key].name || '' });
    } else {
      res.status(200).json({ valid: false, error: 'מפתח לא תקין' });
    }
  } catch(e) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
};
