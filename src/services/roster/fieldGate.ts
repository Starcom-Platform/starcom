/**
 * Going out, decided in one place (decision D-RS, RS37–RS40, RS47; the legal review of 2026-10-17).
 *
 * In order: the National Weather Service read first, and when it cannot be read field trials are paused, since
 * the call-off is a safety service Starcom undertook and must fail safe; then the age question; then the warning;
 * then, for 13 to 17, daylight and a parent or guardian, since curfew exceptions name a parent, not any adult.
 * Under 13 and AI agents never go out, and are asked neither.
 *
 * Darkness is the sun more than 6° below the horizon (civil twilight) at any point of the window, at the middle of
 * each US state it names. Where no place is known, a minor is told it is dark.
 */
import { Body, Equator, Horizon, MakeTime, Observer } from 'astronomy-engine';
import type { AgeAnswer } from '../identity/ageAnswer';
import { windowMs } from './adventure';
import type { RosterItem } from './rosterItem';

/** Each state's middle, near enough for the sun: a degree is four minutes of sunrise. */
const US_STATE_MIDDLES: Record<string, [number, number]> = {
  al: [32.8, -86.8], ak: [64.7, -152.4], az: [34.3, -111.7], ar: [34.9, -92.4], ca: [37.2, -119.5], co: [39.0, -105.5],
  ct: [41.6, -72.7], de: [39.0, -75.5], dc: [38.9, -77.0], fl: [28.6, -82.4], ga: [32.7, -83.4], hi: [20.8, -156.3],
  id: [44.4, -114.6], il: [40.0, -89.2], in: [39.9, -86.3], ia: [42.1, -93.5], ks: [38.5, -98.4], ky: [37.5, -85.3],
  la: [31.1, -92.0], me: [45.4, -69.2], md: [39.0, -76.8], ma: [42.3, -71.8], mi: [44.3, -85.4], mn: [46.3, -94.3],
  ms: [32.7, -89.7], mo: [38.4, -92.5], mt: [47.0, -109.6], ne: [41.5, -99.8], nv: [39.3, -116.6], nh: [43.7, -71.6],
  nj: [40.2, -74.7], nm: [34.4, -106.1], ny: [42.9, -75.5], nc: [35.6, -79.4], nd: [47.5, -100.5], oh: [40.3, -82.8],
  ok: [35.6, -97.5], or: [43.9, -120.6], pa: [40.9, -77.8], ri: [41.7, -71.5], sc: [33.9, -80.9], sd: [44.4, -100.2],
  tn: [35.9, -86.4], tx: [31.5, -99.3], ut: [39.3, -111.7], vt: [44.1, -72.7], va: [37.5, -78.9], wa: [47.4, -120.5],
  wv: [38.6, -80.6], wi: [44.6, -89.9], wy: [43.0, -107.6], pr: [18.2, -66.5],
};

/** The middle of each US state it names; none for a country or an area. */
export function placeMiddles(places: readonly string[]): Array<{ lat: number; lng: number }> {
  return places
    .map((p) => /^us-([a-z]{2})$/.exec(p)?.[1])
    .filter((code): code is string => !!code && code in US_STATE_MIDDLES)
    .map((code) => ({ lat: US_STATE_MIDDLES[code][0], lng: US_STATE_MIDDLES[code][1] }));
}

/** The sun's altitude in degrees, at a place and a moment, refraction included. */
export function sunAltitude(lat: number, lng: number, ms: number): number {
  const observer = new Observer(lat, lng, 0);
  const time = MakeTime(new Date(ms));
  const sun = Equator(Body.Sun, time, observer, true, true);
  return Horizon(time, observer, sun.ra, sun.dec, 'normal').altitude;
}

const CIVIL_TWILIGHT = -6;
const STEP_MS = 30 * 60_000;

/** Whether any of the window is dark at any of the places; null when that cannot be known. */
export function windowDark(window: RosterItem['window'], middles: ReadonlyArray<{ lat: number; lng: number }>): boolean | null {
  const w = windowMs(window);
  if (!w || middles.length === 0) return null;
  for (let t = w.from; t <= w.until; t += STEP_MS) {
    if (middles.some((m) => sunAltitude(m.lat, m.lng, t) < CIVIL_TWILIGHT)) return true;
  }
  return middles.some((m) => sunAltitude(m.lat, m.lng, w.until) < CIVIL_TWILIGHT);
}

/** What the authority read stands at: none to read (outside the US), reading, could not be read, or read. */
export type NwsReading = 'none' | 'reading' | 'unread' | 'read';

export type FieldVerdict =
  | { kind: 'ask_age' }
  | { kind: 'ask_warning' }
  | { kind: 'needs_parent' }
  | { kind: 'no'; reason: string }
  | { kind: 'yes' };

/** Whether a field trial may be taken now, or what is asked first. */
export function fieldVerdict(g: {
  age: AgeAnswer | null;
  warningAgreed: boolean;
  parentTicked: boolean;
  /** Dark anywhere in its window; null when not known, which a minor is told is dark. */
  dark: boolean | null;
  nws: NwsReading;
}): FieldVerdict {
  if (g.nws === 'reading') return { kind: 'no', reason: 'Reading the National Weather Service\'s warnings first.' };
  if (g.nws === 'unread') return { kind: 'no', reason: 'The National Weather Service could not be read here, so field trials are paused until it can be.' };
  if (!g.age) return { kind: 'ask_age' };
  if (g.age.bracket === 'under_13') return { kind: 'no', reason: 'Not for anyone under 13. Desk trials, and the way from home, are open to you.' };
  if (g.age.bracket === 'ai_agent') return { kind: 'no', reason: 'An AI agent does not go out: field trials are for the person it guides, who answers for themselves.' };
  if (!g.warningAgreed) return { kind: 'ask_warning' };
  if (g.age.bracket === '18_plus') return { kind: 'yes' };
  if (g.dark !== false) return { kind: 'no', reason: 'After dark: not for anyone under 18.' };
  return g.parentTicked ? { kind: 'yes' } : { kind: 'needs_parent' };
}
