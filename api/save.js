module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  const owner = 'Adibrill1';
  const repo  = 'brill-banana-prompts';
  const path  = 'state.json';

  if (!token) {
    console.error('GITHUB_TOKEN not set');
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });
  }

  try {
    const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const newState = body.state;
    const content  = Buffer.from(JSON.stringify(newState, null, 2)).toString('base64');

    // Get current SHA
    let sha;
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'brill-banana' } }
    );
    if (getRes.ok) {
      const d = await getRes.json();
      sha = d.sha;
    }

    const putBody = { message: 'Update site state', content };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'brill-banana'
        },
        body: JSON.stringify(putBody)
      }
    );

    const putText = await putRes.text();
    if (!putRes.ok) {
      console.error('GitHub PUT failed:', putRes.status, putText);
      return res.status(500).json({ error: `GitHub error ${putRes.status}: ${putText}` });
    }
    res.status(200).json({ ok: true });
  } catch(e) {
    console.error('save.js error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
