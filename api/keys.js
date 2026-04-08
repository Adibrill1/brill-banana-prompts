const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
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
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Auth: admin token from env
  const adminToken = process.env.ADMIN_TOKEN;
  const provided   = req.headers['x-admin-token'] || (req.body && req.body.adminToken);
  if (!adminToken || provided !== adminToken) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }

  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) { res.status(500).json({ error: 'Server config error' }); return; }

  // Load current keys.json
  var getResult = await ghGet(ghToken, 'keys.json');
  if (getResult.status !== 200 || !getResult.data.content) {
    res.status(500).json({ error: 'Could not load keys.json' }); return;
  }
  var sha = getResult.data.sha;
  var keysData = JSON.parse(Buffer.from(getResult.data.content, 'base64').toString('utf8'));
  var keys = keysData.keys || {};

  // GET — list all keys
  if (req.method === 'GET') {
    res.status(200).json({ keys: keys }); return;
  }

  // POST — add a key
  if (req.method === 'POST') {
    var key  = (req.body && req.body.key)  ? req.body.key.trim()  : '';
    var name = (req.body && req.body.name) ? req.body.name.trim() : '';
    if (!key) { res.status(400).json({ error: 'Missing key' }); return; }
    if (keys[key]) { res.status(400).json({ error: 'Key already exists' }); return; }

    keys[key] = { name: name, createdAt: new Date().toISOString() };
    keysData.keys = keys;
    var encoded = Buffer.from(JSON.stringify(keysData, null, 2)).toString('base64');
    var putResult = await ghPut(ghToken, 'keys.json', encoded, sha, 'Add license key: ' + (name || key));
    if (putResult.status === 200 || putResult.status === 201) {
      res.status(200).json({ ok: true, keys: keys });
    } else {
      res.status(500).json({ error: 'Failed to save' });
    }
    return;
  }

  // DELETE — remove a key
  if (req.method === 'DELETE') {
    var delKey = (req.body && req.body.key) ? req.body.key.trim() : '';
    if (!delKey) { res.status(400).json({ error: 'Missing key' }); return; }
    if (!keys[delKey]) { res.status(404).json({ error: 'Key not found' }); return; }

    delete keys[delKey];
    keysData.keys = keys;
    var encoded2 = Buffer.from(JSON.stringify(keysData, null, 2)).toString('base64');
    var putResult2 = await ghPut(ghToken, 'keys.json', encoded2, sha, 'Remove license key: ' + delKey);
    if (putResult2.status === 200 || putResult2.status === 201) {
      res.status(200).json({ ok: true, keys: keys });
    } else {
      res.status(500).json({ error: 'Failed to save' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
