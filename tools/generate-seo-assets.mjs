#!/usr/bin/env node
/**
 * Generates Open Graph preview screenshot (public/og-preview.png, 1200x630)
 * and PWA icons (public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png)
 * using local Headless Chromium over CDP pipe + file:/// protocol (zero network needed).
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");

async function fileExists(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function findBrowserBinary() {
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

  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  throw new Error("Could not find Chrome/Edge binary.");
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });
  const binaryPath = await findBrowserBinary();

  const baseTmp = join(ROOT, "assets", ".tmp-profile");
  await mkdir(baseTmp, { recursive: true });
  const userDataDir = await mkdtemp(join(baseTmp, "seo-"));

  const proc = spawn(
    binaryPath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--disable-web-security",
      "--remote-debugging-pipe",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
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

  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);

    // 1. Capture Open Graph Preview (1200x630) from file:/// index.html?category=widgets
    const indexFileUrl = pathToFileURL(join(ROOT, "index.html")).href + "?category=widgets";
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 1200,
        height: 630,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId
    );

    await send("Page.navigate", { url: indexFileUrl }, sessionId);

    // Wait for grid cards and visible images to finish loading, apply subtle layout scale for 3 columns
    await new Promise((r) => setTimeout(r, 1000));
    await send(
      "Runtime.evaluate",
      {
        expression: `new Promise((resolve) => {
          document.documentElement.style.zoom = '0.82';
          const check = () => {
            const imgs = Array.from(document.querySelectorAll('.card:not([hidden]) .preview-poster')).slice(0, 9);
            imgs.forEach(img => { img.loading = 'eager'; });
            if (imgs.length > 0 && imgs.every(img => img.complete && img.naturalWidth > 0)) {
              resolve(true);
            } else {
              setTimeout(check, 100);
            }
          };
          check();
          setTimeout(() => resolve(false), 3500);
        })`,
        awaitPromise: true,
      },
      sessionId
    );
    await new Promise((r) => setTimeout(r, 400));

    const ogShot = await send(
      "Page.captureScreenshot",
      {
        format: "png",
        clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
      },
      sessionId
    );
    const ogPath = join(PUBLIC_DIR, "og-preview.png");
    const ogBuf = Buffer.from(ogShot.data, "base64");
    await writeFile(ogPath, ogBuf);
    console.log(`✔ public/og-preview.png (1200x630, ${(ogBuf.byteLength / 1024).toFixed(1)} KB)`);

    // 2. Capture PWA Icons (512x512, 192x192, 180x180)
    const iconHtml = `<!doctype html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 100vw;
    height: 100vh;
    background: radial-gradient(circle at 30% 25%, #19253a 0%, #0e131c 70%, #080b11 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
  }
</style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#162032"/>
        <stop offset="100%" stop-color="#0b0f17"/>
      </linearGradient>
      <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#9ad4ff"/>
        <stop offset="100%" stop-color="#4ea8ff"/>
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#bg)"/>
    <rect x="1" y="1" width="30" height="30" rx="6" fill="none" stroke="#7cc4ff" stroke-opacity="0.22" stroke-width="0.75"/>
    <path d="M9 9v8a7 7 0 0 0 14 0V9" fill="none" stroke="url(#stroke)" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="9" cy="9" r="1.6" fill="#9ad4ff"/>
    <circle cx="23" cy="9" r="1.6" fill="#9ad4ff"/>
  </svg>
</body>
</html>`;

    const iconDataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(iconHtml);

    for (const [name, size] of [
      ["icon-512.png", 512],
      ["icon-192.png", 192],
      ["apple-touch-icon.png", 180],
    ]) {
      await send(
        "Emulation.setDeviceMetricsOverride",
        {
          width: size,
          height: size,
          deviceScaleFactor: 1,
          mobile: false,
        },
        sessionId
      );
      await send("Page.navigate", { url: iconDataUrl }, sessionId);
      await new Promise((r) => setTimeout(r, 150));
      const shot = await send(
        "Page.captureScreenshot",
        {
          format: "png",
          clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
        },
        sessionId
      );
      const buf = Buffer.from(shot.data, "base64");
      await writeFile(join(PUBLIC_DIR, name), buf);
      console.log(`✔ public/${name} (${size}x${size}, ${(buf.byteLength / 1024).toFixed(1)} KB)`);
    }
  } finally {
    proc.kill();
    await new Promise((r) => setTimeout(r, 200));
    await rm(baseTmp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
