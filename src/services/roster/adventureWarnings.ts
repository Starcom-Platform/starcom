/**
 * The authority's warnings for an adventure's places (decision D-RS, RS34). For each US state it names, the
 * National Weather Service's active warnings, quoted as the NWS issued them: their event, the areas they cover,
 * until when, and which office sent them. Watches, advisories and statements are not warnings. Outside the US no
 * authority is read here, and the adventure says so: only its caller and its window call it off there.
 */
import { usStateName } from '../intel/received/usStates';
import { momentText } from './adventure';

const NWS = 'https://api.weather.gov/alerts/active';
const KEEP_MS = 5 * 60_000;

export interface AuthorityWarning {
  event: string;
  /** The areas it covers, as the NWS lists them. */
  area: string;
  /** Until when, in UTC; null when the NWS gives no end. */
  until: string | null;
  sender: string;
  /** The state asked about, as `MN`. */
  state: string;
}

/** A US state from a place code (`us-mn` → `MN`); null for a country, an area or anything finer. */
export function stateOf(place: string): string | null {
  const m = /^us-([a-z]{2})$/.exec(place);
  return m ? m[1].toUpperCase() : null;
}

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : null);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const utc = (v: unknown): string | null => {
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** The warnings in an NWS alerts answer: actual ones, not cancelled. */
export function warningsOf(answer: unknown, state: string): AuthorityWarning[] {
  const features = asShape(answer)?.features;
  if (!Array.isArray(features)) return [];
  const out: AuthorityWarning[] = [];
  for (const f of features) {
    const p = asShape(asShape(f)?.properties);
    const event = text(p?.event);
    if (!p || !event.endsWith('Warning') || p.status !== 'Actual' || p.messageType === 'Cancel') continue;
    out.push({ event, area: text(p.areaDesc), until: utc(p.ends) ?? utc(p.expires), sender: text(p.senderName), state });
  }
  return out;
}

const kept = new Map<string, { at: number; warnings: AuthorityWarning[] }>();

/** Test seam. */
export function forgetWarnings(): void {
  kept.clear();
}

type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

/** The active warnings for these states, each asked at most every five minutes; the states that could not be read. */
export async function fetchWarnings(
  states: readonly string[],
  fetcher: Fetcher = (url, init) => fetch(url, init),
  now: number = Date.now(),
): Promise<{ warnings: AuthorityWarning[]; failed: string[] }> {
  const failed: string[] = [];
  const answers = await Promise.all([...new Set(states)].map(async (state) => {
    const prior = kept.get(state);
    if (prior && now - prior.at < KEEP_MS) return prior.warnings;
    try {
      const response = await fetcher(`${NWS}?area=${state}`, { headers: { Accept: 'application/geo+json' } });
      if (!response.ok) throw new Error(`NWS answered ${response.status}`);
      const warnings = warningsOf(await response.json(), state);
      kept.set(state, { at: now, warnings });
      return warnings;
    } catch {
      failed.push(state);
      return [];
    }
  }));
  return { warnings: answers.flat(), failed };
}

/**
 * The warnings that call an adventure off in a whole state (RS40); any other warning calls it off in its own areas.
 * Wind Chill and Excessive Heat are the former names of Extreme Cold and Extreme Heat, kept while any office uses them.
 */
export const WHOLE_STATE_EVENTS: readonly string[] = [
  'Tornado Warning', 'Hurricane Warning', 'Blizzard Warning', 'Extreme Cold Warning', 'Wind Chill Warning', 'Extreme Heat Warning', 'Excessive Heat Warning',
];

export interface StateWatch {
  state: string;
  /** Warnings calling it off in the whole state. */
  severe: AuthorityWarning[];
  /** Warnings calling it off in their own areas. */
  local: AuthorityWarning[];
  /** False when the NWS could not be read for it. */
  read: boolean;
}

const quoted = (w: AuthorityWarning) => `${w.event} for ${usStateName(w.state)}${w.until ? `, until ${momentText(w.until.replace(/:00\.000Z$/, 'Z'))}` : ''}`;

/**
 * Where the NWS calls an adventure off (RS40): each US state it names, its warnings sorted into the whole state's
 * and their own areas'; quoted for the whole adventure only when every place it names is called off.
 */
export function nwsCallOff(places: readonly string[], warnings: readonly AuthorityWarning[], failed: readonly string[]): {
  states: StateWatch[]; everywhere: string | null; outsideUS: string[];
} {
  const outsideUS = places.filter((p) => !stateOf(p));
  const states = [...new Set(places.map(stateOf).filter((s): s is string => !!s))].map((state) => {
    const mine = warnings.filter((w) => w.state === state);
    return {
      state,
      severe: mine.filter((w) => WHOLE_STATE_EVENTS.includes(w.event)),
      local: mine.filter((w) => !WHOLE_STATE_EVENTS.includes(w.event)),
      read: !failed.includes(state),
    };
  });
  const allOff = states.length > 0 && outsideUS.length === 0 && states.every((s) => s.severe.length > 0);
  return { states, everywhere: allOff ? `the NWS: ${states.map((s) => quoted(s.severe[0])).join('; ')}` : null, outsideUS };
}
