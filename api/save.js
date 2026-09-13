const { isAdmin } = require("../lib/auth.cjs");
const { json, readBody } = require("../lib/http.cjs");
const { uploadImage, saveState } = require("../lib/save.cjs");
module.exports = async (req, res) => {
  if (req.method !== "POST")
    return json(req, res, 405, { error: "Method not allowed" });
  if (!isAdmin(req)) return json(req, res, 401, { error: "נדרשת כניסת מנהל" });
  if (!process.env.GITHUB_TOKEN || process.env.LOCAL_DATA === "1")
    return json(req, res, 503, {
      error: "השמירה אינה מופעלת בסביבת התצוגה המקומית",
    });
  try {
    const body = await readBody(req, 24 * 1024 * 1024);
    if (body.uploadOnly) {
      const images = body.customImgs;
      if (
        !images ||
        typeof images !== "object" ||
        Array.isArray(images) ||
        Object.keys(images).length > 4
      )
        return json(req, res, 400, {
          error: "יש להעלות עד ארבע תמונות בכל בקשה",
        });
      const uploads = {};
      for (const [key, src] of Object.entries(images))
        uploads[key] = await uploadImage(key, src);
      return json(req, res, 200, { ok: true, uploads });
    }
    return json(req, res, 200, await saveState(body));
  } catch (error) {
    return json(req, res, error.status || 502, {
      error: error.message || "השמירה נכשלה",
    });
  }
};
module.exports.config = { api: { bodyParser: false } };
