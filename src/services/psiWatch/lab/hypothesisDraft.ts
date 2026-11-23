/**
 * The board's drafting form (decision D-PW, PW10, PW96; Mecha Jono's kit, schemas_psi 2.10): a hypothesis as their
 * registry takes a draft, from the lab's configuration and the form's own fields. The registry fills the rest (the id,
 * the hashes, the baseline, the null, the controls, power) and checks it; the owner seals it. Starcom only drafts: the
 * JSON is copied and posted by the owner (PW96).
 *
 * What the registry's columns cannot say is not drafted: a sign for a lunation or a station has no column, so such a
 * configuration is refused here rather than drafted as a different test.
 */
import type { EventSetId } from '../timestream/eventSets';
import type { SkySpec } from '../timestream/echoReturns';
import { skyRecurrence } from '../timestream/recurrence';
import type { LabWindow } from './labExplore';

export type Adapter = 'ucdp_exact' | 'comcat_m55' | 'kp_storm';
export const ADAPTER_OF: Record<EventSetId, Adapter> = { conflict: 'ucdp_exact', quakes: 'comcat_m55', storms: 'kp_storm' };

export type Direction = 'two_sided' | 'upper' | 'lower';
export const DIRECTIONS: readonly Direction[] = ['two_sided', 'upper', 'lower'];

/** An aspect's angle as the catalogue's harmonic: n, and k its multiple (the kit's `harmonic` tag). */
const HARMONIC_OF: Record<number, { n: number; k: number }> = {
  0: { n: 1, k: 0 }, 180: { n: 2, k: 1 }, 120: { n: 3, k: 1 }, 90: { n: 4, k: 1 }, 60: { n: 6, k: 1 },
  150: { n: 12, k: 5 }, 30: { n: 12, k: 1 }, 45: { n: 8, k: 1 }, 135: { n: 8, k: 3 }, 72: { n: 5, k: 1 }, 144: { n: 5, k: 2 },
};

export const SIGN_NAMES = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] as const;

export interface DraftFields {
  title: string;
  hypothesis: string;
  direction: Direction;
  p: number;
  rr: number;
  /** The sealed span's last day, `YYYY-MM-DD`. */
  sealedEnd: string;
}

export interface HypothesisDraft {
  title: string;
  hypothesis: string;
  E: { adapter: Adapter };
  S: { class: string; where: Record<string, string | number | string[]>; period_days?: number };
  window: [number, number];
  unit: 'utc_day' | 'hour';
  direction: Direction;
  threshold: { p: number; rr: number };
  place: { kind: 'globe' };
  split: { sealed: { start: string; end: string } };
}

/** What stops a draft, each as a key of the form's words. */
export type DraftProblem = 'title' | 'hypothesis' | 'signHasNoColumn' | 'hourOnlyQuakes' | 'window' | 'threshold' | 'sealedEnd' | 'kind';

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The registry's `where` columns for a kind, or null where they cannot say it. */
function whereOf(spec: SkySpec): Record<string, string | number | string[]> | null {
  const frame = spec.frame === 'galactic' ? 'sidereal_gc' : 'tropical';
  switch (spec.class) {
    case 'aspect': {
      const h = spec.targetDeg === undefined ? undefined : HARMONIC_OF[Math.min(spec.targetDeg, 360 - spec.targetDeg)];
      return h ? { sub: 'harmonic', bodies: [...spec.bodies], n: h.n, k: h.k } : null;
    }
    case 'gc_contact': {
      const h = spec.targetDeg === undefined ? undefined : HARMONIC_OF[Math.min(spec.targetDeg, 360 - spec.targetDeg)];
      return h ? { sub: 'harmonic', bodies: [spec.bodies[0], 'GC'], n: h.n, k: h.k } : null;
    }
    case 'ingress':
      return spec.sign === undefined ? null : { sub: 'sign', bodies: [spec.bodies[0]], frame, sign_to: SIGN_NAMES[spec.sign] };
    case 'lunation':
      return { sub: spec.sub, bodies: ['Sun', 'Moon'] };
    case 'lunar_distance':
    case 'node':
      return { sub: spec.sub, bodies: ['Moon'] };
    case 'station':
      return { sub: spec.sub, bodies: [spec.bodies[0]] };
    default:
      return null;
  }
}

/** The draft, and what stops it; `todayMs` is when it is drafted, the sealed span starting the next UTC day. */
export function draftOf(spec: SkySpec, set: EventSetId, window: LabWindow, fields: DraftFields, todayMs: number): { draft: HypothesisDraft | null; problems: DraftProblem[] } {
  const problems: DraftProblem[] = [];
  if (!fields.title.trim()) problems.push('title');
  if (!fields.hypothesis.trim()) problems.push('hypothesis');
  // A lunation's or a station's sign has no column: drafting it without would draft another test.
  if ((spec.class === 'lunation' || spec.class === 'station') && spec.sign !== undefined) problems.push('signHasNoColumn');
  const where = whereOf(spec);
  if (!where) problems.push('kind');
  if (window.unit === 'hour' && set !== 'quakes') problems.push('hourOnlyQuakes');
  if (![window.before, window.after].every((n) => Number.isInteger(n) && n >= 0) || window.before + window.after <= 0) problems.push('window');
  if (!(fields.p > 0 && fields.p < 1) || !(fields.rr > 0)) problems.push('threshold');
  const start = day(todayMs + 86_400_000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.sealedEnd) || fields.sealedEnd <= start) problems.push('sealedEnd');
  if (problems.length || !where) return { draft: null, problems };
  const angle = spec.targetDeg === undefined ? undefined : Math.min(spec.targetDeg, 360 - spec.targetDeg);
  const period = skyRecurrence({ class: spec.class, sub: spec.sub, bodies: spec.class === 'gc_contact' ? [spec.bodies[0], 'GC'] : spec.bodies, angle });
  return {
    draft: {
      title: fields.title.trim(),
      hypothesis: fields.hypothesis.trim(),
      E: { adapter: ADAPTER_OF[set] },
      S: { class: spec.class, where, ...(period !== undefined && Number.isFinite(period) ? { period_days: Math.round(period * 100) / 100 } : {}) },
      window: [0 - window.before, window.after],
      unit: window.unit === 'hour' ? 'hour' : 'utc_day',
      direction: fields.direction,
      threshold: { p: fields.p, rr: fields.rr },
      place: { kind: 'globe' },
      split: { sealed: { start, end: fields.sealedEnd } },
    },
    problems,
  };
}
