/**
 * Civil Unrest's marks (decision D-CU): a crowd for a place's days of unrest (CU2), and a broken ring for a protest
 * surge, a surge in reporting, never the crowd (CU4). Chartreuse rims every mark (`DATA_SCALES.civilUnrest`, CU1).
 *
 * One atlas, one row: a cell for each section's glyph.
 */
import * as THREE from 'three';
import { bakeSvgAtlas, type GlyphSpriteLayout, type GlyphSpriteMark } from './intelReportSprites';
import { REPORT_SPRITE_PX } from './Hooks/useGlobeIntelSprites';
import { DATA_SCALES, GUNMETAL } from '../../styles/tokens';
import { GLYPHS } from '../../symbols/uiSymbols';
import { CIVIL_UNREST_SECTIONS, type CivilUnrestSection } from '../../services/civilUnrest/civilUnrest';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const CIVIL_UNREST_SPRITE_TYPE = 'civilUnrestSprites';

export const CIVIL_UNREST_LAYOUT: GlyphSpriteLayout = {
  cellCount: CIVIL_UNREST_SECTIONS.length,
  rowCount: 1,
  type: CIVIL_UNREST_SPRITE_TYPE,
};

/** A place's notes of a section at its point or middle: the section's glyph, a report's size; the hover names each. */
export function civilUnrestMark(section: CivilUnrestSection, position: THREE.Vector3, tooltip: string): GlyphSpriteMark {
  return { position, sizePx: REPORT_SPRITE_PX, cell: CIVIL_UNREST_SECTIONS.indexOf(section), row: 0, motion: 0, tooltip };
}

// The palette's darkest and lightest, as the glyph's outline and ink, as AI Watch's marks.
const OUTLINE = GUNMETAL[950];
const INK = GUNMETAL[100];
const markupOf = (icon: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>) =>
  icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(' ')}/>`).join('');
const GLYPH_OF: Record<CivilUnrestSection, string> = {
  CivilUnrest: markupOf(GLYPHS['layer:CivilUnrest'].icon),
  ProtestSurges: markupOf(GLYPHS['layer:ProtestSurges'].icon),
};

function cellSvg(section: CivilUnrestSection): string {
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    + `<circle cx="32" cy="32" r="29" fill="${OUTLINE}" fill-opacity="0.78" stroke="${DATA_SCALES.civilUnrest}" stroke-width="3.5"/>`
    + `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${GLYPH_OF[section]}</g>`
    + `<g ${frame} stroke="${INK}" stroke-width="2.25">${GLYPH_OF[section]}</g>`
    + '</svg>';
}

/** The atlas's one row of cells, as SVG. */
export function civilUnrestAtlasRows(): string[][] {
  return [CIVIL_UNREST_SECTIONS.map(cellSvg)];
}

let atlas: Promise<THREE.Texture | null> | null = null;

export function civilUnrestAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(civilUnrestAtlasRows());
  return atlas;
}
