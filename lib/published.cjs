const fs = require("node:fs");
const path = require("node:path");
const catalog = require("./catalog.cjs");
const repository = require("./repository.cjs");
const SNAPSHOT = path.join(__dirname, "../content/published.json");
let cached;
function releaseRevision(stateRevision, manifest) {
  // Canonical ordering makes concurrent image preparation deterministic.
  const images = Object.keys(manifest).sort().map((src) => [src, manifest[src]]);
  return repository.blobSha(JSON.stringify({ schema: 1, stateRevision, images }));
}
function compile(state, revision) {
  return {
    revision,
    config: catalog.publicConfig(state),
    records: catalog.normalize(state),
  };
}
function index(snapshot) {
  return {
    ...snapshot,
    byKey: new Map(snapshot.records.map((p) => [p.key, p])),
  };
}
async function read() {
  if (process.env.LOCAL_DATA === "1" && process.env.LOCAL_PUBLISHED !== "1") {
    const data = await repository.read("state.json", { fallback: true });
    return { ...index(compile(data.state, data.revision)), stale: data.stale };
  }
  // Production serves an atomic deployment. Browsing never fetches state from GitHub.
  if (!cached) cached = index(JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")));
  return cached;
}
function page(
  data,
  { q = "", category = "", keys, page = 1, limit = 100 } = {},
) {
  const matched = catalog.search(data.records, { q, category, keys });
  const pages = Math.max(1, Math.ceil(matched.length / limit));
  const current = Math.min(Math.max(1, page), pages);
  return {
    items: matched
      .slice((current - 1) * limit, current * limit)
      .map((p) => catalog.summarize(p, data.revision)),
    page: current,
    pages,
    total: matched.length,
    catalogTotal: data.records.length,
    config: data.config,
    revision: data.revision,
    stateRevision: data.stateRevision || data.revision,
    stale: !!data.stale,
  };
}
function detail(data, card, premium) {
  const readable = catalog.canRead(
    { freeMode: data.config.freeMode },
    card,
    premium,
  );
  return {
    ...catalog.summarize(card, data.revision),
    revision: data.revision,
    images: card.images.map((src) =>
      catalog.imageUrl(src, 1600, data.revision),
    ),
    prompt: readable ? card.prompt : null,
    locked: !readable,
    copyEnabled: readable,
  };
}
module.exports = { compile, index, read, page, detail, releaseRevision };
