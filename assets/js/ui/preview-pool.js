// ui/preview-pool.js
// Manages sandboxed iframe lifecycle, viewport scaling, and LRU memory pooling.

import { getComponentCode } from "../core/registry.js";
import { stripMeta } from "../lib/parse-component.js";

const MAX_ACTIVE_IFRAMES = 24;
const activeIframes = new Map(); // id -> { container, iframe, item }
const lruOrder = []; // array of item ids

// In-memory Storage polyfill so sandboxed iframes don't throw security error
const STORAGE_SHIM = `<script>
(() => {
  const mk = () => {
    const m = new Map();
    return {
      getItem: (k) => m.has(k) ? m.get(k) : null,
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      key: (i) => Array.from(m.keys())[i] ?? null,
      get length() { return m.size; }
    };
  };
  for (const n of ["localStorage", "sessionStorage"]) {
    try { window[n].length; }
    catch {
      try {
        Object.defineProperty(window, n, { value: mk(), configurable: true, writable: true });
      } catch (e) {}
    }
  }
})();
</script>`;

// Global reset for iframe preview to avoid scrollbars and center content nicely
const IFRAME_RESET_STYLES = `<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  overflow: hidden !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
</style>`;

export function buildSrcdoc(rawHtml, mode = "center") {
  let clean = stripMeta(rawHtml);
  const injection = STORAGE_SHIM + IFRAME_RESET_STYLES;
  // Inject storage shim and reset right after <head> or at start
  if (clean.includes("<head>")) {
    clean = clean.replace("<head>", `<head>${injection}`);
  } else {
    clean = injection + clean;
  }
  return clean;
}

export function updateIframeScale(container, iframe, item) {
  if (!iframe || !container) return;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (!cw || !ch) return;

  const mode = item.preview?.mode || "center";
  
  if (mode === "page") {
    // For page components (e.g. LCD stopwatch, terminal, glass card)
    const virtW = item.preview?.width || 960;
    const virtH = item.preview?.height || 700;

    // Scale down so it fully fits inside cw x ch without any scrollbars
    const scale = Math.min(cw / virtW, ch / virtH);

    iframe.style.minWidth = `${virtW}px`;
    iframe.style.width = `${virtW}px`;
    iframe.style.height = `${virtH}px`;
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = "top left";

    // Center in the container
    const leftOffset = (cw - virtW * scale) / 2;
    const topOffset = (ch - virtH * scale) / 2;
    iframe.style.left = `${Math.round(leftOffset)}px`;
    iframe.style.top = `${Math.round(topOffset)}px`;
  } else {
    // For "center" widgets (buttons, toggles, notifications, cards):
    // Use an adequate virtual canvas if the widget needs room (e.g. 420x420)
    // or let it fit and auto-scale if smaller than required.
    const virtW = item.preview?.width || 420;
    const virtH = item.preview?.height || 420;

    const scale = Math.min(1, Math.min(cw / virtW, ch / virtH));
    if (scale < 1) {
      iframe.style.minWidth = `${virtW}px`;
      iframe.style.width = `${virtW}px`;
      iframe.style.height = `${virtH}px`;
      iframe.style.transform = `scale(${scale})`;
      iframe.style.transformOrigin = "top left";
      const leftOffset = (cw - virtW * scale) / 2;
      const topOffset = (ch - virtH * scale) / 2;
      iframe.style.left = `${Math.round(leftOffset)}px`;
      iframe.style.top = `${Math.round(topOffset)}px`;
    } else {
      iframe.style.minWidth = "100%";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.transform = "none";
      iframe.style.left = "0";
      iframe.style.top = "0";
    }
  }
}

export async function mountPreview(container, item) {
  const id = item.id;
  if (activeIframes.has(id)) {
    // Touch LRU
    const idx = lruOrder.indexOf(id);
    if (idx > -1) lruOrder.splice(idx, 1);
    lruOrder.push(id);
    return;
  }

  // Evict if exceeded
  if (lruOrder.length >= MAX_ACTIVE_IFRAMES) {
    const oldestId = lruOrder.shift();
    unmountPreview(oldestId);
  }

  const rawCode = await getComponentCode(item.path);
  const srcdoc = buildSrcdoc(rawCode, item.preview?.mode);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("loading", "lazy");
  iframe.title = item.title;
  iframe.srcdoc = srcdoc;

  iframe.addEventListener("load", () => {
    iframe.classList.add("is-ready");
    updateIframeScale(container, iframe, item);
  });

  container.appendChild(iframe);
  activeIframes.set(id, { container, iframe, item });
  lruOrder.push(id);

  updateIframeScale(container, iframe, item);
}

export function unmountPreview(id) {
  const entry = activeIframes.get(id);
  if (!entry) return;
  const { iframe } = entry;
  if (iframe && iframe.parentNode) {
    iframe.parentNode.removeChild(iframe);
  }
  activeIframes.delete(id);
  const idx = lruOrder.indexOf(id);
  if (idx > -1) lruOrder.splice(idx, 1);
}

export function setupResizeHandler() {
  window.addEventListener("resize", () => {
    for (const { container, iframe, item } of activeIframes.values()) {
      updateIframeScale(container, iframe, item);
    }
  });
}
