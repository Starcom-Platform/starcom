/**
 * Diplomacy's marks up close (decision D-DP, DP12): each place is its kind's glyph on a mark of its
 * colour, as Intel Reports draw their emblems. With the whole globe in view a place is a disc
 * (useDiplomaticEvents3D's buildPlaceMarks): 8 to 20 pixels carry a colour, not a glyph.
 *
 * One atlas: a column per kind, in CAMEO's order (DIPLOMATIC_CATEGORIES), and a row per backing — a
 * disc; a hollow ring, for a place GDELT put only at a country; a dashed ring, for that place under
 * the Ring style, where every mark is a ring (DP13).
 */
import * as THREE from 'three';
import { bakeSvgAtlas, type GlyphSpriteLayout } from './intelReportSprites';
import type { MarkerStyle } from './markerStyles';
import { GUNMETAL } from '../../styles/tokens';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../symbols/symbolRegistry';
import { DIPLOMATIC_CATEGORIES, diplomaticEventColor, type DiplomaticEventCategory } from '../../geopolitical/theme/diplomaticEventTheme';
import { cssColorOf } from '../../services/globe/globeLegendStore';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const DIPLOMACY_SPRITE_TYPE = 'diplomacySprites';
/** The atlas's rows: each backing. */
export const DIPLOMACY_ROWS = ['disc', 'ring', 'dashedRing'] as const;

export const DIPLOMACY_LAYOUT: GlyphSpriteLayout = {
  cellCount: DIPLOMATIC_CATEGORIES.length,
  rowCount: DIPLOMACY_ROWS.length,
  type: DIPLOMACY_SPRITE_TYPE,
};

/**
 * A place's backing: the chosen style's for a place GDELT states, a ring for one it put only at a
 * country, dashed where every mark is already a ring. A glow is a disc up close: its light is a
 * far-off view's, and a glyph needs the disc to stand on.
 */
export function diplomacyRowFor(style: MarkerStyle, countryOnly: boolean): number {
  if (style === 'ring') return DIPLOMACY_ROWS.indexOf(countryOnly ? 'dashedRing' : 'ring');
  return DIPLOMACY_ROWS.indexOf(countryOnly ? 'ring' : 'disc');
}

// The palette's darkest, as the glyph's ink on a bright disc and its outline on a ring.
const OUTLINE = GUNMETAL[950];
const markupOf = (category: DiplomaticEventCategory) => DIPLOMACY_CATEGORY_SYMBOLS[category].icon
  .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(' ')}/>`).join('');

function cellSvg(category: DiplomaticEventCategory, row: (typeof DIPLOMACY_ROWS)[number]): string {
  const colour = cssColorOf(diplomaticEventColor(category));
  const glyph = markupOf(category);
  // Lucide's 24-unit grid, scaled to 36 and centred in the 64-unit cell.
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">';
  if (row === 'disc') {
    return open
      + `<circle cx="32" cy="32" r="29" fill="${colour}" stroke="${OUTLINE}" stroke-width="3"/>`
      + `<g ${frame} stroke="${OUTLINE}" stroke-width="2.5">${glyph}</g>`
      + '</svg>';
  }
  // Hollow: a dark ground so the glyph reads over cloud and ice, the ring and glyph in the kind's colour.
  const dash = row === 'dashedRing' ? ' stroke-dasharray="11 7"' : '';
  return open
    + `<circle cx="32" cy="32" r="27" fill="${OUTLINE}" fill-opacity="0.55" stroke="${colour}" stroke-width="5"${dash}/>`
    + `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${glyph}</g>`
    + `<g ${frame} stroke="${colour}" stroke-width="2.25">${glyph}</g>`
    + '</svg>';
}

/** The atlas's rows of cells, as SVG. */
export function diplomacyAtlasRows(): string[][] {
  return DIPLOMACY_ROWS.map((row) => DIPLOMATIC_CATEGORIES.map((category) => cellSvg(category, row)));
}

let atlas: Promise<THREE.Texture | null> | null = null;

/** Baked once, the first time a person comes close. Null where it cannot be baked: the discs stay. */
export function diplomacyAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(diplomacyAtlasRows());
  return atlas;
}
