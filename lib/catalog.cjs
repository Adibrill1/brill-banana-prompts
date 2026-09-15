const originals = require("../content/originals.json");
const { RAW } = require("./repository.cjs");
const imageManifest = require("./image-manifest.cjs");

function imageSource(value) {
  if (typeof value !== "string" || !value || value.startsWith("data:"))
    return "";
  if (/^\/?images\/[\w.-]+$/.test(value)) return RAW + value.replace(/^\//, "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (
      /^brill-banana-prompts(?:-v3)?\.vercel\.app$/.test(url.hostname) &&
      /^\/images\/[\w.-]+$/.test(url.pathname)
    )
      return RAW + url.pathname.slice(1);
    return url.href;
  } catch {
    return "";
  }
}
function optimizable(src) {
  return (
    src.startsWith(RAW + "images/") ||
    /^https:\/\/nanobananai\.site\/images\/case\d+\/output\.webp$/.test(src)
  );
}
function imageUrl(src, width, version) {
  const prepared = imageManifest.get(src);
  if (prepared?.widths.includes(width)) return `/media/${prepared.hash}-${width}.webp`;
  const immutable = src.match(/\/asset_([a-f0-9]{24})\.webp$/)?.[1];
  return optimizable(src)
    ? `/api/img?src=${encodeURIComponent(src)}&w=${width}&v=${encodeURIComponent(immutable || version)}`
    : src;
}
function normalize(state) {
  const categories = Array.isArray(state.customCats) ? state.customCats : [];
  const byLabel = new Map(categories.map((c) => [c.label, c.id]));
  const deleted = new Set(state.deleted || []);
  const records = [];
  for (const base of [...originals, ...(state.added || [])]) {
    if (deleted.has(base.key)) continue;
    const p = { ...base, ...(state.promptEdits?.[base.key] || {}) };
    const cats = p.cats?.length
      ? p.cats
      : byLabel.has(p.cat)
        ? [byLabel.get(p.cat)]
        : [];
    const sources = state.customImgs?.[p.key]
      ? [state.customImgs[p.key]]
      : p.images || [];
    records.push({
      key: p.key,
      title: p.title || "",
      prompt: p.prompt || "",
      cat: p.cat || "",
      cats,
      images: sources.map(imageSource).filter(Boolean),
      free: !!state.freePrompts?.[p.key],
    });
  }
  // applyState appends each ordered card to the end. Unlisted cards remain first.
  const byKey = new Map(records.map((p) => [p.key, p]));
  for (const key of state.order || [])
    if (byKey.has(key)) {
      const p = byKey.get(key);
      byKey.delete(key);
      byKey.set(key, p);
    }
  return [...byKey.values()].map((p, index) => ({ ...p, number: index + 1 }));
}
function mode(state) {
  return state.freeMode || (state.freeEnabled ? "partial" : "off");
}
function canRead(state, card, premium) {
  return (
    premium ||
    mode(state) === "full" ||
    mode(state) === "catalog" ||
    (mode(state) === "partial" && card.free)
  );
}
function summarize(p, revision) {
  const src = p.images[0] || "";
  return {
    key: p.key,
    number: p.number,
    title: p.title,
    cats: p.cats,
    cat: p.cat,
    free: p.free,
    image: src
      ? {
          src: imageUrl(src, 640, revision),
          srcSet: optimizable(src)
            ? [320, 480, 640, 960]
                .map((w) => `${imageUrl(src, w, revision)} ${w}w`)
                .join(", ")
            : "",
          original: src,
          count: p.images.length,
        }
      : null,
  };
}
function search(records, { q = "", category = "", keys }) {
  const query = q.toLowerCase().trim();
  const wanted = keys === undefined ? null : new Set(keys);
  return records.filter(
    (p) =>
      (!query || (p.title + " " + p.prompt).toLowerCase().includes(query)) &&
      (!wanted || wanted.has(p.key)) &&
      (!category ||
        (category === "free"
          ? p.free
          : category === "paid"
            ? !p.free
            : p.cats.includes(category))),
  );
}
function publicConfig(state) {
  return {
    header: state.headerConfig || {},
    categories: state.customCats || [],
    freeMode: mode(state),
    shareWhatsApp: state.shareWhatsApp !== false,
    wa: state.waConfig || {},
    modal: state.modalConfig || {},
    services: state.servicesConfig || {},
  };
}
module.exports = {
  originals,
  normalize,
  search,
  summarize,
  publicConfig,
  canRead,
  mode,
  imageSource,
  optimizable,
  imageUrl,
};
