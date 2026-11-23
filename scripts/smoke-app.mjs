#!/usr/bin/env node
/**
 * Runtime smoke check — the capability-honesty guard, applied to the running
 * app instead of to source.
 *
 * scripts/guard-capability-honesty.mjs refuses a surface that claims more than
 * it verified. This refuses a CHECK that claims more than it could see.
 *
 * That distinction is why this file exists. A previous investigation reported
 * this app's globe as broken — in dev and in production, reproduced on main —
 * and was wrong. The harness was headless Chromium with no GPU: it could not
 * create a WebGL context, three.js threw, an error boundary caught it, and the
 * result read as a product defect. Hours went into debugging a working globe.
 *
 * So this script proves its own capability BEFORE it asserts anything about the
 * app, and reports the two failures under different exit paths:
 *
 *   HARNESS CANNOT OBSERVE  -> exit 2. Says nothing about the app.
 *   APP FAILED              -> exit 1. A real finding.
 *
 * Conflating them is how a false negative gets acted on with confidence.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-app.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';

/**
 * Software rendering. Without these a headless browser has no GPU and reports
 * every WebGL application as broken.
 */
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

/**
 * SMOKE_NO_GL=1 launches without the software-rendering flags, to verify that
 * the harness-cannot-observe path actually fires. A self-check that is never
 * exercised is itself an unverified claim — which is the thing this file is
 * about.
 */
const browser = await chromium.launch({ args: process.env.SMOKE_NO_GL ? ['--disable-gpu', '--disable-software-rasterizer'] : GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  // ---- Step 0: prove the harness can do what the app needs -----------------
  await page.goto('about:blank');
  const gl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!ctx) return { ok: false, reason: 'getContext returned null' };
    const info = ctx.getExtension('WEBGL_debug_renderer_info');
    return { ok: true, renderer: info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  if (!gl.ok) cannotObserve(`no WebGL context in this browser (${gl.reason})`);
  console.log(`  harness: WebGL available (${gl.renderer})`);

  // ---- Step 1: the app -----------------------------------------------------
  // Dismiss the support-drive modal, which overlays the app and swallows
  // clicks including bottom-bar navigation (defect D3).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('support_funnel_session_v1', JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable; the click fallback below still applies */ }
  });

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL} — is the preview server running?`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  await page.waitForTimeout(8000);
  for (const sel of ['button:has-text("×")', '[aria-label*="lose" i]']) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible().catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      break;
    }
  }

  // ---- Step 2: assert, with reasons ---------------------------------------
  const CANVAS_TIMEOUT_MS = 90000;
  const SHOT = 'smoke-failure.png';

  // The main globe fills the centre column. 600px wide is comfortably below
  // that at any sane viewport, and comfortably above the 110px inset.
  const MIN_GLOBE_PX = 600;

  /*
   * ─── WAIT FOR THE THING BEING ASSERTED ─────────────────────────────────────
   *
   * This waited for `canvas` and then measured the largest one, ONCE. Those are
   * different subjects: the TinyGlobe inset mounts first at 110x110, satisfying
   * the wait immediately, and the measurement then happened while the main
   * globe was still behind GlobeLoadingManager's gate. The 90-second budget was
   * never spent — the check reported at about eight seconds and called a
   * healthy app broken.
   *
   * It cried wolf twice in one session against a dev server, where on-demand
   * compilation puts the globe at roughly 25 seconds. A check that reports a
   * working globe as a defect is the exact failure this file was written to
   * refuse, and it had it.
   *
   * So the wait condition is now the assertion: a canvas at least MIN_GLOBE_PX
   * wide, polled until it appears or the budget is genuinely spent.
   */
  const rendered = await page
    .waitForFunction(
      (min) => [...document.querySelectorAll('canvas')]
        .some((c) => c.getBoundingClientRect().width >= min),
      MIN_GLOBE_PX,
      { timeout: CANVAS_TIMEOUT_MS, polling: 500 },
    )
    .then(() => true)
    .catch(() => false);

  if (!rendered) {
    await page.screenshot({ path: SHOT, fullPage: false }).catch(() => {});
    console.error(`  wrote ${SHOT}`);

    const state = await page.evaluate(() => ({
      text: document.body.innerText,
      // GlobeLoadingManager's own signal: `hidden` until the globe is ready,
      // `visible fade-in` afterwards. It says whether the app considers itself
      // still loading, which no amount of waiting can tell us from outside.
      gate: document.querySelector('[class*="globe-content"]')?.className ?? null,
      canvases: [...document.querySelectorAll('canvas')]
        .map((c) => { const r = c.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }),
    }));

    if (state.text.includes('Something went wrong')) fail('app crashed to its error boundary');
    if (state.text.includes('Loading application')) fail(`stuck on the loading fallback after ${CANVAS_TIMEOUT_MS / 1000}s`);
    if (state.gate && state.gate.includes('hidden')) {
      fail(`the globe's own loading gate was still closed after ${CANVAS_TIMEOUT_MS / 1000}s `
        + `(globe-content is "${state.gate}"). The app never finished starting — this is not the `
        + 'harness measuring too early.');
    }
    fail(`no globe canvas reached ${MIN_GLOBE_PX}px wide within ${CANVAS_TIMEOUT_MS / 1000}s. `
      + `Canvases present: ${state.canvases.join(', ') || 'none'} — see ${SHOT}`);
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes('Something went wrong')) fail('error boundary rendered alongside a canvas');

  // Measure the LARGEST canvas, not the first.
  //
  // This app renders a TinyGlobe inset at 110x110 alongside the main globe.
  // Checking `first()` passed on the inset while saying nothing about whether
  // the main globe rendered — a check that is satisfied by the wrong subject,
  // which is the same class of false confidence this script exists to refuse.
  const boxes = await page.locator('canvas').evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
  );
  const largest = boxes.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b), { w: 0, h: 0 });

  // Re-measured after the wait, so the number reported is the one asserted on
  // rather than whatever was on screen when some other condition went true.
  if (largest.w < MIN_GLOBE_PX) {
    fail(`no full-size globe canvas — largest is ${largest.w}x${largest.h}, expected width >= ${MIN_GLOBE_PX}. ` +
         `Canvases found: ${boxes.map(b => `${b.w}x${b.h}`).join(', ') || 'none'}`);
  }

  console.log(`  app: ${boxes.length} canvas element(s), largest is ${largest.w}x${largest.h}`);
  console.log('\n  SMOKE PASSED\n');
} finally {
  await browser.close();
}
