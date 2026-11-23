/**
 * How often a kind of window recurs (decision D-PW, PW51, PW67), from the bodies' mean motions: the planets' own
 * years, the Earth's for the Sun and the sidereal month for the Moon, so a pair's synodic period comes out as the sky
 * shows it (Mercury and the Sun 116 days, Jupiter and Saturn 19.9 years). Wider views keep only the kinds that recur
 * slowly (`busy.ts`), and Busy's hover says how often each open window's kind comes round; it weighs nothing (PW67:
 * every window counts 1).
 */

/** Mean periods, days: sidereal, heliocentric for the planets; the nodes' backward. */
export const MEAN_PERIOD_DAYS: Record<string, number> = {
  Sun: 365.256363, Moon: 27.321662, Mercury: 87.9691, Venus: 224.701, Mars: 686.98, Jupiter: 4332.59, Saturn: 10759.22,
  Uranus: 30688.5, Neptune: 60182, Pluto: 90560, NorthNode: -6798.38, SouthNode: -6798.38, Lilith: 3231.5, Perigee: 3231.5,
};

const SYNODIC_MONTH = 29.530589;
const ANOMALISTIC_MONTH = 27.55455;
const DRACONIC_MONTH = 27.212221;
/** Half an eclipse year: the eclipse seasons' spacing. */
const ECLIPSE_SEASON = 173.31;
const MONTH_DAYS = 30.436875;
const YEAR_DAYS = 365.25;

/** A body's period, or Infinity for a fixed point (the Galactic Centre); undefined for one not known. */
const periodOf = (body: string): number | undefined => (body === 'GC' ? Infinity : MEAN_PERIOD_DAYS[body]);

/** How often two bodies stand at an angle, days: once a synodic period at 0° or 180°, twice at any other. */
export function pairRecurrence(a: string, b: string, angle: number): number | undefined {
  const pa = periodOf(a);
  const pb = periodOf(b);
  if (pa === undefined || pb === undefined) return undefined;
  const relative = Math.abs(1 / pa - 1 / pb);
  if (relative === 0) return Infinity;
  const once = Math.abs(angle % 180) < 1e-6;
  return 1 / relative / (once ? 1 : 2);
}

/** A sky event's kind, as Mecha Jono's notes name it: its class and sub-kind, its bodies, its harmonic's angle. */
export interface SkyKind {
  class: string;
  sub?: string;
  bodies: readonly string[];
  angle?: number;
}

/** How often a kind of sky event recurs, days; undefined for a kind not known. */
export function skyRecurrence(kind: SkyKind): number | undefined {
  const [a, b] = kind.bodies;
  switch (kind.class) {
    case 'aspect':
    case 'gc_contact':
      return a && b && kind.angle !== undefined ? pairRecurrence(a, b, kind.angle) : undefined;
    case 'ingress': {
      const p = a ? periodOf(a) : undefined;
      return p !== undefined && Number.isFinite(p) ? Math.abs(p) / 12 : undefined;
    }
    case 'lunation': return SYNODIC_MONTH;
    case 'lunar_distance': return ANOMALISTIC_MONTH;
    case 'node': return DRACONIC_MONTH;
    case 'eclipse': return ECLIPSE_SEASON;
    // A planet turns the same way once each synodic period with the Sun.
    case 'station': return a ? pairRecurrence(a, 'Sun', 0) : undefined;
    default: return undefined;
  }
}

/** A recurrence as a reader counts it: days under two months, months under two years, years beyond; null for never. */
export function recurrenceIn(days: number): { unit: 'days' | 'months' | 'years'; n: number } | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days < 60) return { unit: 'days', n: Math.max(1, Math.round(days)) };
  if (days < 2 * YEAR_DAYS) return { unit: 'months', n: Math.round(days / MONTH_DAYS) };
  return { unit: 'years', n: Math.round(days / YEAR_DAYS) };
}
