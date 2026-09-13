const { json, readBody, sameOrigin } = require("../lib/http.cjs");
const auth = require("../lib/auth.cjs");
const attempts = new Map();
module.exports = async (req, res) => {
  if (!sameOrigin(req)) return json(req, res, 403, { error: "Forbidden" });
  if (req.method === "GET")
    return json(req, res, 200, {
      admin: auth.isAdmin(req),
      premium: !!auth.readSession(req, "license"),
    });
  if (req.method === "DELETE") {
    auth.clearSession(
      req,
      res,
      req.query.role === "admin" ? "admin" : "license",
    );
    return json(req, res, 200, { ok: true });
  }
  if (req.method !== "POST")
    return json(req, res, 405, { error: "Method not allowed" });
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  for (const [key, value] of attempts)
    if (now > value.until) attempts.delete(key);
  const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60000 };
  if (attempt.count >= 10)
    return json(req, res, 429, {
      error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.",
    });
  try {
    const body = await readBody(req, 4096);
    if (!auth.passwordValid(body.password)) {
      attempt.count++;
      attempts.set(ip, attempt);
      return json(req, res, 401, { error: "סיסמה שגויה" });
    }
    auth.setSession(req, res, "admin", {}, 8 * 3600000);
    attempts.delete(ip);
    return json(req, res, 200, { ok: true });
  } catch (error) {
    return json(req, res, error.status || 503, { error: error.message });
  }
};
