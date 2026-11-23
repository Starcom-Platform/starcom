#!/usr/bin/env node
/**
 * Is the globe lit where the Sun is?
 *
 * ─── WHY A RENDER PROBE AND NOT A UNIT TEST ────────────────────────────────
 *
 * Four things had to line up for the terminator to be right, and every one of them
 * was broken in a way no unit test could see (measured 2026-09-11): three-globe's
 * default light sat fixed above the north pole; SolarSunManager's light was created
 * at (0,0,1000) and only repositioned in scale tiers the globe is never viewed from;
 * the day/night shader's sunDirection uniform was never written; and that shader
 * compared it against a VIEW-space normal, so the lit side followed the camera. The
 * ephemeris underneath agreed with the almanac the whole time.
 *
 * So this asks the running app, at a fixed instant, two questions a person would:
 *
 *   1. is the place the Sun is overhead brighter than the place opposite it?
 *   2. does the lit side stay over the same geography when the camera moves?
 *
 * Playwright's clock is installed before the app loads, so "now" is the instant
 * below and the answer is reproducible rather than a function of when it ran.
 *
 * Exit 0 when both hold, 1 when either fails, 2 when the harness cannot observe —
 * a probe reports; it does not explain away.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/probe-terminator.mjs http://localhost:5210
 *   TERMINATOR_AT=2026-06-21T12:00:00Z node scripts/probe-terminator.mjs …
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:5210';
const AT = new Date(process.env.TERMINATOR_AT || '2026-09-11T21:00:00Z');
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SETTLE_MS = Number(process.env.TERMINATOR_SETTLE_MS || 18000);

const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}\n  This says nothing about the application.\n`);
  process.exit(2);
};

/** The subsolar point for `AT`, computed here so the app cannot be graded by its own maths. */
function subsolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;                       // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;     // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180; // ecliptic longitude
  const epsilon = (23.439 - 0.0000004 * n) * Math.PI / 180;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * 180 / Math.PI;
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * 180 / Math.PI;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lng = ((rightAscension - gmst + 540) % 360) - 180;
  return { lat: declination, lng };
}

const sun = subsolarPoint(AT);
const antipode = { lat: -sun.lat, lng: ((sun.lng + 360) % 360) - 180 };
console.log(`\n  at ${AT.toISOString()} the Sun is overhead at ${sun.lat.toFixed(1)}, ${sun.lng.toFixed(1)}`);
console.log(`  and midnight is at ${antipode.lat.toFixed(1)}, ${antipode.lng.toFixed(1)}\n`);

const browser = await chromium.launch({ args: GL_ARGS });

/** Mean brightness of the globe in the middle of the frame, viewed from `lat,lng`. */
async function brightnessFacing(lat, lng, label) {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await context.clock.install({ time: AT });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
      localStorage.setItem('support_funnel_session_v1', JSON.stringify({ dismissed: true, seen: true, ts: 0 }));
      // EcoNatural/EarthWeather: the mode whose material carries the day/night shader.
      localStorage.setItem('starcom-visualization-mode',
        JSON.stringify({ version: 1, timestamp: 0, data: { mode: 'EcoNatural', subMode: 'EarthWeather' } }));
      // Pin globe quality to High. Under software rendering auto would step down, and the
      // probe would measure a plainer globe than anyone with a GPU sees.
      localStorage.setItem('starcom-globe-quality', JSON.stringify({ version: 1, timestamp: 0, data: { setting: 'high' } }));
    } catch { /* storage unavailable */ }
  });
  try {
    const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    if (!res || !res.ok()) cannotObserve(`could not load ${BASE_URL}`);
    const up = await page.waitForFunction(() => {
      try { window.__starcomShareCard.captureFrame({ scale: 0.1 }); return true; } catch { return false; }
    }, undefined, { timeout: 120000, polling: 300 }).then(() => true).catch(() => false);
    if (!up) cannotObserve('the globe never became capturable');
    await page.evaluate((v) => window.__starcomShareCard.setView(v, { transitionMs: 0, settleMs: 1500 }), { lat, lng, altitude: 2.0 });
    await page.waitForTimeout(SETTLE_MS);
    return await page.evaluate(async () => {
      const frame = window.__starcomShareCard.captureFrame({ scale: 1, mimeType: 'image/png' });
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = frame.dataUrl; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      // The middle fifth of the frame: the globe under the view centre, clear of the limb.
      const w = Math.floor(img.width / 5), h = Math.floor(img.height / 5);
      const { data } = ctx.getImageData(Math.floor((img.width - w) / 2), Math.floor((img.height - h) / 2), w, h);
      let sum = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
      return { luminance: +(sum / n).toFixed(2), pixels: n };
    });
  } finally {
    await context.close();
  }
}

const day = await brightnessFacing(sun.lat, sun.lng, 'subsolar');
const night = await brightnessFacing(antipode.lat, antipode.lng, 'antipode');
// The same view twice, from two camera longitudes 60° apart: the lit side must not follow.
const nightAgainFromEast = await brightnessFacing(antipode.lat, ((antipode.lng + 60 + 540) % 360) - 180, 'antipode+60');

console.log(`  looking at the subsolar point:  luminance ${day.luminance}`);
console.log(`  looking at midnight:            luminance ${night.luminance}`);
console.log(`  midnight, camera moved 60°:     luminance ${nightAgainFromEast.luminance}\n`);

const lit = day.luminance > night.luminance * 1.5;
// A camera-locked light would make every view equally bright; the night side must stay dark.
const stays = nightAgainFromEast.luminance < day.luminance * 0.8;

console.log(`  the day side is brighter than the night side:      ${lit ? 'yes' : 'NO'}`);
console.log(`  the night side stays dark when the camera moves:   ${stays ? 'yes' : 'NO'}\n`);

await browser.close();
if (!lit || !stays) {
  console.error('  The globe is not lit where the Sun is.\n');
  process.exit(1);
}
console.log('  The globe is lit where the Sun is.\n');
