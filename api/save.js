const https = require('https');

function githubRequest(options, body) {
  return new Promise(function(resolve, reject) {
    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
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

  if (!token) {
    console.error('GITHUB_TOKEN not set');
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  }

  try {
    const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newState = body.state;
    const content  = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');

    // Get current SHA
    const getResult = await githubRequest({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/contents/${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha;
    if (getResult.status === 200) {
      sha = JSON.parse(getResult.body).sha;
    }

    const putBody = JSON.stringify({ message: 'Update site state', content, ...(sha ? { sha } : {}) });

    const putResult = await githubRequest({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/contents/${path}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(putBody)
      }
    }, putBody);

    if (putResult.status !== 200 && putResult.status !== 201) {
      console.error('GitHub PUT failed:', putResult.status, putResult.body);
      return res.status(500).json({ error: `GitHub ${putResult.status}: ${putResult.body}` });
    }

    res.status(200).json({ ok: true });
  } catch(e) {
    console.error('save.js error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
