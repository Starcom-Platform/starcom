/**
 * CelesTrak's two-hour update window, and the refusal it sends inside it.
 *
 * ─── WHAT BROKE, AND WHY THESE TESTS EXIST ─────────────────────────────────
 *
 * CelesTrak refreshes GP data every two hours and answers a repeat download in
 * between with HTTP 403. The app held satellite data only in memory for an
 * hour, so any reload within two hours of a good download refetched, got the
 * 403, and failed the whole layer. On a shared IP one person's download refused
 * everyone behind it.
 *
 * Found by a data-source check that happened to download GROUP=active a minute
 * before a second request did — the second came back:
 *
 *   GP data has not updated since your last successful
 *   download of GROUP=active at 2026-09-11 15:13:59 UTC.
 *   Data is updated once every 2 hours.
 *
 * That body is used verbatim below, CRLF line breaks included — the first
 * version of this fixture had bare \n, which is what I assumed rather than what
 * a browser received. A hand-typed fixture on one line would have passed
 * against a regex that the real body defeats.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SpaceAssetsDataProvider,
  CELESTRAK_UPDATE_INTERVAL_MS,
  CELESTRAK_REFUSAL_FLOOR_MS,
  lastDownloadFromRefusal,
} from '../SpaceAssetsDataProvider';
import type { CachedGpGroup, GpCache } from '../CelesTrakCacheStore';

/** The refusal exactly as CelesTrak sent it — note the break mid-sentence. */
const REAL_REFUSAL_BODY = 'GP data has not updated since your last successful\r\n'
  + 'download of GROUP=active at 2026-09-11 15:13:59 UTC.\r\n'
  + 'Data is updated once every 2 hours.';
const REFUSED_DOWNLOAD_AT = Date.parse('2026-09-11T15:13:59Z');

const NOW = Date.parse('2026-09-11T16:00:00Z');
const ISS = { OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 };
const FRESH = [ISS, { OBJECT_NAME: 'CSS (TIANHE)', NORAD_CAT_ID: 48274 }];

function memoryCache(seed?: CachedGpGroup): GpCache & { rows: Map<string, CachedGpGroup> } {
  const rows = new Map<string, CachedGpGroup>();
  if (seed) rows.set(seed.group, seed);
  return {
    rows,
    get: async (group) => (rows.get(group) as never) ?? null,
    set: async (group, data, fetchedAt) => { rows.set(group, { group, data, fetchedAt }); },
  };
}

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const fetchMock = vi.fn();

describe('SpaceAssetsDataProvider and CelesTrak\'s update window', () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('serves a cached group inside the window without asking CelesTrak at all', async () => {
    const cache = memoryCache({ group: 'active-satellites', fetchedAt: NOW - 30 * 60 * 1000, data: [ISS] });
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: cache, now: () => NOW });

    const data = await provider.fetchData('active-satellites');

    expect(data).toEqual([ISS]);
    // Asking would only have earned a refusal.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads past the window, and keeps what it downloaded', async () => {
    const cache = memoryCache({ group: 'active-satellites', fetchedAt: NOW - CELESTRAK_UPDATE_INTERVAL_MS - 1, data: [ISS] });
    fetchMock.mockResolvedValue(respond(200, FRESH));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: cache, now: () => NOW });

    const data = await provider.fetchData('active-satellites');

    expect(data).toEqual(FRESH);
    expect(cache.rows.get('active-satellites')).toEqual({ group: 'active-satellites', fetchedAt: NOW, data: FRESH });
  });

  it('treats the real "has not updated" refusal as confirmation that the cached copy is current', async () => {
    const cachedAt = NOW - CELESTRAK_UPDATE_INTERVAL_MS - 60_000;
    const cache = memoryCache({ group: 'active-satellites', fetchedAt: cachedAt, data: [ISS] });
    fetchMock.mockResolvedValue(respond(403, REAL_REFUSAL_BODY));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: cache, now: () => NOW });

    await expect(provider.fetchData('active-satellites')).resolves.toEqual([ISS]);
    // Confirmed current is not the same as served now: its age is still its age.
    expect(provider.getFetchedAt('active-satellites')).toBe(cachedAt);
  });

  it('refuses honestly when the network was already served and this browser holds no copy', async () => {
    // A shared IP: someone else behind it downloaded; this browser never did.
    fetchMock.mockResolvedValue(respond(403, REAL_REFUSAL_BODY));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => NOW });

    await expect(provider.fetchData('active-satellites'))
      .rejects.toThrow(/already downloaded it within CelesTrak's two-hour update window/);
  });

  it('does not mistake an unrelated 403 for the update-window refusal', async () => {
    fetchMock.mockResolvedValue(respond(403, 'Forbidden'));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => NOW });

    await expect(provider.fetchData('active-satellites')).rejects.toThrow('Failed to fetch CelesTrak data: 403');
  });

  /**
   * The honesty property. A cached group read at 16:00 was served by CelesTrak
   * up to two hours earlier; its age is when it was SERVED. Reporting the read
   * time would caption two-hour-old orbital elements as fresh.
   */
  it('reports when CelesTrak served the data, not when it was read back', async () => {
    const servedAt = NOW - 90 * 60 * 1000;
    const cache = memoryCache({ group: 'active-satellites', fetchedAt: servedAt, data: [ISS] });
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: cache, now: () => NOW });

    await provider.fetchData('active-satellites');

    expect(provider.getFetchedAt('active-satellites')).toBe(servedAt);
  });

  it('reports the download time for a group it has just downloaded', async () => {
    fetchMock.mockResolvedValue(respond(200, FRESH));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => NOW });

    await provider.fetchData('active-satellites');

    expect(provider.getFetchedAt('active-satellites')).toBe(NOW);
  });
});

/**
 * Before this, a refused load was re-asked on every one-minute refresh check —
 * observed live, 403 after 403 — for as long as the layer stayed on. That is
 * the pattern a rate-limited service blocks a network for.
 */
describe('after a refusal, not asking again until CelesTrak would answer', () => {
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads the last download time out of the real refusal', () => {
    expect(lastDownloadFromRefusal(REAL_REFUSAL_BODY)).toBe(REFUSED_DOWNLOAD_AT);
    expect(lastDownloadFromRefusal('GP data has not updated since your last download.')).toBeNull();
  });

  it('holds until two hours after the download the refusal names, then asks', async () => {
    let clock = NOW;
    fetchMock.mockResolvedValue(respond(403, REAL_REFUSAL_BODY));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => clock });

    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Every refresh check until then gets the refusal without a request.
    clock = REFUSED_DOWNLOAD_AT + CELESTRAK_UPDATE_INTERVAL_MS - 1000;
    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock = REFUSED_DOWNLOAD_AT + CELESTRAK_UPDATE_INTERVAL_MS + 1000;
    fetchMock.mockResolvedValue(respond(200, FRESH));
    await expect(provider.fetchData('active-satellites')).resolves.toEqual(FRESH);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the held copy, with its own age, while the hold lasts', async () => {
    const cachedAt = NOW - CELESTRAK_UPDATE_INTERVAL_MS - 60_000;
    let clock = NOW;
    fetchMock.mockResolvedValue(respond(403, REAL_REFUSAL_BODY));
    const provider = new SpaceAssetsDataProvider({
      celesTrakCache: memoryCache({ group: 'active-satellites', fetchedAt: cachedAt, data: [ISS] }),
      now: () => clock,
    });

    await provider.fetchData('active-satellites');
    clock = NOW + 5 * 60 * 1000;
    await expect(provider.fetchData('active-satellites')).resolves.toEqual([ISS]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider.getFetchedAt('active-satellites')).toBe(cachedAt);
  });

  /**
   * CelesTrak runs late: the window the refusal names has already passed and
   * it still refuses. Its own timestamp would then say "ask now" on every
   * check — the floor is what stops that becoming a request a minute.
   */
  it('waits at least the floor when the named window has already passed', async () => {
    let clock = NOW;
    const lateBody = REAL_REFUSAL_BODY.replace('15:13:59', '13:00:00');
    fetchMock.mockResolvedValue(respond(403, lateBody));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => clock });

    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);
    clock = NOW + CELESTRAK_REFUSAL_FLOOR_MS - 1000;
    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock = NOW + CELESTRAK_REFUSAL_FLOOR_MS + 1000;
    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('holds a group, not the provider — others are still asked for', async () => {
    fetchMock.mockResolvedValueOnce(respond(403, REAL_REFUSAL_BODY));
    const provider = new SpaceAssetsDataProvider({ celesTrakCache: memoryCache(), now: () => NOW });
    await expect(provider.fetchData('active-satellites')).rejects.toThrow(/refused/);

    fetchMock.mockResolvedValueOnce(respond(200, [ISS]));
    await expect(provider.fetchData('space-stations')).resolves.toEqual([ISS]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
