#!/usr/bin/env node
/**
 * Measures, in the running app, the contradictions decision D-E exists to remove
 * (docs/missions/01-architecture-decisions/time-model.md), and prints each as a
 * check that passes or fails. Exits 1 while any fails.
 *
 * Usage: npm run probe:time -- http://localhost:5211/ [outDir]
 *
 * Needs the dev server running. The browser runs in America/Chicago (override
 * with PROBE_TZ) so local time and UTC differ, and in a fresh profile, so the
 * first-visit behaviour is what gets measured.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [, , BASE = 'http://localhost:5211/', OUT] = process.argv;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  timezoneId: process.env.PROBE_TZ || 'America/Chicago',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
// React warns, and throws nothing, when a component keeps setting state after every render.
let renderLoopWarnings = 0;
page.on('console', (m) => {
  if (m.type() === 'error' && /Maximum update depth exceeded/.test(m.text())) renderLoopWarnings += 1;
});

await page.addInitScript(() => {
  try {
    localStorage.setItem('support_funnel_v1', JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
    localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
  } catch { /* storage unavailable */ }
  // The HUD timeline is the only 800×400 canvas. Each redraw starts with clearRect,
  // so the record always holds the latest frame.
  const isTimeline = (ctx) => ctx.canvas && ctx.canvas.width === 800 && ctx.canvas.height === 400;
  window.__timelineText = [];
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    if (isTimeline(this)) window.__timelineText.push({ text: String(text), x, y });
    return fillText.call(this, text, x, y, ...rest);
  };
  // What each fill() on the timeline was filled with: it fills only its pins.
  window.__timelineFills = [];
  const fill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function (...args) {
    if (isTimeline(this)) window.__timelineFills.push(String(this.fillStyle));
    return fill.apply(this, args);
  };
  const clearRect = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (isTimeline(this)) {
      window.__timelineText = [];
      window.__timelineFills = [];
    }
    return clearRect.apply(this, args);
  };
});

const surfaces = () => page.evaluate(() => {
  const text = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
  const scrubber = document.querySelector('[class*="timeScrubber"]');
  const missionLabel = [...document.querySelectorAll('span, div')].find((el) => el.children.length === 0 && /MISSION TIME/i.test(el.textContent || ''));
  const badge = document.querySelector('[data-testid="globe-temporal-position"]');
  return {
    cornerClock: text('[class*="clockLabel"]'),
    missionTime: missionLabel ? (missionLabel.nextElementSibling?.textContent || '').trim() : null,
    timelineReadAt: text('[data-panel-id="timeline-panel"] [class*="footer"] [class*="status"]'),
    placedByWritten: text('[data-testid="globe-intel-placed-by-written"]'),
    badgeParts: badge ? [...badge.children].map((c) => c.textContent.trim()) : [],
    scrubber: scrubber && {
      events: text('[class*="timeScrubber"] [class*="eventCount"]'),
      position: text('[class*="timeScrubber"] [class*="currentDate"]'),
      range: [...scrubber.querySelectorAll('[class*="rangeLabel"]')].map((el) => el.textContent.trim()),
      liveButton: text('[class*="timeScrubber"] [class*="liveButton"]'),
    },
  };
});

const timelineCanvas = () => page.evaluate(() => {
  const all = window.__timelineText;
  return {
    currentX: all.find((t) => t.text === 'CURRENT')?.x ?? null,
    // The range is printed at the two bottom corners; tick labels sit just under the axis.
    rangeDates: all.filter((t) => t.y === 390 && (t.x === 50 || t.x === 750)).map((t) => t.text),
    ticks: all.filter((t) => t.y === 225).map((t) => t.text),
    pinFills: window.__timelineFills.slice(),
    overlay: [...document.querySelectorAll('[data-panel-id="timeline-panel"] [class*="stats"] div')].map((d) => d.textContent.trim()),
  };
});

const settle = () => page.waitForFunction(() => !document.querySelector('[class*="starcom-preloader"]'), null, { timeout: 150000 }).catch(() => {});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 180000 });
await settle();
await page.waitForTimeout(15000);

await page.keyboard.press('Control+k');
await page.waitForTimeout(1200);
const item = page.getByText('Timeline', { exact: true }).first();
const box = await item.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(4000);
await page.mouse.move(5, 5);
await page.waitForTimeout(600);
const opened = { canvas: await timelineCanvas(), surfaces: await surfaces() };

// A keyboard user reaches the first event on the focused timeline (decision D-E, step 7).
await page.focus('[data-panel-id="timeline-panel"] canvas');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const keyboardCard = await page.evaluate(() => document.querySelector('[data-testid="timeline-event-card"]')?.innerText ?? null);

const canvasBox = await (await page.$('[data-panel-id="timeline-panel"] canvas')).boundingBox();
await page.mouse.click(canvasBox.x + canvasBox.width * (50 + 0.3 * 700) / 800, canvasBox.y + canvasBox.height * 0.5);
await page.waitForTimeout(1500);
const afterClick = await surfaces();
const clickedCurrentX = (await timelineCanvas()).currentX;

await page.reload({ waitUntil: 'domcontentloaded' });
await settle();
await page.waitForTimeout(15000);
const afterReload = await surfaces();

await browser.close();

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const number = (s) => Number(String(s ?? '').replace(/\D/g, '')) || 0;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A date the app prints, "9 Jul 2026" or "9 Jul", as UTC midnight; NaN if it is not one. */
const parseDayLabel = (label) => {
  const m = String(label).match(/^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?$/);
  if (!m) return Number.NaN;
  return Date.UTC(m[3] ? Number(m[3]) : new Date().getUTCFullYear(), MONTHS.indexOf(m[2]), Number(m[1]));
};
const withoutYear = (label) => String(label).replace(/ \d{4}$/, '');

const scrubberCount = number(opened.surfaces.scrubber?.events);
const timelineCount = number(opened.canvas.overlay.find((s) => /^Events:/.test(s)));
check('the scrubber and the timeline count the same events',
  scrubberCount === timelineCount, `scrubber ${scrubberCount}, timeline ${timelineCount}`);

const scrubberRange = (opened.surfaces.scrubber?.range || []).map(withoutYear);
const timelineRange = opened.canvas.rangeDates.map(withoutYear);
check('the scrubber and the timeline span the same dates',
  scrubberRange.length === 2 && JSON.stringify(scrubberRange) === JSON.stringify(timelineRange),
  `scrubber ${JSON.stringify(opened.surfaces.scrubber?.range)}, timeline ${JSON.stringify(opened.canvas.rangeDates)}`);

if (opened.canvas.rangeDates.length === 2 && opened.canvas.currentX !== null) {
  const start = parseDayLabel(opened.canvas.rangeDates[0]);
  const end = parseDayLabel(opened.canvas.rangeDates[1]);
  const nowAt = (Date.now() - start) / (end - start);
  const currentAt = (opened.canvas.currentX - 50) / 700;
  check('in live mode the timeline marks now where now is',
    Math.abs(nowAt - currentAt) < 0.02, `CURRENT at ${currentAt.toFixed(3)}, now at about ${nowAt.toFixed(3)}`);
} else {
  check('in live mode the timeline marks now where now is', false, 'could not read the timeline marker or its range');
}

const agrees = (s) => /SCRUB/.test(s.badgeParts[0] || '') === /PAUSED/.test(s.scrubber?.liveButton || '');
// The canvas is drawn 800 wide and shown at whatever width the panel gives it.
check('a click on the timeline puts CURRENT where it was clicked',
  clickedCurrentX !== null && Math.abs(clickedCurrentX - (50 + 0.3 * 700)) < 3,
  `clicked at canvas x ${50 + 0.3 * 700}, CURRENT drawn at ${clickedCurrentX}`);
check('after a click on the timeline, the scrubber and the badge agree on live or paused',
  agrees(afterClick), `badge ${afterClick.badgeParts[0]}, scrubber ${afterClick.scrubber?.liveButton}`);
check('after a reload that restores the cursor, the scrubber and the badge agree',
  agrees(afterReload), `badge ${afterReload.badgeParts[0]}, scrubber ${afterReload.scrubber?.liveButton}`);
// Paused, the globe places reports in time; the sample reports state no event time.
check('paused, the globe says how many reports it placed by when they were written',
  /placed by when (they were|it was) written — no stated event time/.test(afterClick.placedByWritten || ''),
  `after a click on the timeline: ${JSON.stringify(afterClick.placedByWritten)}; live: ${JSON.stringify(opened.surfaces.placedByWritten)}`);

const readouts = {
  'corner clock': opened.surfaces.cornerClock,
  'MISSION TIME': opened.surfaces.missionTime,
  'scrubber position': opened.surfaces.scrubber?.position,
  'timeline read time': opened.surfaces.timelineReadAt,
};
check('every time readout is in UTC, marked Z',
  Object.values(readouts).every((v) => /\d{2}:\d{2}(:\d{2})?Z\b/.test(v || '')), JSON.stringify(readouts));

const windowEnds = (afterClick.badgeParts[1] || '').split(/\s[–-]\s/);
// A click selects the axis step containing it (decision D-E): the window runs between two neighbouring ticks.
const [clickedStart, clickedEnd] = (afterClick.badgeParts[1] || '').split(/\s[–-]\s/).map((s) => s.replace(/\s\d{2}:\d{2}Z$/, ''));
const clickedTick = opened.canvas.ticks.indexOf(clickedStart);
check('a click on the timeline selects the axis step containing it',
  clickedTick >= 0 && opened.canvas.ticks[clickedTick + 1] === clickedEnd,
  `badge window ${JSON.stringify(afterClick.badgeParts[1])}, axis ticks ${JSON.stringify(opened.canvas.ticks.slice(0, 8))}`);
check('the paused window shows a different start and end',
  windowEnds.length === 2 && windowEnds[0] !== windowEnds[1], `badge window "${afterClick.badgeParts[1]}"`);

// TimelineView fills a hollow pin with PIN_HOLE_FILL, rgb(0, 18, 36); every other fill is a pin's own colour.
const pinColours = [...new Set(opened.canvas.pinFills)].filter((c) => c !== '#001224');
check('the timeline draws events in their type’s colours, not all white',
  pinColours.length >= 2 && pinColours.some((c) => c !== '#ffffff'), `pin colours ${JSON.stringify(pinColours)}`);
check('a keyboard user can reach an event and read when it happened, in UTC with local time',
  /Happened: .*\d{2}:\d{2}Z/.test(keyboardCard || '') && /Local: /.test(keyboardCard || ''),
  `card after → on the focused timeline: ${JSON.stringify(keyboardCard)}`);

const spansDays = opened.canvas.rangeDates.length === 2
  && parseDayLabel(opened.canvas.rangeDates[1]) - parseDayLabel(opened.canvas.rangeDates[0]) > 2 * 86_400_000;
check('across days, the timeline axis prints dates rather than times of day',
  spansDays && opened.canvas.ticks.length > 0 && !opened.canvas.ticks.some((t) => /^\d{2}:\d{2}Z?$/.test(t)),
  `ticks ${JSON.stringify(opened.canvas.ticks.slice(0, 5))}…`);

// Paused, the globe's eco effects re-rendered without end: 272 warnings in one
// pause, and a globe that stopped answering clicks, while every check above passed.
check('no component re-renders without end, live or paused',
  renderLoopWarnings === 0, `${renderLoopWarnings} "Maximum update depth exceeded" warnings`);

const failing = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}\n    ${c.detail}`);
console.log(`\n${checks.length - failing.length} of ${checks.length} checks pass${pageErrors.length ? `; page errors: ${pageErrors.join(' | ')}` : ''}`);
if (OUT) fs.writeFileSync(`${OUT}/time-surfaces.json`, JSON.stringify({ checks, opened, keyboardCard, afterClick, afterReload, pageErrors }, null, 2));
process.exit(failing.length ? 1 : 0);
