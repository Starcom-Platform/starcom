/**
 * Starcom's service worker.
 *
 * ─── WHY THIS IS NOT WORKBOX ───────────────────────────────────────────────
 *
 * The build is 58MB: a 10MB app shell across 93 hashed chunks, and ~37MB of
 * datasets and geometry that most sessions never touch. A generated precache
 * manifest would download all of it on first visit, which is the wrong trade
 * for people on poor connections — who are exactly the people an offline mode
 * is for.
 *
 * So: nothing is precached except the shell's entry points. Everything else is
 * cached AS IT IS USED. First visit costs what it always cost; the second works
 * offline for whatever the first actually touched.
 *
 * ─── KEPT, BUT NOT TRUSTED ACROSS A BUILD ──────────────────────────────────
 *
 * Code is content-hashed: new bytes, new name, so a kept chunk is never wrong.
 * Data is not. Borders, territories and datasets keep their names when their
 * bytes change, and this worker once kept them for good, so a returning
 * browser drew borders as it first fetched them, weeks after they changed. Now
 * each kept data file is asked for again, with its ETag, the first time it is
 * used under a build that has not checked it: a 304 of no body when unchanged,
 * the new file when not (decided 2026-10-07: recheck once per build).
 *
 * ─── THE RULE THAT MATTERS MOST ────────────────────────────────────────────
 *
 * Cross-origin requests are NOT HANDLED AT ALL — not cached, not intercepted,
 * passed straight through.
 *
 * That is an epistemic rule, not a performance one. This application looks up
 * certificate logs, DNS and registration records, and an observation's value is
 * inseparable from when it was made. Serving yesterday's DNS answer as though
 * it were today's would not be a stale cache, it would be a false observation
 * entering a pipeline whose whole premise is that weight derives from method.
 * An offline analyst must see a lookup FAIL, not silently succeed with old
 * data.
 */

/** Bump to invalidate everything. Appears in every cache name. */
const VERSION = 'v1';

/**
 * The build this worker came with, stamped into the built copy by
 * scripts/stamp-service-worker.mjs. Each build's worker differs by this line,
 * so a deploy installs a new one on the next visit, and the data it keeps is
 * checked once under each build (below), never trusted across one.
 */
const BUILD = '__STARCOM_BUILD__';
const SHELL = `starcom-shell-${VERSION}`;
const ASSETS = `starcom-assets-${VERSION}`;
const DATA = `starcom-data-${VERSION}`;

/**
 * The minimum for the application to start.
 *
 * Deliberately tiny. Hashed chunks are not listed because their names change
 * every build and a stale list fails the install — the runtime rules below pick
 * them up on first use instead.
 */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest'];

/**
 * Immutable: Vite's own output, `name-HASH.ext` at the top of /assets/, so a hit
 * is always correct and is never asked for again. Nothing else is put there:
 * stamp-service-worker.mjs refuses a build whose public/assets/ would. The
 * folders below it (textures, images, models, sounds) are copied as they are,
 * under names that stay when their bytes change, and are kept as data.
 */
const isHashedAsset = (path) => /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/.test(path);

/** Static, under names that stay when their bytes change, and only fetched when something asks: checked once per build. */
const isKeptData = (path) =>
  path.startsWith('/assets/')
  || path.startsWith('/data/')
  || path.startsWith('/geopolitical/')
  || path.startsWith('/social/')
  || path.startsWith('/eco-natural/')
  || path.startsWith('/fonts/');

/**
 * Whether a navigation is to one of the app's own paths, which the host answers
 * with index.html: the only answer that may become the offline shell. A path
 * naming a file (a spec, Uplink's privacy page) is a page of its own; keeping
 * it as the shell made that file the app's offline start.
 */
const isAppPath = (path) => path === '/index.html' || !path.slice(path.lastIndexOf('/') + 1).includes('.');

/** What a kept data file carries: the build that last checked it. */
const CHECKED = 'x-starcom-checked-under';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // Individually, so one missing file does not fail the whole install and
      // leave the worker permanently uninstalled.
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => !n.endsWith(VERSION)).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // See the header. Cross-origin is passed through untouched — a cached
  // intelligence lookup is a false observation, not a fast one.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a deployed update is picked up, with the
  // cached shell as the offline answer. A cache-first shell is how a PWA gets
  // stuck on an old build forever.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /**
           * Only a good response becomes the shell.
           *
           * This cached whatever came back, so one 502 from the edge — or a
           * 404 page during a bad deploy — became the PERMANENT offline
           * experience, served to that visitor on every subsequent offline
           * load. The failure is silent and outlives its cause, which is the
           * worst combination a cache can have.
           *
           * The put is also guarded: a quota error or a private-mode cache
           * rejection must not turn a working navigation into a failed one.
           * And only an app path's answer is the shell (isAppPath).
           */
          if (response.ok && response.status === 200 && isAppPath(url.pathname)) {
            const copy = response.clone();
            caches.open(SHELL)
              .then((cache) => cache.put('/index.html', copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (isKeptData(url.pathname)) {
    // A ranged request, as audio and video make, asks for part of a file: the
    // network answers it, and nothing partial is kept.
    if (request.headers?.has('range')) return;
    event.respondWith(checkedOncePerBuild(request));
    return;
  }

  // Anything else same-origin: try the network, fall back to whatever was
  // stored. No new entries — an unclassified path is not one this worker
  // should decide to keep.
  event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c ?? Response.error())));
});

/**
 * A kept data file, checked once under this build. Checked already, it is
 * served with no request. Otherwise it is asked for again with its ETag, which
 * Vercel answers 304 with no body when the bytes are the same (Last-Modified
 * would not do: it moves with every deploy). Unchanged, the kept copy is marked
 * checked; changed, the new file takes its place; gone from this build, it is
 * forgotten rather than served as current. Offline, or when the server fails,
 * the kept copy answers, whatever build checked it.
 */
async function checkedOncePerBuild(request) {
  const kept = await caches.match(request);
  if (kept && kept.headers.get(CHECKED) === BUILD) return kept;

  const etag = kept?.headers.get('etag');
  let response;
  try {
    // By its URL, not as the page asked: an <img> asks in no-cors mode, which
    // would drop If-None-Match and fetch the whole texture again.
    response = await fetch(request.url, { credentials: 'same-origin', headers: etag ? { 'If-None-Match': etag } : {} });
  } catch {
    return kept ?? Response.error();
  }
  if (response.status === 304 && kept) return keep(request, kept);
  if (response.ok && response.status === 200) return keep(request, response);
  if (response.status === 404 || response.status === 410) {
    await forget(request);
    return response;
  }
  return kept ?? response;
}

/** Kept in the data cache, marked as checked under this build. */
async function keep(request, response) {
  const headers = new Headers(response.headers);
  headers.set(CHECKED, BUILD);
  const marked = new Response(await response.blob(), { status: 200, statusText: response.statusText, headers });
  try {
    await (await caches.open(DATA)).put(request, marked.clone());
    // What the worker before this rule kept of a texture or sound was in the
    // assets cache, which caches.match would go on finding first.
    await (await caches.open(ASSETS)).delete(request);
  } catch {
    // A quota error or a private-mode refusal must not turn a good answer into a failed one.
  }
  return marked;
}

async function forget(request) {
  try {
    await Promise.all([DATA, ASSETS].map(async (name) => (await caches.open(name)).delete(request)));
  } catch {
    // Nothing kept, or nothing that can be: either way nothing stale is served.
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only complete, successful responses. Storing a 404 or an opaque partial
    // would serve it back forever.
    if (response.ok && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return Response.error();
  }
}
