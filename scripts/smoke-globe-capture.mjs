#!/usr/bin/env node
/**
 * Prove captureGlobeFrame reads REAL PIXELS off the live globe.
 *
 * ─── WHY THIS CANNOT BE A UNIT TEST ────────────────────────────────────────
 *
 * captureGlobeFrame's central claim is that rendering and reading in one
 * synchronous block returns a real frame even though Globe.tsx sets
 * `preserveDrawingBuffer: false`. That is a claim about a WebGL
 * implementation's buffer-invalidation timing. A stub renderer in vitest
 * returns whatever data URL the stub was told to return, so a green unit test
 * would say nothing at all about it — and the failure mode it guards against
 * produces a BLANK IMAGE, which looks like success.
 *
 * So this runs the real app in a real browser with real (software) WebGL, and
 * checks the bytes.
 *
 * It follows smoke-app.mjs's discipline, for the reason recorded there: a
 * previous investigation reported this app's globe broken because the harness
 * had no GPU. Capability is proved BEFORE anything is asserted, and the two
 * failures exit differently:
 *
 *   HARNESS CANNOT OBSERVE -> exit 2. Says nothing about the app.
 *   APP FAILED             -> exit 1. A real finding.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-globe-capture.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
const OUT = process.env.CAPTURE_OUT || 'globe-capture.png';

const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

const fail = (msg) => { console.error(`\n  APP FAILED: ${msg}\n`); process.exit(1); };
const cannotObserve = (msg) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${msg}`);
  console.error('  This says nothing about the application. Do not read it as a defect.\n');
  process.exit(2);
};

const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  // ---- Step 0: prove the harness can render at all -------------------------
  await page.goto('about:blank');
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    if (!ctx) return { ok: false, reason: 'getContext returned null' };
    const info = ctx.getExtension('WEBGL_debug_renderer_info');
    return { ok: true, renderer: info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  if (!gl.ok) cannotObserve(`no WebGL context (${gl.reason})`);
  console.log(`  harness: WebGL available (${gl.renderer})`);

  /*
   * ---- Step 0b: prove the harness can reproduce the HAZARD -----------------
   *
   * ─── THE FIRST VERSION OF THIS PROBE WAS INVALID ──────────────────────────
   *
   * It created a 64x64 canvas, cleared it to red ONCE, and compared a same-tick
   * read against a read two frames later. Both returned 394 bytes, so it
   * reported "buffer discarded after composite = false" and this script then
   * told me the timing hazard does not reproduce under SwiftShader. I repeated
   * that in a commit message as evidence.
   *
   * It was measuring the wrong thing. A canvas that is cleared once and never
   * drawn to again is not in a render loop, and the invalidation being probed
   * happens when a frame is PRESENTED. A static canvas presents nothing.
   *
   * Measured properly against the live globe — which renders continuously —
   * the hazard is emphatic and consistent at every time point:
   *
   *     read outside a frame:            22,084 B  (blank)
   *     read inside a rAF callback:     439,000 B  (the globe)
   *
   * So the probe now uses the real globe canvas, which is the only surface in
   * this page that actually presents frames.
   */
  // ---- Step 1: the app -----------------------------------------------------
  await page.addInitScript(() => {
    try {
      localStorage.setItem('support_funnel_session_v1',
        JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable */ }
  });

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL} — is the preview server running?`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  const MIN_GLOBE_PX = 600;
  const ready = await page
    .waitForFunction(
      (min) => [...document.querySelectorAll('canvas')]
        .some((c) => c.getBoundingClientRect().width >= min),
      MIN_GLOBE_PX,
      { timeout: 90000, polling: 500 },
    )
    .then(() => true).catch(() => false);
  if (!ready) fail(`no globe canvas reached ${MIN_GLOBE_PX}px wide within 90s`);

  // Let the globe settle so the frame has content rather than a first paint.
  await page.waitForTimeout(3000);

  /*
   * ---- Step 2: capture, the way the app will -------------------------------
   *
   * captureGlobeFrame is not reachable from the page (no global handle yet —
   * that is Phase 2's wiring), so its mechanics are reproduced here against
   * the real canvas: read the context's own attributes, then render-and-read
   * in one synchronous block versus one separated by a composite. The
   * DIFFERENCE between those two is the claim.
   */
  const result = await page.evaluate(async () => {
    const canvas = [...document.querySelectorAll('canvas')]
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas) return { ok: false, reason: 'no canvas' };

    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const attrs = ctx?.getContextAttributes?.() ?? null;

    /*
     * Both reads, on the real continuously-rendering canvas.
     *
     * (a) NAIVE: outside any frame, which is where an event handler, a
     *     timeout or a promise continuation runs. This is what a caller
     *     reaching for `canvas.toDataURL()` actually gets.
     *
     * (b) IN-FRAME: inside a rAF callback, the closest this harness can get to
     *     captureGlobeFrame's render-then-read-in-one-block. The DIFFERENCE
     *     between the two is the whole claim.
     */
    const naive = canvas.toDataURL('image/png');
    const inFrame = await new Promise((r) =>
      requestAnimationFrame(() => r(canvas.toDataURL('image/png'))));

    return {
      ok: true,
      preserveDrawingBuffer: attrs ? attrs.preserveDrawingBuffer : null,
      width: canvas.width,
      height: canvas.height,
      naiveBytes: Math.floor(naive.length * 3 / 4),
      inFrameBytes: Math.floor(inFrame.length * 3 / 4),
      naive: inFrame,
    };
  });
  if (!result.ok) fail(`could not read the globe canvas: ${result.reason}`);

  console.log(`  app: globe canvas ${result.width}x${result.height},`
    + ` preserveDrawingBuffer=${result.preserveDrawingBuffer}`);

  // ---- Step 3: assert, with reasons ---------------------------------------
  /*
   * Not a byte-size guess. Measured against this globe: a BLANK 1400x708 frame
   * encodes to 22,084 bytes and a rendered one to 439,117 — twenty times more.
   * The verdict below compares the two READS against each other, which needs no
   * absolute threshold at all; this one only catches the case where BOTH are
   * blank, i.e. the globe never rendered.
   */
  const area = result.width * result.height;
  const threshold = Math.max(50000, area / 20);

  fs.writeFileSync(OUT, Buffer.from(result.naive.split(',')[1], 'base64'));
  console.log(`  naive read (outside a frame): ${result.naiveBytes}B`);
  console.log(`  in-frame read:               ${result.inFrameBytes}B`
    + `  (blank below ~${Math.round(threshold)}B)`);
  console.log(`  wrote ${OUT} from the in-frame read`);

  if (result.inFrameBytes < threshold) {
    fail(`even an in-frame read came back blank (${result.inFrameBytes}B for `
      + `${result.width}x${result.height}). The globe is not rendering.`);
  }

  // The comparison that matters: does reading in-frame get meaningfully more
  // than reading outside one? An absolute threshold cannot answer that.
  if (result.inFrameBytes > result.naiveBytes * 4) {
    /*
     * The expected outcome, and the justification for captureGlobeFrame's
     * whole design: the obvious way to read the canvas returns nothing.
     */
    console.log('\n  CONFIRMED: a naive read returns a BLANK frame while an in-frame');
    console.log(`  read returns the globe (${result.naiveBytes}B vs ${result.inFrameBytes}B).`);
    console.log('  This is why captureGlobeFrame renders and reads in one synchronous');
    console.log('  block, and refuses a result the size of the naive one.');
    console.log('\n  CAPTURE SMOKE PASSED (hazard reproduced against the real globe)\n');
  } else {
    console.log('\n  Both reads returned content, so the timing hazard did not reproduce');
    console.log('  here. That is not a failure — but this run does not demonstrate that');
    console.log('  render-then-read is required, only that a frame can be read.');
    console.log('\n  CAPTURE SMOKE PASSED (frame has content)\n');
  }
} finally {
  await browser.close();
}
