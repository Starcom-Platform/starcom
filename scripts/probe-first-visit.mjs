#!/usr/bin/env node
/**
 * Measures, in the running app, what a first visit shows (decision D-F, step 1,
 * docs/missions/01-architecture-decisions/globe-visualization.md), and prints each
 * as a check that passes or fails. Exits 1 while any fails, and 2 when the network
 * sent nothing to show, which says nothing about the application.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210
 *   npm run probe:first-visit -- http://localhost:5210/ [outDir]
 *
 * Point it at the production build: the dev server loads sample data, and a first
 * visitor to the deployed app has none. The browser runs in a fresh profile, so this
 * is a first visit, in America/Chicago (override with PROBE_TZ).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { rendererNotice } from './lib/rendererLabel.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , BASE = 'http://localhost:5210/', OUT] = process.argv;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

/** How long a first visit is given for the network to send something. */
const WAIT_FOR_REPORTS_MS = 90_000;
/** Time for the turn to finish after the first reports show: its move takes a second. */
const AFTER_TURN_MS = 3_000;

/**
 * Software rendering, which is what lets a headless browser draw the globe at
 * all — and what makes every timing figure below unrepresentative of a visitor
 * with a GPU. Printed rather than assumed: see lib/rendererLabel.mjs.
 */
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
console.log(rendererNotice(GL_ARGS));

const browser = await chromium.launch({ args: GL_ARGS });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  timezoneId: process.env.PROBE_TZ || 'America/Chicago',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
let renderLoopWarnings = 0;
page.on('console', (m) => {
  if (m.type() === 'error' && /Maximum update depth exceeded/.test(m.text())) renderLoopWarnings += 1;
});
await page.addInitScript(() => {
  try {
    // The support prompt and the pipeline guide would cover the globe being measured.
    localStorage.setItem('support_funnel_v1', JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
    localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
  } catch { /* storage unavailable */ }
});

/** What the first visit is saying, read from the page as a person would read it. */
const read = () => page.evaluate(() => {
  const text = document.body.innerText;
  const own = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  return {
    networkCount: own('[data-testid="globe-network-report-count"]'),
    analysisStatus: own('[data-testid="globe-intel-status"]'),
    timelineEvents: (text.match(/(\d+)\s+events\b/i) || [])[1] ?? null,
    relays: (text.match(/NOSTR RELAYS:\s*([^\n]+?)(?=\s{2,}|\n|NOSTR INGEST|$)/) || [])[1]?.trim() ?? null,
  };
});

/**
 * Where the camera is, from the share handle's getView: the view a card would state,
 * read without composing one (composing right after load can find no frame drawn yet).
 */
const camera = () => page.evaluate(() => {
  try {
    const view = window.__starcomShareCard?.getView?.();
    return view ? { lat: view.lat, lng: view.lng, altitude: view.altitude } : null;
  } catch {
    return null;
  }
});

const degreesApart = (a, b) => {
  const rad = Math.PI / 180;
  const cos = Math.sin(a.lat * rad) * Math.sin(b.lat * rad)
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lng - b.lng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
};

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

let exitCode = 0;
try {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('[class*="starcom-preloader"]'), null, { timeout: 150000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__starcomShareCard), null, { timeout: 60000 }).catch(() => {});
  const cameraAtLoad = await camera();

  let first = null;
  while (Date.now() - t0 < WAIT_FOR_REPORTS_MS) {
    const now = await read();
    if (now.networkCount) {
      first = { atSeconds: Math.round((Date.now() - t0) / 100) / 10, ...now };
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!first) {
    console.error(`\n  CANNOT OBSERVE: the network sent no reports in ${WAIT_FOR_REPORTS_MS / 1000} s.`
      + '\n  This says nothing about the application.\n');
    exitCode = 2;
  } else {
    await page.waitForTimeout(AFTER_TURN_MS);
    const settled = await read();
    const cameraAfter = await camera();
    if (OUT) await page.screenshot({ path: `${OUT}/first-visit.png` });

    check('a first visit shows reports from the network, and says how many',
      /Showing \d+ reports? from the network/.test(first.networkCount),
      `${first.atSeconds} s after load: "${first.networkCount}"`);

    const moved = cameraAtLoad && cameraAfter ? degreesApart(cameraAtLoad, cameraAfter) : null;
    check('the globe turned to them, with the Show on Globe move',
      moved !== null && moved > 10 && Math.abs(cameraAfter.altitude - 1.8) < 0.05,
      cameraAtLoad && cameraAfter
        ? `from ${cameraAtLoad.lat.toFixed(1)}°, ${cameraAtLoad.lng.toFixed(1)}° at ${cameraAtLoad.altitude.toFixed(2)} to ${cameraAfter.lat.toFixed(1)}°, ${cameraAfter.lng.toFixed(1)}° at ${cameraAfter.altitude.toFixed(2)} (${moved.toFixed(0)}° apart)`
        : 'the share handle did not give a camera position');

    check('the header says the ingest is running once reports have arrived',
      settled.relays !== null && settled.relays !== 'INGEST STANDBY',
      `"NOSTR RELAYS: ${settled.relays}"`);

    check('the analysis status does not say there is nothing at all',
      !/in this working set/i.test(settled.analysisStatus ?? ''),
      settled.analysisStatus ? `"${settled.analysisStatus}"` : 'no analysis status shown');

    check('the timeline says what it counts',
      settled.timelineEvents !== null,
      `timeline: ${settled.timelineEvents} events, beside "${settled.networkCount}"`);

    check('no component re-renders without end',
      renderLoopWarnings === 0, `${renderLoopWarnings} "Maximum update depth exceeded" warnings`);
  }
} finally {
  await browser.close();
}

if (exitCode === 2) process.exit(2);
const failing = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}\n    ${c.detail}`);
console.log(`\n${checks.length - failing.length} of ${checks.length} checks pass${pageErrors.length ? `; page errors: ${pageErrors.join(' | ')}` : ''}`);
if (OUT) fs.writeFileSync(`${OUT}/first-visit.json`, JSON.stringify({ checks, pageErrors }, null, 2));
process.exit(failing.length ? 1 : 0);
