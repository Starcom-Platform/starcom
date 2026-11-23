/**
 * useGlobeEcoDisasterMarks — earthquakes, wildfires, floods and the rest, as marks a
 * person can see.
 *
 * ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
 *
 * These went into react-globe.gl's shared pointsData, sized by pointRadius in
 * fractions of the globe's radius. Measured at the view the share-card audit uses,
 * the markers came out at a median of 3 px² each — a mark about two pixels across
 * for a magnitude-7 earthquake — and they were drawn in a group the country fills
 * painted over. Points of a fixed on-screen size instead (screenPoints.ts).
 *
 * What each event MEANS is unchanged and still lives in EcoNatural/formatters.ts:
 * severity buckets, real wildfire acreage, the hazard-type colours, the labels. Only
 * the unit the size is expressed in changes — see ecoMarkPx.
 *
 * The impact/tsunami/shockwave rings stay on react-globe.gl's ringsData: a ring that
 * propagates outward over the surface is a different kind of drawing from a mark, and
 * nothing was wrong with how they read.
 */
import { useMemo } from 'react';
import type * as THREE from 'three';
import { SURFACE_MARKS } from '../globeAltitudes';
import { useScreenMarkLayer, type ScreenMark } from './useScreenMarkLayer';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import type { GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';

/** What this layer's marks are tagged with, for a test or a probe to find them. */
export const ECO_DISASTER_MARKS_TYPE = 'ecoDisasterMarks';

const ECO_MARK_FLOOR_PX = 8;
const ECO_MARK_CAP_PX = 20;
/** Pixels per unit of the old radius fraction. */
const ECO_MARK_PX_PER_UNIT = 10;
/** The smallest size the formatters produce (MIN_WILDFIRE_SIZE), where the floor sits. */
const ECO_SMALLEST_SIZE = 0.3;

/**
 * An event's on-screen diameter in CSS pixels, from the size its hazard type already
 * decided (sizeForSeverity, or real acreage for a wildfire — EcoNatural/formatters.ts).
 *
 * Converting rather than re-deciding: those functions are where the judgement about
 * what makes one event bigger than another lives, and it stays in one place. This is
 * only the unit change, anchored so the smallest event the formatters can produce
 * lands on a floor a share card can still show (8 px is about 7 at the card's scale,
 * over the layer audit's 4 px), and so the largest cannot blot out a continent.
 */
export function ecoMarkPx(size: number): number {
  const s = Number.isFinite(size) ? size : ECO_SMALLEST_SIZE;
  const px = ECO_MARK_FLOOR_PX + (s - ECO_SMALLEST_SIZE) * ECO_MARK_PX_PER_UNIT;
  return Math.max(ECO_MARK_FLOOR_PX, Math.min(ECO_MARK_CAP_PX, px));
}

export interface EcoDisasterMarkInput {
  lat: number;
  lng: number;
  /** The formatters' radius fraction — converted by ecoMarkPx, not used directly. */
  size: number;
  color: string;
  tooltip?: string;
  label?: string;
  /** What this event's colour stands for, under whichever colour mode is on. */
  category?: string;
  /** What a click on it opens: the event as its feed states it, and its page (critique C5). */
  opens?: GlobeNoteSet;
  /** For the kind marks (useGlobeEcoKindMarks; plan B2): the event's id, hazard, magnitude, severity, time and depth. */
  id?: string;
  hazardType?: string;
  magnitude?: number | null;
  /** A wildfire's burned acres, as the feed states them. */
  acres?: number | null;
  severityBucket?: string | null;
  timestamp?: string | null;
  tsunami?: boolean;
  depthKm?: number | null;
  /** A USGS quake's detail, where it has a ShakeMap (D-EQ, EQ11). */
  shakeMapDetailUrl?: string;
  /** NOAA's atlas record of a significant quake (D-EQ, EQ16). */
  atlas?: { deaths: number | null; deathsOrder: number | null; tsunami: boolean };
}

export function useGlobeEcoDisasterMarks({ scene, enabled, events, colorMeans, markerStyles }: {
  scene: THREE.Scene | null;
  enabled: boolean;
  events: readonly EcoDisasterMarkInput[];
  /**
   * What colour means right now — the operator chooses between severity and hazard
   * type, so the card cannot state this from a constant. It comes from the same
   * setting that picked the colours.
   */
  colorMeans: string;
  /** How the person chose to draw this layer (decision D-F, step 6.3). */
  markerStyles?: MarkerStyleChoices;
}) {
  const marks = useMemo<ScreenMark[]>(() => events.map((event) => ({
    lat: event.lat,
    lng: event.lng,
    sizePx: ecoMarkPx(event.size),
    color: event.color,
    // The label these carried as react-globe.gl points: pointLabel gave a hover for
    // free, and a mark that cannot say what it is is a mark nobody can check.
    tooltip: event.tooltip ?? event.label,
    category: event.category,
    opens: event.opens,
  })), [events]);

  return useScreenMarkLayer({
    compareLayer: 'EcologicalDisasters',
    scene,
    enabled,
    marks,
    // Each one is a point of its own place, not a stand-in for a country.
    altitude: SURFACE_MARKS,
    type: ECO_DISASTER_MARKS_TYPE,
    rim: 'dark',
    style: resolveMarkerStyle(markerStyles, 'EcologicalDisasters'),
    userData: { events: events.length },
    legend: {
      layerId: 'EcologicalDisasters',
      layer: 'Eco Disasters',
      sizeMeans: 'severity (wildfires: burned acreage)',
      colorMeans,
    },
  });
}
