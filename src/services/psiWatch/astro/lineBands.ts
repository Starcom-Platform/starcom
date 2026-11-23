/**
 * Planet lines' bands and parans (decision D-PW, PW59, PW81–PW84).
 *
 * A band is a line widened by its body's orb, so an event can fall on a line. The orb is the kit's, by body (PW82;
 * kit-v0 orbs.json, the aspect class's half-width): the Moon ±1°, the Sun, Mercury and Venus ±2°, the rest ±1°. On the
 * sky, 1° is the same everywhere, so on the ground:
 *   - an MC or IC line's band is the places whose hour angle is within the orb of the meridian: ±orb degrees of
 *     longitude, about 111 km × cos(latitude) either side, narrowing toward the poles as longitude degrees do;
 *   - an ASC or DSC line's band is the places where the body stands within the orb of the horizon: a great circle 90°
 *     from where the body is overhead, widened by ±orb of arc, 111 km per degree everywhere.
 *
 * A paran (PW81) is a latitude where two bodies are angular at once. At the moment drawn, that is where two drawn lines
 * cross: a meridian (MC or IC) of one body crossing the other's horizon, or the two horizons crossing (twice, at
 * antipodal places). Each is drawn as a faint band of latitude round the globe, half the smaller of the two bodies'
 * orbs either side, named for the pair. Parans are the event's own bodies' only, however many bodies' lines are drawn.
 */
import orbs from '../kit-v0/orbs.json';
import type { AstroBody } from './sky';
import { gastDeg, meridianLines, wrap180 } from './lines';
import type { GlobePoint, LineAngle } from './lineGeometry';

const RAD = Math.PI / 180;
/** A degree of arc on the Earth's mean sphere (6,371.0088 km), km. */
export const KM_PER_DEG = (Math.PI * 6371.0088) / 180;

type BodyClass = 'moon' | 'inner' | 'outer';
/** The kit's body classes (orbs.json `pair_kind`, for one body): the Moon; the Sun, Mercury and Venus; the rest. */
export const bodyClass = (body: AstroBody): BodyClass =>
  (body === 'Moon' ? 'moon' : body === 'Sun' || body === 'Mercury' || body === 'Venus' ? 'inner' : 'outer');
const ORB_H = (orbs as { classes: { aspect: { h_deg: Record<BodyClass, number> } } }).classes.aspect.h_deg;
/** A body's orb, degrees: the kit's aspect half-width for its class. */
export const orbDeg = (body: AstroBody): number => ORB_H[bodyClass(body)];

type Vec = [number, number, number];
const toVec = (lat: number, lng: number): Vec => {
  const c = Math.cos(lat * RAD);
  return [c * Math.cos(lng * RAD), c * Math.sin(lng * RAD), Math.sin(lat * RAD)];
};
const toPoint = (v: Vec): GlobePoint => {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / RAD, lng: Math.atan2(v[1], v[0]) / RAD };
};
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec): Vec => {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / r, v[1] / r, v[2] / r];
};

/** A body's altitude at a place, degrees, from its declination and its hour angle there. */
export function altitudeDeg(lat: number, dec: number, hourAngle: number): number {
  const s = Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(hourAngle * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** Which horizon line a place on the horizon is on: rising where the body has yet to culminate (hour angle below 0). */
const horizonAngle = (hourAngle: number): 'ASC' | 'DSC' => (hourAngle < 0 ? 'ASC' : 'DSC');

export interface OnBand {
  body: AstroBody;
  angle: LineAngle;
  /** How far the place is from the line, km. */
  km: number;
  /** How wide the band is there, either side of the line, km. */
  orbKm: number;
}

/** The bands a place falls in at a moment, among these bodies' lines, nearest first. */
export function bandsHolding(place: GlobePoint, at: Date, bodies: readonly AstroBody[]): OnBand[] {
  const gast = gastDeg(at);
  const cosLat = Math.cos(place.lat * RAD);
  const found: OnBand[] = [];
  for (const body of bodies) {
    const { mc, dec } = meridianLines(body, at, gast);
    const h = orbDeg(body);
    const hourAngle = wrap180(place.lng - mc);
    for (const [angle, off] of [['MC', hourAngle], ['IC', wrap180(hourAngle - 180)]] as const) {
      if (Math.abs(off) <= h) found.push({ body, angle, km: Math.abs(off) * KM_PER_DEG * cosLat, orbKm: h * KM_PER_DEG * cosLat });
    }
    const alt = altitudeDeg(place.lat, dec, hourAngle);
    if (Math.abs(alt) <= h) found.push({ body, angle: horizonAngle(hourAngle), km: Math.abs(alt) * KM_PER_DEG, orbKm: h * KM_PER_DEG });
  }
  return found.sort((a, b) => a.km - b.km);
}

/** A band to draw: rows across it, each row its two edges, consecutive rows making the ribbon. */
export interface Ribbon {
  body: AstroBody;
  angle: LineAngle;
  rows: Array<[GlobePoint, GlobePoint]>;
}

/** How finely a ribbon is drawn, degrees between its rows. */
export const RIBBON_STEP_DEG = 2;
const MERIDIAN_LIMIT = 88;

/** Each body's four bands at a moment. */
export function bandRibbons(at: Date, bodies: readonly AstroBody[]): Ribbon[] {
  const gast = gastDeg(at);
  return bodies.flatMap((body) => {
    const { mc, ic, dec } = meridianLines(body, at, gast);
    const h = orbDeg(body);
    const meridian = (lng: number, angle: 'MC' | 'IC'): Ribbon => {
      const rows: Array<[GlobePoint, GlobePoint]> = [];
      for (let lat = -MERIDIAN_LIMIT; lat <= MERIDIAN_LIMIT; lat += RIBBON_STEP_DEG) {
        rows.push([{ lat, lng: wrap180(lng - h) }, { lat, lng: wrap180(lng + h) }]);
      }
      return { body, angle, rows };
    };
    // The horizon: the great circle 90° from where the body stands overhead, each row its two small circles at 90° ± h.
    const s = toVec(dec, mc);
    const u = unit(Math.abs(s[2]) < 0.9 ? cross(s, [0, 0, 1]) : cross(s, [1, 0, 0]));
    const v = cross(s, u);
    const runs: Record<'ASC' | 'DSC', Array<Array<[GlobePoint, GlobePoint]>>> = { ASC: [], DSC: [] };
    let current: 'ASC' | 'DSC' | null = null;
    for (let deg = 0; deg <= 360; deg += RIBBON_STEP_DEG) {
      const t = deg * RAD;
      const p: Vec = [Math.cos(t) * u[0] + Math.sin(t) * v[0], Math.cos(t) * u[1] + Math.sin(t) * v[1], Math.cos(t) * u[2] + Math.sin(t) * v[2]];
      const at0 = toPoint(p);
      const side = horizonAngle(wrap180(at0.lng - mc));
      const edge = (alpha: number): GlobePoint => toPoint([
        Math.cos(alpha * RAD) * p[0] + Math.sin(alpha * RAD) * s[0],
        Math.cos(alpha * RAD) * p[1] + Math.sin(alpha * RAD) * s[1],
        Math.cos(alpha * RAD) * p[2] + Math.sin(alpha * RAD) * s[2],
      ]);
      const row: [GlobePoint, GlobePoint] = [edge(-h), edge(h)];
      if (side !== current) {
        // Each side's run starts afresh, sharing its first row with the run before, so the two meet without a gap.
        const previous = current ? runs[current][runs[current].length - 1] : null;
        runs[side].push(previous ? [previous[previous.length - 1], row] : [row]);
        current = side;
      } else {
        runs[side][runs[side].length - 1].push(row);
      }
    }
    const horizon = (angle: 'ASC' | 'DSC'): Ribbon[] => runs[angle].filter((rows) => rows.length > 1).map((rows) => ({ body, angle, rows }));
    return [meridian(mc, 'MC'), meridian(ic, 'IC'), ...horizon('ASC'), ...horizon('DSC')];
  });
}

export interface Paran {
  /** The two bodies and the angle each stands at there. */
  a: { body: AstroBody; angle: LineAngle };
  b: { body: AstroBody; angle: LineAngle };
  /** Where the two lines cross: the paran's latitude, and the longitude its label stands at. */
  lat: number;
  lng: number;
  /** Half the band's width, degrees of latitude: the smaller of the two bodies' orbs. */
  halfWidthDeg: number;
}

const PARAN_LIMIT = 85;

/** Where the lines of two different bodies among these cross at a moment: their parans, by latitude. */
export function paransAt(at: Date, bodies: readonly AstroBody[]): Paran[] {
  const gast = gastDeg(at);
  const placed = bodies.map((body) => ({ body, ...meridianLines(body, at, gast) }));
  const found: Paran[] = [];
  const keep = (p: Paran) => { if (Number.isFinite(p.lat) && Math.abs(p.lat) <= PARAN_LIMIT) found.push(p); };
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = 0; j < placed.length; j += 1) {
      if (i === j) continue;
      const A = placed[i];
      const B = placed[j];
      const half = Math.min(orbDeg(A.body), orbDeg(B.body));
      // A's meridians across B's horizon: at A's longitude, the latitude where B's altitude is 0.
      if (Math.abs(B.dec) >= 0.01) {
        for (const [lng, angle] of [[A.mc, 'MC'], [A.ic, 'IC']] as const) {
          const hourAngle = wrap180(lng - B.mc);
          const lat = Math.atan(-Math.cos(hourAngle * RAD) / Math.tan(B.dec * RAD)) / RAD;
          keep({ a: { body: A.body, angle }, b: { body: B.body, angle: horizonAngle(hourAngle) }, lat, lng, halfWidthDeg: half });
        }
      }
      // The two horizons, once a pair: where both bodies stand on the horizon, two antipodal places.
      if (j > i) {
        const n = cross(toVec(A.dec, A.mc), toVec(B.dec, B.mc));
        if (Math.hypot(n[0], n[1], n[2]) < 1e-6) continue;
        for (const sign of [1, -1]) {
          const p = toPoint(unit([n[0] * sign, n[1] * sign, n[2] * sign]));
          keep({
            a: { body: A.body, angle: horizonAngle(wrap180(p.lng - A.mc)) },
            b: { body: B.body, angle: horizonAngle(wrap180(p.lng - B.mc)) },
            lat: p.lat, lng: p.lng, halfWidthDeg: half,
          });
        }
      }
    }
  }
  return found.sort((x, y) => y.lat - x.lat);
}
