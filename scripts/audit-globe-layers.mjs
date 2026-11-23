#!/usr/bin/env node
/**
 * Audit every globe layer against the running app, and render each as a card.
 *
 * ─── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 *
 * The share path is done: stills, four shapes and video all carry their
 * caveats in their pixels. What it is pointed at is not. Measured before this
 * was written, the default shareable view was one layer, no feeds, and the
 * app's own status saying "Nothing to analyse in this working set" — a
 * reliable, honest picture of nothing in particular.
 *
 * So the next piece of work is the globe itself, layer by layer, and it needs
 * a worklist. A worklist written by hand is a narrative, and narratives go
 * stale and start lying. This measures instead, and is re-run rather than
 * re-read: its output is regenerated each time and deliberately not committed.
 *
 * ─── WHAT IS MEASURED, PER LAYER ───────────────────────────────────────────
 *
 *   activation    whether the layer actually came up. Checked FIRST, from the
 *                 card's own provenance, so a layer that failed to activate is
 *                 reported as that — never measured as though it were on.
 *   sources       every host it pulled from once the globe was up, and bytes
 *   health        feeds, analysis marks and caveats, from its provenance
 *   drawn         the fraction of the frame it changed over its MODE's floor, at
 *                 each of three views, with that view's own noise measured
 *   legibility    the distinct marks it adds on the card and how big each is,
 *                 measured against the same floor and at the same three views
 *   says          what the app's status chips said while it was up
 *   errors        console errors while it loaded
 *   card          a share card of it — the acceptance artefact for its pass
 *
 * `drawn` is a triage signal, not a verdict. The clouds move, so two captures
 * of the same view are never identical; a layer is only flagged as drawing
 * nothing when its difference from the floor is within that noise. The verdict is
 * the contact sheet: every layer's card at every view, side by side, to look at.
 *
 * Both numbers are reported PER VIEW and never averaged. A layer whose data is in
 * one region — the USGS river gauges are almost all in the United States — is not
 * a two-thirds-blank layer; it is a layer with regional data, and a mean would
 * report it as the first thing rather than the second.
 *
 * ─── ACTIVATION WITHOUT A BACKDOOR ─────────────────────────────────────────
 *
 * VisualizationModeProvider persists the mode to localStorage and loads it on
 * mount. The audit writes it there before the page loads — exactly the state
 * of a returning user who last had that layer open. No debug API, no new
 * surface in the shipped app.
 *
 * Exit 2 when the machine cannot observe; exit 0 otherwise. An audit reports.
 * It does not pass or fail — that is what the week does with its output.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/audit-globe-layers.mjs http://localhost:5210
 *   LAYER_AUDIT_OUT=/some/dir LAYER_AUDIT_ONLY=SpaceWeather,RLSH node scripts/…
 *
 * LAYER_AUDIT_ONLY with a single layer gets no mark count: the count is measured
 * against its MODE's floor, and one layer of a mode has none. Name a sibling too.
 *
 * A full run is two page loads per layer plus three of the baseline, each visiting
 * three views — about twenty-five loads, twenty-odd minutes. The loads are what buys
 * the numbers: see the note on independent loads below.
 *   LAYER_AUDIT_STATE=/tmp/audit-state.json …   (a returning visitor — see below)
 *
 * ─── FIRST VISIT, OR RETURNING ─────────────────────────────────────────────
 *
 * By default every layer loads in a fresh profile: a first visit. CelesTrak
 * serves its catalogue to a network once per update (about two hours) and
 * refuses a repeat in between, so fresh profiles can measure the Satellites
 * layer at most once per update — every rerun after the first measures a
 * refusal. LAYER_AUDIT_STATE=<file> keeps the app's IndexedDB between layers
 * and runs, where the app caches such catalogues, so one download serves every
 * rerun, as it does for a person. Only IndexedDB is kept: localStorage holds
 * the app's settings, and a setting carried from one layer into the next would
 * make their measurements unlike.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererNotice } from './lib/rendererLabel.mjs';
import { noisePairs, layerVerdict } from './lib/auditVerdict.mjs';
import { viewHeld, describeViewDrift } from './lib/auditCamera.mjs';
import { freshTempDir } from './lib/freshTempDir.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
const OUT = process.env.LAYER_AUDIT_OUT || freshTempDir('starcom-layer-audit-');
const ONLY = process.env.LAYER_AUDIT_ONLY ? new Set(process.env.LAYER_AUDIT_ONLY.split(',')) : null;
const SETTLE_MS = Number(process.env.LAYER_AUDIT_SETTLE_MS || 12000);
const STATE_FILE = process.env.LAYER_AUDIT_STATE || null;
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
/*
 * ─── THREE VIEWS, NOT ONE ────────────────────────────────────────────────────
 *
 * Every layer used to be measured from one camera over Africa and the Atlantic, and
 * for a layer whose data is somewhere else that is a measurement of nothing: the USGS
 * river gauges and NOAA tide gauges are almost entirely in the United States, and
 * GDELT's events cluster wherever the news does. A layer can read perfectly and score
 * as blank, and the fix for that number is a different camera, not different code.
 *
 * The same three views for every layer, so the numbers stay comparable, and each is
 * reported separately rather than averaged — "nothing over the Pacific, plenty over
 * the Americas" is the finding, and a mean would hide it.
 */
const VIEWS = [
  { id: 'atlantic', label: 'Europe, Africa, the Atlantic', lat: 20, lng: 5, altitude: 2.4 },
  { id: 'americas', label: 'the Americas', lat: 15, lng: -85, altitude: 2.4 },
  { id: 'asiapac', label: 'Asia and the Pacific', lat: 10, lng: 115, altitude: 2.4 },
];
/*
 * ─── AND TWO INDEPENDENT LOADS, NOT TWO CAPTURES ─────────────────────────────
 *
 * A mark has to appear in two comparisons to count (see markStats), and the two have
 * to come from SEPARATE page loads. I tried it with two captures a second apart in one
 * load, which is much cheaper, and it quietly breaks the statistic: a layer's card is
 * compared against a card from a different load, so the cloud shell is at a different
 * phase in the two — and that difference is the SAME in both captures of the same load,
 * so it survives the intersection and counts as a mark. Two independent loads give the
 * two comparisons independent cloud phases, which is the whole mechanism.
 *
 * It also means the noise figure is measured exactly as the layer counts are: from
 * independent loads of one view. A number measured one way and printed beside numbers
 * measured another way is not a comparison.
 */
const LOADS_PER_LAYER = 2;
/**
 * Three more loads of the baseline, so its noise comes from two DISJOINT pairs.
 *
 * Was 2, which gives three captures in total — and three cannot make two pairs
 * that share nothing, so the code paired them as (b,a) and (c,a). With `a` on
 * one side of both, a's cloud phase survives the intersection and is counted as
 * marks: 161 at atlantic and 154 at americas against 0 at asiapac, on
 * 2026-09-17. The comment above already said what it takes — "Four captures is
 * what that takes: two pairs" — so this is the constant catching up with it.
 */
const BASELINE_NOISE_LOADS = 3;

/**
 * Said once, when the camera cannot be read at all.
 *
 * Returns true — the run continues and still measures content — because a
 * harness that cannot CHECK the view is a different thing from one that has
 * caught it moving. It must not silently behave like either.
 */
let cameraWarned = false;
const cameraUncheckable = (label) => {
  if (!cameraWarned) {
    cameraWarned = true;
    console.log(`\n  NOTE: this build's share handle has no getView, so the camera cannot be`);
    console.log(`  verified (first seen at ${label}). Frames are compared as though the view held.\n`);
  }
  return true;
};

const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}\n  This says nothing about the application.\n`);
  process.exit(2);
};

// ── the catalogue, read from the source the app uses, not retyped here ──
const here = path.dirname(fileURLToPath(import.meta.url));
const catalogSrc = fs.readFileSync(path.resolve(here, '../src/components/Globe/Hooks/useGlobeLayerControl.ts'), 'utf8');
const block = catalogSrc.slice(catalogSrc.indexOf('const LAYER_CATALOG'), catalogSrc.indexOf('];', catalogSrc.indexOf('const LAYER_CATALOG')));
const LAYERS = [...block.matchAll(/\{\s*id:\s*'(\w+)',\s*label:\s*'([^']+)',\s*category:\s*'(\w+)'[^}]*?(implemented:\s*false)?\s*\}/g)]
  .map(([, id, label, category, notImplemented]) => ({ id, label, category, implemented: !notImplemented }));
// Read with its comments taken out: a semicolon in one ("(decision D-HW); RLSH is its fourth") ended the type early.
const unionIds = [...(catalogSrc.replace(/\/\/.*$/gm, '').match(/export type GlobeLayerId =[\s\S]*?;/)?.[0] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
if (!LAYERS.length || LAYERS.some((l) => !unionIds.includes(l.id))) {
  cannotObserve('could not read LAYER_CATALOG from useGlobeLayerControl.ts — the audit would be measuring a guess');
}

const browser = await chromium.launch({ args: GL_ARGS });

/** Load the app with `layer` as the persisted mode, settle, and measure. */
async function measure(layer) {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ...(STATE_FILE && fs.existsSync(STATE_FILE) ? { storageState: STATE_FILE } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0].slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).split('\n')[0].slice(0, 160)}`));

  await page.addInitScript(({ mode, subMode }) => {
    try {
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
      /*
       * The support funnel's real key (useSupportFunnelState's STORAGE_KEY). This set
       * 'support_funnel_session_v1', which that hook has never read — so nothing was
       * being dismissed and a card could have been captured with the modal over the
       * globe. Found when a hover probe turned out to be hovering the modal.
       */
      localStorage.setItem('support_funnel_v1',
        JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
      localStorage.setItem('starcom-visualization-mode',
        JSON.stringify({ version: 1, timestamp: Date.now(), data: { mode, subMode } }));
      // Pin globe quality to High. Under software rendering auto would step down, and the
      // audit would measure a plainer globe than anyone with a GPU sees.
      localStorage.setItem('starcom-globe-quality', JSON.stringify({ version: 1, timestamp: 0, data: { setting: 'high' } }));
    } catch { /* storage unavailable */ }
  }, { mode: layer.category, subMode: layer.id });

  const hosts = new Map();
  let ready = false;
  /*
   * External hosts are counted from the FIRST request, not from when the
   * globe is up: the layer is preset before load, so its fetches start at
   * mount, and a fast one would finish before a later window opened — leaving
   * a layer reported as having no source when it has one. The baseline
   * subtraction is what keeps this from over-crediting. Own-origin bytes are
   * only counted once the globe is up, where they reflect what the layer
   * loads rather than the app shell every layer shares.
   */
  page.on('request', (r) => r.response().then(async (res) => {
    if (!res) return;
    const u = new URL(res.url());
    const own = u.host.startsWith('localhost');
    if (own && !ready) return;
    let len = 0; try { len = (await res.body()).length; } catch { return; }
    const h = own ? `(own) ${u.pathname.split('/').slice(0, 2).join('/')}` : u.host;
    hosts.set(h, (hosts.get(h) || 0) + len);
  }).catch(() => {}));

  try {
    const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    if (!res || !res.ok()) return { error: `could not load ${BASE_URL}` };
    const up = await page.waitForFunction(() => {
      try { window.__starcomShareCard.captureFrame({ scale: 0.1 }); return true; } catch { return false; }
    }, undefined, { timeout: 120000, polling: 300 }).then(() => true).catch(() => false);
    if (!up) return { error: 'the globe never became capturable' };
    ready = true;

    const views = {};
    let provenance = null;
    let says = [];
    for (const view of VIEWS) {
      await page.evaluate((v) => window.__starcomShareCard.setView(v, { transitionMs: 0, settleMs: 1500 }), view);
      // The first view waits for the layer's own data; the others only for the camera,
      // which has already stopped moving by the time setView returns.
      await page.waitForTimeout(view === VIEWS[0] ? SETTLE_MS : Math.min(SETTLE_MS, 2500));
      /*
       * Put the camera back before capturing.
       *
       * The APP moves it during that wait, doing exactly what it should:
       * useTurnToFirstIntel turns the globe to the centroid of the first reports
       * and zooms in. For the first view the wait is SETTLE_MS — twenty seconds
       * in the run that exposed this — so the frame came back from somewhere
       * else entirely, and only for the mode whose floor draws intel. Every
       * CyberCommand layer then reported ~170 marks at 3 px² against that floor:
       * a moved camera read as layer content. See lib/auditCamera.mjs.
       */
      await page.evaluate((v) => window.__starcomShareCard.setView(v, { transitionMs: 0, settleMs: 700 }), view);
      const out = await page.evaluate(async () => {
        // Where the camera actually is, so the frame can be shown to be of the
        // view that was asked for rather than assumed to be.
        const at = typeof window.__starcomShareCard.getView === 'function'
          ? window.__starcomShareCard.getView()
          : null;
        const frame = window.__starcomShareCard.captureFrame({ scale: 0.5, mimeType: 'image/png' });
        const card = await window.__starcomShareCard.compose({ scale: 0.7 });
        // What the app itself is telling the user, from its status docks.
        const docks = [...document.querySelectorAll('[data-dock-slot]')]
          .map((el) => `${el.getAttribute('data-dock-slot')}: ${(el.innerText || '').replace(/\s+/g, ' ').trim()}`)
          .filter((t) => !/: $/.test(t))
          .map((t) => t.slice(0, 140));
        return { frame: frame.dataUrl, card: card.dataUrl, provenance: card.provenance, says: docks, at };
      });
      if (!provenance) { provenance = out.provenance; says = out.says; }
      views[view.id] = { frame: out.frame, card: out.card, at: out.at ?? null };
    }

    return { views, provenance, says, errors: [...new Set(errors)], hosts: Object.fromEntries(hosts) };
  } finally {
    if (STATE_FILE) {
      const state = await context.storageState({ indexedDB: true }).catch(() => null);
      if (state) {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
          cookies: [],
          origins: state.origins.map((o) => ({ ...o, localStorage: [] })),
        }));
      }
    }
    await context.close();
  }
}

/** Fraction of pixels that differ materially between two same-sized frames. */
async function changedFraction(aUrl, bUrl) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const x = c.getContext('2d');
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
      x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        // A material change, not JPEG-grade noise: summed channel delta over 60.
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) changed++;
      }
      return changed / (da.length / 4);
    }, [aUrl, bUrl]);
  } finally {
    await page.close();
  }
}

/**
 * What a viewer can make out on the CARD: the distinct marks a layer adds, and how
 * big each one is, in the card's own pixels.
 *
 * `drawn` says how much of the frame a layer changed; it cannot tell a handful of
 * bold markers from a thousand one-pixel specks — which is what the Satellites
 * card turned out to be. So the cards are diffed over the globe area only — same
 * camera, same crop, so it lines up pixel for pixel — and the changed pixels are
 * grouped into connected marks (8-neighbour). A mark under 16 px² is smaller than
 * 4×4 pixels on a 1200-wide card: there, but not legible.
 *
 * A MARK HAS TO APPEAR IN TWO CAPTURES. The clouds drift a fixed step per frame in
 * the app's own loop, so two loads never have them in the same place, and a single
 * diff counted every moved cloud edge as a mark: between 96 and 434 of them in runs
 * measured on 2026-09-11, swamping layers that add a few dozen. Two independent
 * captures of the same layer are diffed against two of the baseline, and only
 * pixels that changed in BOTH count — a cloud that moved is in one, a mark that is
 * drawn is in both.
 */
const LEGIBLE_PX2 = 16;
async function markStats(layerA, baseA, layerB, baseB) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([la, ba, lb, bb, legible]) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ila, iba, ilb, ibb] = await Promise.all([load(la), load(ba), load(lb), load(bb)]);
      const w = ila.width;
      const h = Math.min(Math.round(w / 1.91), ila.height, iba.height); // the wide preset's globe area
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      const pixels = (img) => {
        x.clearRect(0, 0, w, h);
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const [da, dba, dlb, dbb] = [pixels(ila), pixels(iba), pixels(ilb), pixels(ibb)];
      const changed = (p, q, i) => Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 60;
      const mask = new Uint8Array(w * h);
      for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
        // In both captures, or not a mark.
        mask[p] = (changed(da, dba, i) && changed(dlb, dbb, i)) ? 1 : 0;
      }
      const areas = [];
      const stack = [];
      for (let start = 0; start < mask.length; start++) {
        if (mask[start] !== 1) continue;
        let area = 0; mask[start] = 2; stack.push(start);
        while (stack.length) {
          const p = stack.pop(); area++;
          const px = p % w, py = (p - px) / w;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] === 1) { mask[ny * w + nx] = 2; stack.push(ny * w + nx); }
          }
        }
        areas.push(area);
      }
      areas.sort((m, n) => m - n);
      const q = (f) => (areas.length ? areas[Math.min(areas.length - 1, Math.floor(f * areas.length))] : 0);
      return {
        marks: areas.length,
        underLegible: areas.filter((ar) => ar < legible).length,
        medianPx2: q(0.5),
        p90Px2: q(0.9),
        largestPx2: areas.length ? areas[areas.length - 1] : 0,
      };
    }, [layerA, baseA, layerB, baseB, LEGIBLE_PX2]);
  } finally {
    await page.close();
  }
}

const probe = await browser.newPage();
const gl = await probe.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
await probe.close();
if (!gl) cannotObserve('no WebGL in this browser');

fs.mkdirSync(path.join(OUT, 'cards'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const write = (rel, dataUrl) => fs.writeFileSync(path.join(OUT, rel), Buffer.from(dataUrl.split(',')[1], 'base64'));

/*
 * The baseline, twice. The default layer with no data is as close to a bare
 * globe as the app has, and two independent loads of it measure how much a
 * frame changes on its own — clouds, mostly. A layer is only flagged as
 * drawing nothing when it changes the frame by no more than that.
 */
console.log(`\n  LAYER AUDIT — ${BASE_URL}\n  output: ${OUT}\n${rendererNotice(GL_ARGS)}\n`);
console.log(STATE_FILE
  ? `  a returning visitor: IndexedDB kept in ${STATE_FILE}`
  : '  a first visit: every layer in a fresh profile');
console.log(`  measuring the baseline ${BASELINE_NOISE_LOADS + 1} times at ${VIEWS.length} views, for its own noise…`);
const baselineLayer = LAYERS.find((l) => l.id === 'IntelReports') ?? LAYERS[0];
const baseline = await measure(baselineLayer);
if (baseline.error) cannotObserve(`baseline: ${baseline.error}`);
const noiseLoads = [];
for (let i = 0; i < BASELINE_NOISE_LOADS; i++) {
  const extra = await measure(baselineLayer);
  if (extra.error) cannotObserve(`baseline: ${extra.error}`);
  noiseLoads.push(extra);
}
write('frames/_baseline.png', baseline.views[VIEWS[0].id].frame);

/*
 * ─── HOW MUCH A FRAME CHANGES ON ITS OWN ─────────────────────────────────
 *
 * Per view, from four captures of the same one. The noise in marks is computed by
 * exactly the statistic the layers use — two independent pairs, and only what changed
 * in both — so the two numbers can be compared rather than merely printed together.
 * Four captures is what that takes: two pairs.
 *
 * Clouds are what moves, and they move the same way whatever layer is up, so one
 * measurement per view serves every mode.
 */
const noiseByView = {};
for (const view of VIEWS) {
  const captures = [baseline, ...noiseLoads].map((load) => load.views[view.id]);
  const [[a, b], [c, d]] = noisePairs(captures);
  const fraction = await changedFraction(a.frame, b.frame);
  /*
   * Two DISJOINT pairs, which is the same shape as a layer's own count: a layer
   * compares (its first load vs the floor's first) and (its second vs the
   * floor's second), so no capture sits on both sides and a drifting cloud
   * cancels. Sharing one capture across both pairs is what made this number
   * 161 at atlantic.
   */
  const marks = await markStats(b.card, a.card, d.card, c.card);
  noiseByView[view.id] = { fraction, marks: marks.marks };
  console.log(`  ${view.id.padEnd(9)} ${(fraction * 100).toFixed(2)}% of pixels change between loads (clouds dominate this), ${marks.marks} marks survive both`);
}
const noise = Math.max(...VIEWS.map((v) => noiseByView[v.id].fraction));

/*
 * ─── WHAT THE APP DOES WHATEVER LAYER IS ON ──────────────────────────────
 *
 * The first trial credited api.eia.gov, and its 403s, to Space Weather — and
 * then to Eco Disasters too. It is an app-wide background fetch that happens
 * with any layer up. Anything the baseline already does is reported ONCE, here,
 * and subtracted from every layer; otherwise the worklist sends each layer's
 * pass chasing a problem that belongs to none of them.
 */
const baselineHosts = new Set(Object.keys(baseline.hosts).filter((h) => !h.startsWith('(own)')));
const baselineErrors = new Set(baseline.errors);
console.log(`  app-wide, with any layer up: ${[...baselineHosts].join(', ') || 'no external sources'}`);
for (const e of baselineErrors) console.log(`    · ${e}`);
console.log('');

const results = [];
for (const layer of LAYERS) {
  if (ONLY && !ONLY.has(layer.id)) continue;
  process.stdout.write(`  ${layer.label.padEnd(15)} `);
  const m = layer.id === baselineLayer.id ? baseline : await measure(layer);
  if (m.error) {
    results.push({ ...layer, error: m.error });
    console.log(`could not measure — ${m.error}`);
    continue;
  }
  // The second, independent load. Its cloud phase is unrelated to the first's, which
  // is what lets the intersection below tell a drawn mark from a drifted cloud.
  const m2 = layer.id === baselineLayer.id ? noiseLoads[0] : await measure(layer);
  if (m2.error) {
    results.push({ ...layer, error: m2.error });
    console.log(`could not measure twice — ${m2.error}`);
    continue;
  }
  const p = m.provenance;
  const activated = p.layersShown.includes(layer.label) || p.layersSelectedButEmpty.includes(layer.label);
  /*
   * How much of the frame this layer changes, per view, against the baseline. Used to
   * RANK the layers within a mode so the least-drawing one can serve as that mode's
   * floor; the legibility count below is measured against that floor, not against
   * this. The two references are different on purpose — see the mode-floor note.
   */
  const drawnByView = {};
  for (const view of VIEWS) {
    drawnByView[view.id] = +(await changedFraction(
      baseline.views[view.id].frame, m.views[view.id].frame,
    )).toFixed(4);
  }
  const drawn = Math.max(...VIEWS.map((v) => drawnByView[v.id]));
  for (const view of VIEWS) {
    write(`cards/${layer.id}.${view.id}.png`, m.views[view.id].card);
    write(`frames/${layer.id}.${view.id}.png`, m.views[view.id].frame);
  }

  const ownBytes = Object.entries(m.hosts).filter(([h]) => h.startsWith('(own)')).reduce((n, [, b]) => n + b, 0);
  // Only what THIS layer adds over the baseline.
  const external = Object.entries(m.hosts)
    .filter(([h]) => !h.startsWith('(own)') && !baselineHosts.has(h))
    .sort((a, b) => b[1] - a[1]);
  const layerErrors = m.errors.filter((e) => !baselineErrors.has(e));
  const r = {
    ...layer,
    activated,
    shownAs: p.layersShown.includes(layer.label) ? 'shown' : p.layersSelectedButEmpty.includes(layer.label) ? 'selected but renders nothing' : 'not active',
    drawnFraction: +drawn.toFixed(4),
    drawnByView,
    /*
     * Named for what it measures, not for a conclusion. This is the pixel
     * fraction, which the animated cloud shell dominates — it was called
     * `drawsNothingVisible`, and on 2026-09-17 it would have said exactly that
     * about layers drawing hundreds of legible marks. `marksAboveNoise`, filled
     * in below once the floor is known, is the answer to that question.
     */
    pixelChangeWithinNoise: drawn <= noise * 1.5,
    // Filled in below, once each mode's floor is known.
    legibilityByView: null,
    views: m.views,
    viewsAgain: m2.views,
    feeds: p.feeds.map((f) => ({ name: f.name, error: f.error ?? null, lastUpdated: f.lastUpdated, loading: !!f.loading })),
    marks: p.marks,
    caveats: p.caveats,
    externalSources: external.map(([h, b]) => ({ host: h, bytes: b })),
    ownBytes,
    errors: layerErrors,
    says: m.says,
  };
  results.push(r);

  console.log('measured');
}

/*
 * ─── WHY EACH LAYER IS JUDGED AGAINST ITS OWN MODE ───────────────────────
 *
 * The first full run compared every layer to one baseline and reported
 * Conflict Zones drawing 8.5% of the frame. So did Diplomacy and Resources —
 * both DECLARED to render nothing. The 8.5% was the GeoPolitical mode's own
 * base rendering, not anything a layer drew, and a single global baseline
 * cannot tell the two apart.
 *
 * So each layer is measured over its MODE's floor: a declared-unimplemented
 * layer in the same mode where there is one — a true empty — and otherwise the
 * least-drawing layer in the mode, labelled as a relative floor because it is
 * not known to be empty. The baseline layer itself is reported as the baseline,
 * not as "draws nothing"; comparing it with itself would say nothing.
 */
const byMode = new Map();
for (const r of results.filter((x) => !x.error)) {
  if (!byMode.has(r.category)) byMode.set(r.category, []);
  byMode.get(r.category).push(r);
}
/*
 * ─── AND WHY THE MARK COUNT IS MEASURED AGAINST IT TOO ───────────────────
 *
 * The mark count was diffed against the BASELINE's card while the percentage was
 * measured over the mode floor, and the mismatch made the count useless for any
 * layer outside the baseline's own mode: a GeoPolitical card differs from the
 * baseline over whole continents, so the country fills came back as a handful of
 * continent-sized "marks" with every real marker swallowed inside them. Conflict
 * Zones reported 6 marks on a card showing dozens, for two days.
 *
 * Both numbers come from the mode floor now, so the mode's own rendering cancels
 * and what is left is what the layer added.
 */
for (const [, rows] of byMode) {
  const empty = rows.find((r) => !r.implemented);
  const floor = empty ?? (rows.length > 1
    ? rows.reduce((a, b) => (b.drawnFraction < a.drawnFraction ? b : a))
    : null);
  for (const r of rows) {
    r.addsOverModeFloorByView = {};
    r.legibilityByView = {};
    /*
     * One layer of a mode, measured alone (LAYER_AUDIT_ONLY), has no floor to be
     * measured against — and the baseline belongs to another mode, whose globe differs
     * over whole continents, which is the very comparison that made this number
     * meaningless before. So it reports that it has no floor rather than a figure
     * measured against the wrong thing. Ask for a sibling layer to get the count.
     */
    if (!floor) {
      r.modeFloor = null;
      r.addsOverModeFloor = null;
      continue;
    }
    r.modeFloor = { layer: floor.id, trueEmpty: !!empty };
    if (r.id === floor.id) { r.addsOverModeFloor = 0; continue; }
    r.viewDrift = {};
    for (const view of VIEWS) {
      /*
       * Both frames have to be photographs of the same view or the comparison is
       * of two different places. Checked rather than assumed, because assuming it
       * is what produced a whole afternoon of numbers that were really a moved
       * camera. A view that cannot be shown to be the right one is DROPPED — it
       * gets no mark count, so layerVerdict never sees it.
       */
      const readable = r.views[view.id].at !== null && floor.views[view.id].at !== null;
      const held = !readable
        ? cameraUncheckable(r.label)
        : viewHeld(view, r.views[view.id].at) && viewHeld(view, floor.views[view.id].at);
      if (!held) {
        r.viewDrift[view.id] = {
          layer: describeViewDrift(view, r.views[view.id].at),
          floor: describeViewDrift(view, floor.views[view.id].at),
        };
        continue;
      }
      r.addsOverModeFloorByView[view.id] = +(await changedFraction(
        floor.views[view.id].frame, r.views[view.id].frame,
      )).toFixed(4);
      // Two independent pairs: this layer's first load against the floor's first, and
      // its second against the floor's second.
      r.legibilityByView[view.id] = await markStats(
        r.views[view.id].card, floor.views[view.id].card,
        r.viewsAgain[view.id].card, floor.viewsAgain[view.id].card,
      );
    }
    r.addsOverModeFloor = Math.max(0, ...VIEWS.map((v) => r.addsOverModeFloorByView[v.id] ?? 0));
    /*
     * How many marks this layer adds over the floor at its best view, net of
     * that view's own noise. The mark statistic cancels a drifting cloud; the
     * fraction above does not. This is the number the verdict is read from.
     */
    r.marksAboveNoise = Math.round(layerVerdict({
      isFloor: false,
      floorLabel: floor.id,
      byView: VIEWS.filter((v) => r.legibilityByView[v.id]).map((v) => ({
        view: v.id,
        marks: r.legibilityByView[v.id].marks,
        noiseMarks: noiseByView[v.id].marks,
      })),
    }).net);
  }
}
// The frames and cards were only needed for the diffs above; they are megabytes of
// data URLs and have no business in layers.json.
for (const r of results) { delete r.views; delete r.viewsAgain; }

console.log(`\n  ${'layer'.padEnd(15)} ${'verdict'.padEnd(46)} sources it adds`);
for (const r of results) {
  if (r.error) { console.log(`  ${r.label.padEnd(15)} could not measure — ${r.error}`); continue; }
  const floorNote = !r.modeFloor ? 'no floor'
    : r.modeFloor.trueEmpty ? 'an empty layer' : `${r.modeFloor.layer} (relative)`;
  // The floor compared with itself is 0 by construction — say what it is instead.
  const isOwnFloor = r.modeFloor?.layer === r.id && !r.modeFloor.trueEmpty;
  /*
   * The BEST view, not the mean. A layer with data in one region is not half-blank —
   * it is a layer whose data is in one region, and the per-view lines below say which.
   */
  /*
   * Decided on MARKS, not on the pixel fraction.
   *
   * The fraction is dominated by the animated cloud shell, which moves between
   * any two loads and dwarfs a few hundred small marks — so on 2026-09-17 this
   * reported "adds nothing visible" for Resources and Conflict Zones while the
   * per-view lines below counted 244 and 183 marks at least 4x4 px. The mark
   * statistic is built from two independent pairs and keeps only what changed in
   * both, which is exactly what cancels a drifting cloud. See lib/auditVerdict.
   */
  const marksByView = VIEWS
    .filter((v) => r.legibilityByView?.[v.id])
    .map((v) => ({
      view: v.id,
      marks: r.legibilityByView[v.id].marks,
      noiseMarks: noiseByView[v.id].marks,
    }));
  const verdict = !r.activated ? 'DID NOT ACTIVATE'
    : r.shownAs !== 'shown' ? 'declared: renders nothing'
      : !r.modeFloor ? 'measured alone — no floor in its mode to compare with'
        : layerVerdict({ isFloor: isOwnFloor, floorLabel: floorNote, byView: marksByView }).text;
  const srcs = r.externalSources.length ? r.externalSources.map((x) => x.host).slice(0, 2).join(', ') : '—';
  console.log(`  ${r.label.padEnd(15)} ${verdict.padEnd(46)} ${srcs}`);
  for (const view of VIEWS) {
    const dropped = r.viewDrift?.[view.id];
    if (dropped) {
      console.log(`  ${''.padEnd(15)} ${view.id.padEnd(9)} DROPPED — the camera moved: layer ${dropped.layer}`);
      console.log(`  ${''.padEnd(15)} ${''.padEnd(9)}   floor ${dropped.floor}`);
      continue;
    }
    const l = r.legibilityByView?.[view.id];
    if (!l) continue;
    const legible = l.marks - l.underLegible;
    // The pixel fraction is still printed, as context and labelled: it measures
    // something real, just not whether this layer drew anything.
    const moved = r.addsOverModeFloorByView?.[view.id];
    console.log(`  ${''.padEnd(15)} ${view.id.padEnd(9)} ${String(l.marks).padStart(4)} marks`
      + ` (noise ${noiseByView[view.id].marks}), ${String(legible).padStart(4)} at least 4×4 px,`
      + ` median ${l.medianPx2} px²`
      + (moved === undefined ? '' : `, ${(moved * 100).toFixed(2)}% of pixels moved`));
  }
  for (const e of r.errors) console.log(`  ${''.padEnd(15)} ✗ ${e.slice(0, 96)}`);
}

// ── the contact sheet: every card, to look at ──
const cards = results.filter((r) => !r.error).flatMap((r) => VIEWS.map((view) => ({
  id: `${r.id}.${view.id}`,
  label: `${r.label} · ${view.id}`,
  url: `data:image/png;base64,${fs.readFileSync(path.join(OUT, 'cards', `${r.id}.${view.id}.png`)).toString('base64')}`,
})));
if (cards.length) {
  const sheetPage = await browser.newPage();
  const sheet = await sheetPage.evaluate(async (items) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const imgs = await Promise.all(items.map((it) => load(it.url)));
    // One row per layer, one column per view, so a layer's three views read together.
    const COLS = 3, W = 420, GAP = 14, LABEL = 26;
    const heights = imgs.map((i) => Math.round(i.height * (W / i.width)));
    const rows = Math.ceil(imgs.length / COLS);
    const rowH = [...Array(rows)].map((_, r) => Math.max(...heights.slice(r * COLS, r * COLS + COLS)));
    const c = document.createElement('canvas');
    c.width = COLS * W + (COLS + 1) * GAP;
    c.height = rowH.reduce((a, h) => a + h + LABEL + GAP, GAP);
    const x = c.getContext('2d');
    x.fillStyle = '#05070f'; x.fillRect(0, 0, c.width, c.height);
    let y = GAP;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < COLS; k++) {
        const idx = r * COLS + k; if (idx >= imgs.length) break;
        const px = GAP + k * (W + GAP);
        x.fillStyle = '#e8eefc'; x.font = '16px system-ui, sans-serif'; x.textBaseline = 'top';
        x.fillText(items[idx].label, px, y + 4);
        x.drawImage(imgs[idx], px, y + LABEL, W, heights[idx]);
      }
      y += rowH[r] + LABEL + GAP;
    }
    return c.toDataURL('image/png');
  }, cards);
  write('contact-sheet.png', sheet);
  await sheetPage.close();
}

fs.writeFileSync(path.join(OUT, 'layers.json'), `${JSON.stringify({
  audited: new Date().toISOString(),
  baseUrl: BASE_URL,
  views: VIEWS,
  settleMs: SETTLE_MS,
  visit: STATE_FILE ? 'returning (IndexedDB kept)' : 'first',
  noiseByView,
  noiseFloor: +noise.toFixed(4),
  appWide: { sources: [...baselineHosts], errors: [...baselineErrors] },
  layers: results,
}, null, 2)}\n`);

await browser.close();
console.log('\n  Read the percentages as triage, not verdicts: they vary between runs as data');
console.log('  arrives or does not (Comm Hubs measured 1.48% in one run and 3.92% in the next).');
console.log('  Compare a layer against its own earlier runs. The contact sheet is the verdict.');
console.log(`\n  wrote ${path.join(OUT, 'layers.json')}`);
console.log(`        ${path.join(OUT, 'contact-sheet.png')}   ← every layer's card, to look at`);
console.log(`        ${path.join(OUT, 'cards')}/<layer>.<view>.png\n`);
