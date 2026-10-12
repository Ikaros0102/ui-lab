#!/usr/bin/env node
// Quickly scaffolds a new component file from template.
// Usage: node tools/new-component.mjs <category> <id> "<Title>"
// Example: node tools/new-component.mjs buttons neon-access "Neon Access Button"

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [,, category, id, title] = process.argv;

if (!category || !id || !title) {
  console.log('Usage: node tools/new-component.mjs <category> <id> "<Title>"');
  process.exit(1);
}

const templatePath = join(ROOT, "components", "_template.html");
const targetPath = join(ROOT, "components", category, `${id}.html`);

let content = await readFile(templatePath, "utf8");
content = content.replace('"Component Title"', JSON.stringify(title));
content = content.replace('"category": "buttons"', `"category": ${JSON.stringify(category)}`);
content = content.replace('<title>Component Title</title>', `<title>${title}</title>`);

await writeFile(targetPath, content, "utf8");
console.log(`✔ Created component at: components/${category}/${id}.html`);
console.log(`Edit the file and run: node tools/build-manifest.mjs`);
