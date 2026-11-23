/**
 * Echoes' returns (decision D-PW, PW39, PW47, PW49): the past moments a coming sky event's own kind came round
 * before, each kind as PW49 names it. An aspect, its pair at the same angle either side; a contact with the Galactic
 * Centre, its body at the same angle from it; an ingress, its body entering the same sign in the event's frame; a
 * lunation, the same phase with the Moon in the same sign; a lunar apsis, each perigee or apogee; a node, the Moon
 * crossing it the same way; a station, its planet turning the same way in the same sign. A kind whose note names no
 * frame counts its signs in the drawer's. Found by stepping through time and bisecting each crossing to a minute, or
 * by astronomy-engine's own searches.
 */
import * as Astronomy from 'astronomy-engine';
import { eclipticOfDate, norm360, type AstroBody } from '../astro/sky';
import { galacticCentreLongitude, inFrame, type ZodiacFrame } from '../astro/frames';
import type { PsiSkyEvent } from '../psiEvents';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;
const BODIES = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);

/** The kinds whose returns are found. */
export const ECHOED_CLASSES: ReadonlySet<string> = new Set(['aspect', 'gc_contact', 'ingress', 'lunation', 'lunar_distance', 'node', 'station']);

/**
 * A step through time: a day where the Moon or an inner planet is in it, four days for the slower. A day is well
 * under the Moon's 13°, and short enough that a planet turning back through an exact angle is seen both ways.
 */
const stepFor = (bodies: readonly string[]): number =>
  bodies.some((b) => ['Moon', 'Sun', 'Mercury', 'Venus', 'Mars'].includes(b)) ? DAY : 4 * DAY;

/** Where a signed function of time crosses zero going up, between two moments, to a minute. */
function bisect(f: (ms: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  while (b - a > MINUTE) {
    const mid = (a + b) / 2;
    const fm = f(mid);
    if ((fa < 0) === (fm < 0)) { a = mid; fa = fm; } else b = mid;
  }
  return (a + b) / 2;
}

/** Every moment a wrapped angle of time passes any of its targets, across a span, each angle worked out once a step. */
function crossings(angle: (ms: number) => number, targets: readonly number[], fromMs: number, untilMs: number, step: number, upOnly = false): number[] {
  // Signed difference to a target in −180..180: a crossing is a change of sign through 0, not the jump at ±180.
  const diff = (a: number, target: number) => ((a - target + 540) % 360) - 180;
  const found: number[] = [];
  let t0 = fromMs;
  let a0 = angle(t0);
  for (let t1 = fromMs + step; t1 <= untilMs; t1 += step) {
    const a1 = angle(t1);
    for (const target of targets) {
      const d0 = diff(a0, target);
      const d1 = diff(a1, target);
      if ((d0 < 0) !== (d1 < 0) && Math.abs(d1 - d0) < 180 && (!upOnly || d1 > d0)) {
        const up = d1 > d0;
        found.push(bisect((ms) => (up ? diff(angle(ms), target) : -diff(angle(ms), target)), t0, t1));
      }
    }
    t0 = t1;
    a0 = a1;
  }
  return found;
}

const lonOf = (body: string, frame: ZodiacFrame) => (ms: number) => {
  const at = new Date(ms);
  return inFrame(eclipticOfDate(body as AstroBody, at).lon, frame, at);
};
const signIndex = (lon: number) => Math.floor(norm360(lon) / 30);
const SIGN_NAMES = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
/** The frame a note names, else the drawer's. */
const frameOf = (event: PsiSkyEvent, drawer: ZodiacFrame): ZodiacFrame =>
  event.frame?.frame === 'tropical' ? 'tropical' : event.frame?.frame === 'sidereal_gc' ? 'galactic' : drawer;

/** Whether a sky event's kind is one Echoes find the returns of. */
export const echoable = (event: PsiSkyEvent): boolean => ECHOED_CLASSES.has(event.sky.class);

/**
 * A kind of sky event, as the moments of it are searched for: Echoes make one from a coming event (its sign read at its
 * own moment), the lab from a person's choice (decision D-PW, PW94). The sign is an index, Aries 0 to Pisces 11, in
 * `frame`: for a lunation the Moon's, for a station the planet's, any sign when absent; for an ingress, the sign entered.
 */
export interface SkySpec {
  class: string;
  /** A lunation's phase, a lunar apsis (`perigee`, `apogee`), a node's way (`…ascending`, `…descending`), a station's. */
  sub: string;
  bodies: readonly string[];
  /** An aspect's or a Galactic Centre contact's separation, b from a, degrees: found either side. */
  targetDeg?: number;
  frame: ZodiacFrame;
  sign?: number;
}

/** Every moment of a kind of sky event across a span, ms, oldest first; empty for a kind not searched. */
export function momentsOf(spec: SkySpec, fromMs: number, untilMs: number): number[] {
  const sorted = (list: number[]) => list.sort((x, y) => x - y);
  const [a, b] = spec.bodies;
  const { frame, sign } = spec;
  const inSign = (lon: (ms: number) => number) => (ms: number) => sign === undefined || signIndex(lon(ms)) === sign;
  switch (spec.class) {
    case 'aspect': {
      if (spec.targetDeg === undefined || !BODIES.has(a) || !BODIES.has(b)) return [];
      // The separation, 0–360 from a to b: its target and its mirror, the same aspect from the other side.
      const la = lonOf(a, 'tropical');
      const lb = lonOf(b, 'tropical');
      const t = spec.targetDeg;
      return sorted(crossings((ms) => norm360(lb(ms) - la(ms)), t === 0 || t === 180 ? [t] : [t, 360 - t], fromMs, untilMs, stepFor([a, b])));
    }
    case 'gc_contact': {
      if (spec.targetDeg === undefined || !BODIES.has(a)) return [];
      const la = lonOf(a, 'tropical');
      const t = spec.targetDeg;
      const sep = (ms: number) => norm360(la(ms) - galacticCentreLongitude(new Date(ms)));
      return sorted(crossings(sep, t === 0 || t === 180 ? [t] : [t, 360 - t], fromMs, untilMs, stepFor([a])));
    }
    case 'ingress': {
      if (sign === undefined || sign < 0 || sign > 11 || !BODIES.has(a)) return [];
      // Entering the sign: its first degree crossed going forward.
      return sorted(crossings(lonOf(a, frame), [sign * 30], fromMs, untilMs, stepFor([a]), true));
    }
    case 'lunation': {
      const phase = ({ new: 0, first_quarter: 90, full: 180, last_quarter: 270 } as Record<string, number>)[spec.sub];
      if (phase === undefined) return [];
      const moonIn = inSign(lonOf('Moon', frame));
      const found: number[] = [];
      let start = Astronomy.MakeTime(new Date(fromMs));
      for (;;) {
        const at = Astronomy.SearchMoonPhase(phase, start, 40);
        if (!at || at.date.getTime() > untilMs) break;
        if (moonIn(at.date.getTime())) found.push(at.date.getTime());
        start = at.AddDays(1);
      }
      return sorted(found);
    }
    case 'lunar_distance': {
      const kind = spec.sub === 'perigee' ? Astronomy.ApsisKind.Pericenter : Astronomy.ApsisKind.Apocenter;
      const found: number[] = [];
      let apsis = Astronomy.SearchLunarApsis(new Date(fromMs));
      while (apsis.time.date.getTime() <= untilMs) {
        if (apsis.kind === kind) found.push(apsis.time.date.getTime());
        apsis = Astronomy.NextLunarApsis(apsis);
      }
      return sorted(found);
    }
    case 'node': {
      // The Moon's ecliptic latitude through zero, going up (ascending) or down (descending).
      const up = spec.sub.endsWith('ascending');
      const found: number[] = [];
      let node = Astronomy.SearchMoonNode(new Date(fromMs));
      while (node.time.date.getTime() <= untilMs) {
        if ((node.kind === Astronomy.NodeEventKind.Ascending) === up) found.push(node.time.date.getTime());
        node = Astronomy.NextMoonNode(node);
      }
      return sorted(found);
    }
    case 'station': {
      if (!BODIES.has(a) || a === 'Sun' || a === 'Moon') return [];
      // Its daily motion through zero: from forward to backward (retrograde) or back again (direct), in the sign asked.
      const toRetro = spec.sub === 'retrograde';
      const lon = lonOf(a, frame);
      const planetIn = inSign(lon);
      const speed = (ms: number) => ((lon(ms + DAY / 2) - lon(ms - DAY / 2) + 540) % 360) - 180;
      const found: number[] = [];
      let t0 = fromMs;
      let s0 = speed(t0);
      for (let t1 = fromMs + DAY; t1 <= untilMs; t1 += DAY) {
        const s1 = speed(t1);
        if ((s0 < 0) !== (s1 < 0) && (s1 < s0) === toRetro) {
          const at = bisect((ms) => (toRetro ? -speed(ms) : speed(ms)), t0, t1);
          if (planetIn(at)) found.push(at);
        }
        t0 = t1;
        s0 = s1;
      }
      return sorted(found);
    }
    default:
      return [];
  }
}

/** A coming sky event's kind as a spec: its own frame, else the drawer's; its sign, where its kind keeps one, read at its own moment. */
export function specOf(event: PsiSkyEvent, drawer: ZodiacFrame): SkySpec | null {
  const own = event.exact * 1000;
  const frame = frameOf(event, drawer);
  const base = { class: event.sky.class, sub: event.sky.sub, bodies: event.bodies, frame };
  switch (event.sky.class) {
    case 'aspect':
    case 'gc_contact':
      return event.harmonic ? { ...base, targetDeg: event.harmonic.targetDeg } : null;
    case 'ingress': {
      if (!event.frame) return null;
      const into = SIGN_NAMES.indexOf(event.frame.to);
      return into < 0 ? null : { ...base, sign: into };
    }
    case 'lunation':
      return { ...base, sign: signIndex(lonOf('Moon', frame)(own)) };
    case 'station':
      return BODIES.has(event.bodies[0]) ? { ...base, sign: signIndex(lonOf(event.bodies[0], frame)(own)) } : null;
    case 'lunar_distance':
    case 'node':
      return base;
    default:
      return null;
  }
}

/** The returns of a sky event's kind across a span, ms, oldest first; the event's own moment left out. */
export function returnsOf(event: PsiSkyEvent, fromMs: number, untilMs: number, drawer: ZodiacFrame): number[] {
  const spec = specOf(event, drawer);
  if (!spec) return [];
  const own = event.exact * 1000;
  return momentsOf(spec, fromMs, untilMs).filter((ms) => Math.abs(ms - own) > DAY / 2);
}
