import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { normalize } = require("../lib/catalog.cjs");
const { RAW } = require("../lib/repository.cjs");
const { allowed } = require("../api/img.js");
const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, "node_modules/.cache/brill-images-v1");
const output = path.join(root, "dist/media");
const widths = [320, 480, 640, 960, 1600];
const recipe = "webp-q78-rotate-no-enlarge-v1";
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
const exists = async (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );
await fs.mkdir(cache, { recursive: true });
await fs.mkdir(output, { recursive: true });
const state = JSON.parse(
  await fs.readFile(path.join(root, "state.json"), "utf8"),
);
const sources = [
  ...new Set(
    normalize(state)
      .flatMap((p) => p.images)
      .filter(allowed),
  ),
];
const limit = Number(process.env.BRILL_IMAGE_LIMIT || sources.length);
if (process.env.VERCEL && limit < sources.length)
  throw new Error("A Vercel release must prepare the complete gallery");
let gitRevision = process.env.VERCEL_GIT_COMMIT_SHA;
let blobs = new Map();
try {
  gitRevision ||= execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const tree = execFileSync("git", ["ls-tree", "-r", "HEAD", "--", "images"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  blobs = new Map(
    tree
      .trim()
      .split("\n")
      .map((line) => {
        const [metadata, file] = line.split("\t");
        return [file, metadata?.split(" ")[2]];
      }),
  );
} catch {
  /* Local fixture builds can work without Git metadata. */
}
const manifest = {};
const counted = new Set();
let cursor = 0,
  complete = 0,
  reused = 0,
  bytes = 0;
const failures = [];
async function sourceBytes(src, file) {
  if (file && (await exists(path.join(root, file))))
    return fs.readFile(path.join(root, file));
  const pinned =
    file && gitRevision
      ? RAW.replace("/master/", `/${gitRevision}/`) + file
      : src;
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(pinned, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) throw new Error("Source exceeds 12 MB");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
async function prepare(src) {
  const file = src.startsWith(RAW) ? src.slice(RAW.length) : null;
  let hash = blobs.has(file) ? digest(recipe + blobs.get(file)) : null;
  let input;
  if (!hash) {
    input = await sourceBytes(src, file);
    hash = digest(Buffer.concat([Buffer.from(recipe), input]));
  }
  const names = widths.map((w) => `${hash}-${w}.webp`);
  const cached = await Promise.all(
    names.map((name) => exists(path.join(cache, name))),
  );
  if (cached.every(Boolean)) reused++;
  else {
    input ||= await sourceBytes(src, file);
    // Verify a pinned Git source before assigning its immutable cache name.
    if (blobs.has(file)) {
      const blob = crypto
        .createHash("sha1")
        .update(`blob ${input.length}\0`)
        .update(input)
        .digest("hex");
      if (blob !== blobs.get(file))
        throw new Error("Source does not match the release commit");
    }
    for (let i = 0; i < widths.length; i++) {
      if (cached[i]) continue;
      const buffer = await sharp(input, { limitInputPixels: 40000000 })
        .rotate()
        .resize({ width: widths[i], withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      const target = path.join(cache, names[i]);
      // Different source paths can contain the same bytes and share this hash.
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, buffer);
      await fs.rename(temporary, target);
    }
  }
  for (const name of names) {
    await fs.copyFile(path.join(cache, name), path.join(output, name));
    if (!counted.has(name)) {
      counted.add(name);
      const stat = await fs.stat(path.join(output, name));
      bytes += stat.size;
    }
  }
  manifest[src] = { hash, widths };
}
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < Math.min(limit, sources.length)) {
      const src = sources[cursor++];
      try {
        await prepare(src);
      } catch (error) {
        failures.push({ src, error: error.message });
      }
      complete++;
      if (complete % 100 === 0)
        console.log(
          `Prepared ${complete}/${Math.min(limit, sources.length)} images (${reused} cached)`,
        );
    }
  }),
);
await fs.writeFile(
  path.join(root, "content/image-manifest.json"),
  JSON.stringify(manifest),
);
await fs.writeFile(
  path.join(root, "content/image-build-report.json"),
  JSON.stringify({
    total: sources.length,
    prepared: Object.keys(manifest).length,
    reused,
    bytes,
    failures,
  }),
);
console.log(
  JSON.stringify({
    prepared: Object.keys(manifest).length,
    total: sources.length,
    reused,
    megabytes: Math.round(bytes / 1e6),
    failed: failures.length,
  }),
);
if (failures.length)
  console.warn(
    "Images that could not be prepared retain the existing on-demand fallback:",
    JSON.stringify(failures.slice(0, 8)),
  );
if (process.env.VERCEL && failures.length > Math.max(10, sources.length * 0.01))
  throw new Error("Too many images failed; keep the previous deployment live");
// Keep only this release's active variants in the reusable dependency cache.
if (limit >= sources.length) {
  const keep = new Set(
    Object.values(manifest).flatMap((p) =>
      widths.map((w) => `${p.hash}-${w}.webp`),
    ),
  );
  for (const name of await fs.readdir(cache))
    if (!keep.has(name)) await fs.rm(path.join(cache, name), { force: true });
}
// Vercel's dependency cache also contains node_modules. Keep the smaller gallery
// variants first; all five sizes have already been copied to the deployment.
if (process.env.VERCEL) {
  const files = await Promise.all((await fs.readdir(cache)).map(async (name) => ({
    name, size: (await fs.stat(path.join(cache, name))).size,
  })));
  let size = files.reduce((sum, file) => sum + file.size, 0);
  files.sort((a, b) => b.size - a.size);
  for (const file of files) {
    if (size <= 600 * 1024 * 1024) break;
    await fs.rm(path.join(cache, file.name), { force: true });
    size -= file.size;
  }
}
