# UI Lab — Static UI Components Catalog

A curated, modular catalog of inspiring UI components, micro-interactions, and visual CSS/JS interfaces designed for immediate reuse.

Built with pure vanilla web standards (HTML5, Modern CSS, ES Modules) and hosted on **GitHub Pages** with automated WebP poster generation and a **Hover-to-Play** runtime architecture.

🔗 **Live Demo**: [https://ikaros0102.github.io/ui-lab/](https://ikaros0102.github.io/ui-lab/)

---

## ⚡ Key Architecture & Performance Principles

1. **Static WebP Posters + Hover-to-Play Controller (CodePen / Figma Pattern)**:
   - **Instant Grid Rendering**: Every card renders an optimized `600×420` WebP poster (`assets/thumbnails/{id}.webp`, ~5–30 KB) immediately on load—eliminating blank/unloaded cards even on 4K and Ultrawide monitors displaying 18+ cards at once.
   - **LCP & Priority Tuning**: The primary card poster uses `fetchpriority="high"` with eager loading, initial above-the-fold cards load eagerly, and offscreen cards use native `loading="lazy"` + `decoding="async"`. If a poster is not yet generated locally, `.preview.has-poster-fallback` renders an ambient fallback badge.
   - **Debounced Hover-to-Play**: Resting the cursor on a card for **`190ms`** (`pointerenter` debounce) dynamically mounts the live interactive `iframe[srcdoc]` and crossfades it over the static poster (`opacity: 0 → 1`). Leaving the card (`pointerleave`) starts a **`600ms`** grace timer before unmounting and freeing the DOM node, capped by an LRU pool of **`MAX_ACTIVE_IFRAMES = 2`**.

2. **True Style, Script & Lifecycle Isolation (`SMART_LIFECYCLE_SHIM`)**:
   - Each live preview runs in a sandboxed `iframe` (`sandbox="allow-scripts"`) so global rules (`body`, `:root`, `@keyframes`) never leak into the catalog shell.
   - **In-Memory Storage Polyfill**: Transparent `localStorage` / `sessionStorage` shim prevents opaque-origin security exceptions inside sandboxed scripts.
   - **Automatic `requestAnimationFrame` & `setInterval` Sleep**: Background or scrolling frames automatically queue `requestAnimationFrame` callbacks and skip `setInterval` ticks when offscreen, hidden, or when the parent page broadcasts `uilab:scroll` / `uilab:visibility` events, resuming seamlessly when active.
   - **Web Audio API Protection**: `AudioContext` / `webkitAudioContext` instances are proxied and auto-suspended until an explicit user gesture (`pointerdown` / `keydown`) occurs inside the frame, and are deterministically closed on `pagehide` / unmount.

3. **Monolithic 60–120 FPS Scrolling & GPU Containment**:
   - **Passive Scroll Guard**: A `{ passive: true }` scroll listener with a `140ms` debounce toggles `body.is-scrolling`, applying `pointer-events: none !important` on `.preview` and `iframe` to eliminate cross-document hit-testing overhead while scrolling.
   - **Strict CSS Containment**: `.card` enforces `contain: layout style paint` (plus `content-visibility: auto` and `contain-intrinsic-size: auto 400px` below the fold), while `.preview` enforces `contain: strict; transform: translateZ(0)` to isolate repaints on dedicated GPU composite layers.
   - **Sub-Millisecond Filtering & URL Sync**: Precomputed multi-token search index filters items in `<1ms` by toggling `hidden` attributes and syncing state with URL query parameters.

4. **Get Code & Inspect Modal**:
   - Native accessible `<dialog>` with light-dismiss and discrete top-layer entry transitions.
   - Automatic decomposition of raw component source into **Preview** (full isolated interactive `iframe`), **HTML**, **CSS**, **JS**, and **Full file** tabs.
   - One-click clipboard copy with Popover API toast notifications and an architectural **"How it works"** breakdown.

---

## 🚀 How to Add a New Component in 1 Minute

### Method A: Using the CLI helper
```bash
node tools/new-component.mjs buttons neon-access "Neon Access Button"
```
This scaffolds `components/buttons/neon-access.html` from the template.

### Method B: Manual copy
1. Copy `components/_template.html` to `components/<category>/<your-id>.html`.
2. Fill the `<script type="application/json" data-uilab-meta>` block:
```json
{
  "title": "Neon Access Button",
  "category": "buttons",
  "themes": ["dark", "retro"],
  "tags": ["glow", "neon", "cyberpunk"],
  "description": "HUD access button with pulsing neon borders and audio click feedback.",
  "techniques": ["conic-gradient border", "box-shadow neon glow", "color-mix()"],
  "recipe": "How the core trick works: a concise 2-3 sentence technical explanation in English for future reuse.",
  "preview": { "mode": "center" }
}
```
3. Paste your HTML, CSS, and JS.
4. Rebuild the manifest and generate the WebP thumbnail:
```bash
npm run build
# or step by step:
node tools/build-manifest.mjs
npm run build:thumbs
```
*Note: If you push directly to GitHub without generating thumbnails locally, the GitHub Actions workflow automatically runs `build-manifest.mjs` and `npm run build:thumbs` using headless Chromium before publishing to GitHub Pages.*

---

## 💻 Local Development & Tooling

### 1. Serve the Catalog Locally
Because the catalog uses ES Modules and `fetch()` to load standalone component code and manifests, serve it using any local HTTP server:

```bash
# Node (npx):
npx serve .

# or Python:
python -m http.server 8000
```

### 2. Generate WebP Thumbnails (`tools/generate-thumbnails.mjs`)
```bash
# First-time setup (installs Playwright & Chromium):
npm install
npx playwright install chromium

# Incremental build (generates WebP only for new components missing a thumbnail):
npm run build:thumbs

# Force full regeneration of all component thumbnails:
npm run build:thumbs -- --force
```

### 3. Run the Scroll FPS & Jank Benchmark (`tools/perf-audit.js`)
Open the catalog in your browser, open DevTools Console (`F12`), and run:
```js
import('/tools/perf-audit.js').then(m => m.runScrollBenchmark());
```
This programmatically scrolls the catalog down and up for 5 seconds, measuring **Average FPS**, **P95 / Max Frame Time**, **Jank Frames (`>18.5ms`)**, **Severe Jank (`>33.3ms`)**, **Loaded WebP Posters**, and **Active Iframes**, outputting a summary `console.table`.

---

## 📂 Project Structure

```text
├── index.html                        # Catalog shell (filters, search topbar, grid, modal dialog)
├── package.json                      # Build scripts (build:manifest, build:thumbs) & Playwright dep
├── .github/workflows/
│   ├── pages.yml                     # CI/CD pipeline: manifest + Playwright WebP thumbs + Pages deploy
│   └── deploy.yml                    # Mirror workflow configuration
├── assets/
│   ├── css/
│   │   └── app.css                   # Dark dashboard theme, CSS containment, poster/iframe crossfade
│   ├── thumbnails/                   # Auto-generated 600x420 WebP component posters ({id}.webp)
│   └── js/
│       ├── main.js                   # Bootstrap entrypoint & passive Scroll Guard (.is-scrolling)
│       ├── core/                     # Registry, store, search engine
│       ├── ui/                       # Grid (Hover-to-Play), preview pool (Lifecycle Shim), modal, toast
│       └── lib/                      # Component parser and syntax highlighter
├── components/
│   ├── taxonomy.json                 # Taxonomy categories and themes
│   ├── manifest.json                 # Auto-generated catalog manifest
│   ├── _template.html                # Starter component template
│   ├── backgrounds/                  # Standalone component HTML files by category
│   ├── buttons/
│   ├── cards/
│   ├── forms/
│   ├── loaders/
│   ├── micro-interactions/
│   ├── modals/
│   ├── navigation/
│   ├── text-effects/
│   └── widgets/
└── tools/
    ├── build-manifest.mjs            # Validates meta & builds components/manifest.json
    ├── generate-thumbnails.mjs       # Headless Chromium 600x420 WebP poster generator
    ├── new-component.mjs             # Component scaffolding CLI utility
    └── perf-audit.js                 # Automated 5-second scroll FPS & Jank benchmark
```

---

## 📄 License

- The **UI Components code** (`components/` HTML/CSS/JS) is licensed under the [MIT License](LICENSE-COMPONENTS). Feel free to use them in your personal and commercial projects.
- The **UI Lab platform architecture**, catalog design, and core tooling (`index.html`, `assets/`, `tools/`) are licensed under [CC BY-NC 4.0](LICENSE).
