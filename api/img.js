const sharp = require("sharp");
const { RAW } = require("../lib/repository.cjs");
const { imageSource } = require("../lib/catalog.cjs");
const WIDTHS = new Set([320, 480, 640, 960, 1600]);
const cache = new Map();
const inflight = new Map();
let cacheBytes = 0;
let activeTransforms = 0;
const queue = [];
async function scheduledTransform(src, width, format) {
  if (activeTransforms >= 4)
    await new Promise((resolve) => queue.push(resolve));
  activeTransforms++;
  try {
    return await transform(src, width, format);
  } finally {
    activeTransforms--;
    queue.shift()?.();
  }
}
function allowed(src) {
  try {
    const url = new URL(src);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return false;
    return (
      (src.startsWith(RAW + "images/") &&
        /^[\w.-]+$/.test(src.slice((RAW + "images/").length))) ||
      /^https:\/\/nanobananai\.site\/images\/case\d+\/output\.webp$/.test(src)
    );
  } catch {
    return false;
  }
}
async function transform(src, width, format) {
  const response = await fetch(src, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Object.assign(new Error("Image unavailable"), {
      status: response.status === 404 ? 404 : 502,
    });
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024)
      throw Object.assign(new Error("Image too large"), { status: 413 });
    chunks.push(chunk);
  }
  return sharp(Buffer.concat(chunks), { limitInputPixels: 40000000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toFormat(format, { quality: format === "avif" ? 55 : 80 })
    .toBuffer();
}
module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).end();
  const src =
    typeof req.query.src === "string"
      ? req.query.src
      : imageSource(req.query.p);
  const width = Number(req.query.w || 640);
  const format = req.query.f === "avif" ? "avif" : "webp";
  if (!allowed(src) || !WIDTHS.has(width)) return res.status(400).end();
  const version = /^[a-zA-Z0-9_-]{1,64}$/.test(req.query.v || "")
    ? req.query.v
    : "";
  const key = `${src}|${width}|${format}|${version}`;
  try {
    let entry = cache.get(key);
    if (entry && Date.now() > entry.until) {
      cacheBytes -= entry.buffer.length;
      cache.delete(key);
      entry = null;
    }
    let output = entry?.buffer;
    if (!output) {
      if (!inflight.has(key)) {
        // Keep memory and CPU bounded even when a crawler requests many different variants.
        if (inflight.size >= 64) {
          res.setHeader("Retry-After", "1");
          return res.status(503).end();
        }
        inflight.set(
          key,
          scheduledTransform(src, width, format).finally(() =>
            inflight.delete(key),
          ),
        );
      }
      output = await inflight.get(key);
      if (!cache.has(key)) {
        while (cacheBytes + output.length > 32 * 1024 * 1024 && cache.size) {
          const oldest = cache.keys().next().value;
          cacheBytes -= cache.get(oldest).buffer.length;
          cache.delete(oldest);
        }
        cache.set(key, { buffer: output, until: Date.now() + 3600000 });
        cacheBytes += output.length;
      }
    }
    res.setHeader("Content-Type", `image/${format}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Version changes with publication. Unversioned requests must remain short-lived.
    res.setHeader(
      "Cache-Control",
      version
        ? "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400"
        : "public, max-age=300, s-maxage=300",
    );
    return res.status(200).end(output);
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(error.status || 502).end();
  }
};
module.exports.allowed = allowed;
