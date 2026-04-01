const https = require('https');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

module.exports = async function handler(req, res) {
  // path param: e.g. /api/img?p=images/custom_orig_6.jpg
  const p = req.query && req.query.p;
  if (!p || p.includes('..')) return res.status(400).end();

  const token = process.env.GITHUB_TOKEN;
  const url   = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/master/' + p;

  const headers = {};
  if (token) headers['Authorization'] = 'token ' + token;
  headers['User-Agent'] = 'brill-banana/1.0';

  try {
    await new Promise(function(resolve, reject) {
      https.get(url, { headers }, function(ghRes) {
        if (ghRes.statusCode === 302 || ghRes.statusCode === 301) {
          // follow redirect
          https.get(ghRes.headers.location, function(r2) {
            res.setHeader('Content-Type', r2.headers['content-type'] || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.status(r2.statusCode);
            r2.pipe(res);
            r2.on('end', resolve);
            r2.on('error', reject);
          }).on('error', reject);
          return;
        }
        res.setHeader('Content-Type', ghRes.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(ghRes.statusCode);
        ghRes.pipe(res);
        ghRes.on('end', resolve);
        ghRes.on('error', reject);
      }).on('error', reject);
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
