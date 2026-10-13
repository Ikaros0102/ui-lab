# UI Lab — Static UI Components Catalog

A curated, modular catalog of inspiring UI components, micro-interactions, and visual CSS tricks designed for immediate reuse. 

Built with pure vanilla web standards (HTML5, Modern CSS, ES Modules) and hosted effortlessly on **GitHub Pages** with zero backend or build-step dependencies.

🔗 **Live Demo**: [https://ikaros0102.github.io/ui-lab/](https://ikaros0102.github.io/ui-lab/)

---

## ⚡ Key Architecture Principles

1. **True Style & Script Isolation (`iframe srcdoc`)**:
   - Each component is previewed in a sandboxed `iframe` with `sandbox="allow-scripts"`.
   - Global styles (`body`, `:root`, `@keyframes`) never leak into the catalog shell or into neighboring components.
   - Includes a built-in transparent in-memory `localStorage` shim so sandboxed scripts function properly without cross-origin exceptions.

2. **Ultra-Fast Performance (Built for 300+ items)**:
   - **Lazy preview rendering**: Handled via `IntersectionObserver` with a hard limit of active live iframes in memory (LRU eviction).
   - **Layout optimization**: Cards outside the initial viewport utilize `content-visibility: auto` and `contain-intrinsic-size` to prevent layout reflow bottlenecks.
   - **Instant search & filtering**: Precomputed multi-token search index operates in `<1ms` without DOM re-renders (toggles `hidden` attributes).
   - **URL Synchronization**: Selected filters and search queries are reflected in the URL parameters for direct bookmarking and sharing.

3. **Get Code & Inspect**:
   - Native accessible `<dialog>` with light-dismiss and discrete top-layer entry transitions.
   - Automatic decomposition into **HTML**, **CSS**, **JS**, and **Full file** tabs.
   - One-click copy with modern Popover API toast notifications.
   - Educational breakdown: each component includes an explanation of its techniques and recipe.

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
4. Run the manifest generator:
```bash
node tools/build-manifest.mjs
```
*Note: If you push directly to GitHub, the GitHub Actions workflow runs `build-manifest.mjs` and publishes to Pages automatically.*

---

## 💻 Local Development

Because the catalog uses ES Modules and `fetch()` to load standalone component code and manifests, serve it using any local HTTP server:

```bash
# Python:
python -m http.server 8000

# or Node (npx):
npx serve .
```
Then open `http://localhost:8000` in your browser.

---

## 📂 Project Structure

```text
├── index.html                   # Catalog shell (filters, search topbar, grid, modal dialog)
├── assets/
│   ├── css/
│   │   └── app.css              # Minimal dark dashboard theme (OKLCH, layers, dialog animation)
│   └── js/
│       ├── main.js              # Bootstrap entrypoint
│       ├── core/                # Registry, store, search engine
│       ├── ui/                  # Grid, filters, preview pool, code modal, toast
│       └── lib/                 # Parser and syntax highlighter
├── components/
│   ├── taxonomy.json            # Taxonomy categories and themes
│   ├── manifest.json            # Auto-generated catalog manifest
│   ├── _template.html           # Starter component template
│   ├── buttons/                 # Component HTML files
│   ├── cards/
│   ├── modals/
│   ├── navigation/
│   ├── widgets/
│   └── ...
└── tools/
    ├── build-manifest.mjs       # Validates & builds manifest.json
    └── new-component.mjs        # Scaffolding utility
```

---

## 📄 License

- The **UI Components code** (`components/` HTML/CSS/JS) is licensed under the [MIT License](LICENSE-COMPONENTS). Feel free to use them in your personal and commercial projects.
- The **UI Lab platform architecture**, catalog design, and core tooling (`index.html`, `assets/`, `tools/`) are licensed under [CC BY-NC 4.0](LICENSE).

