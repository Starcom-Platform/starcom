// gdeltEventExport.ts — reading one GDELT 2.0 Event export file, and nothing else.
//
// Pure: no network, no DOM, no THREE. It runs at BUILD time (scripts/snapshot-gdelt.mjs,
// through tsx) to turn GDELT's 15-minute export files into the snapshot the app loads,
// and it is tested against real rows (__tests__/fixtures/gdelt-*.export.sample.csv).
//
// The browser used to do this: 96 zip downloads per visitor, unzipped and parsed on the
// main thread. It could not have worked — see GDELTEventService.ts for why.

/** Cooperative/diplomatic CAMEO root codes — Diplomacy's range. */
export const COOPERATIVE_ROOT_CODES: ReadonlySet<string> = new Set(['03', '04', '05', '06', '07', '08']);
/** Conflict/violence CAMEO root codes — Conflict Zones' war-event range. */
export const CONFLICT_ROOT_CODES: ReadonlySet<string> = new Set(['14', '15', '16', '17', '18', '19', '20']);
/** Everything either consumer uses; rows outside this are dropped at parse. */
export const RELEVANT_ROOT_CODES: ReadonlySet<string> = new Set([...COOPERATIVE_ROOT_CODES, ...CONFLICT_ROOT_CODES]);

// GDELT 2.0 Event export column indices, confirmed against a live fetched row.
const COL = {
  GLOBAL_EVENT_ID: 0,
  ACTOR1_COUNTRY: 7,
  ACTOR2_COUNTRY: 17,
  IS_ROOT_EVENT: 25,
  EVENT_CODE: 26,
  EVENT_ROOT_CODE: 28,
  GOLDSTEIN_SCALE: 30,
  NUM_MENTIONS: 31,
  NUM_SOURCES: 32,
  NUM_ARTICLES: 33,
  ACTION_GEO_TYPE: 51,
  ACTION_GEO_FULLNAME: 52,
  ACTION_GEO_LAT: 56,
  ACTION_GEO_LONG: 57,
  DATE_ADDED: 59,
  SOURCE_URL: 60,
} as const;
export const EXPECTED_FIELD_COUNT = 61;

export interface RealGdeltEvent {
  id: string;
  actor1ISO3: string;
  actor2ISO3: string;
  eventCode: string; // full 3-digit CAMEO code, e.g. '057' — see diplomaticEventTheme.ts's categorizeGdeltEvent
  eventRootCode: string;
  goldsteinScale: number;
  lat: number;
  lng: number;
  sourceUrl: string;
  dateAdded: string; // YYYYMMDDHHMMSS
  /*
   * Kept from snapshot version 2 on (D-DP, DP3); absent from a version 1 file. Where GDELT placed
   * the event and how precisely (a country, for want of a city, is not a place anything happened),
   * and how widely it was reported, in GDELT's own counts.
   */
  placeName?: string;
  placePrecision?: GeoPrecision;
  mentions?: number;
  sources?: number;
  articles?: number;
  /** How many GDELT rows this one event stands for, once counted per article (gdeltArticles.ts). */
  rows?: number;
  /*
   * From snapshot version 3 on (D-DP, DP10). The coder's highest confidence in extracting it, 10–100%,
   * from GDELT's Mentions table; and whether it was found in a lead paragraph (IsRootEvent). Absent is
   * unknown, never a guess.
   */
  confidence?: number;
  lead?: boolean;
}

export type GeoPrecision = 'country' | 'state' | 'city';

/**
 * GDELT's ActionGeo_Type, as a precision: 1 a country, 2 a US state, 3 a US city, 4 a city
 * elsewhere, 5 a state or province elsewhere. Anything else, unknown.
 */
export function geoPrecisionOf(type: string | undefined): GeoPrecision | null {
  switch ((type ?? '').trim()) {
    case '1': return 'country';
    case '2': case '5': return 'state';
    case '3': case '4': return 'city';
    default: return null;
  }
}

/**
 * A number, or null for an empty field. GDELT leaves a field EMPTY when it has
 * no value — an unlocated event has "" for its coordinates, not 0,0 — and
 * Number('') is 0, which reads as a real point in the Gulf of Guinea. The old
 * parser only escaped that because its 0,0 check happened to catch the result.
 */
function field(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every bilateral event in the cooperative or conflict range that GDELT could
 * place: both actors are countries and different, and the event has a location.
 */
export function parseGdeltExport(text: string): RealGdeltEvent[] {
  const events: RealGdeltEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.replace(/\r$/, '').split('\t');
    if (fields.length < EXPECTED_FIELD_COUNT) continue;

    const actor1 = fields[COL.ACTOR1_COUNTRY];
    const actor2 = fields[COL.ACTOR2_COUNTRY];
    const rootCode = fields[COL.EVENT_ROOT_CODE];
    if (!actor1 || !actor2 || actor1 === actor2) continue; // bilateral only, no domestic/self events
    if (!RELEVANT_ROOT_CODES.has(rootCode)) continue;

    const goldstein = field(fields[COL.GOLDSTEIN_SCALE]);
    const lat = field(fields[COL.ACTION_GEO_LAT]);
    const lng = field(fields[COL.ACTION_GEO_LONG]);
    if (goldstein === null || lat === null || lng === null) continue;
    if (lat === 0 && lng === 0) continue; // belt and braces: never a real location

    events.push({
      id: fields[COL.GLOBAL_EVENT_ID],
      actor1ISO3: actor1,
      actor2ISO3: actor2,
      eventCode: fields[COL.EVENT_CODE],
      eventRootCode: rootCode,
      goldsteinScale: goldstein,
      lat,
      lng,
      sourceUrl: fields[COL.SOURCE_URL],
      dateAdded: fields[COL.DATE_ADDED],
      ...placeAndReach(fields),
    });
  }
  return events;
}

/** Where GDELT placed it, how precisely, and its counts, each only where GDELT gave one. */
function placeAndReach(fields: string[]): Pick<RealGdeltEvent, 'placeName' | 'placePrecision' | 'mentions' | 'sources' | 'articles' | 'lead'> {
  const name = fields[COL.ACTION_GEO_FULLNAME]?.trim();
  const precision = geoPrecisionOf(fields[COL.ACTION_GEO_TYPE]);
  const mentions = field(fields[COL.NUM_MENTIONS]);
  const sources = field(fields[COL.NUM_SOURCES]);
  const articles = field(fields[COL.NUM_ARTICLES]);
  // IsRootEvent: 1 in a lead paragraph, 0 not; anything else is unknown (D-DP, DP10).
  const root = fields[COL.IS_ROOT_EVENT]?.trim();
  return {
    ...(root === '1' ? { lead: true } : root === '0' ? { lead: false } : {}),
    ...(name ? { placeName: name } : {}),
    ...(precision ? { placePrecision: precision } : {}),
    ...(mentions !== null ? { mentions } : {}),
    ...(sources !== null ? { sources } : {}),
    ...(articles !== null ? { articles } : {}),
  };
}

/** GDELT's YYYYMMDDHHMMSS stamps, as epoch ms (UTC). Null for anything else. */
export function gdeltStampToMs(stamp: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** The inverse: epoch ms as a GDELT window stamp. */
export function msToGdeltStamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
