#!/usr/bin/env node
/**
 * Compose a real share card from the running globe, and write it out to look at.
 *
 * The unit tests for this feature can each only check part of it: layout
 * arithmetic against a fake measurer, drawing against a recording context,
 * provenance against constructed state. None of them can see the result, and
 * the defects that matter here are visual — text off the card, a crop that
 * clips the Earth, caveats unreadable against the background.
 *
 * So this renders the whole pipeline against the live app and saves a PNG.
 * The check is a person opening it. That is the standard this repository
 * already keeps — "three real defects found by one screenshot".
 *
 * Follows smoke-app.mjs's discipline: prove the harness first, and exit
 * differently for "cannot observe" than for "app failed".
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-share-card.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { freshTempDir } from './lib/freshTempDir.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
/*
 * A temp path by default, never the working directory. The default was once
 * 'share-card.png', which wrote into the repo root on every run without
 * CARD_OUT set — and a `git add -A` came within one step of committing a
 * 570 KB PNG. The clip smoke and the layer audit already default to a temp
 * directory; this one now matches them.
 */
const OUT = process.env.CARD_OUT
  || path.join(freshTempDir('starcom-card-'), 'share-card.png');

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const fail = (m) => { console.error(`\n  APP FAILED: ${m}\n`); process.exit(1); };
const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}`);
  console.error('  This says nothing about the application.\n');
  process.exit(2);
};

const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto('about:blank');
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  if (!gl) cannotObserve('no WebGL context in this browser');
  console.log('  harness: WebGL available');

  await page.addInitScript(() => {
    try {
      localStorage.setItem('support_funnel_session_v1',
        JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable */ }
  });

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL}`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  const ready = await page.waitForFunction(
    () => [...document.querySelectorAll('canvas')].some((c) => c.getBoundingClientRect().width >= 600),
    undefined, { timeout: 90000, polling: 500 },
  ).then(() => true).catch(() => false);
  if (!ready) fail('no globe canvas appeared within 90s');
  /*
   * Then what a person waits for: the Share button enabled, which it is once the globe has drawn a frame that can be
   * captured. A fixed 3 s after the canvas appeared was not enough on a cold load just after a deploy: the canvas
   * stands for seconds before the Earth is drawn on it, and the first capture came back blank (11 Nov, twice).
   */
  const drawn = await page.waitForFunction(
    () => { const b = document.querySelector('[data-testid="globe-share-view"]'); return !!b && !b.disabled; },
    undefined, { timeout: 90000, polling: 500 },
  ).then(() => true).catch(() => false);
  if (!drawn) fail('the Share button was never enabled within 90s: the globe never drew a frame that could be captured');

  /*
   * ─── THE HANDLE IS THE POINT ─────────────────────────────────────────────
   *
   * This script used to reimplement the pipeline inside the page, and said so:
   * "what this proves is that the APPROACH produces a good image, not that the
   * shipped functions were the ones that ran." That was honest and it was a
   * real gap — captureGlobeFrame had never executed in a browser, because
   * nothing on the page could call it.
   *
   * Phase 3 wired useGlobeShareCard, which puts window.__starcomShareCard on
   * the page for exactly this. So the reproduction is gone: what runs below is
   * src/features/globe/capture, bundled and shipped.
   */
  const handleReady = await page.waitForFunction(
    () => typeof window.__starcomShareCard?.compose === 'function',
    undefined, { timeout: 30000, polling: 250 },
  ).then(() => true).catch(() => false);
  if (!handleReady) fail('window.__starcomShareCard never appeared — the capture path is not reachable from the page');
  console.log('  app: window.__starcomShareCard is present');

  /*
   * ─── THE ASSERTION THIS WHOLE FEATURE RESTS ON ───────────────────────────
   *
   * Both reads below happen OUTSIDE a requestAnimationFrame callback, from an
   * ordinary promise continuation — the exact condition under which a naive
   * canvas read returns a blank image, measured on this globe at 22,084 bytes
   * against 439,000 for a real frame.
   *
   * The naive read is taken first, deliberately, so the two numbers come from
   * the same page at the same moment. If the naive read comes back blank and
   * captureGlobeFrame's comes back full, the render-then-read design is proven
   * where it matters. If they are both full, this harness is not exercising
   * the hazard and the comparison says nothing — which is why it is reported
   * rather than assumed.
   */
  const proof = await page.evaluate(() => {
    const src = [...document.querySelectorAll('canvas')]
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const naive = src.toDataURL('image/png');
    let real = null, error = null;
    try {
      real = window.__starcomShareCard.captureFrame();
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
    return {
      frame: { w: src.width, h: src.height },
      naiveBytes: Math.floor(naive.length * 3 / 4),
      real: real ? { bytes: Math.floor(real.dataUrl.length * 3 / 4), w: real.width, h: real.height } : null,
      error,
    };
  });

  if (proof.error) fail(`captureGlobeFrame refused: ${proof.error}`);
  console.log(`  frame: ${proof.frame.w}x${proof.frame.h}`);
  console.log(`  naive toDataURL outside a frame: ${proof.naiveBytes}B`);
  console.log(`  captureGlobeFrame outside a frame: ${proof.real.bytes}B (${proof.real.w}x${proof.real.h})`);

  if (proof.real.bytes < 100000) {
    fail(`captureGlobeFrame returned ${proof.real.bytes}B — too small to hold a rendered globe`);
  }
  if (proof.naiveBytes >= proof.real.bytes / 2) {
    // Not a failure of the app. It means this browser did not invalidate the
    // buffer, so the run proves the capture works but not that it was needed.
    console.log('  NOTE: the naive read was not blank here, so this run does not');
    console.log('        exercise the buffer-invalidation hazard. The capture is');
    console.log('        still proven; the comparison is not.');
  } else {
    console.log(`  the hazard is real and handled: naive is ${Math.round(proof.real.bytes / proof.naiveBytes)}x smaller`);
  }

  /*
   * And the whole card, composed by the shipped composeShareCard — crop,
   * provenance, layout, draw. Also outside a frame.
   */
  const card = await page.evaluate(async () => {
    try {
      // Framed first, as a producer frames its shot, so the run describes a known view.
      await window.__starcomShareCard.setView({ lat: 20, lng: 10, altitude: 2.5 }, { transitionMs: 0 });
      const c = await window.__starcomShareCard.compose({ scale: 1 });
      return {
        ok: true,
        dataUrl: c.dataUrl,
        width: c.width,
        height: c.height,
        provenance: c.provenance,
        sourceRect: c.sourceRect,
        frame: c.frame,
      };
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  });


  if (!card.ok) fail(`could not compose: ${card.reason}`);

  fs.writeFileSync(OUT, Buffer.from(card.dataUrl.split(',')[1], 'base64'));
  const bytes = Math.floor(card.dataUrl.length * 3 / 4);
  const prov = card.provenance;

  const cropFraction = (card.sourceRect.width * card.sourceRect.height)
    / (card.frame.width * card.frame.height);
  console.log(`  card: ${card.width}x${card.height}, ${bytes}B`);
  console.log(`  crop: ${card.sourceRect.width}x${card.sourceRect.height} from `
    + `(${card.sourceRect.x}, ${card.sourceRect.y}) of ${card.frame.width}x${card.frame.height}`
    + ` — ${Math.round(cropFraction * 100)}% of the frame`);
  console.log(`  camera: ${prov.camera.lat.toFixed(2)}, ${prov.camera.lon.toFixed(2)} · alt ${prov.camera.altitude.toFixed(2)}R`);
  console.log(`  layers shown: ${prov.layersShown.join(', ') || '(none)'}`);
  console.log(`  caveats (${prov.caveats.length}):`);
  for (const c of prov.caveats) console.log(`    · ${c}`);
  console.log(`  wrote ${OUT}`);

  if (bytes < 20000) fail(`card is only ${bytes}B — too small to contain a rendered globe`);
  /*
   * The crop must actually crop. computeShareCardLayout clamps the box to the
   * frame, so an over-large box degrades silently into "the whole frame" and
   * publishes a small globe in a wide black field — which is what shipped
   * until the bounds stopped using the sphere's bounding cube.
   */
  /*
   * The capture is the card's own picture window now (composeShareCard: captureGlobeFrame with \`view: window\`), so
   * the frame is the crop and a source rectangle of the whole frame is the design. What can still go wrong is a
   * frame that is not the picture's size: the whole canvas drawn into the picture box, the small-globe card above.
   * (Until 2026-10-24 this asked for a crop smaller than the frame, which every card since the window capture fails.)
   */
  if (card.sourceRect.width !== card.frame.width || card.sourceRect.height !== card.frame.height) {
    fail(`the card drew ${card.sourceRect.width}x${card.sourceRect.height} of a ${card.frame.width}x${card.frame.height} capture: the capture was not the picture's own window`);
  }
  if (card.frame.height !== card.height) {
    fail(`the capture is ${card.frame.width}x${card.frame.height}, not the card's picture height ${card.height}: the globe was not captured to the picture`);
  }
  if (prov.schema !== 'starcom.globe.capture') fail(`provenance schema is ${prov.schema} — the card was composed without it`);
  /*
   * The unsigned-capture caveat is unconditional in buildGlobeViewProvenance,
   * so its absence does not mean "nothing to disclose" — it means the
   * provenance step did not run, and the image is making a claim nobody
   * checked.
   */
  if (!prov.caveats.some((c) => c.includes('Unsigned client-side capture'))) {
    fail('the unconditional capture caveat is missing — provenance did not run');
  }

  /*
   * ─── AND THE BUTTON, BECAUSE "REACHABLE" MEANS A PERSON CAN REACH IT ─────
   *
   * Everything above runs through window.__starcomShareCard, which is the
   * agent's door. If only that were checked, the human affordance would be in
   * exactly the position captureGlobeFrame was in before this phase: shipped,
   * plausible, and never once executed.
   *
   * So this clicks it and waits for the download the click is supposed to
   * produce. A button that renders and does nothing passes every test that
   * only looks at the DOM.
   */
  const button = page.locator('[data-testid="globe-share-view"]');
  if (!(await button.count())) fail('the share button is not on the page');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="globe-share-view"]').disabled,
    undefined, { timeout: 30000, polling: 250 },
  ).catch(() => fail('the share button never became enabled'));

  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    button.click(),
  ]).then(([d]) => d).catch(() => null);

  if (!download) fail('clicking the share button produced no download');
  const name = download.suggestedFilename();
  if (!name.endsWith('.png')) fail(`the download is named ${name}, which is not a PNG`);
  const path = await download.path();
  const size = path ? fs.statSync(path).size : 0;
  if (size < 20000) fail(`the downloaded card is ${size}B — too small to hold a globe`);
  console.log(`  button: click produced ${name}, ${size}B`);

  /*
   * ─── EVERY PUBLISHED SHAPE, CHECKED FOR THE DEFECT THAT WOULD SHOW ───────
   *
   * drawShareCard maps the crop onto the card with one drawImage, so a crop
   * whose aspect does not match what the card reserved draws a stretched
   * Earth. The layout letterboxes rather than stretching, and unit tests hold
   * that arithmetic — but only a real capture exercises the case where the
   * crop box exceeds the frame, which is where the aspects diverge. Portrait
   * is within five pixels of the frame's height at the default altitude, so it
   * is one zoom step from that case at all times.
   */
  /*
   * Each card shape: its picture is captured at the picture's own size (the window), so the crop must have the
   * capture's shape exactly, or the globe is drawn stretched. Until 2026-10-24 this compared the crop with the whole
   * card's shape (wide 1.91), from when the picture spanned the card; a wide card's picture now sits beside its text
   * panel, square, and the goldens hold that layout.
   */
  const PRESETS = ['wide', 'square', 'portrait'];
  for (const preset of PRESETS) {
    const r = await page.evaluate(async (p) => {
      const c = await window.__starcomShareCard.compose({ preset: p, scale: 0.5 });
      return { w: c.width, h: c.height, src: c.sourceRect, frame: { w: c.frame.width, h: c.frame.height }, caveats: c.provenance.caveats.length };
    }, preset).catch((e) => ({ error: String(e).split('\n')[0] }));
    if (r.error) fail(`${preset}: ${r.error}`);

    const cropAspect = r.src.width / r.src.height;
    const frameAspect = r.frame.w / r.frame.h;
    console.log(`  ${preset.padEnd(9)} ${r.w}x${r.h}, capture ${r.frame.w}x${r.frame.h}, crop ${r.src.width}x${r.src.height} (${cropAspect.toFixed(3)})`);

    if (Math.abs(cropAspect - frameAspect) / frameAspect > 0.02) {
      fail(`${preset}: the crop is ${cropAspect.toFixed(3)} where its capture is ${frameAspect.toFixed(3)} — the globe would be drawn stretched`);
    }
    if (r.frame.w > r.w || r.frame.h > r.h) {
      fail(`${preset}: the capture ${r.frame.w}x${r.frame.h} is larger than the card ${r.w}x${r.h}`);
    }
    if (r.caveats === 0) fail(`${preset}: the card states no caveats`);
  }

  const notice = await page.locator('[data-testid="globe-share-error"]').count();
  if (notice) {
    const text = await page.locator('[data-testid="globe-share-error"]').innerText();
    fail(`the app is showing a capture error: ${text}`);
  }

  console.log('\n  SHARE CARD SMOKE PASSED — open the PNG; the check is a person looking at it\n');
} finally {
  await browser.close();
}
