/**
 * Eco Disasters as the kind marks every point layer draws (critique-2026-11-01, O7, OR2, OR3, OR29; plan B2): each
 * event its hazard's icon, in the hazards colour, brighter the more severe; Icon, Pin (Earthquake3D's look, the
 * default), Spike (height by magnitude, or a fire's acres) or Dot. A quake's depth, when drawn, is a thin line from
 * its place down to where it began (quakeDepthLines.ts).
 */
import type { KindMarkItem } from './kindMarks';
import type { GlobeNoteSet } from '../noteDetail/globeNoteStore';

/** Each hazard type's kind in the lexicon (kindLexicon.ts); one with no kind of its own is drawn as a report. */
export const ECO_HAZARD_KIND: Readonly<Record<string, string>> = {
  earthquake: 'earth:geo:earthquake',
  volcano: 'earth:geo:volcano',
  wildfire: 'earth:fire:wildfire',
  flood: 'earth:weather:flood',
  drought: 'earth:weather:drought',
  hurricane: 'earth:weather:cyclone',
  cyclone: 'earth:weather:cyclone',
  storm: 'earth:weather:storm',
  landslide: 'earth:geo:landslide',
  tsunami: 'earth:geo:tsunami',
};

/** How severe, 0 to 1, from the bucket the feeds' severity was sorted into (useGeoEvents classifySeverity). */
export const SEVERITY_OF_BUCKET: Readonly<Record<string, number>> = { minor: 0.35, major: 0.7, catastrophic: 1 };

export interface EcoKindInput {
  id: string;
  lat: number;
  lng: number;
  hazardType: string;
  /** A quake's magnitude; for a fire, its burned acres stand in (the formatters' size for fires). */
  magnitude?: number | null;
  acres?: number | null;
  severityBucket?: string | null;
  /** ISO time, as the feed states it. */
  timestamp?: string | null;
  tsunami?: boolean;
  tooltip?: string;
  opens?: GlobeNoteSet;
  /** A USGS quake's detail, where it has a ShakeMap (D-EQ, EQ11). */
  shakeMapDetailUrl?: string;
  /** NOAA's atlas record of a significant quake (D-EQ, EQ16). */
  atlas?: { deaths: number | null; deathsOrder: number | null; tsunami: boolean };
}

export function ecoKindItems(events: readonly EcoKindInput[]): KindMarkItem[] {
  return events.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)).map((e) => {
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    return {
      id: e.id,
      lat: e.lat,
      lng: e.lng,
      // A quake that raised a tsunami flag is drawn as the tsunami it warned of.
      kind: e.tsunami ? ECO_HAZARD_KIND.tsunami : ECO_HAZARD_KIND[e.hazardType] ?? 'earth:geo:earthquake',
      magnitude: e.hazardType === 'wildfire' ? e.acres ?? undefined : e.magnitude ?? undefined,
      severity: SEVERITY_OF_BUCKET[e.severityBucket ?? 'minor'] ?? 0.35,
      tooltip: e.tooltip,
      opens: e.opens ?? null,
      timeMs: Number.isFinite(t) ? t : null,
    };
  });
}
