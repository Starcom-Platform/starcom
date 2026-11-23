// GDELTEventService — the GDELT events Diplomacy and Conflict Zones draw, from the
// snapshot this build carries (see gdeltSnapshot.ts).
//
// ─── WHAT THIS REPLACED ────────────────────────────────────────────────────
//
// This fetched GDELT's Event Database from the browser: 96 fifteen-minute export zips
// from http://data.gdeltproject.org, unzipped and parsed client-side. Its header said it
// was verified live, "CORS wide open … no proxy needed". What was verified was the https
// host from a terminal. The code asked for http://, which an https page may not fetch,
// and GDELT's redirect to https carries no CORS header, so a plain-http page was refused
// too. Every window failed; every failure returned []. Measured on 2026-09-11: 96 of 96
// requests blocked, and the share card listing Diplomacy with no caveat at all — an
// empty globe reading as "no diplomatic activity", and for Conflict Zones the false
// "all quiet" the old comment below this one warned against.
//
// Serves two consumers off one load:
//   - DiplomaticEvents draws from CAMEO root codes 03-08, the cooperative spectrum.
//   - ConflictZones' war layer draws from root codes 14-20, the conflict spectrum.
// GoldsteinScale (-10..+10, published) gives both a real intensity metric.
import { COOPERATIVE_ROOT_CODES, CONFLICT_ROOT_CODES, type RealGdeltEvent } from './gdeltEventExport';
import { GDELT_SNAPSHOT_URL, readGdeltSnapshot, type LoadedGdeltSnapshot } from './gdeltSnapshot';
import { oneEventPerArticle } from './gdeltArticles';

export type { RealGdeltEvent };

/**
 * How often a consumer re-reads the snapshot. It only changes on a deploy, and
 * a re-read costs a revalidation, so this matters only to a tab left open
 * across one.
 */
export const CACHE_TTL_MS = 20 * 60 * 1000;

/** One consumer's events, and the time the data is from — never the time it was read. */
export interface GdeltEventSet {
  events: RealGdeltEvent[];
  /** Epoch ms: the snapshot's own time. See LoadedGdeltSnapshot.asOf. */
  asOf: number;
  /** Epoch ms: where the snapshot's day starts, its oldest window (D-DP, DP15). */
  from: number;
}

let cache: { snapshot: LoadedGdeltSnapshot; loadedAt: number } | null = null;
let inflight: Promise<LoadedGdeltSnapshot> | null = null;

async function loadSnapshot(): Promise<LoadedGdeltSnapshot> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.snapshot;
  // Diplomacy and Conflict Zones mount together; they share one request.
  inflight ??= (async () => {
    const res = await fetch(GDELT_SNAPSHOT_URL);
    /*
     * A dev server answers a missing file with the app's index.html and a 200,
     * so a status check alone would parse HTML and report a corrupt snapshot.
     * Absent is absent, whichever way the server says it.
     */
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    if (res.status === 404 || (res.ok && !isJson)) {
      throw new Error('this build carries no GDELT snapshot — GDELT could not be reached when it was built');
    }
    if (!res.ok) throw new Error(`the GDELT snapshot could not be loaded (HTTP ${res.status})`);
    const snapshot = readGdeltSnapshot(await res.json());
    cache = { snapshot, loadedAt: Date.now() };
    return snapshot;
  })().finally(() => { inflight = null; });
  return inflight;
}

/**
 * Drops events whose actor codes aren't real, individual countries (GDELT/CAMEO country
 * codes include non-country entities like "EUR" for Europe, "UNO" for United Nations) —
 * validated against the same real country set the rest of GeoPolitical rendering uses,
 * not a separately-maintained list. Pure, exported for direct unit testing.
 */
export function filterToRealCountryPairs(
  events: RealGdeltEvent[],
  realCountryCodes: Set<string>
): RealGdeltEvent[] {
  return events.filter((e) => realCountryCodes.has(e.actor1ISO3) && realCountryCodes.has(e.actor2ISO3));
}

export async function getRealDiplomaticEvents(): Promise<GdeltEventSet> {
  const { events, asOf, from } = await loadSnapshot();
  // One event per article (D-DP, DP1): one article was 146 rows on 2026-10-13.
  return { events: oneEventPerArticle(events.filter((e) => COOPERATIVE_ROOT_CODES.has(e.eventRootCode))), asOf, from };
}

export async function getRealConflictEvents(): Promise<GdeltEventSet> {
  const { events, asOf, from } = await loadSnapshot();
  return { events: events.filter((e) => CONFLICT_ROOT_CODES.has(e.eventRootCode)), asOf, from };
}

/** Test-only: forget the loaded snapshot. */
export function clearGdeltSnapshotCache(): void {
  cache = null;
  inflight = null;
}
