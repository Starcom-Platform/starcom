// fatBorderLines.ts — border lines built with THREE's fat-line pipeline
// (LineSegments2/LineMaterial, from three/examples/jsm/lines) instead of
// plain THREE.Line/LineBasicMaterial. Unlike LineBasicMaterial, LineMaterial
// supports both real (screen-space) line width and native dashing —
// GeometryFactory.buildBorderLines produced hairlines regardless of the
// borderThickness config, since WebGL's native line width is effectively
// fixed at 1px on most platforms.
//
// Resolution: LineMaterial needs its `resolution` uniform kept in sync with
// the actual viewport size in pixels or line width renders wrong — no manual
// resize wiring needed for this, though: LineSegments2 implements its own
// onBeforeRender(renderer) hook that reads renderer.getViewport() and updates
// the uniform every frame for every visible instance automatically (see
// node_modules/three/examples/jsm/lines/LineSegments2.js).
import * as THREE from 'three';
import { latLonToVector3 } from '../utils/latLonToVector3';
import { buildLineBatches, type LineLook } from './lineBatches';
import type { LineFeature, BorderBuildOptions } from './geometryFactory';

export type { LineFeature, BorderBuildOptions };

export interface BorderLineStyle {
  color: number;
  look: LineLook;
  classification?: string;
}

/**
 * Projects each feature onto the sphere and draws every feature sharing a look
 * as one batch (lineBatches.ts), rather than a Line2 apiece. `styleOf` decides
 * each feature's colour and look; see materialTheme.ts's resolveBorderMaterialConfig
 * and borderLineLook for the national borders' styling.
 */
export function buildBorderLineBatches<F extends LineFeature>(
  features: F[],
  styleOf: (feature: F) => BorderLineStyle,
  opts: Pick<BorderBuildOptions, 'radius' | 'elevation'> = {},
): THREE.Group {
  const { radius = 100, elevation = 0.2 } = opts;
  return buildLineBatches(features.flatMap((f) => {
    if (!Array.isArray(f.coordinates) || f.coordinates.length < 2) return [];
    const positions: number[] = [];
    f.coordinates.forEach(([lng, lat]) => {
      const v = latLonToVector3(lat, lng, { radius, elevation, invertX: false });
      positions.push(v.x, v.y, -v.z);
    });
    const style = styleOf(f);
    return [{ id: String(f.id), positions, color: style.color, classification: style.classification, look: style.look }];
  }));
}
