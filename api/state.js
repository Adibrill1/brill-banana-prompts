module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.GITHUB_TOKEN;
  const owner = 'Adibrill1';
  const repo  = 'brill-banana-prompts';

  if (!token) {
    console.error('GITHUB_TOKEN not set');
    return res.status(200).json({ deleted:[], customImgs:{}, added:[], order:[] });
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/state.json`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'brill-banana' } }
    );
    if (!r.ok) {
      console.error('GitHub GET failed:', r.status, await r.text());
      return res.status(200).json({ deleted:[], customImgs:{}, added:[], order:[] });
    }
    const data = await r.json();
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    res.status(200).json(content);
  } catch(e) {
    console.error('state.js error:', e.message);
    res.status(200).json({ deleted:[], customImgs:{}, added:[], order:[] });
  }
};
