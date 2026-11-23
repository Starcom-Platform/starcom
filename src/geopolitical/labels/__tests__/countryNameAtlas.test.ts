/**
 * Every country's name drawn once, into one texture (decision K5, step 4).
 */
import { describe, expect, it } from 'vitest';
import { TERRITORY_LABELS } from '../../theme/territoryLabels';
import { ATLAS_WIDTH_CSS, atlasPad, bakeNameAtlas, layoutNameAtlas, waitForNameFonts, type AtlasCanvas, type AtlasContext } from '../countryNameAtlas';
import { NAME_HALO } from '../countryNameLook';
import { FONTS } from '../../../styles/tokens';

/** Text as wide as 0.6 of its size a character, the size read off the font string. */
const measureLike = (font: string, text: string) => text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.6;

interface Stroke { text: string; lineWidth: number; alpha: number }
function fakeCanvas(log: { strokes: Stroke[]; fills: string[] }): AtlasCanvas {
  const ctx = {
    font: '', textAlign: 'left', textBaseline: 'alphabetic', fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'miter', globalAlpha: 1, letterSpacing: '0px',
    measureText(text: string) { return { width: measureLike(ctx.font, text) } as TextMetrics; },
    fillText(text: string) { log.fills.push(text); },
    strokeText(text: string) { log.strokes.push({ text, lineWidth: ctx.lineWidth, alpha: ctx.globalAlpha }); },
    getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4) } as ImageData; },
    clearRect() {},
  };
  return { width: 0, height: 0, getContext: () => ctx as unknown as AtlasContext };
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('the atlas layout', () => {
  for (const ratio of [1, 1.5, 2]) {
    it(`fits all 247 names at ratio ${ratio}, in whole pixels, padded for the glow, none overlapping`, () => {
      const layout = layoutNameAtlas(TERRITORY_LABELS, ratio, (label, line) => measureLike(`${ratio * 12}px`, line));
      expect(layout.cells.size).toBe(247);
      expect(layout.width).toBe(ATLAS_WIDTH_CSS * ratio);
      expect(layout.pad).toBeGreaterThanOrEqual(Math.ceil(3.5 * ratio));
      const cells = [...layout.cells.values()];
      for (const cell of cells) {
        for (const v of [cell.x, cell.y, cell.width, cell.height]) expect(Number.isInteger(v)).toBe(true);
        expect(cell.x + cell.width).toBeLessThanOrEqual(layout.width);
        expect(cell.y + cell.height).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j])).toBe(false);
    });
  }

  it('gives the placer each name\'s box in CSS px, without the pad', () => {
    const layout = layoutNameAtlas(TERRITORY_LABELS, 2, () => 100);
    const usa = layout.cells.get('USA')!;
    expect(usa.boxWidth).toBe(50);
    expect(usa.width).toBe(100 + 2 * atlasPad(2));
  });
});

describe('baking the atlas', () => {
  it('draws each line\'s halo as a soft glow under a tight stroke, then its letters, at the ratio asked', () => {
    const log = { strokes: [] as Stroke[], fills: [] as string[] };
    const atlas = bakeNameAtlas(TERRITORY_LABELS.slice(0, 3), 2, () => fakeCanvas(log))!;
    expect(atlas.ratio).toBe(2);
    expect(log.fills).toEqual(TERRITORY_LABELS.slice(0, 3).flatMap((l) => l.lines));
    expect(log.strokes.slice(0, 2)).toEqual([
      { text: TERRITORY_LABELS[0].lines[0], lineWidth: NAME_HALO.glow.widthPx * 2, alpha: NAME_HALO.glow.alpha },
      { text: TERRITORY_LABELS[0].lines[0], lineWidth: NAME_HALO.stroke.widthPx * 2, alpha: NAME_HALO.stroke.alpha },
    ]);
    expect(atlas.data).toHaveLength(atlas.width * atlas.height * 2);
  });

  it('bakes nothing where there is no canvas to draw on', () => {
    expect(bakeNameAtlas(TERRITORY_LABELS, 1, () => null)).toBeNull();
  });
});

describe('waiting for the face', () => {
  it('asks for both weights the names use, in the text face\'s own stack', async () => {
    const asked: string[] = [];
    const fonts = { load: async (font: string) => { asked.push(font); return [{} as FontFace]; } };
    expect(await waitForNameFonts(fonts)).toBe(true);
    expect(asked).toEqual([`500 12px ${FONTS.text}`, `600 12px ${FONTS.text}`]);
  });

  it('reports a fallback when the face does not come in time, or comes empty', async () => {
    const never = { load: () => new Promise<FontFace[]>(() => {}) };
    expect(await waitForNameFonts(never, 10)).toBe(false);
    const empty = { load: async () => [] as FontFace[] };
    expect(await waitForNameFonts(empty)).toBe(false);
  });
});
