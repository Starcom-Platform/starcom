/**
 * Every country's name drawn once, into one texture (decision K5, step 4).
 *
 * Two channels: R is the name's own letters, G its halo, a soft glow under a tight
 * stroke. The shader colours each from the look (countryNameLook.ts), so the colours
 * are tokens, never baked in, and a selected country turns cyan without a re-bake.
 *
 * Drawn at the pixel ratio it is shown at, in whole device pixels, so a texel lands
 * on a pixel and the letters are as crisp as canvas text gets. Packed in rows of a
 * fixed width, as tall as the names need: it cannot overflow.
 */
import { FONTS } from '../../styles/tokens';
import type { TerritoryLabel } from '../theme/territoryLabels';
import { NAME_HALO, NAME_LINE_HEIGHT, nameFont, tierOf } from './countryNameLook';

/** Where one name is in the atlas, in device px; and its size in CSS px, as it is placed. */
export interface AtlasCell {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The box the placer uses, in CSS px: the cell less its pad. */
  boxWidth: number;
  boxHeight: number;
}

export interface NameAtlas {
  ratio: number;
  width: number;
  height: number;
  /** Two bytes a texel: R the letters, G the halo. */
  data: Uint8Array;
  cells: ReadonlyMap<string, AtlasCell>;
  pad: number;
}

/** A canvas to draw on: the browser's, or a test's. */
export interface AtlasCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): AtlasContext | null;
}
export type AtlasContext = Pick<CanvasRenderingContext2D,
  'font' | 'textAlign' | 'textBaseline' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'globalAlpha'
  | 'measureText' | 'fillText' | 'strokeText' | 'getImageData' | 'clearRect'> & { letterSpacing?: string };

/** Each row of the atlas is this many CSS px wide, times the ratio. */
export const ATLAS_WIDTH_CSS = 1024;

/** The pad round each name, in device px: room for the glow. */
export function atlasPad(ratio: number): number {
  return Math.ceil((NAME_HALO.glow.widthPx / 2 + 1) * ratio);
}

/** Lays the names out in rows: no drawing, so it can be checked without a canvas. */
export function layoutNameAtlas(
  labels: readonly TerritoryLabel[],
  ratio: number,
  measure: (label: TerritoryLabel, line: string) => number,
): { width: number; height: number; cells: Map<string, AtlasCell>; pad: number } {
  const pad = atlasPad(ratio);
  const width = Math.round(ATLAS_WIDTH_CSS * ratio);
  const cells = new Map<string, AtlasCell>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const label of labels) {
    const tier = tierOf(label.rank);
    const lineHeight = tier.sizePx * NAME_LINE_HEIGHT * ratio;
    const textWidth = Math.ceil(Math.max(...label.lines.map((line) => measure(label, line))));
    const textHeight = Math.ceil(label.lines.length * lineHeight);
    const cellWidth = Math.min(width, textWidth + 2 * pad);
    const cellHeight = textHeight + 2 * pad;
    if (x + cellWidth > width) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    cells.set(label.code, {
      x, y, width: cellWidth, height: cellHeight,
      boxWidth: textWidth / ratio,
      boxHeight: textHeight / ratio,
    });
    x += cellWidth;
    rowHeight = Math.max(rowHeight, cellHeight);
  }
  return { width, height: y + rowHeight, cells, pad };
}

/**
 * Waits until the text face is loaded in both weights the names use, and the
 * accented letters with it. False when it has not come within the time allowed:
 * the screen draws anyway and draws again when it comes; a card asking for names
 * is refused, since it would not make the same picture twice.
 */
export async function waitForNameFonts(
  fonts: Pick<FontFaceSet, 'load'> | undefined = typeof document !== 'undefined' ? document.fonts : undefined,
  timeoutMs = 3_000,
): Promise<boolean> {
  if (!fonts) return false;
  const sample = 'ABCÃÉÇÅÔ';
  const loads = Promise.all([500, 600].map((weight) => fonts.load(`${weight} 12px ${FONTS.text}`, sample)))
    .then((faces) => faces.every((loaded) => loaded.length > 0));
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([loads, timeout]).catch(() => false);
}

/** Draws every name into the atlas at `ratio`, or null where there is no canvas to draw on (tests, workers). */
export function bakeNameAtlas(
  labels: readonly TerritoryLabel[],
  ratio: number,
  makeCanvas: () => AtlasCanvas | null = () => (typeof document === 'undefined' ? null : document.createElement('canvas') as unknown as AtlasCanvas),
): NameAtlas | null {
  const letters = makeCanvas();
  const halo = makeCanvas();
  const lc = letters?.getContext('2d');
  const hc = halo?.getContext('2d');
  if (!letters || !halo || !lc || !hc) return null;

  const fontOf = (label: TerritoryLabel) => nameFont(tierOf(label.rank), ratio);
  const trackingOf = (label: TerritoryLabel) => `${tierOf(label.rank).trackingEm}em`;
  const measure = (label: TerritoryLabel, line: string) => {
    lc.font = fontOf(label);
    lc.letterSpacing = trackingOf(label);
    return lc.measureText(line).width;
  };
  const layout = layoutNameAtlas(labels, ratio, measure);
  for (const canvas of [letters, halo]) {
    canvas.width = layout.width;
    canvas.height = layout.height;
  }

  for (const ctx of [lc, hc]) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // White coverage only: the shader colours both channels from the look's tokens.
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, layout.width, layout.height);
  }
  for (const label of labels) {
    const cell = layout.cells.get(label.code)!;
    const lineHeight = tierOf(label.rank).sizePx * NAME_LINE_HEIGHT * ratio;
    for (const ctx of [lc, hc]) {
      ctx.font = fontOf(label);
      ctx.letterSpacing = trackingOf(label);
    }
    label.lines.forEach((line, i) => {
      const cx = cell.x + cell.width / 2;
      const cy = cell.y + layout.pad + (i + 0.5) * lineHeight;
      hc.globalAlpha = NAME_HALO.glow.alpha;
      hc.lineWidth = NAME_HALO.glow.widthPx * ratio;
      hc.strokeText(line, cx, cy);
      hc.globalAlpha = NAME_HALO.stroke.alpha;
      hc.lineWidth = NAME_HALO.stroke.widthPx * ratio;
      hc.strokeText(line, cx, cy);
      lc.globalAlpha = 1;
      lc.fillText(line, cx, cy);
    });
  }

  const lettersData = lc.getImageData(0, 0, layout.width, layout.height).data;
  const haloData = hc.getImageData(0, 0, layout.width, layout.height).data;
  const data = new Uint8Array(layout.width * layout.height * 2);
  for (let i = 0, j = 0; j < data.length; i += 4, j += 2) {
    data[j] = lettersData[i + 3];
    data[j + 1] = haloData[i + 3];
  }
  return { ratio, width: layout.width, height: layout.height, data, cells: layout.cells, pad: layout.pad };
}
