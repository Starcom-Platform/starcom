/**
 * Planet lines as paths on the globe (decision D-PW, PW20–PW22; the kit's PsiLines): each body's MC and IC meridians
 * from pole to pole, and its ASC and DSC curves through every latitude where it rises and sets, broken where it never
 * does and where a curve crosses the antimeridian. Degrees, longitude east in (−180, 180].
 */
import { horizonCrossing, meridianLines, gastDeg } from './lines';
import type { AstroBody } from './sky';

export type LineAngle = 'MC' | 'IC' | 'ASC' | 'DSC';
export const LINE_ANGLES: readonly LineAngle[] = ['MC', 'IC', 'ASC', 'DSC'];

export interface GlobePoint {
  lat: number;
  lng: number;
}

export interface PlanetLine {
  body: AstroBody;
  angle: LineAngle;
  /** One path or more: a curve breaks where it is undefined or wraps at the antimeridian. */
  paths: GlobePoint[][];
}

/** How finely a path is drawn, degrees of latitude between its points. */
export const LINE_STEP_DEG = 1;
/** The highest latitude drawn: the meridians meet at the poles, the curves stop short of them. */
const POLE = 90;
const NEAR_POLE = 89;

function meridian(lng: number): GlobePoint[][] {
  const path: GlobePoint[] = [];
  for (let lat = -POLE; lat <= POLE; lat += LINE_STEP_DEG) path.push({ lat, lng });
  return [path];
}

/** Splits a run of points wherever two neighbours sit more than half the globe apart in longitude. */
function unwrap(points: GlobePoint[]): GlobePoint[][] {
  const paths: GlobePoint[][] = [];
  let current: GlobePoint[] = [];
  for (const point of points) {
    const last = current[current.length - 1];
    if (last && Math.abs(point.lng - last.lng) > 180) {
      if (current.length > 1) paths.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 1) paths.push(current);
  return paths;
}

function horizonPaths(mc: number, dec: number, side: 'asc' | 'dsc'): GlobePoint[][] {
  const runs: GlobePoint[][] = [];
  let run: GlobePoint[] = [];
  for (let lat = -NEAR_POLE; lat <= NEAR_POLE; lat += LINE_STEP_DEG) {
    const crossing = horizonCrossing(mc, dec, lat);
    if ('state' in crossing) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push({ lat, lng: crossing[side] });
  }
  if (run.length) runs.push(run);
  return runs.flatMap(unwrap);
}

/** The four lines of each body asked for, at a moment. */
export function planetLinesAt(at: Date, bodies: readonly AstroBody[]): PlanetLine[] {
  const gast = gastDeg(at);
  return bodies.flatMap((body) => {
    const { mc, ic, dec } = meridianLines(body, at, gast);
    return [
      { body, angle: 'MC' as const, paths: meridian(mc) },
      { body, angle: 'IC' as const, paths: meridian(ic) },
      { body, angle: 'ASC' as const, paths: horizonPaths(mc, dec, 'asc') },
      { body, angle: 'DSC' as const, paths: horizonPaths(mc, dec, 'dsc') },
    ];
  });
}

/**
 * The moment the lines are drawn for (PW21): the event's exact moment, or the shared cursor while it is inside the
 * event's window. Unix seconds in, a Date out.
 */
export function linesMoment(window: { from: number; until: number; exact: number }, cursor: number): Date {
  const inside = cursor >= window.from && cursor <= window.until;
  return new Date((inside ? cursor : window.exact) * 1000);
}

/** The latitudes a label tries, in turn, near 40°N where most people look. */
export const LABEL_LATS: readonly number[] = [40, 32, 48, 24, 56, 16, 8, 64];
/** How far apart two labels must stand on the sphere, degrees, so neither covers the other. */
export const LABEL_SEPARATION_DEG = 10;

const RAD = Math.PI / 180;
const apartDeg = (a: GlobePoint, b: GlobePoint) =>
  Math.acos(Math.min(1, Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lng - b.lng) * RAD))) / RAD;

/**
 * Where each line's label stands: the first of its points at a latitude in LABEL_LATS that keeps clear of the labels
 * already placed, else its point nearest 40°N. In the lines' order, so the same lines always place alike.
 */
export function labelPlaces(lines: PlanetLine[]): (GlobePoint | null)[] {
  const placed: GlobePoint[] = [];
  return lines.map((line) => {
    const points = line.paths.flat();
    if (!points.length) return null;
    const nearest = (lat: number) => points.reduce((best, p) => (Math.abs(p.lat - lat) < Math.abs(best.lat - lat) ? p : best));
    const tried = LABEL_LATS.map(nearest);
    const place = tried.find((p) => placed.every((q) => apartDeg(p, q) >= LABEL_SEPARATION_DEG)) ?? tried[0];
    placed.push(place);
    return place;
  });
}
