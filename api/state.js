const repository = require("../lib/repository.cjs");
const { originals } = require("../lib/catalog.cjs");
const { json } = require("../lib/http.cjs");
const { isAdmin } = require("../lib/auth.cjs");
module.exports = async (req, res) => {
  if (req.method !== "GET")
    return json(req, res, 405, { error: "Method not allowed" });
  if (!isAdmin(req)) return json(req, res, 401, { error: "נדרשת כניסת מנהל" });
  try {
    const { state, revision } = await repository.read("state.json", {
      fresh: true,
    });
    return json(req, res, 200, {
      ...state,
      _revision: revision,
      _originals: originals,
    });
  } catch {
    return json(req, res, 503, {
      error: "לא ניתן לטעון נתונים מעודכנים. נסו שוב לפני עריכה.",
    });
  }
};
