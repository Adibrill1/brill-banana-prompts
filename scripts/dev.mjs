import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
// Local preview never writes to GitHub, even when a token exists in the parent environment.
process.env.LOCAL_DATA = "1";
process.env.SESSION_SECRET ||= crypto.randomBytes(32).toString("hex");
if (process.env.LOCAL_ADMIN_PASSWORD)
  process.env.ADMIN_PASSWORD_SHA256 = crypto
    .createHash("sha256")
    .update(process.env.LOCAL_ADMIN_PASSWORD)
    .digest("hex");
const production = process.argv.includes("--production");
const vite = production
  ? null
  : await createServer({
      server: { middlewareMode: true, hmr: { port: 5174 } },
      appType: "custom",
    });
const routes = new Set([
  "catalog",
  "prompt",
  "img",
  "session",
  "state",
  "save",
  "license",
  "keys",
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5);
      if (!routes.has(name)) {
        res.writeHead(404).end();
        return;
      }
      req.query = Object.fromEntries(url.searchParams);
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (value) => {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(value));
      };
      // Legacy license-key management expects a parsed JSON body.
      if (name === "keys" && req.method !== "GET")
        req.body = await require("../lib/http.cjs").readBody(req);
      return await require("../api/" + name + ".js")(req, res);
    }
    if (
      /^\/(?:state\.json|keys\.json|content(?:\/|$)|lib(?:\/|$)|tests(?:\/|$)|scripts(?:\/|$)|\.env)/.test(
        url.pathname,
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    const aliases = {
      "/": "index.html",
      "/admin": "admin.html",
      "/services": "services.html",
    };
    const relative =
      aliases[url.pathname] ||
      decodeURIComponent(url.pathname).replace(/^\//, "");
    const base = production ? path.join(root, "dist") : root;
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    if (
      fs.existsSync(file) &&
      fs.statSync(file).isFile() &&
      (production || /\.(?:html|jpg|png|webp)$/.test(file))
    ) {
      let body = fs.readFileSync(file);
      if (!production && file.endsWith("index.html"))
        body = await vite.transformIndexHtml(url.pathname, body.toString());
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader(
        "Cache-Control",
        file.includes("/assets/") && production
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      return res.end(body);
    }
    if (vite)
      return vite.middlewares(req, res, () => {
        res.writeHead(404).end();
      });
    res.writeHead(404).end();
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end("Preview error");
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () =>
  console.log(`Gallery preview: http://127.0.0.1:${port}`),
);
async function stop() {
  server.close();
  if (vite) await vite.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
