const https = require('https');

function githubGet(token, owner, repo, path) {
  return new Promise(function(resolve, reject) {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + owner + '/' + repo + '/contents/' + path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 8000
    };
    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('GET timeout')); });
    req.end();
  });
}

function githubPut(token, owner, repo, path, bodyStr) {
  return new Promise(function(resolve, reject) {
    const buf = Buffer.from(bodyStr, 'utf8');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + owner + '/' + repo + '/contents/' + path,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': buf.length
      },
      timeout: 15000
    };
    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('PUT timeout')); });
    req.write(buf);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  const owner = 'Adibrill1';
  const repo  = 'brill-banana-prompts';
  const path  = 'state.json';

  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });

  try {
    const body      = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newState  = body.state;
    const content   = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');

    // Get SHA of existing file
    let sha;
    try {
      const getRes = await githubGet(token, owner, repo, path);
      if (getRes.status === 200) sha = JSON.parse(getRes.body).sha;
    } catch(e) {
      // If GET fails, proceed without SHA (will create new file)
    }

    const payload = JSON.stringify(Object.assign(
      { message: 'Update site state', content: content },
      sha ? { sha: sha } : {}
    ));

    const putRes = await githubPut(token, owner, repo, path, payload);

    if (putRes.status !== 200 && putRes.status !== 201) {
      return res.status(500).json({ error: 'GitHub ' + putRes.status + ': ' + putRes.body.substring(0, 200) });
    }

    res.status(200).json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
