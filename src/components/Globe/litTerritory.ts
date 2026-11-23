/**
 * A territory lit as featured (BA3): a faint fill, and an edge three pixels wide in
 * the palette's near-white cyan, where every outline is one pixel of the intel cyan.
 * Cyan both, because featured is selected, and selected is cyan (tokens.ts). Both
 * stand over the cloud shell, which veils what is under it.
 *
 * Shared by the Intel Reports' territories and areas (useGlobeRegionMarks.ts) and the
 * War & Conflict item a card is about (useGlobeWarConflict.ts; theatre-lens.md, TL1),
 * so a featured country looks the same whichever layer features it.
 */
import * as THREE from 'three';
import { GeometryFactory, type LineFeature } from '../../geopolitical/geometry/geometryFactory';
import { buildBorderLineBatches } from '../../geopolitical/geometry/fatBorderLines';
import type { LineLook } from '../../geopolitical/geometry/lineBatches';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import { CYAN } from '../../styles/tokens';
import { CLOUDS, SURFACE_LINES } from './globeAltitudes';

const GLOBE_RADIUS_UNITS = 100;
const toColor = (css: string) => parseInt(css.slice(1), 16);

export const LIT_FILL_COLOR = toColor(CYAN[400]);
export const LIT_FILL_OPACITY = 0.18;
/** Where the war map's fills stand: over the clouds, under the surface lines. */
export const LIT_FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
export const LIT_EDGE_COLOR = toColor(CYAN[100]);
export const LIT_EDGE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
/** Drawn after every border, which stand at 100 and a priority, and before the report glyphs. */
export const LIT_EDGE_LOOK: LineLook = { opacity: 1, linewidth: 3, dashed: false, dashSize: 0, gapSize: 0, dashScale: 1, renderOrder: 120 };

/** Every ring of a territory, at least `fewest` points each, as lines. */
export function ringsOf(geometry: PolygonGeometry, name: string, fewest: number, prefix = ''): LineFeature[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((rings, i) => rings.flatMap((ring, r) => (ring && ring.length >= fewest
    ? [{ id: `${prefix}${name}#${i}${r === 0 ? '' : `/${r}`}`, coordinates: ring }]
    : [])));
}

/**
 * A territory lit: its fill and its edge, each part tagged `lit` as `${tag}-fill` or
 * `${tag}-edge`. `prefix` keeps the ids the caller's own: GeometryFactory caches a
 * fill by id, in the colour it was first built in.
 */
export function litTerritory(geometry: PolygonGeometry, name: string, prefix: string, tag: string): THREE.Group {
  const group = new THREE.Group();
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const fill = GeometryFactory.buildTerritoryPolygons(
    polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 3 ? [{ id: `${prefix}fill:${name}#${i}`, rings: rings as [number, number][][] }] : [])),
    { color: LIT_FILL_COLOR, opacity: LIT_FILL_OPACITY, elevation: LIT_FILL_ELEVATION },
  );
  fill.children.forEach((part) => { part.userData.lit = `${tag}-fill`; });
  const edge = buildBorderLineBatches(ringsOf(geometry, name, 3, `${prefix}edge:`), () => ({ color: LIT_EDGE_COLOR, look: LIT_EDGE_LOOK }), { elevation: LIT_EDGE_ELEVATION });
  edge.children.forEach((batch) => { batch.userData.lit = `${tag}-edge`; });
  group.add(fill, edge);
  return group;
}
