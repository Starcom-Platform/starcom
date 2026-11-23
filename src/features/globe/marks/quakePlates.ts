/**
 * The plate boundaries beside the quakes (D-EQ, EQ8): PB2002's 241 boundaries (Bird 2003), baked by
 * scripts/quakes/bake-plates.ts, drawn on the ground. The subduction zones, where the greatest quakes come, in the
 * hazards' colour and heavier; the other boundaries in a light grey. Read once, the first time they are asked for.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../../../components/Globe/globeAltitudes';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { GUNMETAL, KIND_COLOURS } from '../../../styles/tokens';

export const PLATES_URL = '/data/quakes/plate-boundaries.json';
export const PLATE_COLOURS = { boundary: GUNMETAL[200], subduction: KIND_COLOURS.hazards } as const;

export interface PlateBoundary {
  name: string;
  plates: [string, string];
  subduction: boolean;
  /** [lng, lat] along it. */
  line: Array<[number, number]>;
}
export interface PlatesFile {
  credit: string;
  boundaries: PlateBoundary[];
}

const GLOBE_RADIUS_UNITS = 100;
const BOUNDARY: LineLook = { opacity: 0.6, linewidth: 1.2, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 112 };
const SUBDUCTION: LineLook = { opacity: 0.85, linewidth: 1.9, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 113 };
const hex = (css: string) => parseInt(css.slice(1), 16);

/** Whether a file is the plates' shape: its boundaries each with a line of two places or more. */
export function isPlatesFile(file: unknown): file is PlatesFile {
  const f = file as PlatesFile | null;
  return !!f && typeof f.credit === 'string' && Array.isArray(f.boundaries)
    && f.boundaries.every((b) => Array.isArray(b?.line) && b.line.length >= 2 && typeof b.subduction === 'boolean');
}

let reading: Promise<PlatesFile | null> | null = null;
/** The boundaries, read once; null when they could not be (asked again next time). */
export function loadPlateBoundaries(fetcher: (url: string) => Promise<Response> = fetch): Promise<PlatesFile | null> {
  reading ??= fetcher(PLATES_URL)
    .then((response) => (response.ok ? response.json() : null))
    .then((file: unknown) => (isPlatesFile(file) ? file : null))
    .catch(() => null)
    .then((file) => {
      if (!file) reading = null;
      return file;
    });
  return reading;
}

/** The boundaries as lines on the ground, the subduction zones in their own batch. */
export function buildPlateBoundaries(file: PlatesFile, options: { type: string }): THREE.Group {
  const radius = GLOBE_RADIUS_UNITS * SURFACE_LINES;
  const group = buildLineBatches(file.boundaries.map((b, i) => {
    const positions: number[] = [];
    for (const [lng, lat] of b.line) {
      const p = latLngToGlobeWorld(lat, lng, radius);
      positions.push(p.x, p.y, p.z);
    }
    return {
      id: `${options.type}:${i}`,
      positions,
      color: hex(b.subduction ? PLATE_COLOURS.subduction : PLATE_COLOURS.boundary),
      look: b.subduction ? SUBDUCTION : BOUNDARY,
      tooltip: `${b.subduction ? 'A subduction zone' : 'A plate boundary'} between the ${b.plates[0]} and ${b.plates[1]} plates (PB2002)`,
    };
  }));
  group.userData = { type: options.type };
  return group;
}

/** Test-only. */
export function resetPlatesForTests(): void {
  reading = null;
}
