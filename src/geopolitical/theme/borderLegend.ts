import type * as THREE from 'three';
import { isProvisional, type BorderClassification } from './materialTheme';
import { CLASSIC_FILL_COLOURS, borderColourOf, type TerritoryLook, type TerritoryStyle } from './territoryStyles';
import { cssColorOf, type LayerLegend } from '../../services/globe/globeLegendStore';
import { lineBatchData } from '../geometry/lineBatches';

/**
 * The key to the borders, from the borders actually drawn (decision D-F,
 * 2026-09-19).
 *
 * This replaced a key typed into GeopoliticalLayersPopup by hand, which is the
 * failure globeLegendStore exists to prevent — and it had already happened: it
 * showed International as one green swatch when international borders were
 * hashed into four colours, and drew every swatch solid, so it never said the
 * dash is what marks a boundary that is not settled.
 *
 * The borders now publish into the same store as every data layer, so they
 * appear in the on-globe key and on a share card, and the key cannot name a
 * colour or a kind of boundary the globe did not draw.
 */

export const BORDERS_LEGEND_ID = 'NationalTerritories:borders';

/** The key's line for Classic's fills (decision K5): what their four colours mean, which is little. */
export const COUNTRIES_LEGEND_ID = 'NationalTerritories:countries';

const LABELS: Record<BorderClassification, string> = {
  international: 'international boundary',
  disputed: 'disputed',
  line_of_control: 'line of control',
  indefinite: 'indefinite',
  unknown: 'unclassified',
  maritime_eez: 'maritime EEZ',
  maritime_overlap: 'maritime overlap',
};

/**
 * Settled first, then provisional, then the rest. Fixed so the key does not
 * reshuffle when a change in level of detail brings the borders back in a
 * different order.
 */
const ORDER: BorderClassification[] = [
  'international', 'disputed', 'line_of_control', 'indefinite', 'unknown', 'maritime_eez', 'maritime_overlap',
];

/**
 * The borders' legend entry, or null when none were drawn.
 *
 * Takes the classification of every border drawn — duplicates and all, in
 * whatever order they arrived — so the caller can hand it what the batches hold
 * rather than deciding which kinds are present itself. The colours are the style's
 * (territoryStyles.ts): a settled border is green in Classic, pale in Quiet.
 */
export function bordersLegendFrom(
  drawn: Iterable<BorderClassification>,
  style: TerritoryStyle = 'quiet',
  look?: Pick<TerritoryLook, 'borderColours'>,
): LayerLegend | null {
  const present = new Set(drawn);
  if (present.size === 0) return null;
  return {
    layerId: BORDERS_LEGEND_ID,
    layer: 'Borders',
    colorMeans: 'what kind of boundary it is — dashed where it is not settled',
    swatches: ORDER.filter((c) => present.has(c)).map((c) => ({
      color: cssColorOf(borderColourOf(style, c, look)),
      label: LABELS[c],
      shape: isProvisional(c) ? 'dashed' : 'line',
    })),
  };
}

/**
 * The borders' legend entry, read off the groups that were drawn.
 *
 * Each batch records the classification of every line in it (lineBatches.ts),
 * so this reads what the service actually built rather than what the dataset
 * holds — which is what makes the setting that hides disputed borders drop
 * their swatch too. Groups may be null: maritime borders are optional.
 */
export function drawnBorderKinds(...groups: (THREE.Object3D | null | undefined)[]): BorderClassification[] {
  const drawn: BorderClassification[] = [];
  for (const group of groups) {
    for (const child of group?.children ?? []) {
      for (const line of lineBatchData(child)?.lines ?? []) {
        if (line.classification) drawn.push(line.classification as BorderClassification);
      }
    }
  }
  return drawn;
}

/**
 * Classic's fills in the key, or null where they are not drawn (Quiet's one tone
 * says nothing a key need explain). Four colours that mean only "not the country
 * next door": said, because a reader otherwise looks for what green has in common.
 */
/** What Classic's four fills mean, said once after them (owner, 2026-10-08). */
export const COUNTRIES_KEY_LABEL = 'one colour each; neighbours never share one';

export function countriesLegend(style: TerritoryStyle, fillsDrawn: boolean): LayerLegend | null {
  if (style !== 'classic' || !fillsDrawn) return null;
  const last = CLASSIC_FILL_COLOURS.length - 1;
  return {
    layerId: COUNTRIES_LEGEND_ID,
    layer: 'Countries',
    colorMeans: 'nothing but a different country: four colours, so no two that share a border look alike',
    // One line: the four run together, unlabelled, and the last names them all.
    swatches: CLASSIC_FILL_COLOURS.map((c, i) => ({ color: cssColorOf(c), label: i === last ? COUNTRIES_KEY_LABEL : '', shape: 'area' })),
  };
}

/** What the territories drew: the kinds of border, and whether the fills. */
export interface TerritoriesDrawn {
  borderKinds: readonly BorderClassification[];
  fills: boolean;
}

/** The territories' entries in the key, in a style: the borders, and Classic's fills. */
export function territoryLegends(style: TerritoryStyle, drawn: TerritoriesDrawn, look?: Pick<TerritoryLook, 'borderColours'>): Array<{ id: string; legend: LayerLegend | null }> {
  return [
    { id: BORDERS_LEGEND_ID, legend: bordersLegendFrom(drawn.borderKinds, style, look) },
    { id: COUNTRIES_LEGEND_ID, legend: countriesLegend(style, drawn.fills) },
  ];
}

/**
 * The key as a card in `style` would print it: every entry as published, then the
 * territories' in the card's style rather than the screen's (TS3). Always last:
 * the base map after the layers the card is about. The store lists entries in the
 * order they were published, so where the borders fell depended on which layer
 * finished loading first, and two cards from one page keyed them in different places.
 */
export function legendsInStyle(legends: readonly LayerLegend[], style: TerritoryStyle, drawn: TerritoriesDrawn, look?: Pick<TerritoryLook, 'borderColours'>): LayerLegend[] {
  const ours = territoryLegends(style, drawn, look);
  const theirs = new Set(ours.map(({ id }) => id));
  return [
    ...legends.filter((legend) => !theirs.has(legend.layerId)),
    ...ours.flatMap(({ legend }) => (legend ? [legend] : [])),
  ];
}
