/**
 * War & Conflict's marks (decisions WC1-WC4 of 2026-10-02).
 *
 * One atlas of thirteen glyphs in three rows, a row per backing, drawn through
 * the same sprite builder as Intel Reports and Raver Watch: one object for
 * every mark, a fixed size on screen, a hover, and an opacity per mark, which
 * fades an item as its three days end.
 *
 * ─── WHAT EACH CHANNEL SAYS ────────────────────────────────────────────────
 *
 * The backing is the most serious thing about an item, so it never rests on
 * colour alone: a critical warning (do not fly, do not travel) glows and is
 * the one mark that moves; a line that reports deaths is ringed; any other
 * report is a disc. The first two are the token set's danger red, whose
 * meaning (danger, hostile) they share; a report asks nothing, so its edge is
 * a quiet light grey. The glyph is what happened. Every colour comes from
 * src/styles/tokens.ts.
 *
 * The glyphs are Lucide's, on its 24-unit grid (ISC licence; Copyright (c)
 * Lucide Contributors 2022, portions Cole Bemis 2013-2022 as part of Feather,
 * MIT), written out because the atlas is baked from SVG strings through an
 * Image under the CSP, which admits `data:`.
 */
import type * as THREE from 'three';
import type { MarkerStyle } from './markerStyles';
import { bakeBadgeAtlas, bakeSvgAtlas, type GlyphSpriteLayout, type GlyphSpriteMark } from './intelReportSprites';
import { REPORT_SPRITE_PX } from './Hooks/useGlobeIntelSprites';
import { GUNMETAL, SEMANTIC } from '../../styles/tokens';
import type { ConflictItem } from '../../services/warConflict/warConflict';
import {
  CONFLICT_BACKINGS, CONFLICT_GLYPHS, backingOf, fadeAt, glyphOf,
  type ConflictBacking, type ConflictGlyph, type WarConflictMoment,
} from '../../services/warConflict/warConflictView';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const WAR_CONFLICT_SPRITE_TYPE = 'warConflictSprites';

/** How each backing is drawn, and what the key says of it. */
export const WAR_CONFLICT_BACKING_LOOK: Record<ConflictBacking, { color: string; backing: MarkerStyle; motion: number; means: string }> = {
  critical: { color: SEMANTIC.danger, backing: 'glow', motion: 0.6, means: 'a critical warning (a glow)' },
  deadly: { color: SEMANTIC.danger, backing: 'ring', motion: 0, means: 'deaths reported (a ring)' },
  report: { color: GUNMETAL[300], backing: 'disc', motion: 0, means: 'a report (a disc)' },
};

/** What each glyph is, in the key's words. */
export const WAR_CONFLICT_GLYPH_MEANING: Record<ConflictGlyph, string> = {
  strike: 'a strike, shelling, an explosion or a missile launch',
  fighting: 'fighting, shooting or an attack',
  unrest: 'a protest or unrest',
  captive: 'kidnapping, hostages or arrests',
  sea: 'piracy or the dark fleet',
  diplomacy: 'diplomacy, talks or the Security Council',
  troops: 'troop movements',
  nuclear: 'nuclear safety',
  humanitarian: 'humanitarian',
  warning: 'a warning: airspace, travel, an emergency or an election',
  shutdown: 'an internet shutdown',
  sanctions: 'sanctions or export controls',
  report: 'another report',
};

export const WAR_CONFLICT_LAYOUT: GlyphSpriteLayout = {
  cellCount: CONFLICT_GLYPHS.length,
  rowCount: CONFLICT_BACKINGS.length,
  type: WAR_CONFLICT_SPRITE_TYPE,
};

type Shape = { d: string } | { cx: number; cy: number; r: number };

/** Lucide's bomb, swords, megaphone, lock, ship, handshake, shield, radiation, heart, triangle-alert, wifi-off, ban and newspaper. */
const GLYPH_SHAPES: Record<ConflictGlyph, readonly Shape[]> = {
  strike: [
    { cx: 11, cy: 13, r: 9 },
    { d: 'M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95' },
    { d: 'm22 2-1.5 1.5' },
  ],
  fighting: [
    { d: 'M14.5 17.5 3 6V3h3l11.5 11.5' },
    { d: 'm13 19 6-6' },
    { d: 'm16 16 4 4' },
    { d: 'm19 21 2-2' },
    { d: 'M14.5 6.5 18 3h3v3l-3.5 3.5' },
    { d: 'm5 14 4 4' },
    { d: 'm7 17-3 3' },
    { d: 'm3 19 2 2' },
  ],
  // A protest or unrest (WC5): a voice raised, not a weapon, so it does not read as fighting.
  unrest: [
    { d: 'm3 11 18-5v12L3 14v-3z' },
    { d: 'M11.6 16.8a3 3 0 1 1-5.8-1.6' },
  ],
  captive: [
    { d: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z' },
    { d: 'M7 11V7a5 5 0 0 1 10 0v4' },
  ],
  sea: [
    { d: 'M12 10.189V14' },
    { d: 'M12 2v3' },
    { d: 'M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6' },
    { d: 'M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76' },
    { d: 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' },
  ],
  diplomacy: [
    { d: 'm11 17 2 2a1 1 0 1 0 3-3' },
    { d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4' },
    { d: 'm21 3 1 11h-2' },
    { d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3' },
    { d: 'M3 4h8' },
  ],
  troops: [
    { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
  ],
  nuclear: [
    { d: 'M12 12h.01' },
    { d: 'M7.5 4.2c-.3-.5-.9-.7-1.3-.4C3.9 5.5 2.3 8.1 2 11c-.1.5.4 1 1 1h5c0-1.5.8-2.8 2-3.4-1.1-1.9-2-3.5-2.5-4.4z' },
    { d: 'M21 12c.6 0 1-.4 1-1-.3-2.9-1.8-5.5-4.1-7.1-.4-.3-1.1-.2-1.3.3-.6.9-1.5 2.5-2.6 4.3 1.2.7 2 2 2 3.5h5z' },
    { d: 'M7.5 19.8c-.3.5-.1 1.1.4 1.3 2.6 1.2 5.6 1.2 8.2 0 .5-.2.7-.8.4-1.3-.5-.9-1.4-2.5-2.5-4.3-1.2.7-2.8.7-4 0-1.1 1.8-2 3.4-2.5 4.3z' },
  ],
  humanitarian: [
    { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' },
  ],
  warning: [
    { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { d: 'M12 9v4' },
    { d: 'M12 17h.01' },
  ],
  shutdown: [
    { d: 'M12 20h.01' },
    { d: 'M8.5 16.429a5 5 0 0 1 7 0' },
    { d: 'M5 12.859a10 10 0 0 1 5.17-2.69' },
    { d: 'M19 12.859a10 10 0 0 0-2.007-1.523' },
    { d: 'M2 8.82a15 15 0 0 1 4.177-2.643' },
    { d: 'M22 8.82a15 15 0 0 0-11.288-3.764' },
    { d: 'm2 2 20 20' },
  ],
  sanctions: [
    { cx: 12, cy: 12, r: 10 },
    { d: 'm4.9 4.9 14.2 14.2' },
  ],
  report: [
    { d: 'M15 18h-5' },
    { d: 'M18 14h-8' },
    { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2' },
    { d: 'M10 6h8v4h-8z' },
  ],
};

const OUTLINE = GUNMETAL[950];
const GLYPH_COLOR = GUNMETAL[100];

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`;

/** A glyph, light over a dark outline: Lucide's 24-unit grid scaled to 36 of the cell's 64, centred. */
function glyphMarkup(glyph: ConflictGlyph): string {
  const shapes = GLYPH_SHAPES[glyph]
    .map((shape) => ('d' in shape ? `<path d="${shape.d}"/>` : `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`))
    .join('');
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  return `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${shapes}</g>`
    + `<g ${frame} stroke="${GLYPH_COLOR}" stroke-width="2.25">${shapes}</g>`;
}

/** The backing an item is drawn on. The one reference, the glow's gradient, is by fragment inside this image. */
function backingMarkup(glyph: ConflictGlyph, backing: ConflictBacking): string {
  const { color, backing: style } = WAR_CONFLICT_BACKING_LOOK[backing];
  switch (style) {
    case 'glow': {
      const id = `wc-glow-${glyph}`;
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

/** One cell of the atlas: a glyph on its backing, as a standalone SVG string. */
export function warConflictCellSvg(glyph: ConflictGlyph, backing: ConflictBacking): string {
  return svg(backingMarkup(glyph, backing) + glyphMarkup(glyph));
}

/** The atlas's cells: a row per backing, a cell per glyph. */
export function warConflictAtlasRows(): string[][] {
  return CONFLICT_BACKINGS.map((backing) => CONFLICT_GLYPHS.map((glyph) => warConflictCellSvg(glyph, backing)));
}

let atlas: Promise<THREE.Texture | null> | null = null;

/** The atlas, baked once. Null where there is no canvas to bake it on. */
export function warConflictAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(warConflictAtlasRows());
  return atlas;
}

let badgeAtlas: Promise<THREE.Texture | null> | null = null;

/** The count badges a crowded mark wears (glyphDeclutter.ts), baked once. Null where there is no canvas. */
export function warConflictBadgeAtlas(): Promise<THREE.Texture | null> {
  badgeAtlas ??= bakeBadgeAtlas();
  return badgeAtlas;
}

/** One item as a mark: its glyph and backing, faded as its end nears, dated when it was reported. */
export function warConflictSpriteMark(
  item: ConflictItem,
  position: THREE.Vector3,
  moment: WarConflictMoment,
  describe: (item: ConflictItem) => string,
): GlyphSpriteMark {
  const backing = backingOf(item);
  return {
    position,
    sizePx: REPORT_SPRITE_PX,
    cell: CONFLICT_GLYPHS.indexOf(glyphOf(item)),
    row: CONFLICT_BACKINGS.indexOf(backing),
    motion: WAR_CONFLICT_BACKING_LOOK[backing].motion,
    opacity: fadeAt(item, moment),
    tooltip: describe(item),
    timeMs: item.reportedAt * 1000,
  };
}
