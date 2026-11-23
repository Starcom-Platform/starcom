// connectionLines.ts — animated/dashed great-circle-arc lines between two
// lat/lng points on the globe. Shared infrastructure: ResourceZones' trade
// routes (Piece 4) and DiplomaticEvents' event connections (Piece 5) are both
// "a line between two countries," differing only in the data feeding them.
//
// Same fat-line batching as fatBorderLines.ts (lineBatches.ts), but the path
// between endpoints is a great-circle arc lifted at the midpoint — the
// standard flight-path-visualization convention — rather than a straight
// chord, which for widely-separated points would cut through/under the globe
// surface under a naive linear interpolation.
import * as THREE from 'three';
import { latLonToVector3 } from '../utils/latLonToVector3';
import { buildLineBatches, type LineLook } from './lineBatches';

export interface ConnectionEndpoint {
  lat: number;
  lng: number;
}

export interface ConnectionSpec {
  id: string;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
}

export interface ConnectionLinesOptions {
  radius?: number;
  arcHeight?: number;
  segments?: number;
  color?: number;
  opacity?: number;
  linewidth?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  dashScale?: number;
}

function toUnitVector(point: ConnectionEndpoint): THREE.Vector3 {
  // Same [x, y, -z] convention as fatBorderLines.ts's per-vertex projection —
  // computed at radius 1 so the result is already unit-length for slerp.
  const v = latLonToVector3(point.lat, point.lng, { radius: 1, elevation: 0, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z);
}

function slerpUnitVectors(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a.clone(); // a and b (nearly) coincide — no arc to interpolate
  const sinOmega = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;
  return a.clone().multiplyScalar(wa).addScaledVector(b, wb);
}

/**
 * Builds a great-circle arc per connection, from `from` to `to`, sampled at
 * `segments` points and lifted radially so it peaks `arcHeight` above `radius`
 * at the midpoint, returning to `radius` at both endpoints. A connection whose
 * two endpoints coincide (or nearly so) degenerates to a flat point at `radius`
 * — still a valid (if visually trivial) line.
 *
 * Every arc from one call shares a look, so they are drawn as one batch: the
 * group holds a single LineSegments2, or nothing when no connection was given.
 */
export function buildConnectionLines(connections: ConnectionSpec[], opts: ConnectionLinesOptions = {}): THREE.Group {
  const {
    radius = 101,
    arcHeight = 10,
    segments = 32,
    color = 0xffaa33,
    opacity = 0.6,
    linewidth = 1.5,
    dashed = false,
    dashSize = 3,
    gapSize = 2,
    dashScale = 1
  } = opts;
  const look: LineLook = { opacity, linewidth, dashed, dashSize, gapSize, dashScale, renderOrder: 0 };

  return buildLineBatches(connections.map((c) => {
    const unitFrom = toUnitVector(c.from);
    const unitTo = toUnitVector(c.to);
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const dir = slerpUnitVectors(unitFrom, unitTo, t);
      const r = radius + arcHeight * Math.sin(Math.PI * t);
      positions.push(dir.x * r, dir.y * r, dir.z * r);
    }
    return { id: c.id, positions, color, look };
  }));
}
