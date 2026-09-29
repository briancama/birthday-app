// Regenerates docs/site-inventory.json and the generated timestamp in docs/site-inventory.md.
// Usage: npm run inventory
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function scan(file) {
  const src = fs.readFileSync(file, "utf8");
  const css = [...src.matchAll(/href=["']([^"']*\.css)[^"']*["']/g)].map((m) => m[1]);
  const scripts = [...src.matchAll(/src=["']([^"']*\.js)[^"']*["']/g)].map((m) => m[1]);
  const imports = [...src.matchAll(/import\s[^"']*["']([^"']*\.js)["']/g)].map((m) => m[1]);
  const partials = [...src.matchAll(/include\(["']([^"')]+)["']/g)].map((m) => m[1]);
  const all = [...scripts, ...imports];
  return {
    css: [...new Set(css)],
    pageScripts: [...new Set(all.filter((s) => s.includes("/pages/")))],
    components: [
      ...new Set(
        [...src.matchAll(/["'][^"']*(components\/[a-zA-Z0-9-]+\.js)["']/g)].map((m) => m[1])
      ),
    ],
    partials: [...new Set(partials)],
    otherScripts: [
      ...new Set(all.filter((s) => !s.includes("/pages/") && !s.includes("components/"))),
    ],
  };
}

const out = { generated: new Date().toISOString().slice(0, 10), staticPages: {}, templates: {} };
for (const f of fs
  .readdirSync(root)
  .filter((f) => f.endsWith(".html"))
  .sort()) {
  out.staticPages[f] = scan(path.join(root, f));
}
const templatesDir = path.join(root, "templates");
for (const f of fs
  .readdirSync(templatesDir)
  .filter((f) => f.endsWith(".ejs"))
  .sort()) {
  out.templates["templates/" + f] = scan(path.join(templatesDir, f));
}

const jsonPath = path.join(root, "docs/site-inventory.json");
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2) + "\n");

const mdPath = path.join(root, "docs/site-inventory.md");
const md = fs.readFileSync(mdPath, "utf8");
fs.writeFileSync(
  mdPath,
  md.replace(/^Generated: \*\*[\d-]+\*\*/m, `Generated: **${out.generated}**`)
);

console.log(
  `site-inventory.json regenerated: ${Object.keys(out.staticPages).length} static pages, ${Object.keys(out.templates).length} templates.`
);
console.log(
  "Note: review docs/site-inventory.md tables manually if pages/templates were added or removed."
);
