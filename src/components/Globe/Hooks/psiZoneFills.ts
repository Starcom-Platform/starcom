/**
 * Psi Watch's Zones filled by a measure (decision D-PW, PW54, PW70): an Echo's counts, the Finder's resonance. Each
 * Zone in the ground's violet at its own strength, a little over the countries' own fills, which sit at the lit
 * height and pull themselves forward, so it is not lost under them. GeometryFactory hands back its cached material,
 * first built for another strength: each fill takes its own copy, its colour and strength set here every time.
 */
import * as THREE from 'three';
import { GeometryFactory } from '../../../geopolitical/geometry/geometryFactory';
import { LIT_FILL_ELEVATION } from '../litTerritory';
import { DATA_SCALES } from '../../../styles/tokens';
import type { AreaShapes } from '../../../features/globe/areas/areaShapes';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';

export const PSI_ELEVATION = LIT_FILL_ELEVATION + 0.15;
const GROUND = new THREE.Color(DATA_SCALES.psiGround);

const polygonsOf = (geometry: PolygonGeometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

export interface ZoneFill { code: string; opacity: number; tooltip: string }

/** The Zones filled, each its mesh tagged with `tag` for whoever clears them. */
export function psiZoneFills(shapes: AreaShapes, fills: readonly ZoneFill[], tag: string): THREE.Group {
  const group = new THREE.Group();
  for (const { code, opacity, tooltip } of fills) {
    const outline = shapes.get(code);
    if (!outline) continue;
    const built = GeometryFactory.buildTerritoryPolygons(
      polygonsOf(outline.geometry).flatMap((rings, i) => (rings[0] && rings[0].length >= 3 ? [{ id: `${tag}:${code}#${i}`, rings: rings as [number, number][][] }] : [])),
      { color: GROUND.getHex(), opacity, elevation: PSI_ELEVATION, polygonOffsetFactor: -3, polygonOffsetUnits: -3 },
    );
    built.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as THREE.MeshBasicMaterial).clone();
      material.color.copy(GROUND);
      material.opacity = opacity;
      material.transparent = true;
      mesh.material = material;
      mesh.renderOrder = 115;
      mesh.userData = { ...mesh.userData, [tag]: code, tooltip };
    });
    group.add(built);
  }
  return group;
}
