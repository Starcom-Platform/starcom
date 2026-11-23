/**
 * Tests the file that actually ships.
 *
 * public/sw.js is served verbatim and imported by nothing, so a test that
 * re-stated its rules would be testing a copy. This loads the real file into a
 * fabricated ServiceWorkerGlobalScope and drives its fetch handler.
 *
 * The rule under test above all others is that CROSS-ORIGIN REQUESTS ARE NOT
 * HANDLED. That is epistemic rather than architectural: this application looks
 * up certificate logs, DNS and registration records, and an observation's value
 * is inseparable from when it was made. Serving yesterday's DNS answer as
 * today's would not be a stale cache — it would be a false observation entering
 * a pipeline whose premise is that weight derives from method.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface FetchEventLike {
  request: Request;
  respondWith: ReturnType<typeof vi.fn>;
  waitUntil: ReturnType<typeof vi.fn>;
}

function loadWorker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches = {
    open: vi.fn().mockResolvedValue({ put: vi.fn(), add: vi.fn().mockResolvedValue(undefined), addAll: vi.fn() }),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  };

  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://starcom.app' },
    caches,
  };

  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  // Offline in these tests: a handler that reaches for the network gets no answer, never a real request.
  const offline = vi.fn().mockRejectedValue(new TypeError('offline in tests'));
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(
    self, caches, offline, globalThis.Response, URL,
  );

  return { listeners, caches, self };
}

function fetchEvent(url: string, init: { method?: string; mode?: string } = {}): FetchEventLike {
  return {
    request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors' } as unknown as Request,
    respondWith: vi.fn(),
    waitUntil: vi.fn(),
  };
}

describe('the shipped service worker', () => {
  let worker: ReturnType<typeof loadWorker>;

  beforeEach(() => {
    worker = loadWorker();
  });

  it('registers install, activate and fetch handlers', () => {
    expect([...worker.listeners.keys()].sort()).toEqual(['activate', 'fetch', 'install']);
  });

  describe('cross-origin intelligence lookups', () => {
    const handle = (url: string) => {
      const event = fetchEvent(url);
      worker.listeners.get('fetch')?.(event);
      return event;
    };

    it.each([
      ['https://crt.sh/?q=%25.example.com&output=json', 'certificate transparency'],
      ['https://dns.google/resolve?name=example.com&type=TXT', 'DNS over HTTPS'],
      ['https://data.iana.org/rdap/dns.json', 'the registries\' list'],
      ['https://rdap.verisign.com/com/v1/domain/example.com', 'registration'],
    ])('passes %s straight through, uncached', (url) => {
      // respondWith never called means the worker declined to intervene, and
      // the request goes to the network as though no worker existed.
      expect(handle(url).respondWith).not.toHaveBeenCalled();
    });

    it('does intervene for same-origin requests, so the rule is about origin', () => {
      expect(handle('https://starcom.app/assets/index-abc12345.js').respondWith).toHaveBeenCalled();
    });
  });

  it('ignores non-GET entirely', () => {
    const event = fetchEvent('https://starcom.app/api/thing', { method: 'POST' });
    worker.listeners.get('fetch')?.(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('handles navigations, which is what makes an offline launch possible', () => {
    const event = fetchEvent('https://starcom.app/cases', { mode: 'navigate' });
    worker.listeners.get('fetch')?.(event);
    expect(event.respondWith).toHaveBeenCalled();
  });

  it('handles bulk data paths so a dataset survives going offline', () => {
    for (const path of ['/data/gleif.json', '/geopolitical/world-borders-lod2.geojson', '/fonts/x.woff2']) {
      const event = fetchEvent(`https://starcom.app${path}`);
      worker.listeners.get('fetch')?.(event);
      expect(event.respondWith).toHaveBeenCalled();
    }
  });
});

/* The shipped worker, driven against an in-memory cache and a stand-in server. */
const ORIGIN = 'https://starcom.app';
const urlOf = (req: Request | string) => (typeof req === 'string' ? req : req.url);

/** CacheStorage as the worker uses it: named caches of responses by URL, searched in the order they were made. */
function memoryCaches() {
  const named = new Map<string, Map<string, Response>>();
  const entriesOf = (name: string) => {
    if (!named.has(name)) named.set(name, new Map());
    return named.get(name)!;
  };
  return {
    named,
    open: async (name: string) => {
      const entries = entriesOf(name);
      return {
        match: async (req: Request | string) => entries.get(urlOf(req))?.clone(),
        put: async (req: Request | string, res: Response) => { entries.set(urlOf(req), res); },
        add: async () => undefined,
        delete: async (req: Request | string) => entries.delete(urlOf(req)),
      };
    },
    match: async (req: Request | string) => {
      for (const entries of named.values()) {
        const hit = entries.get(urlOf(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...named.keys()],
    delete: async (name: string) => named.delete(name),
  };
}

/** The server: each path's body and ETag, a matching If-None-Match answered 304 with no body, as Vercel does. */
function server(files: Record<string, { body: string; etag: string } | 'gone'>) {
  const asked: Array<{ path: string; ifNoneMatch: string | null }> = [];
  const fetch = vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = urlOf(input);
    const headers = new Headers(init?.headers ?? (typeof input === 'string' ? undefined : input.headers));
    asked.push({ path: new URL(url).pathname, ifNoneMatch: headers.get('if-none-match') });
    const file = files[new URL(url).pathname];
    if (!file || file === 'gone') return new Response('not here', { status: 404 });
    if (headers.get('if-none-match') === file.etag) return new Response(null, { status: 304, headers: { etag: file.etag } });
    return new Response(file.body, { status: 200, headers: { etag: file.etag, 'content-type': 'application/json' } });
  });
  return { fetch, asked, files };
}

/** The shipped worker as a build stamps it. */
function workerOf(build: string, caches: ReturnType<typeof memoryCaches>, fetch: unknown) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: ORIGIN },
    caches,
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  expect(source.split("'__STARCOM_BUILD__'")).toHaveLength(2);
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source.replace("'__STARCOM_BUILD__'", `'${build}'`))(
    self, caches, fetch, globalThis.Response, URL,
  );
  return listeners;
}

/** What the worker answers for a path; null when it lets the request go to the network itself. */
async function answer(listeners: Map<string, (event: unknown) => void>, path: string, headers: Record<string, string> = {}, mode = 'cors') {
  // Not this environment's Headers, which drops `range`: a worker's request for audio carries it.
  const named = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const requestHeaders = { has: (name: string) => named.has(name.toLowerCase()), get: (name: string) => named.get(name.toLowerCase()) ?? null };
  const event = {
    request: { url: `${ORIGIN}${path}`, method: 'GET', mode, headers: requestHeaders } as unknown as Request,
    respondWith: vi.fn(),
    waitUntil: vi.fn(),
  };
  listeners.get('fetch')?.(event);
  if (event.respondWith.mock.calls.length === 0) return null;
  return (await event.respondWith.mock.calls[0][0]) as Response;
}
const textOf = async (response: Response | null) => response?.text();

/*
 * Data, checked once per build (decided 2026-10-07). The worker kept every data
 * file it fetched for good and never asked again, so a returning browser drew
 * borders as it first fetched them, after they had changed. Each build now
 * stamps itself into the worker, and a kept file is asked for again, with its
 * ETag, the first time it is used under a build that has not checked it.
 */
describe('data, checked once per build', () => {
  const BORDERS = '/geopolitical/topology/world-borders.topology.json';

  it('asks nothing for a file this build has checked', async () => {
    const caches = memoryCaches();
    const net = server({ [BORDERS]: { body: 'borders 1', etag: '"a"' } });
    const worker = workerOf('build-1', caches, net.fetch);
    expect(await textOf(await answer(worker, BORDERS))).toBe('borders 1');
    expect(await textOf(await answer(worker, BORDERS))).toBe('borders 1');
    expect(net.asked).toEqual([{ path: BORDERS, ifNoneMatch: null }]);
  });

  it('under a new build, asks once with the kept ETag; unchanged, it is the kept copy at the cost of a 304', async () => {
    const caches = memoryCaches();
    const net = server({ [BORDERS]: { body: 'borders 1', etag: '"a"' } });
    await textOf(await answer(workerOf('build-1', caches, net.fetch), BORDERS));
    const next = workerOf('build-2', caches, net.fetch);
    expect(await textOf(await answer(next, BORDERS))).toBe('borders 1');
    expect(await textOf(await answer(next, BORDERS))).toBe('borders 1');
    expect(net.asked).toEqual([{ path: BORDERS, ifNoneMatch: null }, { path: BORDERS, ifNoneMatch: '"a"' }]);
  });

  it('under a new build, a changed file takes the kept one\'s place', async () => {
    const caches = memoryCaches();
    const net = server({ [BORDERS]: { body: 'borders 1', etag: '"a"' } });
    await textOf(await answer(workerOf('build-1', caches, net.fetch), BORDERS));
    net.files[BORDERS] = { body: 'borders 2', etag: '"b"' };
    const next = workerOf('build-2', caches, net.fetch);
    expect(await textOf(await answer(next, BORDERS))).toBe('borders 2');
    expect(await textOf(await answer(next, BORDERS))).toBe('borders 2');
    expect(net.asked).toHaveLength(2);
  });

  it('checks what the worker before this rule kept, which says no build', async () => {
    const caches = memoryCaches();
    await (await caches.open('starcom-data-v1')).put(`${ORIGIN}${BORDERS}`, new Response('borders as first fetched', { headers: { etag: '"old"' } }));
    const net = server({ [BORDERS]: { body: 'borders now', etag: '"new"' } });
    expect(await textOf(await answer(workerOf('build-2', caches, net.fetch), BORDERS))).toBe('borders now');
    expect(net.asked).toEqual([{ path: BORDERS, ifNoneMatch: '"old"' }]);
  });

  it('checks a texture in a folder under /assets/ like data, and moves what the old worker kept of it', async () => {
    const TEXTURE = '/assets/textures/earth-day.jpg';
    const caches = memoryCaches();
    await (await caches.open('starcom-assets-v1')).put(`${ORIGIN}${TEXTURE}`, new Response('day', { headers: { etag: '"t"' } }));
    const net = server({ [TEXTURE]: { body: 'day', etag: '"t"' } });
    const worker = workerOf('build-2', caches, net.fetch);
    expect(await textOf(await answer(worker, TEXTURE))).toBe('day');
    expect(net.asked).toEqual([{ path: TEXTURE, ifNoneMatch: '"t"' }]);
    expect(caches.named.get('starcom-assets-v1')?.has(`${ORIGIN}${TEXTURE}`)).toBe(false);
    expect(await textOf(await answer(worker, TEXTURE))).toBe('day');
    expect(net.asked).toHaveLength(1);
  });

  it('never asks again for a content-hashed chunk, whatever the build', async () => {
    const CHUNK = '/assets/index-BxYz1234.js';
    const caches = memoryCaches();
    const net = server({ [CHUNK]: { body: 'code', etag: '"c"' } });
    await textOf(await answer(workerOf('build-1', caches, net.fetch), CHUNK));
    expect(await textOf(await answer(workerOf('build-2', caches, net.fetch), CHUNK))).toBe('code');
    expect(net.asked).toHaveLength(1);
  });

  it('offline, answers with the kept copy, whatever build checked it', async () => {
    const caches = memoryCaches();
    const net = server({ [BORDERS]: { body: 'borders 1', etag: '"a"' } });
    await textOf(await answer(workerOf('build-1', caches, net.fetch), BORDERS));
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await textOf(await answer(workerOf('build-2', caches, offline), BORDERS))).toBe('borders 1');
  });

  it('forgets a file the new build no longer has, rather than serve it as current', async () => {
    const caches = memoryCaches();
    const net = server({ [BORDERS]: { body: 'borders 1', etag: '"a"' } });
    await textOf(await answer(workerOf('build-1', caches, net.fetch), BORDERS));
    net.files[BORDERS] = 'gone';
    expect((await answer(workerOf('build-2', caches, net.fetch), BORDERS))?.status).toBe(404);
    expect(await caches.match(`${ORIGIN}${BORDERS}`)).toBeUndefined();
  });

  it('lets a ranged request, as audio makes, go to the network untouched', async () => {
    const net = server({});
    expect(await answer(workerOf('build-1', memoryCaches(), net.fetch), '/assets/sfx/click.mp3', { range: 'bytes=0-' })).toBeNull();
  });
});

/*
 * The offline shell. A navigation is answered from the network, and a good answer is kept as the
 * shell an offline start opens. It kept any good answer, so opening a page starcom.app serves as a
 * file of its own (a spec, Uplink's privacy page) made that file the app's offline start.
 */
describe('the offline shell', () => {
  const SHELL = '<!doctype html><title>Starcom</title>';
  const files: Record<string, { body: string; etag: string }> = {
    '/': { body: SHELL, etag: '"s"' },
    '/app/cases': { body: SHELL, etag: '"s"' },
    '/spec/starcom-share-handle.spec.md': { body: '# The share handle', etag: '"m"' },
    '/uplink/privacy.html': { body: '<!doctype html><title>Starcom Uplink: privacy</title>', etag: '"p"' },
  };
  const settle = () => new Promise((done) => setTimeout(done, 0));
  const offlineStart = async (caches: ReturnType<typeof memoryCaches>) => {
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    return textOf(await answer(workerOf('build-1', caches, offline), '/app/cases', {}, 'navigate'));
  };

  it('keeps an app page as the shell, so an offline start works', async () => {
    const caches = memoryCaches();
    await answer(workerOf('build-1', caches, server(files).fetch), '/app/cases', {}, 'navigate');
    await settle();
    expect(await offlineStart(caches)).toBe(SHELL);
  });

  it.each(['/spec/starcom-share-handle.spec.md', '/uplink/privacy.html'])('never makes %s, a page of its own, the shell', async (path) => {
    const caches = memoryCaches();
    const worker = workerOf('build-1', caches, server(files).fetch);
    await answer(worker, '/', {}, 'navigate');
    await settle();
    expect(await textOf(await answer(worker, path, {}, 'navigate'))).toBe(files[path].body);
    await settle();
    expect(await offlineStart(caches)).toBe(SHELL);
  });
});
