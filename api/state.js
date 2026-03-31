const owner = 'Adibrill1';
const repo  = 'brill-banana-prompts';
const empty = { deleted: [], customImgs: {}, added: [], order: [] };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(200).json(empty);

  try {
    const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/state.json';
    const r = await fetch(apiUrl, {
      headers: {
        'Authorization': 'token ' + token,
        'User-Agent': 'brill-banana',
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!r.ok) return res.status(200).json(empty);
    const data = await r.json();
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    res.status(200).json(content);
  } catch(e) {
    res.status(200).json(empty);
  }
};
