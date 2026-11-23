#!/usr/bin/env node
/**
 * Mecha Jono's eight checks for Raver Watch, run as theirs (globe record,
 * section 19, Phase 1 step 6).
 *
 * Their share stack runs this sequence for each Raver Watch layer, and counts
 * the layer done when all of it passes (their spec sheet, "What our capture
 * driver will check"). Phase 1 is done, by their own measure, when their
 * driver composes a card with a live note on each layer. This runs the same
 * sequence through the same share handle, so the answer is known here before
 * it is found there.
 *
 *   1  the published contract lists the layer (v7 or later)
 *   2  listLayers() gives it under RaverWatch, implemented
 *   3  setLayer(id, { pin: false, clearOtherPins: true }) and pinLayers accept it
 *   4  listReports() includes its notes: id 30023:<pubkey>:<d>, variant,
 *      variantMeans, precisionM, lat/lng and time
 *   5  frameReports, focusReport and planReportTour work on them
 *   6  compose() for wide, square and portrait names the layer and note ids
 *      shown, and describeView() counts them
 *   7  recordClip works with both end cards
 *   8  the framing floor (altitude 1) holds, and nothing is finer than 0.01°
 *
 * ─── NOTHING LEAVES THE MACHINE ────────────────────────────────────────────
 *
 * The Record is answered here, from their real notes as it held them on
 * 2026-09-29 (docs/.../raver-watch/raver_watch_live_2026-09-29.json). They are
 * signed by their key, and Starcom reads no other, so a note cannot be made up
 * for a test. Every other relay socket is answered empty, every other request
 * aborted, and names fail to resolve for every host but this one. The
 * timeline is set to a window inside every note's validity, so the check
 * does not expire with the notes.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 --strictPort &
 *   node scripts/check-raver-watch.mjs http://localhost:5210
 *   CHECK_OUT_DIR=/tmp/cards node scripts/check-raver-watch.mjs …   (also saves each layer's wide card)
 *
 * Exit 0: every check held on every layer. 1: at least one did not. 2: the
 * harness could not observe (The Record was never asked), which says nothing
 * about Raver Watch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || 'http://localhost:5210';
const FIXTURE = path.resolve(here, '../docs/missions/01-architecture-decisions/raver-watch/raver_watch_live_2026-09-29.json');
const { events: NOTES } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const LAYERS = [
  { id: 'DrugCheckAlerts', tag: 'drug_check_alert', label: 'Drug-check alerts' },
  { id: 'SceneIncidents', tag: 'scene_incident', label: 'Scene incidents' },
];

const tagOf = (event, name) => event.tags.filter((t) => t[0] === name).map((t) => t[1]);
// A window every note applies in, so the check stands after the notes end.
const WINDOW = {
  from: Math.max(...NOTES.map((e) => Number(tagOf(e, 'valid_from')[0]))),
  until: Math.min(...NOTES.map((e) => Number(tagOf(e, 'valid_until')[0]))),
};
function matches(event, filter) {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  return Object.keys(filter).filter((k) => k.startsWith('#')).every((k) => filter[k].some((v) => tagOf(event, k.slice(1)).includes(v)));
}

const results = [];
const expect = (layer, n, claim, holds, detail = '') => results.push({ layer, n, claim, holds: Boolean(holds), detail });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ],
});
let recordAsked = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const local = (u) => u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return local(u) || u.protocol === 'data:' || u.protocol === 'blob:' ? route.continue() : route.abort();
  });
  await context.routeWebSocket((u) => !local(u), (socket) => {
    const record = new URL(socket.url()).hostname === 'record.cosmiccodex.app';
    socket.onMessage((raw) => {
      let message; try { message = JSON.parse(String(raw)); } catch { return; }
      if (message[0] === 'REQ') {
        const filters = message.slice(2);
        if (record && filters.some((f) => (f['#t'] ?? []).includes('raver_watch'))) recordAsked = true;
        if (record) for (const event of NOTES) if (filters.some((f) => matches(event, f))) socket.send(JSON.stringify(['EVENT', message[1], event]));
        socket.send(JSON.stringify(['EOSE', message[1]]));
      }
      if (message[0] === 'EVENT') socket.send(JSON.stringify(['OK', message[1].id, true, '']));
    });
  });
  const page = await context.newPage();
  const call = (method, ...args) => page.evaluate(([m, a]) => window.__starcomShareCard[m](...a), [method, args]);

  const contract = await (await fetch(`${BASE_URL}/.well-known/starcom-share-contract.json`)).json();
  await page.goto(`${BASE_URL}/?v=1&sub=DrugCheckAlerts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__starcomShareCard?.whenReady === 'function', null, { timeout: 90000 });
  await call('whenReady', { timeoutMs: 60000 });
  await call('setTimeWindow', WINDOW);

  for (const layer of LAYERS) {
    const notes = NOTES.filter((e) => tagOf(e, 't').includes(layer.tag));
    const ids = notes.map((e) => `30023:${e.pubkey}:${tagOf(e, 'd')[0]}`);

    expect(layer.id, 1, 'the published contract lists it', contract.version >= 7 && contract.layers.includes(layer.id), `v${contract.version}`);

    const listed = (await call('listLayers')).find((l) => l.id === layer.id);
    expect(layer.id, 2, 'listLayers gives it under RaverWatch, implemented', listed?.category === 'RaverWatch' && listed?.implemented === true);

    let accepted = true;
    try {
      await call('setLayer', layer.id, { pin: false, clearOtherPins: true });
      await call('pinLayers', [layer.id === 'DrugCheckAlerts' ? 'SceneIncidents' : 'DrugCheckAlerts']);
      await call('pinLayers', []);
    } catch (e) { accepted = String(e); }
    expect(layer.id, 3, 'setLayer and pinLayers accept it', accepted === true, accepted === true ? '' : accepted);

    const drawn = await page.waitForFunction((id) => window.__starcomShareCard.listReports().some((r) => r.layer === id), layer.id, { timeout: 30000 }).then(() => true, () => false);
    const reports = (await call('listReports')).filter((r) => r.layer === layer.id);
    const complete = reports.every((r) => r.id.startsWith('30023:') && r.variant && r.variantMeans && typeof r.precisionM === 'number'
      && typeof r.lat === 'number' && typeof r.lng === 'number' && r.time);
    const unplaced = notes.filter((e) => !tagOf(e, 'geo').length && !tagOf(e, 'jurisdiction').length).length;
    expect(layer.id, 4, 'listReports includes its notes, with every field', drawn && reports.length > 0 && complete,
      drawn ? `${reports.length} of ${notes.length} listed` : `none listed: ${unplaced} of its ${notes.length} live note(s) name no place, so none can be drawn`);
    if (!reports.length) continue;

    let tour = null;
    let framed = null;
    try {
      framed = await call('frameReports', reports.map((r) => r.id), { preset: 'wide', transitionMs: 0 });
      await call('focusReport', reports[0].id);
      tour = await call('planReportTour', reports.map((r) => r.id), { preset: 'wide', holdMs: 400, travelMs: 400 });
      expect(layer.id, 5, 'frameReports, focusReport and planReportTour work on them', framed && tour.stops.length > 0, `${tour.stops.length} stop(s)`);
    } catch (e) {
      expect(layer.id, 5, 'frameReports, focusReport and planReportTour work on them', false, String(e).slice(0, 160));
    }

    const cards = [];
    for (const preset of ['wide', 'square', 'portrait']) {
      try { cards.push({ preset, card: await call('compose', { preset }) }); } catch (e) { cards.push({ preset, error: String(e).slice(0, 120) }); }
    }
    const described = await call('describeView', { preset: 'wide' });
    const counted = described.layers.find((l) => l.layer === layer.label);
    const named = cards.every(({ card }) => card && card.provenance.layersShown.includes(layer.label)
      && ids.some((id) => (card.provenance.raverWatchItems ?? []).some((item) => item.id === id)));
    expect(layer.id, 6, 'compose names the layer and notes shown, for every preset, and describeView counts them',
      named && (counted?.inFrame ?? 0) > 0, cards.map(({ preset, error }) => error ? `${preset}: ${error}` : preset).join(', ') + ` · described: ${counted ? counted.inFrame : 'not counted'}`);
    // The wide card, to look at, when asked for somewhere to put it.
    if (process.env.CHECK_OUT_DIR && cards[0].card) {
      fs.writeFileSync(path.join(process.env.CHECK_OUT_DIR, `raver-watch-${layer.id}.png`), Buffer.from(cards[0].card.dataUrl.split(',')[1], 'base64'));
    }

    let clips = '';
    try {
      for (const endCard of ['read', 'poster']) {
        const clip = await call('recordClip', { keyframes: tour.keyframes, fps: 2, endCard });
        clips += `${endCard}: ${clip.frames.length} frames; `;
      }
      expect(layer.id, 7, 'recordClip works with both end cards', true, clips);
    } catch (e) {
      expect(layer.id, 7, 'recordClip works with both end cards', false, String(e).slice(0, 160));
    }

    const coarse = reports.every((r) => Number(r.lat.toFixed(2)) === r.lat && Number(r.lng.toFixed(2)) === r.lng);
    expect(layer.id, 8, 'the framing floor holds, and nothing is finer than 0.01°', framed && framed.altitude >= 1 && coarse, framed ? `altitude ${framed.altitude.toFixed(2)}` : '');
    await call('focusReport', null);
  }
} finally {
  await browser.close();
}

if (!recordAsked) {
  console.error('\n  HARNESS CANNOT OBSERVE: The Record was never asked for raver_watch notes. This says nothing about Raver Watch.');
  console.error(`  Is the app served at ${BASE_URL}?\n`);
  process.exit(2);
}
console.log('');
for (const layer of LAYERS) {
  console.log(`  ${layer.id}`);
  for (const r of results.filter((x) => x.layer === layer.id)) console.log(`    ${r.holds ? 'PASS' : 'FAIL'}  ${r.n}. ${r.claim}${r.detail ? `  — ${r.detail}` : ''}`);
}
const done = LAYERS.filter((layer) => results.some((r) => r.layer === layer.id && r.n === 6 && r.holds));
console.log(`\n  A card with a live note: ${done.map((l) => l.id).join(', ') || 'no layer'}${done.length === LAYERS.length ? ' — Phase 1 done by their measure.' : '.'}`);
const failed = results.filter((r) => !r.holds).length;
console.log(`  ${results.length - failed} of ${results.length} checks hold.\n`);
process.exit(failed ? 1 : 0);
