// gdeltSnapshot.ts — the one file of GDELT events the app loads, built at build time.
//
// ─── WHY A SNAPSHOT, AND WHY AT BUILD ──────────────────────────────────────
//
// The browser fetched GDELT itself: 96 fifteen-minute export zips per visitor, every
// twenty minutes, unzipped and parsed on the main thread — 7.3 MB of zips on
// 2026-09-11. It also never worked. The URL was http://, which an https page may not
// fetch at all, and the http→https redirect GDELT answers with carries no CORS header,
// so even a plain-http page was refused. Every window failed, every failure returned
// an empty list, and Diplomacy and Conflict Zones drew an empty globe with no caveat.
//
// Built once, the same day of events is ~16,000 rows and ~225 KB compressed, from our
// own origin, already parsed. What it costs is freshness: it is as old as the deploy.
// So it carries its own time (`asOf`), and a card made from it says how old it is.
//
// public/data/README.md says regenerating bundled data is a deliberate act, not a
// build step, so that one commit always means one dataset. GDELT is the stated
// exception, for two reasons: a 24-hour window is worth little a day later, and
// GDELT keeps every 15-minute window permanently. This file lists the windows it was
// made from, and the rows are written in a fixed order, so anyone can rebuild it byte
// for byte from GDELT's archive — the traceability that rule exists for.
import { gdeltStampToMs, msToGdeltStamp, type GeoPrecision, type RealGdeltEvent } from './gdeltEventExport';

export const GDELT_SNAPSHOT_SCHEMA = 'starcom.gdelt-events' as const;
/**
 * 1: first version.
 * 2: each event's place name, its precision (country, state or city) and GDELT's mention, source and
 *    article counts (D-DP, DP3). A version 1 file still reads, without them.
 * 3: whether GDELT found it in a lead paragraph, and the coder's highest confidence from the day's
 *    Mentions files, with the Mentions files that did not arrive (D-DP, DP10). Versions 1 and 2
 *    still read, without them.
 */
export const GDELT_SNAPSHOT_VERSION = 3 as const;
type Version = 1 | 2 | typeof GDELT_SNAPSHOT_VERSION;
/** Where the build writes it (under public/) and the app reads it. */
export const GDELT_SNAPSHOT_URL = '/data/gdelt-events.json';
/** GDELT publishes an export file every fifteen minutes. */
export const GDELT_WINDOW_MS = 15 * 60 * 1000;
/** One day of windows. */
export const GDELT_WINDOWS_PER_SNAPSHOT = 96;

const V1_COLUMNS = [
  'id', 'actor1ISO3', 'actor2ISO3', 'eventCode', 'eventRootCode',
  'goldsteinScale', 'lat', 'lng', 'sourceUrl', 'dateAdded',
] as const;
const V2_COLUMNS = [...V1_COLUMNS, 'placeName', 'placePrecision', 'mentions', 'sources', 'articles'] as const;
export const GDELT_SNAPSHOT_COLUMNS = [...V2_COLUMNS, 'lead', 'confidence'] as const;
const COLUMNS_BY_VERSION: Record<Version, readonly string[]> = { 1: V1_COLUMNS, 2: V2_COLUMNS, 3: GDELT_SNAPSHOT_COLUMNS };

type V1Row = [string, string, string, string, string, number, number, number, string, string];
/** A place name and precision are '' where GDELT gave none; a count is null. */
type V2Row = [...V1Row, string, string, number | null, number | null, number | null];
/** The lead paragraph and the confidence are null where unknown. */
type Row = [...V2Row, boolean | null, number | null];

export interface GdeltSnapshot {
  schema: typeof GDELT_SNAPSHOT_SCHEMA;
  version: Version;
  source: string;
  terms: string;
  /** When the build fetched it — not the data's time; see `asOf` on the loaded form. */
  retrievedAt: string;
  /**
   * Window stamps asked for, newest first, and those that did not arrive; from version 3, the
   * windows whose Mentions file did not arrive, their events' confidence unknown.
   */
  windows: { requested: string[]; missing: string[]; mentionsMissing?: string[] };
  columns: readonly string[];
  rows: Array<Row | V2Row | V1Row>;
}

export interface LoadedGdeltSnapshot {
  events: RealGdeltEvent[];
  /**
   * The data's own time: the newest window that arrived. Every event is at or
   * before it. Filters that mean "the last day" mean the day before THIS, not
   * before the wall clock — against the wall clock, a snapshot two days old
   * would filter itself to nothing and draw an empty globe.
   */
  asOf: number;
  /** Epoch ms: the oldest window that arrived, where the snapshot's day starts (D-DP, DP15). */
  from: number;
  windowsRequested: number;
  windowsReceived: number;
  retrievedAt: number;
}

/**
 * What a viewer must know about every GDELT event, whatever the snapshot's state:
 * GDELT codes events automatically from news text. The export this was tested
 * against codes an article about an office lease as a "Fight" between Egypt and
 * the UK, at -9.5 on a -10..+10 scale. Carried on each GDELT feed as its note (see
 * FeedProvenance.note), so every card and clip of these layers says it once.
 *
 * Not said: that a viewer can check a marker's source. The snapshot keeps each
 * event's article URL, but these layers have no hover or selection, so nothing in
 * the app reaches it — and a card offers a viewer less still.
 */
export const GDELT_MACHINE_CODED_NOTE =
  'GDELT events are machine-coded from news reports; any single event can be miscoded.';

export class GdeltSnapshotError extends Error {}

/**
 * Assemble a snapshot from the windows that arrived. Pure, and deterministic:
 * the same windows give the same bytes, which is what makes the snapshot
 * rebuildable from GDELT's archive.
 */
export function buildGdeltSnapshot(input: {
  requested: string[];
  received: ReadonlyMap<string, RealGdeltEvent[]>;
  retrievedAt: Date;
  /** Each event's highest confidence from the day's Mentions files, and the windows whose file did not arrive. */
  mentions?: { confidence: ReadonlyMap<string, number>; missing: readonly string[] };
}): GdeltSnapshot {
  const confidence = input.mentions?.confidence ?? new Map<string, number>();
  const byId = new Map<string, RealGdeltEvent>();
  for (const stamp of input.requested) {
    for (const e of input.received.get(stamp) ?? []) byId.set(e.id, e);
  }
  const rows = [...byId.values()]
    .sort((a, b) => a.dateAdded.localeCompare(b.dateAdded) || a.id.localeCompare(b.id))
    .map((e): Row => [e.id, e.actor1ISO3, e.actor2ISO3, e.eventCode, e.eventRootCode,
      e.goldsteinScale, e.lat, e.lng, e.sourceUrl, e.dateAdded,
      e.placeName ?? '', e.placePrecision ?? '', e.mentions ?? null, e.sources ?? null, e.articles ?? null,
      e.lead ?? null, confidence.get(e.id) ?? null]);
  return {
    schema: GDELT_SNAPSHOT_SCHEMA,
    version: GDELT_SNAPSHOT_VERSION,
    source: 'GDELT 2.0 Event Database — https://www.gdeltproject.org/',
    terms: 'GDELT data is free and open for unlimited use; cite the GDELT Project.',
    retrievedAt: input.retrievedAt.toISOString(),
    windows: {
      requested: [...input.requested],
      missing: input.requested.filter((s) => !input.received.has(s)),
      // No Mentions files given is every window's missing: no confidence is claimed.
      mentionsMissing: input.mentions ? [...input.mentions.missing] : [...input.requested],
    },
    columns: GDELT_SNAPSHOT_COLUMNS,
    rows,
  };
}

const isV1Row = (r: unknown): r is V1Row =>
  Array.isArray(r) && r.length >= V1_COLUMNS.length
  && [0, 1, 2, 3, 4, 8, 9].every((i) => typeof r[i] === 'string')
  && [5, 6, 7].every((i) => typeof r[i] === 'number' && Number.isFinite(r[i]));
const PRECISIONS: readonly string[] = ['', 'country', 'state', 'city'];
const isCount = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const isPercent = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100);
const isRowOf = (version: Version, r: unknown): boolean => {
  if (!isV1Row(r)) return false;
  const cells = r as unknown[];
  if (cells.length !== COLUMNS_BY_VERSION[version].length) return false;
  if (version === 1) return true;
  if (!(typeof cells[10] === 'string' && typeof cells[11] === 'string' && PRECISIONS.includes(cells[11] as string)
    && [12, 13, 14].every((i) => isCount(cells[i])))) return false;
  return version === 2 || ((cells[15] === null || typeof cells[15] === 'boolean') && isPercent(cells[16]));
};

/**
 * Read a snapshot, or say exactly why it cannot be read. Nothing here fills a
 * gap: a file that is not what it claims to be is refused, not half-used.
 */
export function readGdeltSnapshot(json: unknown): LoadedGdeltSnapshot {
  const s = json as Partial<GdeltSnapshot> | null;
  if (!s || s.schema !== GDELT_SNAPSHOT_SCHEMA || (s.version !== 1 && s.version !== 2 && s.version !== GDELT_SNAPSHOT_VERSION)) {
    throw new GdeltSnapshotError(`not a ${GDELT_SNAPSHOT_SCHEMA} v1 to v${GDELT_SNAPSHOT_VERSION} snapshot`);
  }
  const version = s.version;
  if (JSON.stringify(s.columns) !== JSON.stringify(COLUMNS_BY_VERSION[version])) {
    throw new GdeltSnapshotError('snapshot columns are not the ones this build reads');
  }
  const requested = Array.isArray(s.windows?.requested) ? s.windows.requested : [];
  const missing = new Set(Array.isArray(s.windows?.missing) ? s.windows.missing : []);
  const receivedTimes = requested
    .filter((w) => !missing.has(w))
    .map((w) => gdeltStampToMs(w))
    .filter((t): t is number => t !== null);
  if (receivedTimes.length === 0) {
    throw new GdeltSnapshotError('snapshot holds no GDELT windows');
  }
  if (!Array.isArray(s.rows)) throw new GdeltSnapshotError('snapshot has no rows array');
  const events = s.rows.map((r, i): RealGdeltEvent => {
    if (!isRowOf(version, r)) throw new GdeltSnapshotError(`snapshot row ${i} is malformed`);
    const [id, actor1ISO3, actor2ISO3, eventCode, eventRootCode, goldsteinScale, lat, lng, sourceUrl, dateAdded] = r as V1Row;
    const event: RealGdeltEvent = { id, actor1ISO3, actor2ISO3, eventCode, eventRootCode, goldsteinScale, lat, lng, sourceUrl, dateAdded };
    if (version === 1) return event;
    const [, , , , , , , , , , placeName, placePrecision, mentions, sources, articles, lead, confidence] = r as Row;
    return {
      ...event,
      ...(version === 3 && lead !== null ? { lead } : {}),
      ...(version === 3 && confidence !== null ? { confidence } : {}),
      ...(placeName ? { placeName } : {}),
      ...(placePrecision ? { placePrecision: placePrecision as GeoPrecision } : {}),
      ...(mentions !== null ? { mentions } : {}),
      ...(sources !== null ? { sources } : {}),
      ...(articles !== null ? { articles } : {}),
    };
  });
  const retrievedAt = Date.parse(s.retrievedAt ?? '');
  /*
   * GDELT names a window by its scheduled END and publishes it early: at
   * 16:57 UTC the newest file was already 170000. Taken as the data's time,
   * that stamp is in the future, and a card made at once would give its data a
   * negative age. Nothing fetched can be newer than the fetch, so the data's
   * time is whichever came first.
   */
  const newestWindow = Math.max(...receivedTimes);
  return {
    events,
    asOf: Number.isFinite(retrievedAt) ? Math.min(newestWindow, retrievedAt) : newestWindow,
    from: Math.min(...receivedTimes),
    windowsRequested: requested.length,
    windowsReceived: receivedTimes.length,
    retrievedAt: Number.isFinite(retrievedAt) ? retrievedAt : NaN,
  };
}

/** The window stamps for the day ending at `newest` (a GDELT stamp), newest first. */
export function windowsEndingAt(newest: string, count = GDELT_WINDOWS_PER_SNAPSHOT): string[] {
  const end = gdeltStampToMs(newest);
  if (end === null) throw new GdeltSnapshotError(`not a GDELT window stamp: ${newest}`);
  return Array.from({ length: count }, (_, i) => msToGdeltStamp(end - i * GDELT_WINDOW_MS));
}
