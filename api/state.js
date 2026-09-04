const https = require('https');
const zlib  = require('zlib');

const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';
const empty = { deleted: [], customImgs: {}, added: [], order: [] };

const RAW_URL = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/master/state.json';

function httpsGet(url, token, timeoutMs) {
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
    req.setTimeout(timeoutMs || 8000, function() { req.destroy(); resolve({ status: 0, body: '' }); });
    req.on('error', function() { resolve({ status: 0, body: '' }); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;

  try {
    var jsonStr = null;

    // Preferred path: the Contents API, which is authenticated and is not
    // subject to the raw CDN's few-minutes of staleness. Kept on a short
    // timeout so that failing over to raw still fits Vercel's 10s budget.
    if (token) {
      var result = await httpsGet(
        'https://api.github.com/repos/' + owner + '/' + repo + '/contents/state.json',
        token,
        4000
      );
      if (result.status === 200) {
        var data = JSON.parse(result.body);
        // For files <= 1MB GitHub returns inline base64 content.
        // state.json is well past that, so in practice download_url is used.
        if (data.content && data.content.trim()) {
          jsonStr = Buffer.from(data.content, 'base64').toString('utf-8');
        } else if (data.download_url) {
          var raw = await httpsGet(data.download_url, null);
          if (raw.status === 200) jsonStr = raw.body;
        }
      }
    }

    // Fallback: the repo is public, so state.json is readable with no
    // credentials at all. This is what keeps the site alive when GITHUB_TOKEN
    // is missing or expired — previously the handler returned `empty` on the
    // very first line in that case, and the client's isEmptyState() check
    // silently kept the baked-in fallback state, which has no cats[]. The
    // visible symptom was every category filter coming back empty while "all"
    // still worked. Reads no longer depend on the token; publishing still does.
    if (!jsonStr) {
      var pub = await httpsGet(RAW_URL, null);
      if (pub.status === 200) jsonStr = pub.body;
    }

    if (!jsonStr) return res.status(200).json(empty);

    // Parse to validate — a corrupt state.json falls through to the catch
    // below rather than being served to the client.
    var content = JSON.parse(jsonStr);

    // state.json is past Vercel's ~4.5MB response limit, and a function that
    // exceeds it fails outright. Gzip keeps the response around 0.9MB.
    // Browsers always send this header and decompress transparently, so the
    // client needs no change.
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      var gz = zlib.gzipSync(jsonStr);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', gz.length);
      res.setHeader('Vary', 'Accept-Encoding');
      return res.status(200).end(gz);
    }
    res.status(200).json(content);
  } catch(e) {
    res.status(200).json(empty);
  }
};
