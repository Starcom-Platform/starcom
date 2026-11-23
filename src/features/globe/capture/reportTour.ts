/**
 * A tour of the reports on the globe, planned as camera keyframes (decision D-F,
 * section 18, item 5).
 *
 * The shape of the clip is the one a person would film: open on all of them,
 * visit each cluster close enough to read its glyphs, hold still long enough to
 * read, and pull back out. Every pose keeps the framing floor, so a tour of
 * Mecha Jono's filing addresses stays at region scale however tight a cluster is.
 *
 * Pure. It moves no camera; it returns keyframes for recordClip, so an agent can
 * inspect the plan, cut it, or record it as it stands.
 */
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import type { CameraKeyframe } from './cameraTrack';
import { altitudeToFit, frameForReports, SHARE_ALTITUDE_CEILING, SHARE_ALTITUDE_FLOOR, type FitView } from './shareReports';

/** How much further out than the fit a tour opens and closes, in globe radii. */
const OPENING_PULLBACK = 0.8;

export const TOUR_DEFAULTS = {
  /** Five stops at the default timings is under the recorder's 900 frames at 30 fps. */
  maxStops: 5,
  openingMs: 1500,
  travelMs: 2500,
  holdMs: 1500,
  /** Reports within this many degrees of each other are one stop. */
  clusterDeg: 4,
} as const;

export interface TourStop {
  lat: number;
  lng: number;
  altitude: number;
  ids: string[];
}

export interface TourPlan {
  keyframes: CameraKeyframe[];
  stops: TourStop[];
  durationMs: number;
  /** Reports not visited because the tour stopped at maxStops. Still in the overview. */
  skipped: number;
}

type Point = { id: string; lat: number; lng: number };
type TourOptions = Partial<{ [K in keyof typeof TOUR_DEFAULTS]: number }>;

const toRad = (deg: number) => (deg * Math.PI) / 180;
function degreesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h))) * 180) / Math.PI;
}

/** Single-link clusters: a report joins a cluster when it is near any report in it. */
function clusterOf(points: readonly Point[], clusterDeg: number): Point[][] {
  const clusters: Point[][] = [];
  for (const point of points) {
    const near = clusters.filter((c) => c.some((p) => degreesBetween(p, point) <= clusterDeg));
    const merged = [point, ...near.flat()];
    for (const c of near) clusters.splice(clusters.indexOf(c), 1);
    clusters.push(merged);
  }
  return clusters;
}

/**
 * Keyframes for a tour of these reports, or null when one overview cannot show
 * them all — the tour would otherwise open on a view with some of its subject on
 * the far side of the planet.
 */
export function planReportTour(
  points: readonly Point[],
  view: FitView,
  options: TourOptions = {},
): TourPlan | null {
  const o = { ...TOUR_DEFAULTS, ...options };
  if (points.length === 0) return null;
  const fitted = frameForReports(points, view);
  if (!fitted) return null;
  /*
   * Open wider than the fit, so each stop is a visible move in. Found on the
   * first real tour: the fit for Mecha Jono's US reports is 1.06 radii and every
   * stop sits at the 1.0 floor, so the camera only panned.
   */
  const overview = { ...fitted, altitude: Math.min(SHARE_ALTITUDE_CEILING, fitted.altitude + OPENING_PULLBACK) };

  const clusters = clusterOf(points, o.clusterDeg)
    // The biggest first, and the same order every time for the same input.
    .sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1))
    .slice(0, Math.max(0, o.maxStops));

  const unordered: TourStop[] = clusters.map((cluster) => {
    const centre = centreOf(cluster.map((p) => ({ latitude: p.lat, longitude: p.lng }))) ?? cluster[0];
    const at = { lat: centre.lat, lng: centre.lng };
    return {
      ...at,
      altitude: Math.max(SHARE_ALTITUDE_FLOOR, altitudeToFit(cluster, at, view)),
      ids: cluster.map((p) => p.id),
    };
  });

  // Nearest next, from the overview's centre: the shortest path a viewer can follow.
  const stops: TourStop[] = [];
  let from: { lat: number; lng: number } = overview;
  const left = [...unordered];
  while (left.length) {
    left.sort((a, b) => degreesBetween(from, a) - degreesBetween(from, b));
    const next = left.shift() as TourStop;
    stops.push(next);
    from = next;
  }

  const keyframes: CameraKeyframe[] = [{ ...overview, atMs: 0 }];
  let t = o.openingMs;
  keyframes.push({ ...overview, atMs: t });
  for (const stop of stops) {
    t += o.travelMs;
    keyframes.push({ lat: stop.lat, lng: stop.lng, altitude: stop.altitude, atMs: t });
    t += o.holdMs;
    keyframes.push({ lat: stop.lat, lng: stop.lng, altitude: stop.altitude, atMs: t });
  }
  t += o.travelMs;
  keyframes.push({ ...overview, atMs: t });

  const visited = stops.reduce((n, s) => n + s.ids.length, 0);
  return { keyframes, stops, durationMs: t, skipped: points.length - visited };
}
