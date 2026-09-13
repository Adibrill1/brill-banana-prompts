const repository = require('../lib/repository.cjs');
const catalog = require('../lib/catalog.cjs');
const { json, readBody } = require('../lib/http.cjs');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return json(req, res, 405, { error: 'Method not allowed' });
  try {
    const params = req.method === 'POST' ? await readBody(req, 256000) : req.query;
    if (params.keys !== undefined && (!Array.isArray(params.keys) || params.keys.length > 15000 || !params.keys.every(k => typeof k === 'string' && k.length < 160))) return json(req, res, 400, { error: 'רשימת מועדפים לא תקינה' });
    const page = Math.max(1, Math.min(10000, Number.parseInt(params.page) || 1));
    const limit = Math.max(1, Math.min(48, Number.parseInt(params.limit) || 36));
    const data = await repository.read('state.json', { fallback: true });
    const all = catalog.normalize(data.state);
    const matched = catalog.search(all, { q: String(params.q || '').slice(0, 500), category: String(params.category || ''), keys: params.keys });
    const pages = Math.max(1, Math.ceil(matched.length / limit));
    const current = Math.min(page, pages);
    const items = matched.slice((current - 1) * limit, current * limit).map(p => catalog.summarize(p, data.state._publishedAt || data.revision));
    return json(req, res, 200, { items, page: current, pages, total: matched.length, catalogTotal: all.length, config: catalog.publicConfig(data.state), revision: data.revision, stale: data.stale }, req.method === 'GET' && !data.stale ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' : 'private, no-store');
  } catch (error) { return json(req, res, error.status || 503, { error: 'לא ניתן לטעון את הקטלוג כרגע. נסו שוב.' }); }
};
