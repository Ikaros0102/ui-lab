// ui/preview-pool.js
// Manages sandboxed iframe lifecycle, viewport scaling, Smart Lifecycle Shim,
// scroll-idle deferred mounting, and LRU memory pooling.

import { getComponentCode } from "../core/registry.js";
import { stripMeta } from "../lib/parse-component.js";

const MAX_ACTIVE_IFRAMES = 2;
const activeIframes = new Map(); // id -> { container, iframe, item }
const pendingMounts = new Map(); // id -> { container, item }
const cancelledMounts = new Set(); // ids cancelled while async fetch in-flight
const lruOrder = []; // array of item ids

let isUserScrolling = false;
let idleFlushHandle = null;

const scheduleIdle = globalThis.requestIdleCallback
  ? (cb) => globalThis.requestIdleCallback(cb, { timeout: 120 })
  : (cb) => setTimeout(cb, 16);

const cancelIdle = globalThis.cancelIdleCallback
  ? (id) => globalThis.cancelIdleCallback(id)
  : (id) => clearTimeout(id);

// In-memory Storage polyfill + Smart Lifecycle Manager (rAF/Interval sleep + Web Audio mute)
const SMART_LIFECYCLE_SHIM = `<script>
(() => {
  // 1. In-memory Storage Polyfill for opaque sandboxed origin
  const mkStorage = () => {
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
        Object.defineProperty(window, n, { value: mkStorage(), configurable: true, writable: true });
      } catch (e) {}
    }
  }

  // 2. Smart Lifecycle State (Sleep when offscreen, hidden, or parent is scrolling)
  let isVisible = !document.hidden;
  let isParentScrolling = false;
  let hasUserInteracted = false;

  const isSleeping = () => !isVisible || document.hidden || isParentScrolling;

  // 3. requestAnimationFrame sleep / queue mechanism
  const origRAF = window.requestAnimationFrame.bind(window);
  const origCAF = window.cancelAnimationFrame.bind(window);
  let rafIdSeed = 100000;
  const sleepingRafQueue = new Map(); // virtualId -> callback
  const activeRafMap = new Map(); // virtualId -> nativeId

  function flushSleepingRAF() {
    if (isSleeping() || sleepingRafQueue.size === 0) return;
    const entries = Array.from(sleepingRafQueue.entries());
    sleepingRafQueue.clear();
    for (const [vId, cb] of entries) {
      const nativeId = origRAF((ts) => {
        activeRafMap.delete(vId);
        if (!isSleeping()) {
          cb(ts);
        } else {
          sleepingRafQueue.set(vId, cb);
        }
      });
      activeRafMap.set(vId, nativeId);
    }
  }

  window.requestAnimationFrame = function(callback) {
    if (typeof callback !== "function") return 0;
    const vId = ++rafIdSeed;
    if (isSleeping()) {
      sleepingRafQueue.set(vId, callback);
      return vId;
    }
    const nativeId = origRAF((ts) => {
      activeRafMap.delete(vId);
      if (isSleeping()) {
        sleepingRafQueue.set(vId, callback);
      } else {
        callback(ts);
      }
    });
    activeRafMap.set(vId, nativeId);
    return vId;
  };

  window.cancelAnimationFrame = function(vId) {
    if (sleepingRafQueue.has(vId)) {
      sleepingRafQueue.delete(vId);
    }
    if (activeRafMap.has(vId)) {
      origCAF(activeRafMap.get(vId));
      activeRafMap.delete(vId);
    }
  };

  // 4. setInterval throttling / sleeping when offscreen or scrolling
  const origSetInterval = window.setInterval.bind(window);
  const origClearInterval = window.clearInterval.bind(window);

  window.setInterval = function(handler, timeout = 0, ...args) {
    if (typeof handler !== "function") {
      return origSetInterval(handler, timeout, ...args);
    }
    const safeTimeout = Math.max(timeout, 16);
    return origSetInterval(() => {
      if (isSleeping()) return;
      handler(...args);
    }, safeTimeout);
  };

  // 5. Web Audio API (AudioContext) Auto-Muting & Lifecycle Management
  const trackedAudioContexts = new Set();
  const patchAudioContext = (CtxClass) => {
    if (!CtxClass) return undefined;
    const PatchedAudioContext = function(...args) {
      const ctx = new CtxClass(...args);
      trackedAudioContexts.add(ctx);
      const origResume = ctx.resume.bind(ctx);
      const origSuspend = ctx.suspend.bind(ctx);

      ctx.resume = function() {
        if (!hasUserInteracted || isSleeping()) {
          return origSuspend();
        }
        return origResume();
      };

      if (!hasUserInteracted || isSleeping()) {
        try { origSuspend(); } catch (e) {}
      }
      return ctx;
    };
    PatchedAudioContext.prototype = CtxClass.prototype;
    Object.setPrototypeOf(PatchedAudioContext, CtxClass);
    return PatchedAudioContext;
  };

  if ("AudioContext" in window) {
    window.AudioContext = patchAudioContext(window.AudioContext);
  }
  if ("webkitAudioContext" in window) {
    window.webkitAudioContext = patchAudioContext(window.webkitAudioContext);
  }

  function syncAudioContexts() {
    for (const ctx of trackedAudioContexts) {
      if (ctx.state === "closed") continue;
      try {
        if (isSleeping() || !hasUserInteracted) {
          if (ctx.state === "running") ctx.suspend();
        }
      } catch (e) {}
    }
  }

  function syncLifecycle() {
    if (!isSleeping()) {
      flushSleepingRAF();
    }
    syncAudioContexts();
  }

  // Track user gestures to unlock audio only on explicit interaction
  const onUserGesture = () => {
    hasUserInteracted = true;
    syncAudioContexts();
  };
  window.addEventListener("pointerdown", onUserGesture, { passive: true, once: true });
  window.addEventListener("keydown", onUserGesture, { passive: true, once: true });

  // IntersectionObserver inside iframe to detect viewport visibility
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        isVisible = entry.isIntersecting;
      }
      syncLifecycle();
    }, { threshold: 0.01 });
    if (document.documentElement) {
      io.observe(document.documentElement);
    } else {
      window.addEventListener("DOMContentLoaded", () => io.observe(document.documentElement), { once: true });
    }
  }

  document.addEventListener("visibilitychange", () => {
    syncLifecycle();
  });

  // Listen for parent lifecycle / scroll signals
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "uilab:scroll") {
      isParentScrolling = Boolean(data.scrolling);
      syncLifecycle();
    } else if (data.type === "uilab:visibility") {
      isVisible = Boolean(data.visible);
      syncLifecycle();
    }
  });

  // Clean up audio contexts on frame unload
  window.addEventListener("pagehide", () => {
    for (const ctx of trackedAudioContexts) {
      try { if (ctx.state !== "closed") ctx.close(); } catch (e) {}
    }
    trackedAudioContexts.clear();
  });
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
  const injection = SMART_LIFECYCLE_SHIM + IFRAME_RESET_STYLES;
  // Inject lifecycle shim and reset right after <head> or at start
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
    const virtW = item.preview?.width || 960;
    const virtH = item.preview?.height || 700;

    const scale = Math.min(cw / virtW, ch / virtH);

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

async function performMount(container, item) {
  const id = item.id;
  cancelledMounts.delete(id);

  if (activeIframes.has(id)) {
    const idx = lruOrder.indexOf(id);
    if (idx > -1) lruOrder.splice(idx, 1);
    lruOrder.push(id);
    return;
  }

  const rawCode = await getComponentCode(item.path);

  // Abort if unmounted or scrolled past while fetching
  if (cancelledMounts.has(id) || !container.isConnected) {
    cancelledMounts.delete(id);
    return;
  }

  // If user started scrolling again while code was loading, defer DOM creation
  if (isUserScrolling) {
    pendingMounts.set(id, { container, item });
    return;
  }

  // Evict oldest if pool limit reached
  while (lruOrder.length >= MAX_ACTIVE_IFRAMES) {
    const oldestId = lruOrder.shift();
    if (oldestId) unmountPreview(oldestId);
  }

  const srcdoc = buildSrcdoc(rawCode, item.preview?.mode);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("loading", "lazy");
  iframe.title = item.title;
  iframe.srcdoc = srcdoc;

  iframe.addEventListener("load", () => {
    iframe.classList.add("is-ready");
    updateIframeScale(container, iframe, item);
  }, { once: true });

  container.appendChild(iframe);
  activeIframes.set(id, { container, iframe, item });
  lruOrder.push(id);

  updateIframeScale(container, iframe, item);
}

function flushPendingMounts() {
  if (isUserScrolling || pendingMounts.size === 0) return;

  // Keep only the most recent MAX_ACTIVE_IFRAMES items in queue if more accumulated
  while (pendingMounts.size > MAX_ACTIVE_IFRAMES) {
    const firstKey = pendingMounts.keys().next().value;
    pendingMounts.delete(firstKey);
  }

  const nextEntry = pendingMounts.entries().next();
  if (nextEntry.done) return;

  const [id, { container, item }] = nextEntry.value;
  pendingMounts.delete(id);

  idleFlushHandle = scheduleIdle(async () => {
    idleFlushHandle = null;
    if (isUserScrolling) {
      pendingMounts.set(id, { container, item });
      return;
    }
    await performMount(container, item);
    if (pendingMounts.size > 0 && !isUserScrolling) {
      flushPendingMounts();
    }
  });
}

export function mountPreview(container, item) {
  const id = item.id;
  cancelledMounts.delete(id);

  if (activeIframes.has(id)) {
    const idx = lruOrder.indexOf(id);
    if (idx > -1) lruOrder.splice(idx, 1);
    lruOrder.push(id);
    return;
  }

  // Defer mounting if user is actively scrolling
  if (isUserScrolling) {
    pendingMounts.set(id, { container, item });
    return;
  }

  performMount(container, item);
}

export function unmountPreview(id) {
  pendingMounts.delete(id);
  cancelledMounts.add(id);

  const entry = activeIframes.get(id);
  if (!entry) return;
  const { iframe } = entry;
  if (iframe) {
    try {
      iframe.contentWindow?.postMessage({ type: "uilab:visibility", visible: false }, "*");
    } catch (e) {}
    iframe.srcdoc = "";
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
  activeIframes.delete(id);
  const idx = lruOrder.indexOf(id);
  if (idx > -1) lruOrder.splice(idx, 1);
}

export function notifyScrollState(scrolling) {
  if (isUserScrolling === scrolling) return;
  isUserScrolling = scrolling;

  // Broadcast scroll state to active iframes so they pause rAF/timers during scroll
  for (const { iframe } of activeIframes.values()) {
    try {
      iframe.contentWindow?.postMessage({ type: "uilab:scroll", scrolling }, "*");
    } catch (e) {}
  }

  if (scrolling) {
    if (idleFlushHandle) {
      cancelIdle(idleFlushHandle);
      idleFlushHandle = null;
    }
  } else {
    flushPendingMounts();
  }
}

export function getPoolStats() {
  return {
    activeCount: activeIframes.size,
    pendingCount: pendingMounts.size,
    maxPoolSize: MAX_ACTIVE_IFRAMES
  };
}

export function setupResizeHandler() {
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const { container, iframe, item } of activeIframes.values()) {
        updateIframeScale(container, iframe, item);
      }
    }, 80);
  }, { passive: true });
}
