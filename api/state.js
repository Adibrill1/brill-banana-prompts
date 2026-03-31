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

  const token = process.env.GITHUB_TOKEN;
  const owner = 'Adibrill1';
  const repo  = 'brill-banana-prompts';
  const empty = { deleted: [], customImgs: {}, added: [], order: [] };

  if (!token) {
    console.error('GITHUB_TOKEN not set');
    return res.status(200).json(empty);
  }

  try {
    const result = await githubRequest({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/contents/state.json`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (result.status !== 200) {
      console.error('GitHub GET failed:', result.status, result.body);
      return res.status(200).json(empty);
    }

    const data = JSON.parse(result.body);
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    res.status(200).json(content);
  } catch(e) {
    console.error('state.js error:', e.message);
    res.status(200).json(empty);
  }
};
