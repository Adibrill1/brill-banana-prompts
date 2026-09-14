const repository = require("../lib/repository.cjs");
const catalog = require("../lib/catalog.cjs");
const { json } = require("../lib/http.cjs");
const { readSession, isAdmin } = require("../lib/auth.cjs");
module.exports = async (req, res) => {
  if (req.method !== "GET")
    return json(req, res, 405, { error: "Method not allowed" });
  try {
    const { state, revision } = await repository.read();
    const card = catalog.normalize(state).find((p) => p.key === req.query.key);
    if (!card) return json(req, res, 404, { error: "הפרומפט לא נמצא" });
    const license = readSession(req, "license");
    let premium = isAdmin(req);
    if (license) {
      const { state: data } = await repository.read("keys.json");
      const entry = data.keys?.[license.key];
      premium ||=
        !!entry &&
        (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now());
    }
    const readable = catalog.canRead(state, card, premium);
    const version = state._publishedAt || revision;
    return json(req, res, 200, {
      ...catalog.summarize(card, version),
      images: card.images.map((src) => catalog.imageUrl(src, 1600, version)),
      prompt: readable ? card.prompt : null,
      locked: !readable,
      copyEnabled: readable,
    });
  } catch {
    return json(req, res, 503, { error: "לא ניתן לטעון את הפרומפט כרגע" });
  }
};
