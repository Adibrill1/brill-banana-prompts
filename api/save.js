const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';

const ghHeaders = (token) => ({
  'Authorization': 'token ' + token,
  'User-Agent': 'brill-banana',
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json'
});

async function ghGet(token, path) {
  const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, { headers: ghHeaders(token) });
  return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
}

async function ghPut(token, path, content, sha, message) {
  const body = JSON.stringify(Object.assign({ message, content }, sha ? { sha } : {}));
  const r = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    method: 'PUT', headers: ghHeaders(token), body
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });

  try {
    const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newState = JSON.parse(JSON.stringify(body.state)); // deep copy

    // Upload base64 images as separate files, replace with URL in state
    const customImgs = newState.customImgs || {};
    for (const key of Object.keys(customImgs)) {
      const src = customImgs[key];
      if (!src || !src.startsWith('data:')) continue; // already a URL, skip

      // Extract mime and base64 data
      const m = src.match(/^data:(image\/(\w+));base64,(.+)$/s);
      if (!m) continue;
      const ext      = m[2] === 'jpeg' ? 'jpg' : m[2];
      const b64data  = m[3];
      const imgPath  = 'images/custom_' + key.replace(/[^a-z0-9_]/gi, '_') + '.' + ext;

      // Check if file exists (to get SHA for update)
      const existing = await ghGet(token, imgPath);
      const sha      = existing.ok ? existing.data.sha : undefined;

      const putRes = await ghPut(token, imgPath, b64data, sha, 'Upload custom image ' + key);
      if (putRes.ok) {
        // Replace base64 with public URL
        customImgs[key] = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/master/' + imgPath;
      } else {
        console.error('Image upload failed for', key, putRes.status, JSON.stringify(putRes.data));
      }
    }

    // Now save state.json (without large base64)
    const stateContent = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
    const existing     = await ghGet(token, 'state.json');
    const sha          = existing.ok ? existing.data.sha : undefined;
    const putRes       = await ghPut(token, 'state.json', stateContent, sha, 'Update site state');

    if (!putRes.ok) return res.status(500).json({ error: 'state save failed: ' + putRes.status + ' ' + JSON.stringify(putRes.data).substring(0,200) });

    res.status(200).json({ ok: true, state: newState });
  } catch(e) {
    console.error('save.js error:', e);
    res.status(500).json({ error: e.message });
  }
};
