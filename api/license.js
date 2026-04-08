const https = require('https');

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function lemonValidate(licenseKey) {
  return new Promise(function(resolve) {
    var body = JSON.stringify({ license_key: licenseKey });
    var opts = {
      hostname: 'api.lemonsqueezy.com',
      port: 443,
      path: '/v1/licenses/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body)
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
    req.on('error', function(e) { resolve({ status: 500, data: { error: e.message } }); });
    req.write(body);
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

  try {
    var result = await lemonValidate(license_key);
    var data = result.data;

    // Lemon Squeezy returns { valid: true, license_key: {...}, meta: {...} } on success
    if (result.status === 200 && data.valid === true) {
      res.status(200).json({ valid: true });
    } else {
      var errMsg = (data && data.error) ? data.error : 'Invalid license key';
      res.status(200).json({ valid: false, error: errMsg });
    }
  } catch(e) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
};
