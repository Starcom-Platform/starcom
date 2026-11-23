import type { LineLook } from '../geometry/lineBatches';
// Corrected path to GeoPoliticalConfig
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';

export interface BorderMaterialParams {
  color: number;
  opacity: number;
  thickness: number; // now a real screen-space pixel width — see borderLineLook
  classification?: BorderClassification;
  // disputed/line_of_control borders render dashed — the standard cartographic
  // signal for "provisional" — everything else solid. Sizes are in screen-space
  // pixels (LineMaterial's default; worldUnits is left false).
  dashed: boolean;
  dashSize: number;
  gapSize: number;
  dashScale: number;
}

// Classification enum for boundary styling
export type BorderClassification = 'international' | 'disputed' | 'line_of_control' | 'indefinite' | 'unknown' | 'maritime_eez' | 'maritime_overlap';

/*
 * ─── A BORDER'S COLOUR MEANS WHAT KIND OF BOUNDARY IT IS (D-F, 2026-09-19) ─
 *
 * Until this date an international border, and every country fill, was
 * coloured by `schemeColor(scheme, id)`: a hash of the id into one of four
 * palettes a person picked in the settings as "Default", "Political",
 * "Economic" or "Population". The names promised the colours encoded those
 * things. They encoded nothing — "Population" was four reds assigned by hashing
 * each country's id, with no population in it.
 *
 * And two palettes held a provisional colour. Measured off the live scene, 104
 * of 331 international borders were drawn in the line-of-control amber on the
 * default scheme and 89 of 331 in the disputed red on the political one:
 * settled borders drawn in the colours this map uses for contested ones. The
 * dash was left as the only thing telling them apart, and at the default
 * altitude a border was a line about a pixel wide under the fills, where no
 * dash is legible. The overlay is on by default, so that was the first visit.
 *
 * So the hash is gone, and with it the scheme setting it was the only reader
 * of. A border is coloured by its classification alone, every classification
 * has a colour no other uses, the two provisional colours are reserved for
 * provisional borders, and the fills are one quiet tone. After this, every
 * colour on the base map means something.
 */

/** The boundaries whose status is contested or not settled: drawn dashed, and heavier. */
export const PROVISIONAL_CLASSIFICATIONS: ReadonlySet<BorderClassification> = new Set(['disputed', 'line_of_control']);

export function isProvisional(classification: BorderClassification): boolean {
  return PROVISIONAL_CLASSIFICATIONS.has(classification);
}

/**
 * How much heavier a provisional border is drawn than a settled one.
 *
 * A dash on a line about a pixel wide is not legible under the fills, and the
 * dash is what separates contested from settled once colour has been checked.
 * A multiplier rather than a fixed width, so the thickness setting still moves
 * every border together.
 */
const PROVISIONAL_WEIGHT = 2;

/**
 * The fill every country is drawn in: one quiet tone.
 *
 * The fills are the largest colour on the globe and they encode nothing — a
 * country is a country. A single dark, desaturated tone reads as the base map
 * and recedes behind the data layers, which are the saturated colours a reader
 * is meant to be looking at. It is deliberately none of the provisional colours
 * (materialTheme.test.ts pins that).
 */
export const TERRITORY_FILL_COLOR = 0x2b4257;

/**
 * One colour per kind of boundary, and no two kinds share one
 * (materialTheme.test.ts). Exported because the legend reads it: the key names
 * these colours from the same record the borders are drawn from.
 *
 * International was vivid green, and the fill hash put amber and red beside it.
 * It is now a pale cool neutral: 91% of all borders are international, so it
 * is the baseline and should be the quietest line on the map.
 */
export const BORDER_CLASS_COLORS: Readonly<Record<BorderClassification, number>> = {
  international: 0xc9d4e3,     // pale cool neutral — the settled baseline
  disputed: 0xff5555,          // red — reserved for provisional borders
  line_of_control: 0xffcc00,   // amber — reserved for provisional borders
  indefinite: 0x888888,        // mid grey
  unknown: 0x555555,           // dark grey
  maritime_eez: 0x0094ff,      // blue
  maritime_overlap: 0xff8800   // orange
};

export function resolveBorderMaterialConfig(
  cfg: GeoPoliticalConfig['nationalTerritories'],
  featureId: string,
  classification: BorderClassification = 'international'
): BorderMaterialParams {
  // featureId no longer picks a colour — see the note above PROVISIONAL_CLASSIFICATIONS.
  void featureId;
  const provisional = isProvisional(classification);
  return {
    color: BORDER_CLASS_COLORS[classification],
    // Provisional borders slightly more opaque, as well as heavier, to stand out.
    opacity: Math.min(1, cfg.borderVisibility / 100 + (provisional ? 0.1 : 0)),
    thickness: cfg.borderThickness * (provisional ? PROVISIONAL_WEIGHT : 1),
    classification,
    dashed: provisional,
    dashSize: 3,
    gapSize: 2,
    dashScale: 1
  };
}

export type BakedPartQaStatus = 'pass' | 'warn' | 'fail';

// Dev-only QA-honesty overlay color (behind ?geoQaOverlay=1) — tints a baked
// territory's fill by its own baked qa.status, so a triangulation-quality
// regression (the kind that took direct code reading to find, before this
// session's constrained-Delaunay fixes) is visible in the running app instead
// of only discoverable by re-running npm run geo:qa or reading source.
export function qaStatusTintColor(status: BakedPartQaStatus | undefined): number | null {
  if (status === 'fail') return 0xff2222;
  if (status === 'warn') return 0xffcc00;
  return null;
}

/**
 * The look a border is drawn with, so borders sharing one share a batch
 * (geometry/lineBatches.ts). The draw order is left to the caller, written beside this
 * as `renderOrder: N`: that is the shape the screen-point markers' order check reads
 * from source (components/Globe/__tests__/screenPoints.test.ts).
 */
export function borderLineLook(params: BorderMaterialParams): Omit<LineLook, 'renderOrder'> {
  return {
    opacity: params.opacity,
    linewidth: Math.max(1, params.thickness),
    dashed: params.dashed,
    dashSize: params.dashSize,
    gapSize: params.gapSize,
    dashScale: params.dashScale
  };
}
