#!/usr/bin/env node
/**
 * Every control a person can see, they can actually click.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The globe's "Reset view" button was unclickable in shipped code. Not
 * subtly — elementFromPoint at the button's own centre returned a dock slot,
 * and a real click timed out. It had been that way for some time and nobody
 * reported it, because a reset button that does nothing is indistinguishable
 * from a globe that did not need resetting.
 *
 * No unit test can see this. The button renders, it has its handler, every
 * assertion about it passes. What is wrong is geometry — one fixed element at
 * z-index 5000 near the app root, and a control inside a stacking context at
 * z-index 1, which no local z-index can lift above it.
 *
 * It was found by accident while adding a fourth button to the same strip. A
 * sweep is what turns that into something we know rather than something we
 * noticed.
 *
 * ─── FIRST-RUN UI IS DISMISSED, NOT EXEMPTED ───────────────────────────────
 *
 * NewUserHint legitimately covers controls while it is open — that is what a
 * panel does, and reporting it would be a false positive that teaches people
 * to ignore this script. So the run starts from the state of someone who has
 * been here before. What is measured is the steady-state app.
 *
 * Exit 2 means the harness could not observe, which is different from the app
 * being wrong, and the difference matters: a sweep that finds nothing because
 * it looked at an empty page must not read as a pass.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-reachability.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/** Below this, a page that failed to render would pass by having nothing to check. */
const MIN_CONTROLS = 12;

const fail = (m) => { console.error(`\n  APP FAILED: ${m}\n`); process.exit(1); };
const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}`);
  console.error('  This says nothing about the application.\n');
  process.exit(2);
};

/** Runs in the page. Returns every visible control and whether it is on top. */
const SWEEP = () => {
  const describe = (el) => (el.getAttribute('aria-label') || el.getAttribute('title')
    || (el.innerText || '').trim().split('\n')[0] || el.getAttribute('data-testid')
    || '(unlabelled)').slice(0, 44);
  const named = (el) => `${el?.tagName?.toLowerCase()}.${(el?.className || '').toString().split(' ')[0].slice(0, 30)}`;

  const rows = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    if (cs.pointerEvents === 'none') continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
    const hit = document.elementFromPoint(cx, cy);
    const reachable = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    rows.push({
      what: describe(el),
      tag: el.tagName.toLowerCase(),
      at: `${Math.round(r.left)},${Math.round(r.top)}`,
      reachable,
      under: reachable ? null : named(hit),
      disabled: !!el.disabled,
    });
  }
  return rows;
};

const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.addInitScript(() => {
    try {
      // The state of someone who has been here before.
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
      localStorage.setItem('support_funnel_session_v1',
        JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable */ }
  });

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL}`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  const rendered = await page.waitForFunction(
    () => [...document.querySelectorAll('canvas')].some((c) => c.getBoundingClientRect().width >= 600),
    undefined, { timeout: 90000, polling: 500 },
  ).then(() => true).catch(() => false);
  if (!rendered) cannotObserve('no globe canvas appeared within 90s, so the HUD around it is not up either');
  await page.waitForTimeout(5000);

  /*
   * ─── PROVE THE SWEEP CAN SEE A BLOCKED CONTROL BEFORE TRUSTING A CLEAN ONE ─
   *
   * A sweep reporting "0 blocked" is indistinguishable from a sweep whose
   * hit-testing silently does nothing. So one is manufactured: a transparent
   * fixed overlay is dropped over the page, the sweep must report widespread
   * blocking, and then it is removed. Only then does a clean result mean
   * anything.
   */
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = '__reachability_probe__';
    Object.assign(probe.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', background: 'transparent',
    });
    document.body.appendChild(probe);
  });
  const probed = await page.evaluate(SWEEP);
  const probeBlocked = probed.filter((r) => !r.reachable).length;
  await page.evaluate(() => document.getElementById('__reachability_probe__')?.remove());

  if (probed.length < MIN_CONTROLS) {
    cannotObserve(`only ${probed.length} visible controls found; the page is not up enough to sweep`);
  }
  if (probeBlocked < probed.length) {
    cannotObserve(`a full-page overlay blocked only ${probeBlocked} of ${probed.length} controls — `
      + 'the hit-test is not working, so a clean sweep would prove nothing');
  }
  console.log(`  harness: a full-page overlay blocks all ${probed.length} controls, so the sweep can see blocking`);

  const rows = await page.evaluate(SWEEP);
  const blocked = rows.filter((r) => !r.reachable);

  console.log(`  swept ${rows.length} visible controls (${rows.filter((r) => r.disabled).length} disabled but present)`);

  if (blocked.length) {
    console.error('\n  These render, and a click at their centre lands on something else:\n');
    for (const b of blocked) {
      console.error(`    ${b.tag.padEnd(7)} "${b.what}"`.padEnd(58) + ` at ${b.at.padEnd(10)} under ${b.under}`);
    }
    fail(`${blocked.length} of ${rows.length} visible controls cannot be clicked`);
  }

  console.log(`\n  REACHABILITY SMOKE PASSED — all ${rows.length} visible controls are on top\n`);
} finally {
  await browser.close();
}
