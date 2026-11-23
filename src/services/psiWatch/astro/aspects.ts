/**
 * Aspects (decision D-PW): the angles between two points along the ecliptic that astrology reads, each with an orb,
 * how far from exact it may stand and still be counted. Angles between longitudes are the same in every frame. Three
 * orb schemes: the catalogue's, by default (PW13), the half-weight orb and cap Mecha Jono's sky events carry, so a
 * chart never disagrees with a sky event (their `kit/orbs.json`: a pair with the Moon is a moon pair, 1° and 3°; else
 * one with the Sun, Mercury or Venus is inner, 2° and 6°; else outer, 1° and 3°; the major aspects); the classic one,
 * wide for the major aspects and narrow for the minor; and the harmonic one the owner's own tools use, 30° over the
 * aspect's harmonic (30° for a conjunction, 10° for a trine, 2.5° for a semi-sextile).
 */
import { arc, type AstroPoint, type SkyPosition } from './sky';

export const ASPECT_KINDS = [
  { name: 'conjunction', angle: 0, harmonic: 1, major: true },
  { name: 'opposition', angle: 180, harmonic: 2, major: true },
  { name: 'trine', angle: 120, harmonic: 3, major: true },
  { name: 'square', angle: 90, harmonic: 4, major: true },
  { name: 'sextile', angle: 60, harmonic: 6, major: true },
  { name: 'quincunx', angle: 150, harmonic: 12, major: false },
  { name: 'semi-sextile', angle: 30, harmonic: 12, major: false },
  { name: 'semi-square', angle: 45, harmonic: 8, major: false },
  { name: 'sesquiquadrate', angle: 135, harmonic: 8, major: false },
  { name: 'quintile', angle: 72, harmonic: 5, major: false },
  { name: 'biquintile', angle: 144, harmonic: 5, major: false },
] as const;
export type AspectKind = (typeof ASPECT_KINDS)[number];
export type AspectName = AspectKind['name'];

export type OrbScheme = 'catalogue' | 'classic' | 'harmonic';
export const ORB_SCHEMES: readonly OrbScheme[] = ['catalogue', 'classic', 'harmonic'];
export const ORB_SCHEME_NAMES: Record<OrbScheme, string> = {
  catalogue: "The sky catalogue's orbs (3° with the Moon, 6° with the Sun, Mercury or Venus, 3° otherwise; major aspects)",
  classic: 'Classic orbs (8° conjunction and opposition, 6° trine and square, 4° sextile, 2° minor)',
  harmonic: 'Harmonic orbs (30° over the harmonic)',
};

const CLASSIC: Record<AspectName, number> = {
  conjunction: 8, opposition: 8, trine: 6, square: 6, sextile: 4,
  quincunx: 2, 'semi-sextile': 2, 'semi-square': 2, sesquiquadrate: 2, quintile: 2, biquintile: 2,
};

const INNER = new Set<AstroPoint>(['Sun', 'Mercury', 'Venus']);
export type PairKind = 'moon' | 'inner' | 'outer';

/** A pair's kind, as the catalogue's rule has it; the node, a fixed point, counts as the other body. */
export const pairKind = (a: AstroPoint, b: AstroPoint): PairKind =>
  a === 'Moon' || b === 'Moon' ? 'moon' : INNER.has(a) || INNER.has(b) ? 'inner' : 'outer';

const CATALOGUE_ORBS: Record<PairKind, { h: number; cap: number }> = { moon: { h: 1, cap: 3 }, inner: { h: 2, cap: 6 }, outer: { h: 1, cap: 3 } };

/** The catalogue's half-weight orb and cap for a pair, degrees. */
export const catalogueOrb = (a: AstroPoint, b: AstroPoint): { h: number; cap: number } => CATALOGUE_ORBS[pairKind(a, b)];

/** How far from exact an aspect between a pair may stand in a scheme, degrees; 0 where the scheme reads no such aspect. */
export function orbOf(kind: AspectKind, scheme: OrbScheme, a: AstroPoint, b: AstroPoint): number {
  if (scheme === 'catalogue') return kind.major ? catalogueOrb(a, b).cap : 0;
  return scheme === 'classic' ? CLASSIC[kind.name] : 30 / kind.harmonic;
}

export interface Aspect {
  a: AstroPoint;
  b: AstroPoint;
  kind: AspectName;
  /** The aspect's exact angle, and how far the pair stands from it, degrees (never below zero). */
  angle: number;
  orb: number;
  /** How strongly it holds, 0–1: 2^−(orb/h)², h a third of the cap, as the sky catalogue weighs its windows. */
  weight: number;
  /** Closing on exact: the orb is shrinking. */
  applying: boolean;
}

/** The angle between two longitudes, degrees 0–180. */
export const separation = (a: number, b: number): number => Math.abs(arc(a, b));

/**
 * Every aspect between the positions within their orbs, tightest first. A pair takes the one aspect it stands
 * closest to, so wide orbs never count one pair twice.
 */
export function aspectsOf(positions: SkyPosition[], scheme: OrbScheme, options: { majorOnly?: boolean } = {}): Aspect[] {
  const kinds = ASPECT_KINDS.filter((kind) => !options.majorOnly || kind.major);
  const found: Aspect[] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p = positions[i];
      const q = positions[j];
      const apart = separation(p.lon, q.lon);
      let best: { kind: AspectKind; orb: number; cap: number } | null = null;
      for (const kind of kinds) {
        const orb = Math.abs(apart - kind.angle);
        const cap = orbOf(kind, scheme, p.body, q.body);
        if (cap > 0 && orb <= cap && (!best || orb < best.orb)) best = { kind, orb, cap };
      }
      if (!best) continue;
      // An hour on, at each point's own speed: is the pair nearer exact?
      const later = separation(p.lon + p.speed / 24, q.lon + q.speed / 24);
      found.push({
        a: p.body, b: q.body, kind: best.kind.name, angle: best.kind.angle, orb: best.orb,
        weight: Math.pow(2, -((best.orb / (best.cap / 3)) ** 2)),
        applying: Math.abs(later - best.kind.angle) < best.orb,
      });
    }
  }
  return found.sort((x, y) => x.orb - y.orb);
}
