#!/usr/bin/env node
/**
 * Prove that many views cost one page load.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Measured against the deployed build, a cold load transfers 16.42 MB from our
 * own origin over 70 requests and needs 13s before a frame can be captured. A
 * second capture in the same page costs 0.3 KB and 2.4s.
 *
 * That difference is the entire hosting cost of this feature. A 300-frame
 * camera move at one page load per frame is roughly 4.9 GB; the same 300
 * frames from one session is 16.42 MB and then nothing. Phase 6's video is
 * only affordable if the session is reused, so the property is worth a
 * standing check rather than a note in a commit message.
 *
 * ─── WHY IT WALKS THE VIEWS TWICE ──────────────────────────────────────────
 *
 * The first version measured three views once and failed, correctly: the first
 * camera move pulled 1.8 MB while the next two cost 0.3 KB each. That is
 * level-of-detail geometry for a region the globe had not shown yet, and it is
 * real — setView's own documentation says it does not wait for it.
 *
 * So one pass cannot separate "moving the camera is expensive" from "this
 * region had not been loaded yet". Walking the same three views twice can: the
 * first pass pays for whatever those views need, and the second pass over
 * identical views is the marginal cost of a capture. Both numbers are printed,
 * because hiding the warm-up would make the cheap number a half-truth.
 *
 * What it asserts:
 *   1. Several DIFFERENT views can be captured from one load.
 *   2. Revisiting a loaded view is nearly free — the steady state an agent
 *      should be in, and the one Phase 6's video depends on.
 *   3. The warm-up is bounded: a regression where every move refetches the
 *      world would still pass (2) and must not pass.
 *   4. setView reports where the camera actually went, and the card's
 *      provenance agrees with it — a caption that disagrees with its picture
 *      is the failure this whole feature exists to avoid.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-share-session.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const fail = (m) => { console.error(`\n  APP FAILED: ${m}\n`); process.exit(1); };
const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}`);
  console.error('  This says nothing about the application.\n');
  process.exit(2);
};

/** Views chosen to differ in all three axes, so a no-op setView cannot pass. */
const VIEWS = [
  { name: 'Atlantic',   lat: 20,  lng: -40,  altitude: 2.5 },
  { name: 'Europe',     lat: 48,  lng: 10,   altitude: 1.6 },
  { name: 'Pacific',    lat: -20, lng: 170,  altitude: 3.2 },
];

const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

let bytes = 0, requests = 0;
page.on('request', (r) => r.response().then(async (res) => {
  if (!res) return;
  try { bytes += (await res.body()).length; requests++; } catch { /* body gone */ }
}).catch(() => {}));

try {
  await page.goto('about:blank');
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  if (!gl) cannotObserve('no WebGL context in this browser');

  await page.addInitScript(() => {
    try {
      localStorage.setItem('support_funnel_session_v1',
        JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable */ }
  });

  const t0 = Date.now();
  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL}`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  const ready = await page.waitForFunction(
    () => typeof window.__starcomShareCard?.setView === 'function',
    undefined, { timeout: 90000, polling: 250 },
  ).then(() => true).catch(() => false);
  if (!ready) fail('window.__starcomShareCard.setView never appeared');

  // Capturable, not merely present.
  await page.waitForFunction(() => {
    try { window.__starcomShareCard.captureFrame({ scale: 0.1 }); return true; } catch { return false; }
  }, undefined, { timeout: 90000, polling: 300 }).catch(() => fail('the globe never became capturable'));
  await page.waitForTimeout(2500);

  /*
   * ─── THE LIVE HANDLE MUST MATCH THE PUBLISHED CONTRACT ───────────────────
   *
   * /.well-known/starcom-share-contract.json is what Mecha Jono fetches to
   * learn what it is driving. If the deployment serves one shape and the
   * document promises another, the document is worse than useless — an agent
   * would build against a promise this build does not keep.
   *
   * So it is fetched from the running deployment, not read off disk, and the
   * handle is compared to it key by key. Extra keys fail too: an undeclared
   * method is one somebody starts depending on before anybody agreed to
   * support it.
   */
  const contract = await page.evaluate(async () => {
    const res = await fetch('/.well-known/starcom-share-contract.json');
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { doc: await res.json() };
  });
  if (contract.error) fail(`could not fetch the share contract: ${contract.error}`);

  const shape = await page.evaluate(() => {
    const h = window.__starcomShareCard;
    const out = { version: h.version, keys: Object.keys(h).sort(), args: {} };
    for (const k of Object.keys(h)) {
      if (typeof h[k] === 'function') out.args[k] = h[k].length;
    }
    return out;
  });

  const doc = contract.doc;
  const expectedKeys = [...doc.properties, ...Object.keys(doc.methods)].sort();
  if (shape.version !== doc.version) {
    fail(`the handle reports version ${shape.version} and the contract promises ${doc.version}`);
  }
  if (shape.keys.join(',') !== expectedKeys.join(',')) {
    fail(`the handle exposes [${shape.keys}] and the contract declares [${expectedKeys}]`);
  }
  console.log(`  contract: v${doc.version} matches the live handle — ${expectedKeys.join(', ')}`);

  const loadMs = Date.now() - t0;
  const loadBytes = bytes, loadRequests = requests;
  console.log(`  cold load to capturable: ${(loadBytes / 1048576).toFixed(2)} MB over ${loadRequests} requests, ${loadMs} ms`);

  const walk = async (labelForPass) => {
    const out = [];
    for (const v of VIEWS) {
      const before = bytes;
      const t = Date.now();
      const r = await page.evaluate(async (view) => {
        const arrived = await window.__starcomShareCard.setView(
          { lat: view.lat, lng: view.lng, altitude: view.altitude }, { transitionMs: 0 },
        );
        const card = await window.__starcomShareCard.compose({ scale: 1 });
        return { arrived, camera: card.provenance.camera };
      }, v).catch((e) => ({ error: String(e).split('\n')[0] }));
      if (r.error) fail(`${labelForPass} ${v.name}: ${r.error}`);
      out.push({ v, r, ms: Date.now() - t, added: bytes - before });
    }
    return out;
  };

  const show = (label, rows) => {
    console.log(`  ${label}`);
    for (const { v, r, ms, added } of rows) {
      console.log(`    ${v.name.padEnd(9)} asked ${String(v.lat).padStart(4)},${String(v.lng).padStart(5)}@${v.altitude}`
        + `  arrived ${r.arrived.lat.toFixed(1)},${r.arrived.lng.toFixed(1)}@${r.arrived.altitude.toFixed(2)}`
        + `  ${String(ms).padStart(5)} ms, +${(added / 1024).toFixed(1)} KB`);
    }
  };

  /*
   * And what the methods actually hand back. Declared keys are what an agent
   * may read; anything else is undeclared surface.
   */
  const returned = await page.evaluate(async () => {
    const h = window.__starcomShareCard;
    const view = h.getView();
    const moved = await h.setView({ lat: view.lat, lng: view.lng, altitude: view.altitude }, { transitionMs: 0 });
    const frame = h.captureFrame({ scale: 0.25 });
    const card = await h.compose({ scale: 0.25 });
    return {
      getView: Object.keys(view).sort(),
      setView: Object.keys(moved).sort(),
      captureFrame: Object.keys(frame).sort(),
      compose: Object.keys(card).sort(),
    };
  });
  for (const [method, keys] of Object.entries(returned)) {
    const declared = [...doc.returns[method]].sort();
    if (keys.join(',') !== declared.join(',')) {
      fail(`${method}() returns [${keys}] and the contract declares [${declared}]`);
    }
  }
  console.log('  contract: every method returns exactly the keys it declares');

  const first = await walk('first pass');
  show('first pass — pays for any region the globe had not loaded yet:', first);
  const second = await walk('second pass');
  show('second pass — the same three views again:', second);

  // 1. The views really differ — a setView that did nothing must not pass.
  const distinct = new Set(second.map((x) => `${x.r.arrived.lat.toFixed(2)},${x.r.arrived.lng.toFixed(2)},${x.r.arrived.altitude.toFixed(2)}`));
  if (distinct.size !== VIEWS.length) {
    fail(`asked for ${VIEWS.length} different views and the camera reported ${distinct.size} distinct positions`);
  }

  // 2. The card's caption agrees with where the camera actually is.
  for (const { v, r } of [...first, ...second]) {
    const dLat = Math.abs(r.camera.lat - r.arrived.lat);
    const dLon = Math.abs(r.camera.lon - r.arrived.lng);
    if (dLat > 0.01 || dLon > 0.01) {
      fail(`${v.name}: the card says ${r.camera.lat},${r.camera.lon} but the camera is at ${r.arrived.lat},${r.arrived.lng}`);
    }
  }

  const warmUp = first.reduce((a, x) => a + x.added, 0);
  const steady = second.reduce((a, x) => a + x.added, 0);
  const perCapture = steady / second.length;

  console.log(`  warm-up for ${VIEWS.length} new views: ${(warmUp / 1024).toFixed(1)} KB`);
  console.log(`  steady state, ${second.length} captures: ${(steady / 1024).toFixed(1)} KB `
    + `(${(perCapture / 1024).toFixed(1)} KB each, against ${(loadBytes / 1048576).toFixed(2)} MB for the load)`);

  // 3. The point of the whole exercise: revisiting a loaded view is ~free.
  if (steady > loadBytes * 0.01) {
    fail(`revisiting three already-loaded views cost ${(steady / 1024).toFixed(1)} KB, over 1% of a cold load — `
      + 'session reuse is not actually saving anything');
  }

  // 4. And the warm-up is bounded. Without this, a regression where every move
  //    refetched the world would sail through (3), since pass two would still
  //    be cheap only because pass one paid twice.
  if (warmUp > loadBytes) {
    fail(`warming ${VIEWS.length} views cost ${(warmUp / 1048576).toFixed(2)} MB, more than the entire cold load — `
      + 'moving the camera is refetching more than it should');
  }

  const saving = Math.round(loadBytes / Math.max(perCapture, 1));
  console.log(`  a revisited view is ~${saving}x cheaper than reloading the page`);

  console.log('\n  SHARE SESSION SMOKE PASSED\n');
} finally {
  await browser.close();
}
