/**
 * An event chart on a card (D-PW, PW87): the chart as asked, the sky outside at the card's moment unless said; what the
 * record states of it; a lower corner of the picture first, clear of what it must not cover; the wheel drawn there.
 */
import { describe, expect, it, vi } from 'vitest';
import { chartForCard, chartProvenance, drawChartInset, layoutChartInset, CHART_INSET_SHARE } from '../chartCard';
import { DEFAULT_CARD_THEME } from '../drawShareCard';

const AT = Date.UTC(2026, 10, 10, 6) / 1000;
const CARD = Date.UTC(2026, 10, 11, 12) / 1000;

describe('chartForCard', () => {
  it('draws the sky at the card\'s moment outside, in the Galactic Centre frame, unless the shot says', () => {
    expect(chartForCard({ at: AT, lat: 3, lng: 41 }, CARD).drawn).toEqual({ at: AT, lat: 3, lng: 41, cursorAt: CARD, frame: 'galactic' });
    const said = chartForCard({ at: AT, lat: 3, lng: 41, cursorAt: AT, frame: 'tropical', title: 'Mandera' }, CARD);
    expect(said.drawn).toEqual({ at: AT, lat: 3, lng: 41, title: 'Mandera', cursorAt: AT, frame: 'tropical' });
    // At its own moment, every body is conjunct itself.
    expect(said.wheel.across.filter((a) => a.then === a.now && a.kind === 'conjunction')).toHaveLength(11);
  });
});

describe('chartProvenance', () => {
  it('states the moments, the place, five aspects at most, the frame, houses and orbs, in four to six lines', () => {
    const p = chartProvenance(chartForCard({ at: AT, lat: 3, lng: 41, title: 'Mandera', cursorAt: AT }, CARD));
    expect(p).toMatchObject({ title: 'Mandera', atS: AT, place: { lat: 3, lng: 41 }, cursorAtS: AT, frame: 'galactic', houses: 'Placidus' });
    expect(p.across).toHaveLength(5);
    expect(p.lines[0]).toBe('Event chart. Inside: Mandera, 10 Nov 2026 06:00Z, 3.0° N, 41.0° E.');
    expect(p.lines[1]).toBe('Outside: the sky at 10 Nov 2026 06:00Z.');
    expect(p.lines.slice(2, 5).every((l) => / now conjunct .+ then, 0°\.$/.test(l))).toBe(true);
    expect(p.lines[p.lines.length - 1]).toMatch(/^Galactic Centre .*; Placidus houses; The sky catalogue's orbs/);
  });
});

describe('layoutChartInset', () => {
  const picture = { x: 0, y: 0, width: 800, height: 600 };
  const side = Math.round(CHART_INSET_SHARE * 600);
  it('takes the lower left corner first, then the lower right, clear of what it must not cover', () => {
    expect(layoutChartInset(picture, [], 24)).toEqual({ x: 12, y: 600 - 12 - side, width: side, height: side });
    const label = { x: 20, y: 500, width: 100, height: 30 };
    expect(layoutChartInset(picture, [label], 24)).toMatchObject({ x: 800 - 12 - side, y: 600 - 12 - side });
  });
});

describe('drawChartInset', () => {
  it('backs the square and draws the wheel inside it', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(), fillText: vi.fn(),
      globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic',
    };
    const rect = { x: 10, y: 300, width: 280, height: 280 };
    drawChartInset(ctx as unknown as CanvasRenderingContext2D, rect, chartForCard({ at: AT, lat: 3, lng: 41 }, CARD), DEFAULT_CARD_THEME);
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 300, 280, 280);
    expect(ctx.arc).toHaveBeenCalledTimes(4);
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toEqual(expect.arrayContaining(['ASC', 'MC', 'Ar', 'Pi']));
    // Every word inside the square.
    for (const [, x, y] of ctx.fillText.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(rect.x);
      expect(x).toBeLessThanOrEqual(rect.x + rect.width);
      expect(y).toBeGreaterThanOrEqual(rect.y);
      expect(y).toBeLessThanOrEqual(rect.y + rect.height);
    }
    expect(ctx.restore).toHaveBeenCalled();
  });
});
