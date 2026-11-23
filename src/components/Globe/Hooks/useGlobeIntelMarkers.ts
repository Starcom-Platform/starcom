import { useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { COUNTRY_MARKS } from '../globeAltitudes';
import { useScreenMarkLayer, type ScreenMark } from './useScreenMarkLayer';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import { globeIntelLayerStore } from '../../../services/intel/globe/globeIntelLayerStore';
import { marksWithinWindow } from '../../../services/intel/globe/globeIntelLayer';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import type { GlobeIntelLayer, GlobeIntelMark } from '../../../services/intel/globe/globeIntelLayer';
import { analysisMarkNoteSet } from '../../../features/globe/noteDetail/analysisMarkNote';
import type { GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';

/**
 * Renders what the correlation engine CONCLUDED, not what was fetched.
 *
 * The globe already draws real planetary data from five open sources and has
 * never shown a single analytical result. This is the return path — the
 * closing of docs/build-order.md's "Global" gap.
 *
 * Subscribes to globeIntelLayerStore rather than a context, because the
 * analyzer and the globe are in different React trees (see that store's note).
 */

export const INTEL_MARKER_TYPE = 'intel-analysis';

export interface IntelGlobeMarker {
  lat: number;
  lng: number;
  /** On-screen diameter in CSS pixels — see intelMarkPx. */
  sizePx: number;
  color: string;
  type: typeof INTEL_MARKER_TYPE;
  label: string;
  markKind: GlobeIntelMark['kind'];
  isMock: boolean;
  /** What a click on it opens: what the analysis concluded there, and how (critique C5). */
  opens?: GlobeNoteSet;
}

export interface IntelGlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  strength: number;
  label: string;
}

/**
 * Contradiction red is deliberately the most saturated colour on the layer.
 * Every intelligence tool foregrounds agreement because agreement demos well;
 * this one foregrounds the claim that does not fit, which is where an
 * analyst's most valuable minute goes.
 */
const CORROBORATION_COLOR = '#41e484';
const CONTRADICTION_COLOR = '#ff3b30';
/** Fabricated data reads as washed-out grey regardless of what it claims. */
const MOCK_COLOR = '#6b7280';

/**
 * A mark's on-screen diameter in CSS pixels, from its derived weight.
 *
 * Weight is derived (source reliability x method x age decay), so visual prominence
 * tracks evidential strength rather than recency or volume — that much is unchanged.
 * What changed is the unit. These were 0.15 to 0.5 FRACTIONS OF THE GLOBE'S RADIUS
 * fed to react-globe.gl's pointRadius, which at the share-card view is about one
 * pixel: the layer this application exists for was the least visible thing on the
 * globe. The floor of 10 px is above the layer audit's 4 px on a card, so a
 * weak-but-real mark is seen and can be disbelieved rather than missed.
 */
export function intelMarkPx(weight: number): number {
  const w = Math.min(1, Math.max(0, Number.isFinite(weight) ? weight : 0));
  return 10 + w * 9;
}

function markerFrom(mark: GlobeIntelMark, layer: GlobeIntelLayer | undefined): IntelGlobeMarker {
  return {
    lat: mark.lat,
    lng: mark.lon,
    sizePx: intelMarkPx(mark.weight),
    color: mark.isMock
      ? MOCK_COLOR
      : mark.kind === 'contradiction' ? CONTRADICTION_COLOR : CORROBORATION_COLOR,
    type: INTEL_MARKER_TYPE,
    label: mark.isMock
      // Never let a fixture read as a finding. The globe is where provenance is
      // easiest to lose: a pin looks equally authoritative either way.
      ? `[MOCK] ${mark.label}`
      : mark.kind === 'contradiction'
        ? `Contradiction: ${mark.label}`
        : `${mark.label} — ${mark.sourceCount} independent sources`,
    markKind: mark.kind,
    isMock: mark.isMock,
    ...(layer ? { opens: analysisMarkNoteSet(mark, layer) } : {}),
  };
}

/**
 * How old an analysis may be before the globe stops presenting it as current.
 *
 * The analyzer and the globe are different applications and cannot be open at
 * once, so every layer the globe shows was computed in a PREVIOUS session.
 * That is normal here, not an error — but it means age is the whole staleness
 * story, and it has to be visible rather than assumed.
 */
export const INTEL_LAYER_STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Past this, the layer is dropped rather than labelled.
 *
 * A conclusion old enough is no longer about the current picture, and a
 * clearly-labelled six-hour-old contradiction is still a contradiction drawn on
 * a globe showing live data. Both thresholds are judgement calls, stated here
 * rather than buried, and both are deliberately generous — losing analysis is
 * also a cost.
 */
export const INTEL_LAYER_EXPIRES_AFTER_MS = 2 * 60 * 60 * 1000;

export interface GlobeIntelMarkersResult {
  markers: IntelGlobeMarker[];
  arcs: IntelGlobeArc[];
  /**
   * Every layer currently shown, one per publishing source.
   *
   * Was a single `layer`. The store held one slot, so a second source would
   * have silently replaced the first — see globeIntelLayerStore. Consumers
   * that need a specific source should look it up by id rather than assuming
   * position.
   */
  layers: GlobeIntelLayer[];
  /** Layers withheld because they were too old to show, with their ages. */
  expiredLayers: Array<{ id: string; ageMs: number }>;
  /** Age of the OLDEST shown layer, or null when nothing is shown. */
  ageMs: number | null;
  /** True when any shown layer is older than INTEL_LAYER_STALE_AFTER_MS. */
  stale: boolean;
  /** True when at least one layer was withheld for age. Distinct from having none. */
  expired: boolean;
  /** Marks hidden because they fall outside the operator's current time window. */
  hiddenByTimeWindow: number;
}

export function useGlobeIntelMarkers(now: () => number = Date.now): GlobeIntelMarkersResult {
  const [layers, setLayers] = useState<GlobeIntelLayer[]>(() => globeIntelLayerStore.get());

  useEffect(() => globeIntelLayerStore.subscribe(setLayers), []);

  /**
   * The operator's time cursor.
   *
   * Analysis has to scrub with everything else. The globe already moves its
   * other layers through time via TemporalContext; a corroboration that stayed
   * pinned while the world around it moved would be asserting it is true at
   * every moment, which is the opposite of what a dated finding means.
   *
   * Optional because the globe also renders in contexts without the HUD
   * provider. No cursor means no filtering — showing everything is the honest
   * default when nobody has expressed a time.
   */
  const temporal = useTemporalStateOptional();
  const timeWindow = temporal?.isLive ? null : temporal?.timeWindow ?? null;

  // Memoised on the layer identity, NOT recomputed per render.
  //
  // Without this the hook returns a fresh `markers` array every render, and
  // Globe.tsx's `useEffect(..., [intelMarkers])` fires on every render to call
  // setGlobeData — which re-renders, which produces another new array. That is
  // an infinite loop, and it did not merely slow the app down: it prevented it
  // from ever finishing loading. Every unit test passed, because none of them
  // rendered the hook inside a component that reacts to its output.
  return useMemo<GlobeIntelMarkersResult>(() => {
    const EMPTY: GlobeIntelMarkersResult = {
      markers: [], arcs: [], layers: [], expiredLayers: [],
      ageMs: null, stale: false, expired: false, hiddenByTimeWindow: 0,
    };
    if (layers.length === 0) return EMPTY;

    const at = now();
    const expiredLayers: Array<{ id: string; ageMs: number }> = [];
    const shown: Array<{ layer: GlobeIntelLayer; ageMs: number }> = [];

    // Age is judged PER LAYER. One stale source must not expire a fresh one,
    // and a fresh one must not vouch for a stale one.
    for (const l of layers) {
      const ageMs = at - new Date(l.provenance.computedAt).getTime();
      if (ageMs > INTEL_LAYER_EXPIRES_AFTER_MS) expiredLayers.push({ id: l.id, ageMs });
      else shown.push({ layer: l, ageMs });
    }

    if (shown.length === 0) {
      // Expired is reported separately from absent. "The analysis I ran is too
      // old to show" and "no analysis has been run" are different facts.
      return { ...EMPTY, layers, expiredLayers, ageMs: Math.min(...expiredLayers.map((e) => e.ageMs)), stale: true, expired: true };
    }

    const ageMs = Math.max(...shown.map((s) => s.ageMs));
    const stale = ageMs > INTEL_LAYER_STALE_AFTER_MS;

    const allMarks = shown.flatMap((s) => s.layer.marks);
    // Each mark's own layer, for the provenance its note states: by the mark itself, so two layers' ids never mix.
    const layerOf = new Map(shown.flatMap((s) => s.layer.marks.map((m) => [m, s.layer] as const)));
    const allLinks = shown.flatMap((s) => s.layer.links);

    // Scrubbed position filters analysis; live mode shows everything.
    const visible = timeWindow ? marksWithinWindow(allMarks, timeWindow) : allMarks;
    const hiddenByTimeWindow = allMarks.length - visible.length;

    const byId = new Map(visible.map(m => [m.id, m]));

    const arcs: IntelGlobeArc[] = [];
    for (const link of allLinks) {
      const a = byId.get(link.markIdA);
      const b = byId.get(link.markIdB);
      if (!a || !b) continue;
      arcs.push({
        startLat: a.lat, startLng: a.lon,
        endLat: b.lat, endLng: b.lon,
        color: [CONTRADICTION_COLOR, CONTRADICTION_COLOR],
        strength: link.strength,
        label: `${link.distanceKm} km apart — ${a.label}`,
      });
    }

    const oldest = shown.reduce((w, s) => (s.ageMs > w.ageMs ? s : w), shown[0]);
    const asOf = new Date(oldest.layer.provenance.computedAt).toISOString().slice(11, 16);
    const markers = visible.map((mark) => markerFrom(mark, layerOf.get(mark))).map(m => (
      stale ? { ...m, label: `${m.label} (as of ${asOf} UTC)` } : m
    ));

    return {
      markers, arcs,
      layers: shown.map((s) => s.layer),
      expiredLayers, ageMs, stale, expired: expiredLayers.length > 0,
      hiddenByTimeWindow,
    };
    // `now` is a test seam and intentionally not a dependency: including it
    // would defeat the memo for the default Date.now identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, timeWindow]);
}

/**
 * Draw the analysis layer's marks, or withhold them.
 *
 * Gated on the SAME layer as intel reports. Analysis of intel belongs where intel is
 * shown: ungated, corroboration and contradiction marks render on top of Space Weather
 * or submarine cables, where they read as part of THAT layer — a correlation finding
 * indistinguishable from a geomagnetic reading. The report path has always checked
 * isLayerActive('IntelReports'); this one never did. That was live, not dormant: the
 * analysis layer is on unless VITE_GLOBE_INTEL_LAYER=false (config/env.ts).
 *
 * When inactive the marks are CLEARED, not merely skipped. Skipping would leave a
 * previous layer's conclusions on a globe that has since switched to showing space
 * weather, where they read as part of that layer.
 *
 * A hook rather than something inline in Globe.tsx because nothing renders Globe.tsx —
 * its only non-test importer is CyberCommandCenterManager — so a gate left there
 * cannot be verified at all.
 */
export function useGlobeIntelMarkPoints({ scene, markers, layerActive, markerStyles }: {
  scene: THREE.Scene | null;
  markers: readonly IntelGlobeMarker[];
  layerActive: boolean;
  /** How the person chose to draw this layer (decision D-F, step 6). */
  markerStyles?: MarkerStyleChoices;
}) {
  const marks = useMemo<ScreenMark[]>(() => markers.map((m) => ({
    lat: m.lat, lng: m.lng, sizePx: m.sizePx, color: m.color, tooltip: m.label, opens: m.opens,
    // What the colour stands for, for the card's legend. A fixture says so first:
    // washed-out grey is the one distinction a reader must not have to infer.
    category: m.isMock ? 'fabricated (fixture)' : m.markKind,
  })), [markers]);

  return useScreenMarkLayer({
    compareLayer: 'IntelReports',
    scene,
    enabled: layerActive,
    marks,
    // A conclusion about a place, drawn above the marks it was drawn from.
    altitude: COUNTRY_MARKS,
    type: INTEL_MARKER_TYPE,
    rim: 'dark',
    style: resolveMarkerStyle(markerStyles, 'IntelReports'),
    legend: {
      layerId: 'IntelReports',
      layer: 'Analysis',
      sizeMeans: 'derived weight — source reliability, method, age',
      colorMeans: 'what the analysis found',
    },
  });
}
