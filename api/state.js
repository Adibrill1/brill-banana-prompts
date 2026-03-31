const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';
const empty = { deleted: [], customImgs: {}, added: [], order: [] };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(200).json(empty);

  try {
    const result = await new Promise(function(resolve, reject) {
      const opts = {
        hostname: 'api.github.com',
        port: 443,
        path: '/repos/' + owner + '/' + repo + '/contents/state.json',
        method: 'GET',
        headers: {
          'Authorization': 'token ' + token,
          'User-Agent': 'brill-banana/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      const req2 = https.request(opts, function(r) {
        var chunks = [];
        r.on('data', function(c) { chunks.push(c); });
        r.on('end', function() {
          resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() });
        });
      });
      req2.setTimeout(8000, function() { req2.destroy(new Error('timeout')); });
      req2.on('error', reject);
      req2.end();
    });

    if (result.status !== 200) return res.status(200).json(empty);
    const data    = JSON.parse(result.body);
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    res.status(200).json(content);
  } catch(e) {
    res.status(200).json(empty);
  }
};
