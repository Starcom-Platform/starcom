/**
 * AI Watch's marks (decision D-AW): a note at its point as the glyph of its section, with its stance as a
 * small shape (AW4), and a country's notes at its middle as the mode's glyph, with a pill counting them.
 * AI Watch's magenta rims every mark (`DATA_SCALES.aiWatch`); the stance is the shape, never the colour.
 *
 * One atlas: a column per section's glyph and one for a country, a row per stance and one for none.
 */
import * as THREE from 'three';
import { bakeSvgAtlas, type GlyphSpriteLayout, type GlyphSpriteMark } from './intelReportSprites';
import { REPORT_SPRITE_PX } from './Hooks/useGlobeIntelSprites';
import { DATA_SCALES, GUNMETAL, KIND_COLOURS } from '../../styles/tokens';
import { GLYPHS } from '../../symbols/uiSymbols';
import { AI_WATCH_SECTIONS, type AiWatchItem, type AiWatchSection, type AiWatchStance } from '../../services/aiWatch/aiWatch';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const AI_WATCH_SPRITE_TYPE = 'aiWatchSprites';
/** How its pills are found. Never picked. */
export const AI_WATCH_PILL_TYPE = 'aiWatchPills';

/** The atlas's columns: each section's glyph, then the mode's, for a country's notes. */
export const AI_WATCH_CELLS = [...AI_WATCH_SECTIONS, 'country'] as const;
/** Its rows: each stance, then none stated. */
export const AI_WATCH_ROWS = ['good', 'bad', 'ugly', 'none'] as const;

export const AI_WATCH_LAYOUT: GlyphSpriteLayout = {
  cellCount: AI_WATCH_CELLS.length,
  rowCount: AI_WATCH_ROWS.length,
  type: AI_WATCH_SPRITE_TYPE,
};

const rowOf = (stance: AiWatchStance | undefined) => AI_WATCH_ROWS.indexOf(stance ?? 'none');

/** A note at its point: the glyph of its first section that is on, its stance's shape, a report's size. */
export function aiNoteMark(item: Pick<AiWatchItem, 'sections' | 'stance'>, active: Readonly<Record<AiWatchSection, boolean>>, position: THREE.Vector3, tooltip: string): GlyphSpriteMark {
  const section = item.sections.find((s) => active[s]) ?? item.sections[0] ?? 'AiFrontier';
  return { position, sizePx: REPORT_SPRITE_PX, cell: AI_WATCH_CELLS.indexOf(section), row: rowOf(item.stance), motion: 0, tooltip };
}

/** A country's notes at its middle: the mode's glyph, no stance of its own; the hover names each. */
export function aiCountryMark(position: THREE.Vector3, tooltip: string): GlyphSpriteMark {
  return { position, sizePx: REPORT_SPRITE_PX, cell: AI_WATCH_CELLS.indexOf('country'), row: rowOf(undefined), motion: 0, tooltip };
}

// The palette's darkest and lightest, as the glyph's outline and ink, as Hero Watch's marks.
const OUTLINE = GUNMETAL[950];
const INK = GUNMETAL[100];
const markupOf = (icon: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>) =>
  icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(' ')}/>`).join('');
const GLYPH_OF: Record<(typeof AI_WATCH_CELLS)[number], string> = {
  AiIncidents: markupOf(GLYPHS['layer:AiIncidents'].icon),
  AiFrontier: markupOf(GLYPHS['layer:AiFrontier'].icon),
  AiWar: markupOf(GLYPHS['layer:AiWar'].icon),
  AiSafety: markupOf(GLYPHS['layer:AiSafety'].icon),
  country: markupOf(GLYPHS['mode:AIWatch'].icon),
};
/** Each stance's shape as a badge at the mark's lower right, on a 64-unit cell: ▲ good, ▼ bad, ◆ ugly. */
const BADGE: Record<(typeof AI_WATCH_ROWS)[number], string> = {
  good: 'M50 40 L59 56 L41 56 Z',
  bad: 'M41 42 L59 42 L50 58 Z',
  ugly: 'M50 39 L59 49 L50 59 L41 49 Z',
  none: '',
};

/**
 * Each area's rim by its kind (critique-2026-11-01, O17, OR3): AI in war in armed conflict's colour, safety and
 * security in the technology (cyber) colour, incidents and frontier AI in AI's own; a country's notes in the mode's.
 */
export const AI_WATCH_RIM: Record<(typeof AI_WATCH_CELLS)[number], string> = {
  AiIncidents: KIND_COLOURS.ai,
  AiFrontier: KIND_COLOURS.ai,
  AiWar: KIND_COLOURS.conflict,
  AiSafety: KIND_COLOURS.cyber,
  country: DATA_SCALES.aiWatch,
};

function cellSvg(cell: (typeof AI_WATCH_CELLS)[number], row: (typeof AI_WATCH_ROWS)[number]): string {
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const badge = BADGE[row]
    ? `<path d="${BADGE[row]}" fill="${INK}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`
    : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    + `<circle cx="32" cy="32" r="29" fill="${OUTLINE}" fill-opacity="0.78" stroke="${AI_WATCH_RIM[cell]}" stroke-width="3.5"/>`
    + `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${GLYPH_OF[cell]}</g>`
    + `<g ${frame} stroke="${INK}" stroke-width="2.25">${GLYPH_OF[cell]}</g>`
    + badge
    + '</svg>';
}

/** The atlas's rows of cells, as SVG. */
export function aiWatchAtlasRows(): string[][] {
  return AI_WATCH_ROWS.map((row) => AI_WATCH_CELLS.map((cell) => cellSvg(cell, row)));
}

let atlas: Promise<THREE.Texture | null> | null = null;

export function aiWatchAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(aiWatchAtlasRows());
  return atlas;
}
