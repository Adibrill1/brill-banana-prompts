import fs from "node:fs";
for (const file of ["admin.html", "services.html", "og-image.jpg"])
  fs.copyFileSync(file, "dist/" + file);
fs.cpSync("editor", "dist/editor", { recursive: true });
// State, original prompts, license keys and the source image archive stay out of static output.
for (const file of ["state.json", "keys.json", "content"]) {
  if (fs.existsSync("dist/" + file))
    throw new Error("Private data found in public build: " + file);
}
