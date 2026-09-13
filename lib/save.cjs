const crypto = require("node:crypto");
const sharp = require("sharp");
const repository = require("./repository.cjs");
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
const object = (x) => !!x && typeof x === "object" && !Array.isArray(x);
function validateState(state) {
  if (
    !object(state) ||
    !Array.isArray(state.added) ||
    !Array.isArray(state.order) ||
    !Array.isArray(state.deleted) ||
    !object(state.customImgs)
  )
    return false;
  if (
    state.added.length > 50000 ||
    ![...state.order, ...state.deleted, ...Object.keys(state.customImgs)].every(
      (k) => typeof k === "string" && ID.test(k),
    )
  )
    return false;
  const keys = new Set();
  for (const card of state.added) {
    if (
      !object(card) ||
      !ID.test(card.key) ||
      keys.has(card.key) ||
      typeof card.title !== "string" ||
      typeof card.prompt !== "string" ||
      card.title.length > 2000 ||
      card.prompt.length > 200000
    )
      return false;
    if (
      card.images !== undefined &&
      (!Array.isArray(card.images) ||
        !card.images.every((x) => typeof x === "string"))
    )
      return false;
    if (
      card.cats !== undefined &&
      (!Array.isArray(card.cats) ||
        !card.cats.every((x) => typeof x === "string"))
    )
      return false;
    keys.add(card.key);
  }
  return Object.values(state.customImgs).every((x) => typeof x === "string");
}
async function uploadImage(key, src) {
  if (!ID.test(key) || typeof src !== "string")
    throw Object.assign(new Error("תמונה לא תקינה"), { status: 400 });
  if (!src.startsWith("data:")) return src;
  const match = src.match(
    /^data:image\/(?:jpeg|jpg|png|webp|avif);base64,([A-Za-z0-9+/=\s]+)$/,
  );
  if (!match)
    throw Object.assign(new Error("פורמט התמונה אינו נתמך"), { status: 400 });
  const input = Buffer.from(match[1], "base64");
  if (input.length > 12 * 1024 * 1024)
    throw Object.assign(new Error("התמונה גדולה מדי"), { status: 413 });
  // Hash the processed image: replacing an image always creates a new immutable URL.
  const output = await sharp(input, { limitInputPixels: 40000000 })
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 88 })
    .toBuffer();
  const hash = crypto
    .createHash("sha256")
    .update(output)
    .digest("hex")
    .slice(0, 24);
  const file = `images/asset_${hash}.webp`;
  const existing = await repository.github(file);
  if (existing.status !== 200) {
    if (existing.status !== 404)
      throw new Error("לא ניתן לבדוק את התמונה בשרת");
    const saved = await repository.github(file, {
      method: "PUT",
      body: JSON.stringify({
        message: "Upload image asset",
        content: output.toString("base64"),
      }),
    });
    if (![200, 201].includes(saved.status))
      throw new Error("העלאת התמונה נכשלה");
  }
  return repository.RAW + file;
}
async function saveState(body) {
  if (
    !validateState(body.state) ||
    !/^[a-f0-9]{40}$/.test(body.baseRevision || "")
  )
    throw Object.assign(
      new Error("נתוני שמירה או גרסת בסיס אינם תקינים. טענו מחדש."),
      { status: 400 },
    );
  const current = await repository.read("state.json", { fresh: true });
  if (current.revision !== body.baseRevision)
    throw Object.assign(
      new Error(
        "בוצעה עריכה בלשונית אחרת. השינויים שלך לא נדרסו. ייצאו גיבוי וטענו מחדש לפני מיזוג.",
      ),
      { status: 409 },
    );
  const state = JSON.parse(JSON.stringify(body.state));
  delete state._originals;
  delete state._revision;
  for (const [key, src] of Object.entries(state.customImgs))
    state.customImgs[key] = await uploadImage(key, src);
  for (const card of state.added) {
    if (card.images) {
      const images = [];
      for (let i = 0; i < card.images.length; i++)
        images.push(await uploadImage(card.key + "_img" + i, card.images[i]));
      card.images = images;
    }
  }
  if (Array.isArray(state.servicesConfig?.gallery)) {
    for (let i = 0; i < state.servicesConfig.gallery.length; i++) {
      const item = state.servicesConfig.gallery[i];
      if (item?.src) item.src = await uploadImage("service_" + i, item.src);
    }
  }
  state._publishedAt = Date.now();
  const result = await repository.github("state.json", {
    method: "PUT",
    body: JSON.stringify({
      message: "Update state",
      sha: current.revision,
      content: Buffer.from(JSON.stringify(state, null, 2)).toString("base64"),
    }),
  });
  if (result.status === 409)
    throw Object.assign(
      new Error(
        "הנתונים השתנו בזמן השמירה. יש לטעון את הגרסה החדשה לפני שמירה נוספת.",
      ),
      { status: 409 },
    );
  if (![200, 201].includes(result.status))
    throw new Error("שמירת הנתונים נכשלה");
  repository.invalidate();
  return {
    ok: true,
    _publishedAt: state._publishedAt,
    revision: result.data.content.sha,
  };
}
module.exports = { validateState, uploadImage, saveState };
