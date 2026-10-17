#!/usr/bin/env node
/**
 * UI Lab — Automated WebP Thumbnail Generator (tools/generate-thumbnails.mjs)
 *
 * Reads components/manifest.json, launches headless Chromium via Playwright
 * (with automatic fallback to local Chrome/Edge --remote-debugging-pipe CDP),
 * renders each component respecting its preview.mode ("center" | "page"),
 * waits 300ms for initial entrance animations/shaders to settle, and captures
 * a 600x420 WebP poster (quality ~85%, 15–30 KB) into assets/thumbnails/{id}.webp.
 *
 * Flags:
 *   --force   Regenerate all thumbnails even if assets/thumbnails/{id}.webp exists.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "components", "manifest.json");
const THUMBS_DIR = join(ROOT, "assets", "thumbnails");

const THUMB_WIDTH = 600;
const THUMB_HEIGHT = 420;
const ASPECT = THUMB_WIDTH / THUMB_HEIGHT;
const DEFAULT_QUALITY = 85;
const RENDER_SETTLE_MS = 300;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const HIDE_SCROLLBAR_CSS = `
html, body {
  overflow: hidden !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
`;

async function fileExists(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function startStaticServer(rootDir) {
  return new Promise((resolveServer, rejectServer) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const safePath = resolve(rootDir, "." + urlPath);
        if (!safePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        const data = await readFile(safePath);
        const ext = extname(safePath).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolveServer({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

function computeViewport(item) {
  const mode = item.preview?.mode || "center";
  const rawW = item.preview?.width || (mode === "page" ? 960 : THUMB_WIDTH);
  const rawH = item.preview?.height || (mode === "page" ? 672 : THUMB_HEIGHT);

  const baseW = mode === "page" ? Math.max(rawW, 900) : Math.max(rawW, THUMB_WIDTH);
  const baseH = mode === "page" ? Math.max(rawH, 630) : Math.max(rawH, THUMB_HEIGHT);

  // Maintain exact 600:420 (10:7) aspect ratio while encompassing (baseW, baseH)
  const vpW = Math.max(baseW, Math.round(baseH * ASPECT));
  const vpH = Math.round(vpW / ASPECT);

  return { width: vpW, height: vpH, scale: THUMB_WIDTH / vpW };
}

/**
 * Primary Driver: Playwright Chromium
 */
async function createPlaywrightDriver(baseUrl) {
  const { chromium } = await import("playwright");
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-gpu-vsync",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--hide-scrollbars",
  ];

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: launchArgs });
  } catch (primaryErr) {
    for (const channel of ["chrome", "msedge"]) {
      try {
        browser = await chromium.launch({
          headless: true,
          channel,
          args: launchArgs,
        });
        break;
      } catch {
        // try next channel
      }
    }
    if (!browser) throw primaryErr;
  }

  const context = await browser.newContext({
    colorScheme: "dark",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  return {
    name: "playwright-chromium",
    async captureItem(item, { width, height, scale }) {
      const compUrl = `${baseUrl}/${item.path}`;
      await page.setViewportSize({ width, height });
      await page.goto(compUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.addStyleTag({ content: HIDE_SCROLLBAR_CSS });
      await page.waitForTimeout(RENDER_SETTLE_MS);

      let { data } = await cdp.send("Page.captureScreenshot", {
        format: "webp",
        quality: DEFAULT_QUALITY,
        clip: { x: 0, y: 0, width, height, scale },
      });

      let buffer = Buffer.from(data, "base64");
      if (buffer.byteLength > 32 * 1024) {
        const retry = await cdp.send("Page.captureScreenshot", {
          format: "webp",
          quality: 72,
          clip: { x: 0, y: 0, width, height, scale },
        });
        buffer = Buffer.from(retry.data, "base64");
      }
      return buffer;
    },
    async close() {
      await cdp.detach().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}

/**
 * Fallback Driver: Direct Chromium/Chrome/Edge Headless CDP over --remote-debugging-pipe
 */
async function createNativePipeDriver() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  let binaryPath = null;
  for (const c of candidates) {
    if (await fileExists(c)) {
      binaryPath = c;
      break;
    }
  }
  if (!binaryPath) {
    throw new Error(
      "Neither 'playwright' package nor a local Chrome/Edge binary was found. Run `npm install && npx playwright install chromium`."
    );
  }

  const baseTmp = join(ROOT, "assets", ".tmp-profile");
  await mkdir(baseTmp, { recursive: true });
  const userDataDir = await mkdtemp(join(baseTmp, "run-"));

  const proc = spawn(
    binaryPath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--remote-debugging-pipe",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu-vsync",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--hide-scrollbars",
      "--force-dark-mode",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] }
  );

  const pipeWrite = proc.stdio[3];
  const pipeRead = proc.stdio[4];

  let msgId = 0;
  const pending = new Map();
  const loadListeners = new Set();
  let readBuf = "";

  pipeRead.setEncoding("utf8");
  pipeRead.on("data", (chunk) => {
    readBuf += chunk;
    let idx;
    while ((idx = readBuf.indexOf("\0")) !== -1) {
      const raw = readBuf.slice(0, idx);
      readBuf = readBuf.slice(idx + 1);
      if (!raw) continue;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r, reject: j } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) j(new Error(msg.error.message));
        else r(msg.result);
      } else if (
        msg.method === "Page.domContentEventFired" ||
        msg.method === "Page.loadEventFired"
      ) {
        for (const fn of loadListeners) fn(msg);
      }
    }
  });

  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { resolve: res, reject: rej });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      pipeWrite.write(JSON.stringify(payload) + "\0");
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-color-scheme", value: "dark" }] },
    sessionId
  );

  return {
    name: `chromium-cdp-pipe (${binaryPath})`,
    async captureItem(item, { width, height, scale }) {
      const fileUrl = pathToFileURL(join(ROOT, item.path)).href;

      await send(
        "Emulation.setDeviceMetricsOverride",
        {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        },
        sessionId
      );

      const domReadyPromise = new Promise((res) => {
        const timer = setTimeout(() => {
          loadListeners.delete(onEvt);
          res();
        }, 4000);
        const onEvt = () => {
          clearTimeout(timer);
          loadListeners.delete(onEvt);
          res();
        };
        loadListeners.add(onEvt);
      });

      await send("Page.navigate", { url: fileUrl }, sessionId);
      await domReadyPromise;

      await send(
        "Runtime.evaluate",
        {
          expression: `(() => {
            const s = document.createElement('style');
            s.textContent = ${JSON.stringify(HIDE_SCROLLBAR_CSS)};
            (document.head || document.documentElement).appendChild(s);
          })()`,
        },
        sessionId
      );

      await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));

      let { data } = await send(
        "Page.captureScreenshot",
        {
          format: "webp",
          quality: DEFAULT_QUALITY,
          clip: { x: 0, y: 0, width, height, scale },
        },
        sessionId
      );

      let buffer = Buffer.from(data, "base64");
      if (buffer.byteLength > 32 * 1024) {
        const retry = await send(
          "Page.captureScreenshot",
          {
            format: "webp",
            quality: 72,
            clip: { x: 0, y: 0, width, height, scale },
          },
          sessionId
        );
        buffer = Buffer.from(retry.data, "base64");
      }
      return buffer;
    },
    async close() {
      try {
        await send("Browser.close");
      } catch {}
      if (!proc.killed) {
        proc.kill();
      }
      await new Promise((r) => setTimeout(r, 250));
      await rm(baseTmp, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function createBrowserDriver(baseUrl) {
  try {
    return await createPlaywrightDriver(baseUrl);
  } catch {
    return await createNativePipeDriver();
  }
}

async function main() {
  const force = process.argv.includes("--force");
  await mkdir(THUMBS_DIR, { recursive: true });

  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const items = manifest.items || [];

  console.log(
    `[thumbs] Found ${items.length} component(s) in manifest. Mode: ${
      force ? "FORCE (regenerate all)" : "INCREMENTAL"
    }`
  );

  const queue = [];
  let skippedCount = 0;

  for (const item of items) {
    const outPath = join(THUMBS_DIR, `${item.id}.webp`);
    if (!force && (await fileExists(outPath))) {
      skippedCount++;
    } else {
      queue.push({ item, outPath });
    }
  }

  if (queue.length === 0) {
    console.log(
      `✔ All ${skippedCount} thumbnail(s) are already up to date. Use --force to regenerate.`
    );
    return;
  }

  let serverObj = null;
  try {
    serverObj = await startStaticServer(ROOT);
  } catch {
    // Fallback if socket binding is restricted
  }

  let driver = null;

  try {
    driver = await createBrowserDriver(serverObj?.baseUrl || "");
    console.log(`[thumbs] Engine: ${driver.name}`);

    let generatedCount = 0;

    for (const { item, outPath } of queue) {
      const vp = computeViewport(item);
      try {
        const buffer = await driver.captureItem(item, vp);
        await writeFile(outPath, buffer);
        generatedCount++;
        const kb = (buffer.byteLength / 1024).toFixed(1);
        console.log(
          `  ✔ [${generatedCount}/${queue.length}] ${item.id}.webp (${THUMB_WIDTH}x${THUMB_HEIGHT}, ${kb} KB)`
        );
      } catch (err) {
        console.error(`  ✖ Failed on ${item.id}:`, err.message);
      }
    }

    console.log(
      `\n✔ Done! Generated: ${generatedCount}, Skipped (cached): ${skippedCount}, Total: ${items.length}`
    );
  } finally {
    if (driver) {
      await driver.close().catch(() => {});
    }
    if (serverObj?.server) {
      await new Promise((res) => serverObj.server.close(() => res()));
    }
  }
}

main().catch((err) => {
  console.error("[thumbs] Fatal error:", err);
  process.exit(1);
});
