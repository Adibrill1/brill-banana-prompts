const repository = require('../lib/repository.cjs');
const { json, readBody, sameOrigin } = require('../lib/http.cjs');
const { setSession, clearSession } = require('../lib/auth.cjs');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(req, res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req)) return json(req, res, 403, { error: 'Forbidden' });
  try {
    const body = await readBody(req, 4096);
    const key = typeof body.license_key === 'string' ? body.license_key.trim() : '';
    const { state } = await repository.read('keys.json');
    const entry = Object.hasOwn(state.keys || {}, key) ? state.keys[key] : null;
    const expires = entry?.expiresAt ? Date.parse(entry.expiresAt) : Date.now() + 365 * 86400000;
    if (!entry || !Number.isFinite(expires) || expires <= Date.now()) {
      clearSession(req, res, 'license');
      return json(req, res, 200, { valid: false, error: 'מפתח לא תקין או שפג תוקפו' });
    }
    setSession(req, res, 'license', { key }, Math.min(expires - Date.now(), 7 * 86400000));
    return json(req, res, 200, { valid: true, name: entry.name || '', expiresAt: new Date(expires).toISOString() });
  } catch { return json(req, res, 503, { valid: false, error: 'שגיאת חיבור. נסו שוב.' }); }
};
