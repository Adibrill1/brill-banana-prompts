const zlib = require('node:zlib');

function json(req, res, status, value, cache = 'private, no-store') {
  const body = Buffer.from(JSON.stringify(value));
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Accept-Encoding');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.status(status).end(zlib.gzipSync(body));
  }
  return res.status(status).end(body);
}

async function readBody(req, max = 1024 * 1024) {
  let body;
  if (req.body !== undefined && !Buffer.isBuffer(req.body)) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else {
    const chunks = []; let size = 0;
    if (Buffer.isBuffer(req.body)) chunks.push(req.body);
    else for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw Object.assign(new Error('הבקשה גדולה מדי'), { status: 413 });
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
    if (req.headers['x-body-encoding'] === 'gzip+json') {
      try { body = zlib.gunzipSync(body, { maxOutputLength: max }); }
      catch { throw Object.assign(new Error('בקשה דחוסה לא תקינה או גדולה מדי'), { status: 413 }); }
    }
  }
  if (Buffer.byteLength(body) > max) throw Object.assign(new Error('הבקשה גדולה מדי'), { status: 413 });
  try { const value = JSON.parse(body.toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw Object.assign(new Error('נתוני בקשה לא תקינים'), { status: 400 }); }
}

function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
module.exports = { json, readBody, sameOrigin };
