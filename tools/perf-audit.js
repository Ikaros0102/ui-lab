/**
 * UI Lab — Performance Audit & Scroll Benchmark Utility
 *
 * Usage:
 *   1. In Browser DevTools Console:
 *      import('/tools/perf-audit.js').then(m => m.runScrollBenchmark());
 *
 *   2. Or paste the contents of this file directly into DevTools Console.
 */

export async function runScrollBenchmark(options = {}) {
  const durationMs = options.durationMs ?? 5000;
  const maxAllowedIframes = options.maxAllowedIframes ?? 2;

  console.log(
    "%c[UI Lab Perf Audit]%c Starting %dms scroll benchmark...",
    "background:#7c5cff;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;",
    "color:#a1a1aa;",
    durationMs
  );

  // Ensure all cards are visible (reset to "all" if needed)
  window.scrollTo({ top: 0, behavior: "instant" });
  await new Promise((r) => setTimeout(r, 250));

  const frameDeltas = [];
  let maxDomIframes = 0;
  let scrollGuardTriggered = false;
  let running = true;

  const startTime = performance.now();
  let lastFrameTime = startTime;

  const maxScroll = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight
  );

  await new Promise((resolve) => {
    function step(now) {
      if (!running) return;

      const delta = now - lastFrameTime;
      lastFrameTime = now;
      if (delta > 0 && frameDeltas.length > 0) {
        frameDeltas.push(delta);
      } else if (frameDeltas.length === 0) {
        // Seed first frame marker
        frameDeltas.push(16.67);
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Triangle wave: 0 -> 1 (scroll down for first 2.5s), 1 -> 0 (scroll up for next 2.5s)
      const wave = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      const targetY = Math.round(wave * maxScroll);

      window.scrollTo(0, targetY);

      if (document.body.classList.contains("is-scrolling")) {
        scrollGuardTriggered = true;
      }

      const currentIframes = document.querySelectorAll(".grid .preview iframe").length;
      if (currentIframes > maxDomIframes) {
        maxDomIframes = currentIframes;
      }

      if (elapsed < durationMs) {
        requestAnimationFrame(step);
      } else {
        running = false;
        resolve();
      }
    }

    requestAnimationFrame(step);
  });

  // Wait 250ms after scroll stops to verify idle cleanup & deferred mount flush
  await new Promise((r) => setTimeout(r, 250));
  const idleScrollingClassPresent = document.body.classList.contains("is-scrolling");
  const finalActiveIframes = document.querySelectorAll(".grid .preview iframe").length;
  if (finalActiveIframes > maxDomIframes) {
    maxDomIframes = finalActiveIframes;
  }
  const totalPosters = document.querySelectorAll(".grid .preview-poster").length;
  const loadedPosters = document.querySelectorAll(".grid .preview-poster.is-loaded").length;

  // Compute statistics
  const sampleDeltas = frameDeltas.slice(1); // exclude synthetic seed
  const totalFrames = sampleDeltas.length;
  const totalFrameTime = sampleDeltas.reduce((acc, d) => acc + d, 0);
  const avgFrameTime = totalFrames > 0 ? totalFrameTime / totalFrames : 16.67;
  const avgFps = +(1000 / avgFrameTime).toFixed(1);

  const sorted = [...sampleDeltas].sort((a, b) => a - b);
  const p95FrameTime = +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(2);
  const maxFrameTime = +(sorted[sorted.length - 1] || 0).toFixed(2);
  const minInstantFps = maxFrameTime > 0 ? +(1000 / maxFrameTime).toFixed(1) : 60;

  const jankFrames = sampleDeltas.filter((d) => d > 18.5).length;
  const severeJankFrames = sampleDeltas.filter((d) => d > 33.34).length;
  const jankRatioPct = totalFrames > 0 ? +((jankFrames / totalFrames) * 100).toFixed(1) : 0;

  const report = {
    "Duration (ms)": durationMs,
    "Total Frames": totalFrames,
    "Average FPS": avgFps,
    "Avg Frame Time (ms)": +avgFrameTime.toFixed(2),
    "P95 Frame Time (ms)": p95FrameTime,
    "Max Frame Time (ms)": maxFrameTime,
    "Min Instant FPS": minInstantFps,
    "Jank Frames (>18.5ms)": `${jankFrames} (${jankRatioPct}%)`,
    "Severe Jank (>33.3ms)": severeJankFrames,
    "Loaded WebP Posters": `${loadedPosters} / ${totalPosters}`,
    "Peak Active Iframes": `${maxDomIframes} / ${maxAllowedIframes}`,
    "Final Active Iframes": `${finalActiveIframes} / ${maxAllowedIframes}`,
    "Scroll Guard (.is-scrolling)": scrollGuardTriggered && !idleScrollingClassPresent ? "PASS" : "CHECK",
  };

  console.log(
    "%c[UI Lab Perf Audit — Results]",
    "background:#10b981;color:#000;padding:2px 6px;border-radius:4px;font-weight:bold;"
  );
  console.table(report);

  return {
    durationMs,
    totalFrames,
    avgFps,
    avgFrameTime: +avgFrameTime.toFixed(2),
    p95FrameTime,
    maxFrameTime,
    minInstantFps,
    jankFrames,
    severeJankFrames,
    jankRatioPct,
    maxDomIframes,
    finalActiveIframes,
    scrollGuardTriggered,
    idleScrollingClassRemoved: !idleScrollingClassPresent,
  };
}

// Expose globally for convenient console invocation
if (typeof window !== "undefined") {
  window.runUILabPerfAudit = runScrollBenchmark;
}
