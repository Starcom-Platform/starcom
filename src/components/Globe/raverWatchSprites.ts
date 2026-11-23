/**
 * Raver Watch's marks (globe record, section 19, Phase 1 step 3).
 *
 * One atlas of nine glyphs in three rows, a row per level, drawn through the
 * same sprite builder as Intel Reports (buildGlyphSprites): one object for
 * every mark, a fixed size on screen, a hover, and an opacity per mark, which
 * is what fades an item as its end nears (RW6).
 *
 * ─── WHAT EACH CHANNEL SAYS ────────────────────────────────────────────────
 *
 * The level is the backing: red a glow, amber a ring, info a disc. So a level
 * never rests on colour alone, which fails somewhere between bright land and a
 * night terminator. The colour agrees with it: red and amber as the level
 * names them, the red Intel Reports uses for critical, which is the same
 * meaning; and for info the mode's own violet, which nothing else on the globe
 * uses. The glyph is what the item is: the lab's flask for a drug-check alert,
 * and an incident's category. It is drawn light with a dark outline, so it
 * reads over any backing.
 *
 * The glyphs are Lucide's, on its 24-unit grid (ISC licence; Copyright (c)
 * Lucide Contributors 2022, portions Cole Bemis 2013-2022 as part of Feather,
 * MIT). They are written out here rather than imported, because the atlas is
 * baked from SVG strings through an Image under the CSP, which admits `data:`.
 */
import type * as THREE from 'three';
import type { MarkerStyle } from './markerStyles';
import { RAVER_WATCH_VIOLET } from './raverWatchColor';
import { bakeSvgAtlas, type GlyphSpriteLayout, type GlyphSpriteMark } from './intelReportSprites';
// The size an Intel Report's glyph is drawn at, so the two kinds of mark read as one family.
import { REPORT_SPRITE_PX } from './Hooks/useGlobeIntelSprites';
import type { RaverWatchItem, RaverWatchLevel } from '../../services/raverWatch/raverWatch';
import {
  RAVER_WATCH_GLYPHS, fadeAt, glyphOf, levelOf, notBegunAt, type RaverWatchGlyph, type RaverWatchMoment,
} from '../../services/raverWatch/raverWatchView';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const RAVER_WATCH_SPRITE_TYPE = 'raverWatchSprites';

/** Every level, in the order of the atlas's rows. */
export const RAVER_WATCH_LEVELS: readonly RaverWatchLevel[] = ['red', 'amber', 'info'];

/** How each level is drawn, and what the key says of it. */
export const RAVER_WATCH_LEVEL_LOOK: Record<RaverWatchLevel, { color: string; backing: MarkerStyle; motion: number; means: string }> = {
  // The one level that moves: a globe where every mark moves is one where movement says nothing.
  red: { color: '#ff4d4f', backing: 'glow', motion: 0.6, means: 'level red (a glow)' },
  amber: { color: '#ffb02e', backing: 'ring', motion: 0, means: 'level amber (a ring)' },
  info: { color: RAVER_WATCH_VIOLET, backing: 'disc', motion: 0, means: 'information (a disc)' },
};

/**
 * The colour a region an item applies to is outlined in, whatever its level.
 * Red and amber lines along borders already mean a provisional border (globe
 * record, section 8), so an alert's country in red would read as a disputed
 * one. The mode's own violet, which nothing else on the globe uses, cannot.
 */
export const RAVER_WATCH_REGION_COLOR = RAVER_WATCH_VIOLET;

/** What each glyph is, in the key's words. */
export const RAVER_WATCH_GLYPH_MEANING: Record<RaverWatchGlyph, string> = {
  alert: 'a drug-check alert',
  drugs: 'drugs',
  heat: 'heat',
  crowd: 'crowd',
  violence: 'spiking or violence',
  closure: 'a closure',
  incident: 'another incident',
  event: 'a scene event, at its town or a public venue',
  cancelled: 'a scene event called off, kept until its end',
};

export const RAVER_WATCH_LAYOUT: GlyphSpriteLayout = {
  cellCount: RAVER_WATCH_GLYPHS.length,
  rowCount: RAVER_WATCH_LEVELS.length,
  type: RAVER_WATCH_SPRITE_TYPE,
};

type Shape = { d: string } | { cx: number; cy: number; r: number };

/** Lucide's flask-conical, pill, thermometer, users, shield-alert, ban, triangle-alert and music; music struck through. */
const GLYPH_SHAPES: Record<RaverWatchGlyph, readonly Shape[]> = {
  alert: [
    { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' },
    { d: 'M6.453 15h11.094' },
    { d: 'M8.5 2h7' },
  ],
  drugs: [
    { d: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z' },
    { d: 'm8.5 8.5 7 7' },
  ],
  heat: [
    { d: 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' },
  ],
  crowd: [
    { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { cx: 9, cy: 7, r: 4 },
  ],
  violence: [
    { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
    { d: 'M12 8v4' },
    { d: 'M12 16h.01' },
  ],
  closure: [
    { cx: 12, cy: 12, r: 10 },
    { d: 'm4.9 4.9 14.2 14.2' },
  ],
  incident: [
    { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { d: 'M12 9v4' },
    { d: 'M12 17h.01' },
  ],
  event: [
    { d: 'M9 18V5l12-2v13' },
    { cx: 6, cy: 18, r: 3 },
    { cx: 18, cy: 16, r: 3 },
  ],
  cancelled: [
    { d: 'M9 18V5l12-2v13' },
    { cx: 6, cy: 18, r: 3 },
    { cx: 18, cy: 16, r: 3 },
    { d: 'm2 2 20 20' },
  ],
};

const OUTLINE = '#08121a';
const GLYPH_COLOR = '#f4f7ff';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`;

/** A glyph, light over a dark outline: Lucide's 24-unit grid scaled to 36 of the cell's 64, centred. */
function glyphMarkup(glyph: RaverWatchGlyph): string {
  const shapes = GLYPH_SHAPES[glyph]
    .map((shape) => ('d' in shape ? `<path d="${shape.d}"/>` : `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`))
    .join('');
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  return `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${shapes}</g>`
    + `<g ${frame} stroke="${GLYPH_COLOR}" stroke-width="2.25">${shapes}</g>`;
}

/** The backing a level is drawn on. The one reference, the glow's gradient, is by fragment inside this image. */
function backingMarkup(glyph: RaverWatchGlyph, level: RaverWatchLevel): string {
  const { color, backing } = RAVER_WATCH_LEVEL_LOOK[level];
  switch (backing) {
    case 'glow': {
      const id = `rw-glow-${glyph}`;
      // A dark core under the glyph, so a light glyph reads over a bright red.
      return `<defs><radialGradient id="${id}">`
        + `<stop offset="0.3" stop-color="${color}" stop-opacity="0.9"/>`
        + `<stop offset="1" stop-color="${color}" stop-opacity="0"/>`
        + `</radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#${id})"/>`
        + `<circle cx="32" cy="32" r="19" fill="${OUTLINE}" fill-opacity="0.45"/>`;
    }
    case 'ring':
      return `<circle cx="32" cy="32" r="27" fill="${OUTLINE}" fill-opacity="0.55"/>`
        + `<circle cx="32" cy="32" r="28" fill="none" stroke="${OUTLINE}" stroke-width="7"/>`
        + `<circle cx="32" cy="32" r="28" fill="none" stroke="${color}" stroke-width="3.5"/>`;
    case 'disc':
    default:
      return `<circle cx="32" cy="32" r="29" fill="${OUTLINE}" fill-opacity="0.78" stroke="${color}" stroke-width="3"/>`;
  }
}

/** One cell of the atlas: a glyph on its level's backing, as a standalone SVG string. */
export function raverWatchCellSvg(glyph: RaverWatchGlyph, level: RaverWatchLevel): string {
  return svg(backingMarkup(glyph, level) + glyphMarkup(glyph));
}

/** The atlas's cells: a row per level, a cell per glyph. */
export function raverWatchAtlasRows(): string[][] {
  return RAVER_WATCH_LEVELS.map((level) => RAVER_WATCH_GLYPHS.map((glyph) => raverWatchCellSvg(glyph, level)));
}

let atlas: Promise<THREE.Texture | null> | null = null;

/** The atlas, baked once. Null where there is no canvas to bake it on. */
export function raverWatchAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(raverWatchAtlasRows());
  return atlas;
}

/** How solid a scene event is drawn before it begins: there, and plainly not yet. */
export const NOT_BEGUN_OPACITY = 0.55;

/** One item as a mark: its glyph and level, faded as its end nears, faint before it begins, dated from when it applies. */
export function raverWatchSpriteMark(
  item: RaverWatchItem,
  position: THREE.Vector3,
  moment: RaverWatchMoment,
  describe: (item: RaverWatchItem) => string,
): GlyphSpriteMark {
  const level = levelOf(item);
  return {
    position,
    sizePx: REPORT_SPRITE_PX,
    cell: RAVER_WATCH_GLYPHS.indexOf(glyphOf(item)),
    row: RAVER_WATCH_LEVELS.indexOf(level),
    motion: RAVER_WATCH_LEVEL_LOOK[level].motion,
    opacity: fadeAt(item, moment) * (notBegunAt(item, moment) ? NOT_BEGUN_OPACITY : 1),
    tooltip: describe(item),
    // A scene event appears in a replay at its own start, not when it was listed.
    timeMs: (item.start ?? item.validFrom) * 1000,
  };
}
