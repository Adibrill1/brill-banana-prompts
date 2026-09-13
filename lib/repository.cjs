const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.github.com/repos/Adibrill1/brill-banana-prompts/contents/';
const RAW = 'https://raw.githubusercontent.com/Adibrill1/brill-banana-prompts/master/';
const entries = new Map();
const pending = new Map();
function blobSha(text) { return crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex'); }
function headers() {
  return { 'User-Agent': 'brill-banana/2.0', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
}
async function github(file, options = {}) {
  const response = await fetch(API + file, { ...options, headers: { ...headers(), 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
async function remote(file) {
  if (process.env.LOCAL_DATA === '1') {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return { state: JSON.parse(text), revision: blobSha(text), stale: false };
  }
  let text, revision;
  if (process.env.GITHUB_TOKEN) {
    const result = await github(file);
    if (result.status !== 200) throw new Error('לא ניתן לקרוא את הנתונים המעודכנים');
    revision = result.data.sha;
    if (result.data.content) text = Buffer.from(result.data.content, 'base64').toString('utf8');
    else {
      // Pin the read to the file's current commit-independent blob to avoid stale raw CDN content.
      const response = await fetch(`https://api.github.com/repos/Adibrill1/brill-banana-prompts/git/blobs/${revision}`, { headers: headers(), signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('לא ניתן לקרוא את הנתונים המעודכנים');
      const blob = await response.json();
      text = Buffer.from(blob.content, 'base64').toString('utf8');
    }
  } else {
    if (file !== 'state.json') throw new Error('הרשאות השרת אינן מוגדרות');
    const response = await fetch(RAW + file, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('לא ניתן לקרוא את הנתונים המעודכנים');
    text = await response.text(); revision = blobSha(text);
  }
  return { state: JSON.parse(text), revision, stale: false };
}
async function read(file = 'state.json', { fresh = false, fallback = false } = {}) {
  const cached = entries.get(file);
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached.value;
  if (!fresh && pending.has(file)) return pending.get(file);
  const job = remote(file).then(value => { entries.set(file, { value, at: Date.now() }); return value; }).catch(error => {
    if (!fallback || file !== 'state.json') throw error;
    if (cached) return { ...cached.value, stale: true };
    const text = fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8');
    return { state: JSON.parse(text), revision: blobSha(text), stale: true };
  }).finally(() => pending.delete(file));
  pending.set(file, job);
  return job;
}
function invalidate(file = 'state.json') { entries.delete(file); }
module.exports = { read, github, invalidate, blobSha, ROOT, RAW };
