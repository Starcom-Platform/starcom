/**
 * A built Starcom, in a browser, drawing cards from kept notes: shared by the
 * golden cards (golden-cards.mjs) and the contact sheet (contact-cards.mjs).
 *
 * ─── NOTHING LEAVES THE MACHINE ────────────────────────────────────────────
 *
 * The Record is answered from Mecha Jono's notes as it held them, signed by
 * their key, which is the only key Starcom reads, so no note can be made up. It
 * is answered as it answers: the newest 500 per filter, `until` inclusive.
 * Every other relay is answered empty, every publish refused, every other
 * request aborted, and names fail to resolve for every host but this one.
 *
 * Earth Weather's feeds are the exception, on the page that asks for them
 * (decision D-W, step 5d): kept, the four hosts its fields come from are asked
 * and every answer recorded; served, each answer is given as it was kept and
 * the page's clock starts at the moment they were kept, since which hour each
 * feed answers for is judged against the clock. A served page that asks for an
 * answer not kept cannot be compared, and says so.
 *
 * ─── THE SAME SHOT MAKES THE SAME PICTURE ──────────────────────────────────
 *
 * The quality setting is pinned: SwiftShader's governor otherwise switches the
 * atmosphere off between renders. A card that says a feed it draws is still
 * loading is made again. And a shot is rendered until two renders in a row
 * agree: some of what a globe draws still refines after it is ready (the
 * borders take a finer level of detail a few seconds after a load: 0.57% of a
 * card's pixels, measured 2026-10-03).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RECORD_HOST = 'record.cosmiccodex.app';
const RECORD_CAP = 500;
/** Renders of one shot before it must have settled, and how far two in a row may differ when it has. */
const SETTLE_RENDERS = 5;
const SETTLED_SHARE = 0.0005;
/**
 * Where Earth Weather's data comes from: NOAA's GFS on AWS, EUMETSAT's cloud
 * mosaic, RainViewer's radar, and the Open-Meteo grid and NASA's sea-ice events
 * read whatever the look, for the hover's readings and the ice.
 */
const WEATHER_HOSTS = [
  'noaa-gfs-bdp-pds.s3.amazonaws.com', 'view.eumetsat.int', 'api.rainviewer.com', 'tilecache.rainviewer.com',
  'api.open-meteo.com', 'air-quality-api.open-meteo.com', 'eonet.gsfc.nasa.gov',
];
const KEPT_INDEX = 'kept.json';
const EXTENSIONS = { 'image/png': '.png', 'application/json': '.json', 'application/xml': '.xml', 'text/plain': '.txt' };

/** One answer's name: the URL, and the byte range asked for when one was. */
const feedKey = (url, range) => (range ? `${url} ${range}` : url);

/** The kept answers in `dir`, and when they were kept. Exits with 2 when there are none. */
export function loadKeptFeeds(dir) {
  const index = path.join(dir, KEPT_INDEX);
  if (!fs.existsSync(index)) cannotObserve(`no kept weather feeds in ${dir}: keep them with --keep-feeds --update`);
  const kept = JSON.parse(fs.readFileSync(index, 'utf8'));
  const answers = new Map(kept.answers.map((a) => [feedKey(a.url, a.range), { ...a, body: fs.readFileSync(path.join(dir, a.file)) }]));
  return { keptAt: Date.parse(kept.keptAt), answers };
}

/** Writes what a keeping page recorded into `dir`, in place of what was kept there before. */
export function writeKeptFeeds(dir, keptAt, recorded) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const answers = recorded.map(({ url, range, status, type, body }) => {
    const bare = (type ?? '').split(';')[0].trim();
    const file = crypto.createHash('sha256').update(feedKey(url, range)).digest('hex').slice(0, 16)
      + (EXTENSIONS[bare] ?? (url.split('?')[0].endsWith('.idx') ? '.idx' : '.bin'));
    fs.writeFileSync(path.join(dir, file), body);
    return { url, ...(range ? { range } : {}), status, type: bare, file, bytes: body.length };
  });
  const about = 'Earth Weather\'s feeds as they answered when kept (decision D-W, step 5d): each answer to the golden weather shots, '
    + 'served by card-harness.mjs in their place, the page\'s clock starting at keptAt. Kept again with golden-cards.mjs --keep-feeds --update.';
  fs.writeFileSync(path.join(dir, KEPT_INDEX), `${JSON.stringify({ about, keptAt: new Date(keptAt).toISOString(), answers }, null, 1)}\n`);
  return answers;
}

/** How a card is made small to compare: the golden cards' own copy (IM21). */
export const SMALL = { width: 400, type: 'image/webp', quality: 0.9, pixelDelta: 48 };

export const cannotObserve = (why) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${why}\n  This says nothing about the cards.\n`);
  process.exit(2);
};

export const bytesOf = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
export const dataUrlOf = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;

/** Every event in the kept files, as one list. */
export function loadNotes(repo, files) {
  return files.flatMap((file) => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8')).events);
}

const tagValues = (event, name) => event.tags.filter((t) => t[0] === name).map((t) => t[1]);
function matches(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.since !== undefined && event.created_at < filter.since) return false;
  if (filter.until !== undefined && event.created_at > filter.until) return false;
  return Object.keys(filter).filter((k) => k.startsWith('#'))
    .every((k) => filter[k].some((v) => tagValues(event, k.slice(1)).includes(v)));
}

/*
 * In the page, which decodes WebP: a card made small, and, given a kept copy,
 * compared with it outside the footer's band (contract v20's regions.footer:
 * the capture moment and the build). The diff shows the kept copy dimmed, what
 * differs in magenta and the band left out in grey.
 */
export async function pictureOf(page, card, keptUrl, small = SMALL) {
  return page.evaluate(async ({ dataUrl, footer, small, keptUrl }) => {
    const load = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('could not decode')); img.src = src; });
    const pixels = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
    const full = await load(dataUrl);
    const scale = small.width / full.width;
    const canvas = document.createElement('canvas');
    canvas.width = small.width;
    canvas.height = Math.round(full.height * scale);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, 0, canvas.width, canvas.height);
    const smallUrl = canvas.toDataURL(small.type, small.quality);
    if (!keptUrl) return { smallUrl, width: canvas.width, height: canvas.height };
    const [now, then] = [pixels(await load(smallUrl)), pixels(await load(keptUrl))];
    if (now.width !== then.width || now.height !== then.height) {
      return { smallUrl, width: canvas.width, height: canvas.height, sameSize: false, keptSize: `${then.width}x${then.height}` };
    }
    const bandFrom = Math.floor(footer.y * scale) - 1;
    const bandTo = Math.ceil((footer.y + footer.height) * scale) + 1;
    const diff = new ImageData(now.width, now.height);
    let compared = 0; let differing = 0; let sum = 0;
    for (let y = 0; y < now.height; y++) {
      for (let x = 0; x < now.width; x++) {
        const i = (y * now.width + x) * 4;
        if (y >= bandFrom && y <= bandTo) { diff.data.set([96, 96, 96, 255], i); continue; }
        const d = Math.max(Math.abs(now.data[i] - then.data[i]), Math.abs(now.data[i + 1] - then.data[i + 1]), Math.abs(now.data[i + 2] - then.data[i + 2]));
        compared += 1; sum += d;
        if (d > small.pixelDelta) { differing += 1; diff.data.set([255, 0, 255, 255], i); }
        else diff.data.set([then.data[i] * 0.35, then.data[i + 1] * 0.35, then.data[i + 2] * 0.35, 255], i);
      }
    }
    const dc = document.createElement('canvas'); dc.width = now.width; dc.height = now.height; dc.getContext('2d').putImageData(diff, 0, 0);
    return { smallUrl, width: canvas.width, height: canvas.height, sameSize: true, share: differing / compared, meanDelta: sum / compared, diffUrl: dc.toDataURL('image/png') };
  }, { dataUrl: card.dataUrl, footer: card.regions.footer, small, keptUrl });
}

/**
 * The built app at `baseUrl`, ready to draw shots from `notes`. Exits with 2
 * (cannot observe) when there is no WebGL or the share handle never appears.
 *
 * `feeds`, for a page drawing Earth Weather: `{ keep: true }` asks its hosts and
 * records each answer in `stats.kept`; `{ kept }` (loadKeptFeeds) answers from
 * what was kept, and lists in `stats.unkept` whatever was asked and not kept.
 */
export async function openCardPage({ baseUrl, notes, viewport, feeds }) {
  const answer = (filter) => notes.filter((e) => matches(e, filter))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, Math.min(RECORD_CAP, filter.limit ?? RECORD_CAP));
  const stats = { recordAsked: false, publishRefused: 0, keptAt: Date.now(), kept: [], unkept: [], refusedHosts: new Map() };
  const refuse = (route, u) => { stats.refusedHosts.set(u.hostname, (stats.refusedHosts.get(u.hostname) ?? 0) + 1); return route.abort(); };
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const local = (u) => u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  await context.route('**/*', async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    if (local(u) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (!feeds || !WEATHER_HOSTS.includes(u.hostname) || request.method() !== 'GET') return refuse(route, u);
    const range = request.headers().range;
    const key = feedKey(request.url(), range);
    if (feeds.keep) {
      // The first answer to each ask is the one kept; it is what a served page is given every time.
      const response = await route.fetch().catch(() => null);
      if (!response) return refuse(route, u);
      const body = await response.body();
      if (!stats.kept.some((k) => feedKey(k.url, k.range) === key)) {
        stats.kept.push({ url: request.url(), range, status: response.status(), type: response.headers()['content-type'], body });
      }
      return route.fulfill({ response, body });
    }
    const kept = feeds.kept.answers.get(key);
    if (!kept) {
      stats.unkept.push(key);
      return refuse(route, u);
    }
    const from = kept.status === 206 ? Number(/^bytes=(\d+)-/.exec(range ?? '')?.[1]) : NaN;
    return route.fulfill({
      status: kept.status,
      body: kept.body,
      headers: {
        'content-type': kept.type || 'application/octet-stream',
        'access-control-allow-origin': '*',
        ...(Number.isFinite(from) ? { 'content-range': `bytes ${from}-${from + kept.body.length - 1}/*` } : {}),
      },
    });
  });
  if (feeds?.kept) {
    // The clock as it read when the feeds were kept, moving on from there: which hour a feed answers for is judged against it.
    await context.addInitScript((keptAt) => {
      const RealDate = Date;
      const offset = keptAt - RealDate.now();
      function KeptDate(...args) {
        if (!new.target) return new RealDate(RealDate.now() + offset).toString();
        return args.length === 0 ? new RealDate(RealDate.now() + offset) : new RealDate(...args);
      }
      KeptDate.prototype = RealDate.prototype;
      KeptDate.now = () => RealDate.now() + offset;
      KeptDate.parse = RealDate.parse;
      KeptDate.UTC = RealDate.UTC;
      globalThis.Date = KeptDate;
    }, feeds.kept.keptAt);
  }
  await context.routeWebSocket((u) => !local(u), (socket) => {
    const record = new URL(socket.url()).hostname === RECORD_HOST;
    socket.onMessage((raw) => {
      let message; try { message = JSON.parse(String(raw)); } catch { return; }
      if (message[0] === 'REQ') {
        if (record) {
          stats.recordAsked = true;
          const sent = new Set();
          for (const filter of message.slice(2)) {
            for (const event of answer(filter)) {
              if (sent.has(event.id)) continue;
              sent.add(event.id);
              socket.send(JSON.stringify(['EVENT', message[1], event]));
            }
          }
        }
        socket.send(JSON.stringify(['EOSE', message[1]]));
      }
      if (message[0] === 'EVENT') { stats.publishRefused += 1; socket.send(JSON.stringify(['OK', message[1]?.id, false, 'blocked: a card run publishes nothing'])); }
    });
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
      localStorage.setItem('support_funnel_v1', JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
      // Pinned: SwiftShader's quality governor otherwise switches the atmosphere off between renders.
      localStorage.setItem('starcom-globe-quality', JSON.stringify({ version: 1, timestamp: Date.now(), data: { setting: 'low' } }));
    } catch { /* storage blocked: the card states its quality, and the text would differ */ }
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));

  await page.goto('about:blank');
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
  if (!gl) cannotObserve('no WebGL context in this browser');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => typeof window.__starcomShareCard?.renderShot === 'function', null, { timeout: 120_000 })
    .catch(() => cannotObserve('the share handle never appeared'));
  const call = (method, ...args) => page.evaluate(([m, a]) => window.__starcomShareCard[m](...a), [method, args]);
  await call('whenReady', { timeoutMs: 90_000 });

  // A card made while a feed it draws is still being read states that, and is not this shot's card: wait, and make it again.
  const renderFed = async (name, shot) => {
    for (let attempt = 0; ; attempt += 1) {
      const result = await call('renderShot', shot, { timeoutMs: 120_000 });
      const loading = (result.card?.provenance?.feeds ?? []).filter((f) => f.loading).map((f) => f.name);
      if (loading.length === 0) return result;
      if (attempt === 10) cannotObserve(`${name}: ${loading.join(', ')} still loading after ten tries`);
      await page.waitForTimeout(3_000);
    }
  };
  /** The shot's card once two renders in a row agree, and how many it took. */
  const settled = async (name, shot) => {
    let previous = await renderFed(name, shot);
    for (let renders = 2; renders <= SETTLE_RENDERS; renders += 1) {
      const next = await renderFed(name, shot);
      if (!previous.card || !next.card) return { result: next, renders };
      const before = await pictureOf(page, previous.card, null);
      const agreement = await pictureOf(page, next.card, before.smallUrl);
      if (agreement.sameSize && agreement.share <= SETTLED_SHARE) return { result: next, renders };
      previous = next;
    }
    return cannotObserve(`${name}: ${SETTLE_RENDERS} renders in a row never agreed; the page did not settle`);
  };

  return { page, call, settled, stats, pageErrors, close: () => browser.close() };
}
