/**
 * The Timestream strip in a card (D-PW, PW62, PW77): the card's moment ±3 days unless it asks for another, each
 * window's weight curve with the card's own lit, Kp's bars, the bodies' lanes in their frame; its record and sources;
 * and drawn in its band, the moment marked, held-back years quiet.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { kpRecord, type KpSpan } from '../../../../services/psiWatch/timestream/kp';
import type { PsiLaneItem } from '../../../../services/psiWatch/timestream/psiLanes';
import { stripModel, stripSpan, timestreamProvenance, STRIP_HALF_SPAN_MS } from '../timestreamStrip';
import { drawTimestreamStrip, elementColour, stripLanes } from '../drawTimestreamStrip';
import { DEFAULT_CARD_THEME, type Drawable2D } from '../drawShareCard';

const AT = Date.UTC(2026, 10, 1, 12);
const HOUR = 3_600_000;
const window = (address: string, fromMs: number, untilMs: number): PsiLaneItem => ({
  lane: 'windows', address, title: address, fromMs, untilMs, peakMs: (fromMs + untilMs) / 2,
  window: { from: fromMs / 1000, peak: (fromMs + untilMs) / 2000, until: untilMs / 1000, anchor: (fromMs + untilMs) / 2000, profile: null },
});
const ITEMS = [window('mine', AT - 6 * HOUR, AT + 6 * HOUR), window('other', AT + 24 * HOUR, AT + 30 * HOUR), window('far', AT + 30 * 24 * HOUR, AT + 31 * 24 * HOUR)];
const slot = (h: number, kp: number, basis: KpSpan['basis'] = 'observed'): KpSpan => ({ fromMs: AT + h * HOUR, untilMs: AT + (h + 3) * HOUR, kp, basis });
const KP = kpRecord(null, [slot(-3, 2), slot(0, 5.33), slot(3, 6, 'predicted')], []);

describe('stripModel', () => {
  it('spans the card\'s moment ±3 days unless asked otherwise, never wider than 92 days', () => {
    expect(stripSpan(AT)).toEqual({ fromMs: AT - STRIP_HALF_SPAN_MS, untilMs: AT + STRIP_HALF_SPAN_MS });
    expect(stripSpan(AT, AT - HOUR, AT + HOUR)).toEqual({ fromMs: AT - HOUR, untilMs: AT + HOUR });
    expect(() => stripSpan(AT, AT, AT - 1)).toThrow(/before its until/);
    expect(() => stripSpan(AT, AT - 50 * 24 * HOUR, AT + 50 * 24 * HOUR)).toThrow(/92 days/);
  });

  it('draws the windows in its span, the card\'s own lit, Kp\'s bars, and each body\'s lane in its frame', () => {
    const model = stripModel({ atMs: AT, items: ITEMS, lit: ['mine'], kp: KP, bodies: ['Venus', 'Jupiter'], frame: 'galactic', columns: 60 });
    expect(model.windows.map((w) => [w.address, w.lit])).toEqual([['mine', true], ['other', false]]);
    // A window with no profile is a band: no weight to read, so NaN while it holds, 0 outside.
    expect(Number.isNaN(model.windows[0].weights[30])).toBe(true);
    expect(model.windows[0].weights[0]).toBe(0);
    expect(model.kp.map((b) => b.kp)).toEqual([2, 5.333333333333333, 6]);
    expect(model.bodies.map((b) => [b.body, b.longitudes.length])).toEqual([['Venus', 60], ['Jupiter', 60]]);
    expect(model.held).toEqual([]);
  });

  it('draws only the lanes asked for, and the held-back years where its span touches them (PW75)', () => {
    const old = Date.UTC(2003, 9, 29);
    const model = stripModel({ atMs: old, lanes: ['kp'], items: ITEMS, kp: KP, bodies: ['Venus'], frame: 'galactic', columns: 10 });
    expect([model.windows, model.bodies]).toEqual([[], []]);
    expect(model.held.map((h) => h.years)).toEqual(['1966–2025']);
  });

  it('says what it drew, and credits its sources as they ask', () => {
    const model = stripModel({ atMs: AT, items: ITEMS, lit: ['mine'], kp: KP, bodies: ['Venus'], frame: 'galactic', columns: 10 });
    expect(timestreamProvenance(model)).toEqual({
      fromS: (AT - STRIP_HALF_SPAN_MS) / 1000, untilS: (AT + STRIP_HALF_SPAN_MS) / 1000, atS: AT / 1000,
      lanes: ['windows', 'kp', 'bodies'], bodies: ['Venus'], frame: 'galactic', windows: 2,
      credits: [expect.stringMatching(/JPL DE440s/), expect.stringMatching(/GFZ Potsdam.*CC BY 4\.0/), 'NOAA SWPC', 'Astronomy Engine'],
    });
  });
});

describe('drawing the strip', () => {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', font: '', textBaseline: 'top', lineWidth: 1,
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)} ${ctx.fillStyle}`),
    fillText: (text: string) => calls.push(`text ${text}`),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => calls.push(`fill ${ctx.fillStyle}`),
    arc: () => {}, drawImage: () => {},
  } as unknown as Drawable2D & { fillStyle: string };

  it('colours a sign by its element, blended from each sign\'s middle (PW41)', () => {
    expect(elementColour(15)).toBe('#ff0000');
    expect(elementColour(45)).toBe('#00ff00');
    expect(elementColour(30)).toBe('#808000');
  });

  it('lays out Windows, Kp and each body under its ruler, and marks the card\'s moment', () => {
    const model = stripModel({ atMs: AT, items: ITEMS, lit: ['mine'], kp: KP, bodies: ['Venus', 'Jupiter'], frame: 'galactic', columns: 40 });
    const rect = { x: 0, y: 500, width: 800, height: 160 };
    const lanes = stripLanes(model, rect, 18);
    expect(lanes.map((l) => l.lane)).toEqual(['windows', 'kp', 'body', 'body']);
    expect(lanes[0].y).toBe(518);
    expect(lanes[0].height).toBeGreaterThan(lanes[1].height);
    calls.length = 0;
    drawTimestreamStrip(ctx, rect, model, DEFAULT_CARD_THEME, 12);
    expect(calls).toEqual(expect.arrayContaining(['text Windows', 'text Kp', 'text Venus (GC)', 'text Jupiter (GC)']));
    // The card's own window brighter than the others.
    expect(calls).toEqual(expect.arrayContaining([expect.stringMatching(/^fill #5CF5DAb3$/), expect.stringMatching(/^fill #5CF5DA40$/)]));
    // The moment, a line at the middle of the span.
    expect(calls.some((c) => c.startsWith('rect 399,'))).toBe(true);
  });
});
