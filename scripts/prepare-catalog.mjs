import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { compile, index, page, releaseRevision } = require("../lib/published.cjs");
const { blobSha } = require("../lib/repository.cjs");
const text = await fs.readFile("state.json", "utf8");
const stateRevision = blobSha(text);
const manifest = JSON.parse(await fs.readFile("content/image-manifest.json", "utf8"));
const snapshot = compile(JSON.parse(text), releaseRevision(stateRevision, manifest));
snapshot.stateRevision = stateRevision;
await fs.writeFile("content/published.json", JSON.stringify(snapshot));
const data = index(snapshot);
const first = page(data);
const dir = `dist/catalog/${data.revision}`;
await fs.mkdir(dir, { recursive: true });
for (let number = 1; number <= first.pages; number++) {
  const value = page(data, { page: number });
  await fs.writeFile(`${dir}/page-${number}.json`, JSON.stringify(value));
  if (number === 1) Object.assign(first, value);
}
// Escaping '<' prevents prompt titles/configuration from closing the JSON script element.
const json = JSON.stringify(first)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const html = await fs.readFile("dist/index.html", "utf8");
await fs.writeFile(
  "dist/index.html",
  html.replace(
    "</head>",
    `<script type="application/json" id="catalog-bootstrap">${json}</script></head>`,
  ),
);
console.log(
  `Prepared ${data.records.length} records and ${first.pages} public catalog pages; private prompts remain server-only.`,
);
