/**
 * The shapes intel reports were published as, drawn on the globe.
 *
 * A report whose source was a line or a polygon has been reduced to one pin
 * since the globe first drew intel; D-F 17 fixed WHERE that pin sits, and the
 * shape was still discarded. It is now kept as a bounded outline on the report
 * (see boundedOutline) and this draws it.
 *
 * ─── IT DOES NOT REPLACE THE PIN ───────────────────────────────────────────
 *
 * The pin stays. It is what places the report, what the time window filters,
 * what a click selects and what every other surface reads. The outline is drawn
 * beside it and means something narrower: this is the shape the publisher sent,
 * as far as it was kept.
 *
 * ─── CONVENTION ────────────────────────────────────────────────────────────
 *
 * Own THREE.Group, scene.add/remove, dispose on cleanup, and geometry built by
 * GeometryFactory — the same arrangement useGlobeGdacsGeometry documents and
 * every geometry layer in this build uses, rather than react-globe.gl's native
 * polygonsData/pathsData. The factory matters for more than consistency here:
 * it splits at the dateline, and a shape crossing the antimeridian drawn
 * naively wraps the wrong way round the planet.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { GeometryFactory } from '../../../geopolitical/geometry/geometryFactory';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { outlineLineFeatures } from '../../../services/intel/globe/outlineFeatures';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

/**
 * What this layer costs, reported where every other geometry layer reports it.
 *
 * Omitted in the first version, which claimed to follow useGlobeGdacsGeometry's
 * convention and then left out half of it. It matters more here than the shape
 * of the comment: the ingest holds up to 200 reports and every one of them may
 * carry an outline, so this is the intel layer's largest geometry contribution
 * and the monitor is where anyone would look for it.
 */
const MODE_KEY = 'CyberCommand.IntelReports' as const;

/**
 * The stack, from the base map up: borders 0.2, subject territories 0.3, a
 * report's own shape above both.
 *
 * A report's own shape is the most specific mark here, so it goes on top: a
 * district inside a highlighted country must not be hidden by the country.
 *
 * These were 0.12 and 0.7 — below the borders, and fainter — and were raised
 * while hunting an outline that could not be found on the globe. That hunt had
 * the wrong suspect: the shape was not buried, it was 90° of longitude away
 * (see makeOutlineGroup). The values are kept because the stack above is the
 * right order on its own merits, not because they fixed anything.
 */
const OUTLINE_ELEVATION = 0.34;
/** The intel layer's own colour, so the outline reads as belonging to its pin. */
const OUTLINE_COLOR = 0x00d8ff;
const OUTLINE_OPACITY = 0.9;

/**
 * The turn that puts the shape where the report is.
 *
 * GeometryFactory builds in the globe MESH's frame (prime meridian on +x); a
 * group added to the scene is in the scene's frame (prime meridian on +z).
 * three-globe turns its globe -90° about y between the two, so a layer that
 * skips this draws every shape 90° of longitude away — see the two-frames note
 * in utils/globeCoordinates.ts, which exists because seven layers once did
 * exactly that and put the Caribbean's cables across the Sahara.
 *
 * This layer skipped it. The outline was built correctly, added to the scene,
 * visible, unculled and off the coast of Somalia, and every check that did not
 * look at the globe agreed it was fine.
 */
function makeOutlineGroup(): THREE.Group {
  const group = ridesShell(new THREE.Group());
  group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
  return group;
}

export function useGlobeIntelOutlines(
  globeRef: React.MutableRefObject<GlobeMethods | undefined>,
  markers: readonly IntelReportOverlayMarker[],
  visible: boolean,
): void {
  const groupRef = useRef<THREE.Group>(makeOutlineGroup());

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('IntelReports', groupRef.current);
  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    const clearGroup = () => {
      group.traverse((obj) => {
        const drawn = obj as THREE.Mesh | THREE.Line;
        if ((drawn as THREE.Mesh).isMesh || (drawn as THREE.Line).isLine) {
          drawn.geometry?.dispose();
          const material = drawn.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      group.clear();
    };

    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
      visualizationResourceMonitor.clearMode(MODE_KEY);
    };

    if (!visible) {
      teardown();
      return;
    }

    const features = outlineLineFeatures(markers);
    if (features.length === 0) {
      // Nothing to draw is not the same as the layer being off: the group stays
      // attached and empty, so a report arriving with a shape does not have to
      // wait for a mode change to appear.
      clearGroup();
      if (!scene.children.includes(group)) scene.add(group);
      return;
    }

    clearGroup();
    if (!scene.children.includes(group)) scene.add(group);

    const built = GeometryFactory.buildBorderLines(features, {
      elevation: OUTLINE_ELEVATION,
      color: OUTLINE_COLOR,
      opacity: OUTLINE_OPACITY,
    });
    group.add(built);
    visualizationResourceMonitor.recordGeometry(MODE_KEY, collectGeometryStats(group));

    return () => {
      teardown();
    };
  }, [globeRef, markers, visible]);
}
