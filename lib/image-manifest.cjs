const fs = require("node:fs");
const path = require("node:path");
const FILE = path.join(__dirname, "../content/image-manifest.json");
let entries;
function get(src) {
  if (!entries) {
    try {
      entries = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      entries = {};
    }
  }
  return entries[src];
}
module.exports = { get };
