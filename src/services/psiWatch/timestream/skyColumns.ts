/**
 * The sky the Timestream's lanes draw (decision D-PW, PW41–PW42; Cosmic Cypher's `spectrographWorker.ts`): for each
 * pixel column of a view, each lane body's ecliptic longitude in the chart's frame, and whether it was moving
 * backward. The positions are Psi Watch's own (`astro/sky.ts`, `astro/frames.ts`, checked against Mecha Jono's
 * vectors), the rotation into the ecliptic of date and the Galactic Centre's place computed once a column for every
 * body in it. Retrograde is read from the change between neighbouring columns, as Cosmic Cypher does, at no cost.
 */
import * as Astronomy from 'astronomy-engine';
import { ASTRO_BODIES, meanNorthNode, norm360, type AstroBody } from '../astro/sky';
import { ayanamsa, type ZodiacFrame } from '../astro/frames';
import type { GraphColumns } from './graphColumns';
import { anglesAt } from '../astro/angles';
import type { TimeView } from './timeView';
import type { MoonMark } from './moonMarks';

/** The four angles, which need an observer (PW43): where the ecliptic rises, culminates, sets and stands underfoot. */
export const LANE_ANGLES = ['ASC', 'MC', 'DSC', 'IC'] as const;
export type LaneAngle = (typeof LANE_ANGLES)[number];
/** The lane bodies: the ten, the nodes, the Moon's mean apogee (Lilith) and perigee, and the angles. */
export const LANE_BODIES = [...ASTRO_BODIES, 'NorthNode', 'SouthNode', 'Lilith', 'Perigee', ...LANE_ANGLES] as const;
export type LaneBody = (typeof LANE_BODIES)[number];

/** Bodies whose apparent motion never turns: no retrograde mark is drawn for them. */
export const NEVER_RETROGRADE: ReadonlySet<LaneBody> = new Set(['Sun', 'Moon', 'NorthNode', 'SouthNode', 'Lilith', 'Perigee', ...LANE_ANGLES]);

/** Where the angles are cast for: a place on the globe, degrees, east positive. */
export interface Observer { lat: number; lon: number }

const isAngle = (body: LaneBody): body is LaneAngle => (LANE_ANGLES as readonly string[]).includes(body);

const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** The Moon's mean perigee, tropical of date (Meeus, Astronomical Algorithms, 47.7); Lilith, its mean apogee, opposite. */
export function meanLunarPerigee(at: Date): number {
  const t = (at.getTime() - J2000_MS) / (36525 * DAY_MS);
  return norm360(83.3532465 + 4069.0137287 * t - 0.01032 * t * t - (t * t * t) / 80053 + (t * t * t * t) / 18999000);
}

const BODY: Record<AstroBody, Astronomy.Body> = {
  Sun: Astronomy.Body.Sun, Moon: Astronomy.Body.Moon, Mercury: Astronomy.Body.Mercury, Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars, Jupiter: Astronomy.Body.Jupiter, Saturn: Astronomy.Body.Saturn, Uranus: Astronomy.Body.Uranus,
  Neptune: Astronomy.Body.Neptune, Pluto: Astronomy.Body.Pluto,
};

/** One moment's longitudes of the given bodies, tropical of date, then turned into the frame; an angle NaN without an observer. */
export function longitudesAt(bodies: readonly LaneBody[], at: Date, frame: ZodiacFrame, observer?: Observer): number[] {
  const rotation = Astronomy.Rotation_EQJ_ECT(at);
  const shift = ayanamsa(frame, at);
  const angles = observer && bodies.some(isAngle) ? anglesAt(at, observer.lat, observer.lon) : null;
  return bodies.map((body) => {
    let tropical: number;
    if (isAngle(body)) {
      if (!angles) return NaN;
      tropical = { ASC: angles.asc, MC: angles.mc, DSC: angles.dsc, IC: angles.ic }[body];
      return norm360(tropical - shift);
    }
    switch (body) {
      case 'NorthNode': tropical = meanNorthNode(at); break;
      case 'SouthNode': tropical = meanNorthNode(at) + 180; break;
      case 'Perigee': tropical = meanLunarPerigee(at); break;
      case 'Lilith': tropical = meanLunarPerigee(at) + 180; break;
      default: {
        const vector = Astronomy.RotateVector(rotation, Astronomy.GeoVector(BODY[body], at, true));
        tropical = Astronomy.SphereFromVector(vector).lon;
      }
    }
    return norm360(tropical - shift);
  });
}

export interface SkyColumns {
  /** Longitudes, column by column: `columns × bodies.length` degrees, column-major (a column's bodies together). */
  longitudes: Float32Array;
  /** 1 where a body was moving backward through its column. */
  retrograde: Uint8Array;
  columns: number;
  bodies: readonly LaneBody[];
  /** The Moon's marks where its lane is drawn as them, a view wider than a few months (PW51). */
  moonMarks?: MoonMark[];
  /** The graph lanes' series where one is shown (PW45). */
  graphs?: GraphColumns;
}

/** Each column's moment: its middle, so the first and last stand inside the view. */
export const columnMs = (view: TimeView, columns: number, col: number): number =>
  view.startMs + ((col + 0.5) / columns) * view.spanMs;

/** Every column's longitudes for a view, and their retrograde marks. */
export function skyColumns(view: TimeView, columns: number, bodies: readonly LaneBody[], frame: ZodiacFrame, observer?: Observer): SkyColumns {
  const n = bodies.length;
  const longitudes = new Float32Array(columns * n);
  const retrograde = new Uint8Array(columns * n);
  for (let col = 0; col < columns; col++) {
    longitudesAt(bodies, new Date(columnMs(view, columns, col)), frame, observer).forEach((lon, b) => { longitudes[col * n + b] = lon; });
  }
  // Backward where a body's longitude falls between neighbouring columns; the first column looks a column back.
  const step = view.spanMs / Math.max(1, columns);
  const before = columns ? longitudesAt(bodies, new Date(columnMs(view, columns, 0) - step), frame, observer) : [];
  for (let col = 0; col < columns; col++) {
    for (let b = 0; b < n; b++) {
      if (NEVER_RETROGRADE.has(bodies[b])) continue;
      const prev = col === 0 ? before[b] : longitudes[(col - 1) * n + b];
      const delta = ((longitudes[col * n + b] - prev + 540) % 360) - 180;
      retrograde[col * n + b] = delta < 0 ? 1 : 0;
    }
  }
  return { longitudes, retrograde, columns, bodies };
}
