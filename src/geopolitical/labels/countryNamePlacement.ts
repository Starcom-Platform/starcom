/**
 * Which country names are drawn, and where (decision K5, step 4: TS11, TS13).
 *
 * ─── HOW FAR IN THE CAMERA IS ──────────────────────────────────────────────
 *
 * Natural Earth gives each country the web-map zoom it is first labelled at
 * (MIN_LABEL). The globe's own zoom is read the way a web map's is: the scale of
 * the map at the middle of the view, in px per radian of the Earth, as
 * `log2(2π · pxPerRad / 256)`. At the default view (altitude 2.5, a 900 px tall
 * canvas) that is 3.24, inside the flat stretch where Natural Earth's own choice
 * names 106 countries worldwide; the disc's radius would read 2.82, just under
 * the step from 52 to 106 at 3.0.
 *
 * ─── HOW MANY ──────────────────────────────────────────────────────────────
 *
 * The label slider moves Natural Earth's thresholds, not size or opacity: 60, its
 * default, is Natural Earth's own choice; 0 shows none; less brings each name in
 * later, more earlier. Collision has the last word, so names never overlap.
 * Natural Earth's MAX_LABEL, where a name gives way to its provinces', is not
 * applied while there are no province names (TS13).
 *
 * ─── IN WHAT ORDER ─────────────────────────────────────────────────────────
 *
 * On screen, the selected country first and the hovered one next; then by label
 * rank, a name already shown counting half a rank stronger, so it holds its place
 * against its equals but never against a larger country; then by the zoom it
 * labels at; then by code, so the same view always makes the same picture. A card
 * ignores the screen's selection, hover and memory.
 */
import { placeNamesIn, type PlacedName, type ScreenBox } from '../../globe-engine/placeNames';
import type { TerritoryLabel } from '../theme/territoryLabels';
import { NAME_LINE_HEIGHT, tierOf } from './countryNameLook';

export const NAME_PAD_PX = 3;
export const NAME_MARGIN_PX = 4;
export const NAME_CAP = 120;
/** A name shown stays until the view is this far below its threshold (screen only). */
export const NAME_HYSTERESIS = 0.15;
/** Never placed facing the camera less than this; whole from FACING_WHOLE. */
export const FACING_MIN = 0.15;
export const FACING_WHOLE = 0.35;
/** A name shown at the last placement counts this much stronger, within its rank. */
export const INCUMBENT_BONUS = 0.5;
/** Cards and clips never read the screen's slider: Natural Earth's own choice. */
export const CARD_LABEL_VISIBILITY = 60;

/** The map's scale at the middle of the view, in px per radian of a sphere `radius` across. */
export function pxPerRadFrom(projectionYScale: number, heightPx: number, distance: number, radius = 100): number {
  if (distance <= radius) return Infinity;
  return (projectionYScale * heightPx / 2) * (radius / (distance - radius));
}

/** A web map's zoom for that scale. */
export function nameZoom(pxPerRad: number): number {
  return Math.log2((2 * Math.PI * pxPerRad) / 256);
}

/** How far the slider moves Natural Earth's thresholds, or null when it shows no names. */
export function nameZoomBias(visibility: number): number | null {
  if (!(visibility > 0)) return null;
  return visibility < 60 ? (visibility - 60) / 40 : (visibility - 60) / 20;
}

/** Whether a name is due at this zoom: by Natural Earth's threshold, held a little longer once shown. */
export function nameDue(label: Pick<TerritoryLabel, 'minZoom'>, zoom: number, bias: number, wasShown = false): boolean {
  return zoom + bias >= label.minZoom - (wasShown ? NAME_HYSTERESIS : 0);
}

/** How squarely a point on the globe faces the camera: 1 straight on, 0 at the limb. */
export function nameFacing(anchor: { x: number; y: number; z: number }, camera: { x: number; y: number; z: number }): number {
  const n = Math.hypot(anchor.x, anchor.y, anchor.z) || 1;
  const tx = camera.x - anchor.x;
  const ty = camera.y - anchor.y;
  const tz = camera.z - anchor.z;
  const t = Math.hypot(tx, ty, tz) || 1;
  return (anchor.x * tx + anchor.y * ty + anchor.z * tz) / (n * t);
}

/** A name's opacity by how squarely it faces the camera. */
export function facingOpacity(facing: number): number {
  if (facing <= FACING_MIN) return 0;
  if (facing >= FACING_WHOLE) return 1;
  const t = (facing - FACING_MIN) / (FACING_WHOLE - FACING_MIN);
  return t * t * (3 - 2 * t);
}

export interface NameCandidate {
  label: TerritoryLabel;
  /** The anchor on screen, px. */
  x: number;
  y: number;
  /** The name's measured box size, px. */
  width: number;
  height: number;
}

export interface PlacementInput {
  viewport: { width: number; height: number };
  hard?: readonly ScreenBox[];
  soft?: readonly ScreenBox[];
  /** On screen only: what to favour. A card passes none. */
  previous?: ReadonlySet<string>;
  selected?: string | null;
  hovered?: string | null;
}

/** The placing order: selected, hovered, then rank (a name shown holding within its rank), zoom, code. */
export function orderNames<T extends { label: TerritoryLabel }>(candidates: readonly T[], input: Pick<PlacementInput, 'previous' | 'selected' | 'hovered'> = {}): T[] {
  const first = (c: T) => (c.label.code === input.selected ? 0 : c.label.code === input.hovered ? 1 : 2);
  const strength = (c: T) => c.label.rank - (input.previous?.has(c.label.code) ? INCUMBENT_BONUS : 0);
  return [...candidates].sort((a, b) =>
    first(a) - first(b)
    || strength(a) - strength(b)
    || a.label.minZoom - b.label.minZoom
    || (a.label.code < b.label.code ? -1 : a.label.code > b.label.code ? 1 : 0));
}

/** Places the candidates: centred on their anchors, a line up or down to clear a mark, never over another. */
export function placeCountryNames(candidates: readonly NameCandidate[], input: PlacementInput): PlacedName[] {
  const ordered = orderNames(candidates, input);
  return placeNamesIn(
    ordered.map((c) => {
      const line = tierOf(c.label.rank).sizePx * NAME_LINE_HEIGHT;
      return {
        id: c.label.code,
        box: { x: c.x - c.width / 2, y: c.y - c.height / 2, width: c.width, height: c.height },
        /*
         * A line either way, and no further. Two lines (tried 2026-10-08) named France and
         * Germany beside Germany's 35 px report glyph at the default view, but stood GERMANY
         * over the North Sea and FRANCE over the Alps, and took the United Kingdom's, Spain's
         * and Italy's names with them. A name over the wrong country misleads; one that waits
         * for a closer view does not.
         */
        shifts: [0, -line, line],
      };
    }),
    {
      pad: NAME_PAD_PX,
      margin: NAME_MARGIN_PX,
      viewport: input.viewport,
      cap: NAME_CAP,
      hard: input.hard,
      soft: input.soft,
      softTolerance: 2,
    },
  );
}
