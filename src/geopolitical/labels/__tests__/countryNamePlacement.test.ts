/**
 * Which country names are drawn, and where (decision K5, step 4: TS11, TS13).
 */
import { describe, expect, it } from 'vitest';
import { TERRITORY_LABELS, type TerritoryLabel } from '../../theme/territoryLabels';
import {
  CARD_LABEL_VISIBILITY,
  FACING_MIN,
  FACING_WHOLE,
  NAME_PAD_PX,
  facingOpacity,
  nameDue,
  nameFacing,
  nameZoom,
  nameZoomBias,
  orderNames,
  placeCountryNames,
  pxPerRadFrom,
  type NameCandidate,
} from '../countryNamePlacement';
import { NAME_HALO, NAME_TIERS, SELECTED_NAME_COLOUR, tierOf } from '../countryNameLook';
import { MIN_TEXT_PX, contrast } from '../../../styles/tokens';

const P5_FOV50 = 1 / Math.tan((25 * Math.PI) / 180);
const label = (code: string) => TERRITORY_LABELS.find((l) => l.code === code)!;
const dueCount = (zoom: number, visibility: number) => {
  const bias = nameZoomBias(visibility);
  return bias === null ? 0 : TERRITORY_LABELS.filter((l) => nameDue(l, zoom, bias)).length;
};

describe('how far in the camera is', () => {
  it('reads the map\'s scale at the middle of the view, as a web map\'s zoom', () => {
    expect(pxPerRadFrom(P5_FOV50, 900, 350)).toBeCloseTo(386, 0);
    expect(nameZoom(386)).toBeCloseTo(3.24, 2);
    expect(nameZoom(965)).toBeCloseTo(4.57, 2);
    expect(nameZoom(1930)).toBeCloseTo(5.57, 2);
  });

  it('keeps the scale in proportion when a capture draws a part of the view at another size', () => {
    // A view offset showing half the height, drawn into an output twice as tall: the projection's y scale doubles.
    expect(pxPerRadFrom(P5_FOV50 * 2, 900, 350)).toBeCloseTo(pxPerRadFrom(P5_FOV50, 900, 350) * 2, 6);
  });
});

describe('how many names', () => {
  it('follows Natural Earth\'s own choice at 60, none at 0, and the slider either way between', () => {
    const z = nameZoom(pxPerRadFrom(P5_FOV50, 900, 350));
    expect([0, 20, 40, 60, 80, 100].map((v) => dueCount(z, v))).toEqual([0, 31, 52, 106, 171, 242]);
    expect(CARD_LABEL_VISIBILITY).toBe(60);
  });

  it('never takes a name away as the camera comes in or the slider goes up', () => {
    let last = 0;
    for (let z = 1; z <= 7; z += 0.05) {
      const n = dueCount(z, 60);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    last = 0;
    for (let v = 1; v <= 100; v++) {
      const n = dueCount(3.24, v);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('keeps a country\'s name close in: Natural Earth\'s MAX_LABEL is not applied (TS13)', () => {
    expect(label('USA').maxZoom).toBeLessThan(8);
    expect(nameDue(label('USA'), 8, 0)).toBe(true);
  });

  it('holds a name it shows a little past its threshold, so it does not flicker there', () => {
    const fra = label('FRA');
    expect(nameDue(fra, fra.minZoom - 0.1, 0, true)).toBe(true);
    expect(nameDue(fra, fra.minZoom - 0.2, 0, true)).toBe(false);
    expect(nameDue(fra, fra.minZoom - 0.1, 0, false)).toBe(false);
  });
});

describe('in what order', () => {
  const as = (code: string) => ({ label: label(code) });

  it('places a larger country first, and a name already shown first only among its equals', () => {
    expect(label('CHN').rank).toBeLessThan(label('MNG').rank);
    expect(orderNames([as('MNG'), as('CHN')]).map((c) => c.label.code)).toEqual(['CHN', 'MNG']);
    expect(orderNames([as('MNG'), as('CHN')], { previous: new Set(['MNG']) }).map((c) => c.label.code)).toEqual(['CHN', 'MNG']);
    const sameRank = TERRITORY_LABELS.filter((l) => l.rank === label('MNG').rank && l.code !== 'MNG')[0];
    const pair = [{ label: sameRank }, as('MNG')];
    expect(orderNames(pair, { previous: new Set(['MNG']) })[0].label.code).toBe('MNG');
  });

  it('places the selected country first and the hovered one next, on screen', () => {
    const order = orderNames([as('CHN'), as('LUX'), as('BEL')], { selected: 'LUX', hovered: 'BEL' }).map((c) => c.label.code);
    expect(order).toEqual(['LUX', 'BEL', 'CHN']);
  });

  it('places the same names whatever order they arrive in', () => {
    const all = TERRITORY_LABELS.map((l) => ({ label: l }));
    const shuffled = [...all].reverse();
    expect(orderNames(shuffled).map((c) => c.label.code)).toEqual(orderNames(all).map((c) => c.label.code));
  });
});

describe('where', () => {
  const candidate = (l: TerritoryLabel, x: number, y: number): NameCandidate => ({ label: l, x, y, width: 60, height: 14 });
  const viewport = { width: 800, height: 600 };

  it('never places a name near the limb, and fades one in as it turns to face the camera', () => {
    const camera = { x: 0, y: 0, z: 400 };
    expect(nameFacing({ x: 0, y: 0, z: 100 }, camera)).toBeCloseTo(1, 6);
    expect(nameFacing({ x: 100, y: 0, z: 0 }, camera)).toBeLessThan(FACING_MIN);
    expect(facingOpacity(FACING_MIN)).toBe(0);
    expect(facingOpacity(FACING_WHOLE)).toBe(1);
    expect(facingOpacity((FACING_MIN + FACING_WHOLE) / 2)).toBeCloseTo(0.5, 6);
  });

  it('centres a name on its anchor, keeps it clear of the edge, and drops the weaker of two that would meet', () => {
    const placed = placeCountryNames([
      candidate(label('CHN'), 400, 300),
      candidate(label('MNG'), 410, 302),
      candidate(label('FRA'), 2, 300),
    ], { viewport });
    expect(placed.map((p) => p.id)).toEqual(['CHN']);
    expect(placed[0].box).toEqual({ x: 370, y: 293, width: 60, height: 14 });
  });

  it('moves a name no more than a line from its anchor: beside a glyph one line does not clear, it waits', () => {
    // From the running app: FRANCE's anchor just west of Germany's 35 px report glyph, at the default view.
    const glyph = { x: 713 - 17.5, y: 476 - 17.5, width: 35, height: 35 };
    expect(placeCountryNames([{ label: label('FRA'), x: 669.6, y: 487.3, width: 70, height: 15.6 }], { viewport, hard: [glyph] })).toEqual([]);
  });

  it('moves a name a line to clear a mark a person clicks', () => {
    const glyph = { x: 395, y: 296, width: 10, height: 8 };
    const placed = placeCountryNames([candidate(label('CHN'), 400, 300)], { viewport, hard: [glyph] });
    expect(placed).toHaveLength(1);
    expect(Math.abs(placed[0].shift)).toBeCloseTo(tierOf(label('CHN').rank).sizePx * 1.2, 6);
    const b = placed[0].box;
    const clear = b.y + b.height + NAME_PAD_PX <= glyph.y || glyph.y + glyph.height <= b.y - NAME_PAD_PX;
    expect(clear).toBe(true);
  });
});

describe('the look', () => {
  it('is never smaller than the app\'s least type size', () => {
    for (const tier of NAME_TIERS) expect(tier.sizePx).toBeGreaterThanOrEqual(MIN_TEXT_PX);
  });

  it('reads against its own halo in every tier, and in the selected colour', () => {
    for (const colour of [...NAME_TIERS.map((t) => t.colour), SELECTED_NAME_COLOUR]) {
      expect(contrast(colour, NAME_HALO.colour)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives the giants the largest type and the smallest countries the least', () => {
    expect(tierOf(2).sizePx).toBeGreaterThan(tierOf(4).sizePx);
    expect(tierOf(4).sizePx).toBeGreaterThan(tierOf(7).sizePx);
  });
});
