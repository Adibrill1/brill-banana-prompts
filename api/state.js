const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';
const empty = { deleted: [], customImgs: {}, added: [], order: [] };

function httpsGet(url, token) {
  return new Promise(function(resolve) {
    var parsed = new URL(url);
    var opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'brill-banana/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    if (token) opts.headers['Authorization'] = 'token ' + token;
    var req = https.request(opts, function(r) {
      var chunks = [];
      r.on('data', function(c) { chunks.push(c); });
      r.on('end', function() {
        resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });
    req.setTimeout(8000, function() { req.destroy(); resolve({ status: 0, body: '' }); });
    req.on('error', function() { resolve({ status: 0, body: '' }); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(200).json(empty);

  try {
    // Fetch file metadata from GitHub Contents API
    var result = await httpsGet(
      'https://api.github.com/repos/' + owner + '/' + repo + '/contents/state.json',
      token
    );

    if (result.status !== 200) return res.status(200).json(empty);

    var data = JSON.parse(result.body);

    // For files ≤ 1MB GitHub returns inline base64 content
    // For files > 1MB content is empty — use download_url instead
    var jsonStr;
    if (data.content && data.content.trim()) {
      jsonStr = Buffer.from(data.content, 'base64').toString('utf-8');
    } else if (data.download_url) {
      var raw = await httpsGet(data.download_url, null);
      if (raw.status !== 200) return res.status(200).json(empty);
      jsonStr = raw.body;
    } else {
      return res.status(200).json(empty);
    }

    var content = JSON.parse(jsonStr);
    res.status(200).json(content);
  } catch(e) {
    res.status(200).json(empty);
  }
};
