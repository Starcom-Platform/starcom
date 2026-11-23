// zoneTheme.ts — the Zones layer's colours and lines (ZSP 1.0; see zones/zsp.ts).
//
// An Anchor Zone takes the colour of its frame, the system that defines it: a rift
// is the earth's colour, a basin water's, a forest's green. An Event Zone takes the
// colour of its condition, what is happening. Its Sectors are shades of the Zone's
// colour, stepping lighter and darker along the Zone so neighbours read apart: the
// documents list Sectors in order along the Zone, so the next one is the neighbour.
//
// Kept clear of the app's meanings (tokens.ts): no cyan, which is the app's own and
// "selected"; not Hero Watch's rescue orange; and the reds only for conflict. Colour
// is never the only signal: the hover and the panel name the frame or condition.
//
// Pure, with no THREE scene or DOM, as resourceZoneTheme.ts is, so it is tested alone.
import * as THREE from 'three';
import type { LineLook } from '../geometry/lineBatches';
import type { ZspPlace } from '../zones/zsp';

/** An Anchor Zone's colour, by its frame. */
const FRAME_COLORS: Readonly<Record<string, number>> = {
  geological: 0xc98a4b,   // terracotta: rock and rift
  hydrological: 0x4f86d9, // river blue, darker than the app's cyan
  ecological: 0x5fae6e,   // forest green
  climatic: 0xd9b45a,     // sand
  cultural: 0xc27bb4,     // orchid
  operational: 0x8e9bc4,  // slate
};

/** An Event Zone's colour, by its condition. */
const CONDITION_COLORS: Readonly<Record<string, number>> = {
  hazard: 0xf08a3c,
  conflict: 0xe5484d,
  convergence: 0xb46bff,
  null: 0x7a7a7a,
  sanctuary: 0x5fd38a,
  transition: 0xe6b84a,
  terrain: 0x8bb174,
};

const UNKNOWN_COLOR = 0x9a9a9a;

/** The shade of each Sector in turn, as a lightness step on the Zone's colour. */
const SECTOR_SHADES = [0, -0.14, 0.1, -0.06, 0.16, -0.2] as const;

/** The colour a Zone is drawn in: its frame's for an Anchor Zone, its condition's otherwise. */
export function zoneColor(zone: Pick<ZspPlace, 'zoneClass' | 'frame' | 'condition'>): number {
  if (zone.zoneClass === 'anchor' && zone.frame && FRAME_COLORS[zone.frame] !== undefined) return FRAME_COLORS[zone.frame];
  if (zone.condition && CONDITION_COLORS[zone.condition] !== undefined) return CONDITION_COLORS[zone.condition];
  return UNKNOWN_COLOR;
}

/** The colour of the `index`th Sector of a Zone drawn in `base`. */
export function sectorColor(base: number, index: number): number {
  const step = SECTOR_SHADES[((index % SECTOR_SHADES.length) + SECTOR_SHADES.length) % SECTOR_SHADES.length];
  return new THREE.Color(base).offsetHSL(0, 0, step).getHex();
}

/** The words for what a colour stands for: the catalogue's `zones.colour` (English here, by default). */
export interface ColourWords { frame: string; condition: string; plain: string }
const EN_COLOUR: ColourWords = { frame: '{frame} frame', condition: '{condition} zone', plain: 'zone' };

/** What the colour stands for, in words, for the hover, the panel and the key. */
export function zoneColorMeaning(zone: Pick<ZspPlace, 'zoneClass' | 'frame' | 'condition'>, words: ColourWords = EN_COLOUR): string {
  if (zone.zoneClass === 'anchor' && zone.frame) return words.frame.replace('{frame}', zone.frame);
  return zone.condition ? words.condition.replace('{condition}', zone.condition) : words.plain;
}

/** CSS for a swatch of a colour the globe draws in. */
export function swatchCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** A Sector's fill, and its fill when lit by the pointer or opened. */
export const SECTOR_FILL_OPACITY = 0.2;
/** A Zone with no Sectors is filled itself, as faintly. */
export const ZONE_FILL_OPACITY = 0.16;
/** How fast a fill lights up or fades, in seconds to about 63% of the way. */
export const LIGHT_UP_TAU_S = 0.09;

/**
 * The Zone's own edge: solid, and over the lines between its Sectors. After the
 * borders (100 and a priority) and the report outlines (110), before a featured
 * territory's lit edge (120).
 */
export const ZONE_EDGE_LOOK: LineLook = { opacity: 0.95, linewidth: 2.5, dashed: false, dashSize: 0, gapSize: 0, dashScale: 1, renderOrder: 112 };

/**
 * ZSP 2.0 tiles the whole globe, so its lines are everywhere at once: a Zone's edge is lighter than a lone 1.0 Zone's,
 * and the lines between Sectors faint and thin, so the map still reads under them. The container's edge is the
 * structure, and stays heaviest.
 */
export const PARTITION_ZONE_EDGE_LOOK: LineLook = { ...ZONE_EDGE_LOOK, opacity: 0.7, linewidth: 1.6 };

/** ZSP 2.0: the line between two Sectors, faint, dashed unless its boundary is defined. */
export function partitionSectorLineLook(boundary: string | undefined): LineLook {
  return { ...sectorLineLook(boundary), opacity: 0.35, linewidth: 1 };
}

/** ZSP 2.0: a Terra's or a Mare's edge, the heaviest line, over its Zones' edges. */
export const CONTAINER_EDGE_LOOK: LineLook = { opacity: 1, linewidth: 3.5, dashed: false, dashSize: 0, gapSize: 0, dashScale: 1, renderOrder: 113 };

/**
 * The line between two Sectors, by how it is drawn (ZSP's boundary, mapped onto
 * Starcom's own border classes): a defined line solid, an approximate one dashed
 * as an indefinite border is, a transition band and a disputed line dashed longer.
 */
export function sectorLineLook(boundary: string | undefined): LineLook {
  const settled = boundary === 'defined';
  return {
    opacity: 0.8,
    linewidth: 1.5,
    dashed: !settled,
    dashSize: boundary === 'transition' || boundary === 'disputed' ? 5 : 3,
    gapSize: 2,
    dashScale: 1,
    renderOrder: 111,
  };
}
