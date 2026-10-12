#!/usr/bin/env node
// Scans components/**/*.html, extracts the <script data-uilab-meta> JSON,
// validates it against components/taxonomy.json and writes components/manifest.json.
// Zero dependencies. Usage: node tools/build-manifest.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, basename, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENTS = join(ROOT, "components");
const META_RE = /<script[^>]*\bdata-uilab-meta\b[^>]*>([\s\S]*?)<\/script>/i;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const taxonomy = JSON.parse(await readFile(join(COMPONENTS, "taxonomy.json"), "utf8"));
const categories = new Set(taxonomy.categories.map((c) => c.id));
const themes = new Set(taxonomy.themes.map((t) => t.id));

const errors = [];
const seen = new Map();
const items = [];

for (const file of (await walk(COMPONENTS)).sort()) {
  const rel = relative(COMPONENTS, file).split(sep).join("/");
  const fail = (msg) => errors.push(`✖ ${rel}: ${msg}`);
  const src = await readFile(file, "utf8");
  const match = src.match(META_RE);
  if (!match) { fail("missing <script type=\"application/json\" data-uilab-meta> block"); continue; }

  let meta;
  try { meta = JSON.parse(match[1]); }
  catch (e) { fail(`invalid meta JSON — ${e.message}`); continue; }

  const id = basename(file, ".html");
  const folder = rel.includes("/") ? rel.split("/")[0] : undefined;
  const category = meta.category ?? folder;

  if (!ID_RE.test(id)) fail(`file name "${id}" must be kebab-case (a-z, 0-9, -)`);
  if (seen.has(id)) fail(`duplicate id "${id}" (also in ${seen.get(id)})`);
  seen.set(id, rel);
  if (!meta.title || typeof meta.title !== "string") fail("\"title\" is required");
  if (!categories.has(category)) fail(`unknown category "${category}" (allowed: ${[...categories].join(", ")})`);
  const t = Array.isArray(meta.themes) ? meta.themes : meta.theme ? [meta.theme] : [];
  if (!t.length) fail("\"themes\" must contain at least one theme");
  for (const th of t) if (!themes.has(th)) fail(`unknown theme "${th}" (allowed: ${[...themes].join(", ")})`);
  const mode = meta.preview?.mode ?? "center";
  if (!["center", "page"].includes(mode)) fail(`preview.mode must be "center" or "page"`);

  items.push({
    id,
    path: `components/${rel}`,
    title: meta.title,
    category,
    themes: t,
    tags: meta.tags ?? [],
    description: meta.description ?? "",
    techniques: meta.techniques ?? [],
    recipe: meta.recipe ?? "",
    preview: { mode, ...meta.preview },
    hasJs: /<script(?![^>]*data-uilab-meta)(?![^>]*type=["']application\/json)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(src),
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} error(s). manifest.json was NOT written.`);
  process.exit(1);
}

const manifest = { generated: new Date().toISOString(), count: items.length, items };
await writeFile(join(COMPONENTS, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(`✔ manifest.json — ${items.length} component(s)`);
