const repository = require("../lib/repository.cjs");
const catalog = require("../lib/catalog.cjs");
const published = require("../lib/published.cjs");
const { json, readBody } = require("../lib/http.cjs");
const { readSession, isAdmin } = require("../lib/auth.cjs");
module.exports = async (req, res) => {
  if (!["GET", "POST"].includes(req.method))
    return json(req, res, 405, { error: "Method not allowed" });
  try {
    const keys =
      req.method === "POST"
        ? (await readBody(req, 20000)).keys
        : [req.query.key];
    if (
      !Array.isArray(keys) ||
      keys.length < 1 ||
      keys.length > 100 ||
      !keys.every(
        (key) => typeof key === "string" && /^[\w-]{1,160}$/.test(key),
      )
    )
      return json(req, res, 400, { error: "רשימת פרומפטים לא תקינה" });
    const data = await published.read();
    const cards = [...new Set(keys)]
      .map((key) => data.byKey.get(key))
      .filter(Boolean);
    if (req.method === "GET" && !cards.length)
      return json(req, res, 404, { error: "הפרומפט לא נמצא" });
    let premium = isAdmin(req);
    if (
      !premium &&
      cards.some(
        (card) =>
          !catalog.canRead({ freeMode: data.config.freeMode }, card, false),
      )
    ) {
      const license = readSession(req, "license");
      if (license) {
        const { state } = await repository.read("keys.json");
        const entry = state.keys?.[license.key];
        premium =
          !!entry &&
          (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now());
      }
    }
    const items = [];
    let size = 0;
    for (const card of cards) {
      const item = published.detail(data, card, premium);
      const bytes = Buffer.byteLength(JSON.stringify(item));
      // Large individual prompts remain available through GET without overflowing a batch response.
      if (req.method === "POST" && size + bytes > 2 * 1024 * 1024) break;
      items.push(item);
      size += bytes;
    }
    return json(
      req,
      res,
      200,
      req.method === "GET" ? items[0] : { revision: data.revision, items },
    );
  } catch (error) {
    if ([400, 413].includes(error.status))
      return json(req, res, error.status, { error: error.message });
    return json(req, res, 503, { error: "לא ניתן לטעון את הפרומפט כרגע" });
  }
};
