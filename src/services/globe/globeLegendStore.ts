/**
 * What the marks on the globe MEAN, published by the code that drew them.
 *
 * ─── WHY A STORE AND NOT A TABLE ───────────────────────────────────────────
 *
 * A share card leaves the app and cannot be corrected, so a reader has to be able
 * to tell a magnitude-7 earthquake from a wildfire without asking anyone. That
 * wants a legend. The obvious way to write one is a table of "this colour means
 * that" kept beside the card composer — which is an artifact that can go stale and
 * start lying the first time a layer changes a colour, with nothing failing.
 *
 * So a layer states its own encoding as it draws, from the marks it is drawing:
 * the swatches are derived from the very array that produced the geometry, and
 * they are withdrawn when the layer stops drawing. A legend entry cannot outlive
 * the marks it describes, and cannot name a category the layer did not draw.
 *
 * It says what the LAYER DREW, which is not quite what the picture shows: the globe
 * is a sphere and half of what it draws faces away from the camera. A swatch is a
 * key to the encoding, not a claim that an instance of it is visible.
 *
 * Module-level, like globeIntelLayerStore, because the layers and the capture path
 * are in different React trees.
 */

export interface LegendSwatch {
  /** The colour as drawn — a CSS string, which is what every layer here works in. */
  color: string;
  /**
   * What that colour is: a hazard type, a severity, a satellite's role. Empty
   * when the next labelled swatch names this one too: the run is drawn close
   * together, named once (Classic's four country fills).
   */
  label: string;
  /**
   * The shape of THIS swatch, when it differs within one entry.
   *
   * The borders are why. They are lines, not marks, and in one entry a settled
   * boundary is solid while a provisional one is dashed — the one distinction
   * the key has to show that colour does not carry. LayerLegend.shapeMeans
   * cannot say that: it names one shape for a whole entry. Absent on almost
   * every swatch, which then takes its entry's shape.
   */
  shape?: string;
  /**
   * The style the layer's marks are drawn in — disc, glow or ring — when the
   * swatch should be drawn the same way.
   *
   * The Intel Report glyphs are why (decision D-F, section 18): a document on a
   * dark disc is what a reader sees, and a bare document in the key would be a
   * mark that is not in the picture.
   */
  style?: string;
  /**
   * How the swatch reads on a card, where a card draws more than the screen does.
   *
   * War & Conflict's hatching is why (theatre-lens.md, TL5): a weak device's screen
   * gives it up, and every capture draws it, so the screen's key says "outlined" and
   * the card's "hatched". Absent on every other swatch.
   */
  card?: { label?: string; shape?: string };
  /**
   * A Symbol registry id: the in-app key draws that glyph in this swatch's colour, one line
   * for both, where the marks on the globe are that glyph in that colour (Diplomacy up close,
   * D-DP DP12). A card, which draws chips, keeps the coloured disc. Absent on most swatches.
   */
  symbol?: string;
}

export interface LayerLegend {
  /** The layer catalogue's id — stable across a label change. */
  layerId: string;
  /** What the catalogue calls it, for the card to print. */
  layer: string;
  /**
   * The moment its values hold for, when they hold for one, as a weather
   * model's do: "for 6 Oct 22:12Z", "forecast for 7 Oct 06:00Z". The card
   * prints it after the layer's name (decision D-W, step 5a).
   */
  when?: string;
  /**
   * Which shape this entry describes, when a layer draws more than one.
   *
   * Conflict Zones is why: it draws armed conflict as discs and displacement as
   * rings, and without this a reader has two entries and no way to tell which
   * mark each one is about. Absent when a layer draws one shape, which is most
   * of them.
   */
  shapeMeans?: string;
  /** What a mark's size means here, in words. Absent when size carries nothing. */
  sizeMeans?: string;
  /**
   * What the distances drawn mean, where not every one is true: the solar system's scale (OR9). Absent on every
   * layer but the solar system's.
   */
  distanceMeans?: string;
  /** What its colour means. Absent when colour carries nothing. */
  colorMeans?: string;
  /**
   * What the number beside a mark means, when one is drawn. Absent when no mark
   * carries a number.
   */
  badgeMeans?: string;
  /**
   * What a shaded area around a mark means, when one is drawn: for Intel
   * Reports, how precisely it was placed. Absent when no area is drawn.
   */
  areaMeans?: string;
  /**
   * What the emblem inside a mark means, when one is drawn (BA14): for Intel
   * Reports, what it is about. Absent when no mark wears one.
   */
  emblemMeans?: string;
  /**
   * The emblems drawn, most worn first: each its Symbol registry id, what it
   * means and its icon's name. Never the ones that could be drawn.
   */
  emblems?: Array<{ id: string; meaning: string; icon: string }>;
  /** The categories this layer actually drew — never the ones it could draw. */
  swatches: LegendSwatch[];
}

type Listener = (legends: LayerLegend[]) => void;

const legends = new Map<string, LayerLegend>();
const listeners = new Set<Listener>();

const snapshot = (): LayerLegend[] => [...legends.values()];

const notify = () => {
  const current = snapshot();
  for (const listener of listeners) listener(current);
};

/** State the layer's encoding, or withdraw it by passing null. */
export function publishLegend(layerId: string, legend: LayerLegend | null): void {
  if (legend === null) {
    if (legends.delete(layerId)) notify();
    return;
  }
  legends.set(layerId, legend);
  notify();
}

/** Every encoding currently being drawn, in publication order. */
/** The key as a card prints it: each swatch in the form a card draws, where that differs (LegendSwatch.card). */
export function legendsAsCardsDraw(legends: readonly LayerLegend[]): LayerLegend[] {
  return legends.map((entry) => (entry.swatches.some((swatch) => swatch.card)
    ? { ...entry, swatches: entry.swatches.map(({ card, ...swatch }) => (card ? { ...swatch, ...card } : swatch)) }
    : entry));
}

export function getLegends(): LayerLegend[] {
  return snapshot();
}

export function subscribeLegends(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => { listeners.delete(listener); };
}

/** Tests only — the module store outlives a component, so a suite has to reset it. */
export function resetLegendsForTest(): void {
  legends.clear();
  notify();
}

/** A drawn colour as CSS, which is what a legend swatch is filled with. */
export function cssColorOf(color: number | string): string {
  return typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
}

/**
 * The distinct colours in a set of marks, in the order they first appear.
 *
 * Derived from what was drawn: a category with no mark in the set produces no
 * swatch, so the legend cannot offer a key to something the layer never drew.
 */
export function swatchesFromMarks(
  marks: readonly { color: string; category?: string }[],
): LegendSwatch[] {
  const seen = new Map<string, LegendSwatch>();
  for (const mark of marks) {
    if (!mark.category) continue;
    const key = `${mark.category} ${mark.color}`;
    if (!seen.has(key)) seen.set(key, { color: mark.color, label: mark.category });
  }
  return [...seen.values()];
}
