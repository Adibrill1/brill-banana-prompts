const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';
const path  = 'state.json';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });

  const newState = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body).state;
  const content  = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');
  const headers  = {
    'Authorization': 'token ' + token,
    'User-Agent': 'brill-banana',
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
  const apiBase = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;

  try {
    // Get current SHA
    let sha;
    const getRes = await fetch(apiBase, { headers });
    if (getRes.ok) {
      const d = await getRes.json();
      sha = d.sha;
    }

    // Write new content
    const body = JSON.stringify(Object.assign({ message: 'Update state', content }, sha ? { sha } : {}));
    const putRes = await fetch(apiBase, { method: 'PUT', headers, body });
    const putData = await putRes.json();

    if (!putRes.ok) return res.status(500).json({ error: putData.message || putRes.status });
    res.status(200).json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
