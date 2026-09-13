// Upload each distinct pending image once, including secondary images and services.
// Successful partial uploads remain usable if a later request fails and is retried.
export async function uploadPendingImages(
  state,
  services,
  { compress, upload, onProgress = () => {} },
) {
  const pending = new Map();
  function add(object, key) {
    const src = object[key];
    if (typeof src !== "string" || !src.startsWith("data:")) return;
    if (!pending.has(src)) pending.set(src, []);
    pending.get(src).push({ object, key });
  }
  for (const key of Object.keys(state.customImgs || {}))
    add(state.customImgs, key);
  for (const card of state.added || [])
    for (let i = 0; i < (card.images || []).length; i++) add(card.images, i);
  for (const item of services?.gallery || []) add(item, "src");
  let index = 0;
  for (const [original, targets] of pending) {
    let src = original;
    onProgress(index + 1, pending.size);
    if (src.length > 3000000) src = await compress(src, 1200, 0.82);
    if (src.length > 3000000) src = await compress(src, 900, 0.7);
    if (src.length > 3000000)
      throw new Error("התמונה גדולה מדי להעלאה. יש לבחור תמונה קטנה יותר.");
    const url = await upload("upload_" + index++, src);
    if (typeof url !== "string" || !url.startsWith("https://"))
      throw new Error("השרת לא אישר את העלאת התמונה");
    // Do not overwrite a newer edit made while the upload was pending.
    for (const { object, key } of targets)
      if (object[key] === original) object[key] = url;
  }
}
