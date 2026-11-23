/**
 * useScreenMarkLayer — a layer of marks drawn at a fixed size on screen.
 *
 * ─── WHY THERE IS A SHARED ONE ─────────────────────────────────────────────
 *
 * react-globe.gl's pointsData is the app's oldest way of putting a mark on the globe,
 * and it sizes a point in fractions of the globe's radius. Measured at the share-card
 * view: the space-weather samples came out about two pixels each, the eco-disaster
 * markers a median of 3 px², and the intel analysis marks — the layer this whole
 * application exists for — are built at 0.15 to 0.5 units, which is about a pixel.
 *
 * Every conversion away from it needs the same four things: a group above the surface
 * layers, points rebuilt when the data changes, the old ones released, and the group
 * registered so a hover can ask a mark what it is. Space weather grew its own copy
 * first; this is that copy, made shared before eco disasters and intel grew two more.
 *
 * What a layer still owns: which marks exist, how big each is in pixels, its colour,
 * and what it says when asked.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import {
  buildScreenPoints, drawAboveSurfaceLayers, disposeScreenPoints,
  type ScreenPointsOptions,
} from '../screenPoints';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend, swatchesFromMarks, cssColorOf } from '../../../services/globe/globeLegendStore';
import { ridesShell } from '../../../globe-engine/shellLift';
import type { GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const GLOBE_RADIUS_UNITS = 100;

/**
 * A colour a layer chose, as a hex number or as the CSS string its own pipeline works in.
 *
 * three.js's Color.set() does NOT throw on a string it cannot read — it warns and leaves
 * the colour untouched — so each string is resolved against a fresh white. A shared
 * instance would quietly hand an unreadable colour the PREVIOUS mark's, which is a wrong
 * reading rather than a visible fallback.
 */
export function resolveMarkColor(color: number | string): number {
  return typeof color === 'number' ? color : new THREE.Color(0xffffff).set(color).getHex();
}

export interface ScreenMark {
  lat: number;
  lng: number;
  /** On-screen diameter in CSS pixels. */
  sizePx: number;
  color: number | string;
  /** What a hover says. A mark that cannot answer is a mark nobody can check. */
  tooltip?: string;
  /** What a click on it opens (critique C5, D-CT): the notes its hover names. */
  opens?: GlobeNoteSet;
  /**
   * What this mark's colour stands for — a hazard type, a severity, a role.
   *
   * The card's legend is built from these, so a category this layer did not draw
   * produces no swatch. A layer that leaves them off gets a legend with no swatches
   * rather than one that guesses.
   */
  category?: string;
}

export interface UseScreenMarkLayerOptions {
  scene: THREE.Scene | null;
  enabled: boolean;
  marks: readonly ScreenMark[];
  /** Which band it belongs in — see globeAltitudes.ts. */
  altitude: number;
  /** Tag for a probe, a test, or the picking code to find this layer by. */
  type: string;
  rim?: ScreenPointsOptions['rim'];
  opacity?: number;
  /**
   * How the marks are drawn — the person's choice for this layer
   * (decision D-F, step 6). Omitted means the disc every layer drew before the
   * choice existed, which is why thirteen of fourteen call sites pass nothing.
   */
  style?: ScreenPointsOptions['style'];
  /** Anything else the layer wants on the object, merged with the tooltips. */
  userData?: Record<string, unknown>;
  /**
   * What this layer's marks mean, for the share card to print beside the image.
   *
   * Published as the marks are drawn and withdrawn when they are cleared, so the
   * legend cannot outlive them — see globeLegendStore.
   */
  legend?: { layerId: string; layer: string; sizeMeans?: string; colorMeans?: string; shapeMeans?: string };
  /** The globe layer it draws, by its id, so a comparison side by side can draw it in one half (D-CM, CM1). */
  compareLayer?: string;
}



export function useScreenMarkLayer({
  scene, enabled, marks, altitude, type, rim = 'dark', opacity = 0.95, style, userData, legend, compareLayer,
}: UseScreenMarkLayerOptions) {
  const groupRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot(compareLayer ?? '', compareLayer ? groupRef.current : null);

  // Hoverable: see useGlobePointTooltips. Registered once for the group's lifetime.
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  useEffect(() => {
    const group = groupRef.current;
    if (!scene) return;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  /*
   * Keyed on CONTENT, not identity. A caller writing `userData={{ samples: n }}` or a
   * legend inline — which is how every layer here reads best — hands this a new object
   * every render, and an effect keyed on the object would drop and rebuild every point
   * on every render of the globe. Five hundred samples, sixty times a second.
   */
  const userDataKey = JSON.stringify(userData ?? null);
  const legendKey = JSON.stringify(legend ?? null);

  useEffect(() => {
    const group = groupRef.current;
    const clear = () => {
      while (group.children.length > 0) {
        const child = group.children[0] as THREE.Points;
        group.remove(child);
        disposeScreenPoints(child);
      }
      if (legend) publishLegend(legend.layerId, null);
    };
    clear();
    if (!enabled || marks.length === 0) return;

    const positioned = marks.map((mark) => ({
      position: latLngToGlobeWorld(mark.lat, mark.lng, GLOBE_RADIUS_UNITS * altitude),
      sizePx: mark.sizePx,
      color: resolveMarkColor(mark.color),
      tooltip: mark.tooltip,
      opens: mark.opens,
    }));

    /*
     * One object per layer, whatever the style.
     *
     * A glow used to draw twice here — an additive bloom, then a disc over it —
     * because a bare bloom measured as very nearly invisible. That pairing lived
     * in this hook, so the ten layers calling buildScreenPoints directly could
     * not offer a glow at all, and the switcher had to filter it out for them.
     * GLOW_QUAD_SCALE moved the pairing into the shader on 2026-09-18: a glowing
     * mark is now one object, every caller gets it, and there is nothing here to
     * special-case.
     */
    const points = buildScreenPoints(positioned, {
      rim,
      opacity,
      style,
      // The layer's own name, for describeView to group the marks by.
      userData: { type, ...(legend ? { layer: legend.layer } : {}), ...userData },
    });
    group.add(points);

    if (legend) {
      publishLegend(legend.layerId, {
        ...legend,
        /*
         * Which shape this layer drew, when a style was chosen for it
         * (decision D-F, step 6.3). Derived here rather than remembered by each
         * caller: the share card prints it, so an image says how its marks were
         * drawn instead of leaving a reader to guess why they are rings.
         */
        ...(style ? { shapeMeans: style } : {}),
        swatches: swatchesFromMarks(marks.map((m) => ({ color: cssColorOf(m.color), category: m.category }))),
      });
    }

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, above
  }, [enabled, marks, altitude, type, rim, opacity, style, userDataKey, legendKey]);

  return { groupRef };
}
