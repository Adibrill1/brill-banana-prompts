const crypto = require("node:crypto");
const { sameOrigin } = require("./http.cjs");

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
function secret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.ADMIN_TOKEN ||
    process.env.GITHUB_TOKEN
  );
}
function signature(value) {
  return crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
}
function cookieName(role) {
  return "brill_" + role + "_session";
}
function readSession(req, role) {
  if (!secret()) return null;
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName(role) + "="));
  if (!raw) return null;
  const [value, mac] = raw.slice(raw.indexOf("=") + 1).split(".");
  if (!value || !equal(mac, signature(value))) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    return data.role === role &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now()
      ? data
      : null;
  } catch {
    return null;
  }
}
function setSession(req, res, role, claims, lifetimeMs) {
  if (!secret())
    throw Object.assign(new Error("יש להגדיר הרשאות כניסה בשרת"), {
      status: 503,
    });
  const value = Buffer.from(
    JSON.stringify({ ...claims, role, exp: Date.now() + lifetimeMs }),
  ).toString("base64url");
  const secure = process.env.LOCAL_DATA === "1" ? "" : "; Secure";
  res.setHeader(
    "Set-Cookie",
    `${cookieName(role)}=${value}.${signature(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(lifetimeMs / 1000)}${secure}`,
  );
}
function clearSession(req, res, role) {
  res.setHeader(
    "Set-Cookie",
    `${cookieName(role)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.LOCAL_DATA === "1" ? "" : "; Secure"}`,
  );
}
function isAdmin(req) {
  return (
    sameOrigin(req) &&
    (equal(req.headers["x-admin-token"], process.env.ADMIN_TOKEN) ||
      !!readSession(req, "admin"))
  );
}
function passwordValid(password) {
  // Preserve the existing administrator password; deployments may override its hash.
  const expected =
    process.env.ADMIN_PASSWORD_SHA256 ||
    "23d1d954d91fc0899774810ea01ec11bbbf1dc4d155ad722c527da4db1df6ca0";
  return (
    typeof password === "string" &&
    equal(crypto.createHash("sha256").update(password).digest("hex"), expected)
  );
}
module.exports = {
  equal,
  isAdmin,
  passwordValid,
  setSession,
  clearSession,
  readSession,
};
