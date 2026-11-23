/**
 * The Timestream's graph lanes (decision D-PW, PW45, PW68): series on the lanes' own time axis, so a peak lines up
 * with what stands above it, column by column as the sky worker draws the lanes.
 *
 * The Resonance Score is Cosmic Cypher's general score (cosmiccypher-frontend `src/resonanceScore.ts`, 25 Sep 2026):
 * 50 × (1 + 0.7 × Aspect Harmony + 0.3 × Elemental Coherence) over the ten bodies and the north node, with its own ten
 * aspects, orbs and weights (PW68), and its signs counted in the drawer's frame. The node is the mean north node, as
 * the North Node lane draws it. Tidal stress is the Moon's and Sun's degree-2 tide over the whole Earth: the spread
 * of their combined tidal potential, (Tm + Ts) + √(Tm² + Ts² + 2·Tm·Ts·cos 2θ) with T = GM/d³ and θ the angle
 * between them, as a ratio to its mean, highest at spring tides with the Moon near perigee. The element and modality
 * lanes give each element's and modality's share of the same eleven bodies.
 *
 * A column wider than six hours takes up to sixteen samples, so a wide view draws each column's mean with its range
 * (PW51): the Sun, the Moon, Mercury, Venus, Mars and the node exact at each, the slower planets, which move a degree
 * or so at most in a column, at the column's middle.
 */
import * as Astronomy from 'astronomy-engine';
import { meanNorthNode } from '../astro/sky';
import { ayanamsa, type ZodiacFrame } from '../astro/frames';
import { columnMs, type SkyColumns } from './skyColumns';
import type { TimeView } from './timeView';

/** Cosmic Cypher's aspect table (`aspects.ts`, CANONICAL_ASPECTS): angle, orb, whether it counts for, and weight. */
const ASPECTS = [
  { angle: 0, orb: 8, resonant: true, weight: 1 },
  { angle: 60, orb: 6, resonant: true, weight: 1 },
  { angle: 90, orb: 8, resonant: false, weight: 1 },
  { angle: 120, orb: 8, resonant: true, weight: 1 },
  { angle: 180, orb: 8, resonant: false, weight: 1 },
  { angle: 30, orb: 2, resonant: true, weight: 0.5 },
  { angle: 45, orb: 3, resonant: false, weight: 0.5 },
  { angle: 135, orb: 3, resonant: false, weight: 0.5 },
  { angle: 150, orb: 3, resonant: false, weight: 0.5 },
  { angle: 72, orb: 2, resonant: true, weight: 0.35 },
] as const;
const ASPECT_SHARE = 0.7;
/** Cosmic Cypher's elemental friendship (ELEMENT_COMPATIBILITY), Fire, Earth, Air, Water: a sign's index mod 4. */
const FRIENDSHIP = [
  [1, -0.5, 0.6, -0.8],
  [-0.5, 1, -0.8, 0.6],
  [0.6, -0.8, 1, -0.5],
  [-0.8, 0.6, -0.5, 1],
];

/** The bodies the general score reads: the ten and the north node, no angles (Cosmic Cypher's collectEntities). */
export const RESONANCE_BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'NorthNode'] as const;
type ResonanceBody = (typeof RESONANCE_BODIES)[number];
const FAST = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'] as const;

export const ELEMENTS = ['fire', 'earth', 'air', 'water'] as const;
export const MODALITIES = ['cardinal', 'fixed', 'mutable'] as const;

const apart = (x: number, y: number) => { const d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const signOf = (lon: number) => Math.floor(norm360(lon) / 30) % 12;

export interface Resonance {
  /** 0–100. */
  headline: number;
  aspectHarmony: number;
  elementalCoherence: number;
  /** The aspects in orb that count for and against. */
  resonant: number;
  dissonant: number;
}

/** One moment's general Resonance Score from its bodies' longitudes, in the frame its signs are counted in. */
export function resonanceOf(lons: readonly number[]): Resonance {
  let weighted = 0;
  let total = 0;
  let resonant = 0;
  let dissonant = 0;
  for (let i = 0; i < lons.length; i++) {
    for (let j = i + 1; j < lons.length; j++) {
      const sep = apart(lons[i], lons[j]);
      let best: (typeof ASPECTS)[number] | null = null;
      let exactness = 0;
      for (const a of ASPECTS) {
        const d = Math.abs(sep - a.angle);
        if (d <= a.orb) {
          const e = 1 - d / a.orb;
          if (!best || e > exactness) { best = a; exactness = e; }
        }
      }
      if (!best) continue;
      if (best.resonant) resonant++; else dissonant++;
      weighted += (best.resonant ? 1 : -1) * exactness * best.weight;
      total += best.weight;
    }
  }
  const aspectHarmony = total > 0 ? clamp(weighted / total, -1, 1) : 0;
  const share = [0, 0, 0, 0];
  for (const lon of lons) share[signOf(lon) % 4] += 1 / lons.length;
  let raw = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) raw += share[a] * share[b] * FRIENDSHIP[a][b];
  const elementalCoherence = clamp(raw, -1, 1);
  const headline = clamp((ASPECT_SHARE * aspectHarmony + (1 - ASPECT_SHARE) * elementalCoherence + 1) * 50, 0, 100);
  return { headline, aspectHarmony, elementalCoherence, resonant, dissonant };
}

/** Cosmic Cypher's headline descriptor (`describeHeadline`): resonant above 60, dissonant below 40, neutral between. */
export type ResonanceLean = 'resonant' | 'neutral' | 'dissonant';
export const leanOf = (headline: number): ResonanceLean => (headline > 60 ? 'resonant' : headline < 40 ? 'dissonant' : 'neutral');

/** The Sun's GM over the Moon's (IAU 2015 nominal; DE440). */
const SUN_OVER_MOON = 1.32712440018e20 / 4.9028e12;
/** The tide's mean, in its own units (AU and Moon masses), 1950–2050 every six hours (`graphColumns.test.ts`). */
export const TIDE_MEAN = 1.48413e8;

/** The Earth-wide tide from the Moon's and Sun's geocentric vectors, AU, as a ratio to its mean. */
export function tideOf(moon: Astronomy.Vector, sun: Astronomy.Vector): number {
  const dm = Math.hypot(moon.x, moon.y, moon.z);
  const ds = Math.hypot(sun.x, sun.y, sun.z);
  const cos = (moon.x * sun.x + moon.y * sun.y + moon.z * sun.z) / (dm * ds);
  const tm = 1 / dm ** 3;
  const ts = SUN_OVER_MOON / ds ** 3;
  return (tm + ts + Math.sqrt(tm * tm + ts * ts + 2 * tm * ts * (2 * cos * cos - 1))) / TIDE_MEAN;
}

/** A graph's value at each column: its mean over the column's samples, and its least and most. */
export interface GraphSeries {
  mean: Float32Array;
  min: Float32Array;
  max: Float32Array;
}

export interface GraphColumns {
  columns: number;
  /** The samples each column took: 1 at narrow zooms, up to 16 at wide ones. */
  samples: number;
  resonance: GraphSeries;
  /** Aspect Harmony, Elemental Coherence and the counts in orb, each its mean over the column. */
  harmony: Float32Array;
  coherence: Float32Array;
  resonantCount: Float32Array;
  dissonantCount: Float32Array;
  tide: GraphSeries;
  /** Each element's and modality's mean share: `columns × 4` and `columns × 3`, column by column. */
  elements: Float32Array;
  modalities: Float32Array;
}

const SAMPLE_MS = 6 * 3_600_000;
const MOST_SAMPLES = 16;
/** How many samples a column of this view takes. */
export const samplesFor = (view: TimeView, columns: number): number =>
  clamp(Math.ceil(view.spanMs / Math.max(1, columns) / SAMPLE_MS), 1, MOST_SAMPLES);

const BODY = { Sun: Astronomy.Body.Sun, Moon: Astronomy.Body.Moon, Mercury: Astronomy.Body.Mercury, Venus: Astronomy.Body.Venus, Mars: Astronomy.Body.Mars, Jupiter: Astronomy.Body.Jupiter, Saturn: Astronomy.Body.Saturn, Uranus: Astronomy.Body.Uranus, Neptune: Astronomy.Body.Neptune, Pluto: Astronomy.Body.Pluto } as const;

/** Every array a graph's columns hold, to hand them from the worker without a copy. */
export const graphBuffers = (g: GraphColumns): ArrayBuffer[] =>
  [g.resonance.mean, g.resonance.min, g.resonance.max, g.harmony, g.coherence, g.resonantCount, g.dissonantCount,
    g.tide.mean, g.tide.min, g.tide.max, g.elements, g.modalities].map((a) => a.buffer as ArrayBuffer);

const series = (columns: number): GraphSeries => ({ mean: new Float32Array(columns), min: new Float32Array(columns), max: new Float32Array(columns) });

/** The graphs at every column of the lanes' sky, its longitudes already in the frame. */
export function graphColumns(view: TimeView, sky: SkyColumns, frame: ZodiacFrame): GraphColumns {
  const { columns } = sky;
  const n = sky.bodies.length;
  const k = samplesFor(view, columns);
  const colSpan = view.spanMs / Math.max(1, columns);
  const out: GraphColumns = {
    columns, samples: k, resonance: series(columns), tide: series(columns),
    harmony: new Float32Array(columns), coherence: new Float32Array(columns),
    resonantCount: new Float32Array(columns), dissonantCount: new Float32Array(columns),
    elements: new Float32Array(columns * 4), modalities: new Float32Array(columns * 3),
  };
  const indexIn = RESONANCE_BODIES.map((b) => sky.bodies.indexOf(b as SkyColumns['bodies'][number]));
  const lons = new Array<number>(RESONANCE_BODIES.length);
  const slot = (body: ResonanceBody) => RESONANCE_BODIES.indexOf(body);
  for (let col = 0; col < columns; col++) {
    const middle = new Date(columnMs(view, columns, col));
    // Over a column the frame's shift and the equinox's turn are the same to a few arcseconds.
    const rotation = Astronomy.Rotation_EQJ_ECT(middle);
    const shift = ayanamsa(frame, middle);
    const lonOf = (vector: Astronomy.Vector) => norm360(Astronomy.SphereFromVector(Astronomy.RotateVector(rotation, vector)).lon - shift);
    // The slower planets at the column's middle, from the lanes where they are drawn.
    RESONANCE_BODIES.forEach((body, i) => {
      if ((FAST as readonly string[]).includes(body) || body === 'NorthNode') return;
      lons[i] = indexIn[i] >= 0 ? sky.longitudes[col * n + indexIn[i]] : lonOf(Astronomy.GeoVector(BODY[body as keyof typeof BODY], middle, true));
    });
    let sumScore = 0; let minScore = Infinity; let maxScore = -Infinity;
    let sumTide = 0; let minTide = Infinity; let maxTide = -Infinity;
    let harmony = 0; let coherence = 0; let resonantCount = 0; let dissonantCount = 0;
    const startMs = view.startMs + col * colSpan;
    for (let s = 0; s < k; s++) {
      const at = k === 1 ? middle : new Date(startMs + ((s + 0.5) / k) * colSpan);
      let moon: Astronomy.Vector | null = null;
      let sun: Astronomy.Vector | null = null;
      for (const body of FAST) {
        const vector = Astronomy.GeoVector(BODY[body], at, true);
        if (body === 'Moon') moon = vector;
        if (body === 'Sun') sun = vector;
        lons[slot(body)] = lonOf(vector);
      }
      lons[slot('NorthNode')] = norm360(meanNorthNode(at) - shift);
      const r = resonanceOf(lons);
      sumScore += r.headline; minScore = Math.min(minScore, r.headline); maxScore = Math.max(maxScore, r.headline);
      harmony += r.aspectHarmony; coherence += r.elementalCoherence; resonantCount += r.resonant; dissonantCount += r.dissonant;
      const tide = tideOf(moon!, sun!);
      sumTide += tide; minTide = Math.min(minTide, tide); maxTide = Math.max(maxTide, tide);
      for (const lon of lons) {
        const sign = signOf(lon);
        out.elements[col * 4 + (sign % 4)] += 1 / (lons.length * k);
        out.modalities[col * 3 + (sign % 3)] += 1 / (lons.length * k);
      }
    }
    out.resonance.mean[col] = sumScore / k; out.resonance.min[col] = minScore; out.resonance.max[col] = maxScore;
    out.tide.mean[col] = sumTide / k; out.tide.min[col] = minTide; out.tide.max[col] = maxTide;
    out.harmony[col] = harmony / k; out.coherence[col] = coherence / k;
    out.resonantCount[col] = resonantCount / k; out.dissonantCount[col] = dissonantCount / k;
  }
  return out;
}
