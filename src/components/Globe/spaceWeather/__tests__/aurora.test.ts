/**
 * The aurora drawn from OVATION (space-weather-visualization.md, SW3): its colours by the chance,
 * the band's texels and the curtain's colours (the key's, so the key is what is drawn), and its
 * night curtain's path round each oval.
 */
import { describe, expect, it } from 'vitest';
import { auroraRgb, bandTexel, createAurora, curtainColours, curtainPath, CURTAIN_BASE, CURTAIN_MAX } from '../aurora';
import { DATA_SCALES } from '../../../../styles/tokens';
import { auroraOval, type OvalPoint, type OvationGrid } from '../../../../services/spaceWeather/ovation';

const bytes = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

describe('the aurora\'s colours', () => {
  it('are the token\'s at each stop, blended between, held past the ends', () => {
    for (const [percent, hex] of DATA_SCALES.auroraPercent) expect(auroraRgb(percent)).toEqual(bytes(hex));
    const [a, b] = [bytes(DATA_SCALES.auroraPercent[1][1]), bytes(DATA_SCALES.auroraPercent[2][1])];
    expect(auroraRgb(17.5)).toEqual([0, 1, 2].map((k) => Math.round((a[k] + b[k]) / 2)));
    expect(auroraRgb(0)).toEqual(bytes(DATA_SCALES.auroraPercent[0][1]));
    expect(auroraRgb(100)).toEqual(bytes(DATA_SCALES.auroraPercent[DATA_SCALES.auroraPercent.length - 1][1]));
  });
});

describe('the band', () => {
  it('draws each chance in the key\'s own colour for it, at full glow from 12%', () => {
    for (const percent of [12, 25, 50, 90]) expect(bandTexel(percent)).toEqual([...auroraRgb(percent), 255]);
  });

  it('fades out below that, colour and glow together, and is dark where there is none', () => {
    const faint = bandTexel(5);
    expect(faint[3]).toBeGreaterThan(0);
    expect(faint[3]).toBeLessThan(255);
    // Premultiplied: the colour scaled by the glow, so a soft halo keeps its hue.
    expect(faint.slice(0, 3)).toEqual(auroraRgb(5).map((b) => Math.round((b * faint[3]) / 255)));
    expect(bandTexel(1)).toEqual([0, 0, 0, 0]);
    expect(bandTexel(0)).toEqual([0, 0, 0, 0]);
  });
});

describe('the curtain\'s colours', () => {
  it('are the chance\'s own at its foot, and at its top too, below an even chance', () => {
    for (const peak of [5, 20, 50]) expect(curtainColours(peak)).toEqual({ foot: auroraRgb(peak), top: auroraRgb(peak) });
  });

  it('turn toward the key\'s strongest at the top of a strong aurora, as its red is', () => {
    expect(curtainColours(90).top).toEqual(auroraRgb(90));
    const [from, to] = [auroraRgb(70), auroraRgb(90)];
    expect(curtainColours(70).top).toEqual([0, 1, 2].map((k) => Math.round(from[k] + (to[k] - from[k]) * 0.5)));
    expect(curtainColours(70).foot).toEqual(auroraRgb(70));
  });
});

describe('the curtain\'s path', () => {
  const oval = (points: Record<number, [number, number]>): OvalPoint[] =>
    Array.from({ length: 360 }, (_, lng) => (points[lng] ? { lng, lat: points[lng][0], peak: points[lng][1] } : { lng, lat: null, peak: 0 }));

  it('runs round the oval, rising higher where the chance is greater, closed at the end', () => {
    const path = curtainPath(oval({ 0: [65, 0], 1: [66, 40], 2: [67, 20] }));
    expect(path).toHaveLength(361);
    expect(path[1]).toEqual({ lng: 1, lat: 66, peak: 40, height: CURTAIN_MAX });
    expect(path[2].height).toBeCloseTo(CURTAIN_BASE + (CURTAIN_MAX - CURTAIN_BASE) * 0.5, 6);
    expect(path[360]).toEqual({ ...path[0], lng: 360 });
  });

  it('carries the line through longitudes with no aurora at the latitudes either side, unlit', () => {
    const path = curtainPath(oval({ 10: [60, 20], 20: [70, 20] }));
    expect(path[15]).toMatchObject({ lat: 65, peak: 0 });
    // Round the back of the loop, between 20° and 370° (10° again).
    expect(path[200].lat).toBeCloseTo(70 - (10 * 180) / 350, 6);
  });

  it('is none where the hemisphere has no aurora at all', () => {
    expect(curtainPath(oval({}))).toEqual([]);
  });
});

describe('the curtain switched off', () => {
  it('stays off through a newer forecast, the band still drawn', () => {
    const values = new Uint8Array(360 * 181);
    for (let lng = 0; lng < 360; lng++) values[(65 + 90) * 360 + lng] = 20;
    const grid: OvationGrid = { observed: '2026-10-10T12:14:00Z', forecast: '2026-10-10T13:21:00Z', values, max: 20, nonZero: 360 };
    const paths = { north: curtainPath(auroraOval(grid, 'north')), south: [] };
    const aurora = createAurora(grid, paths);
    aurora.setCurtain(false);
    aurora.setGrid(grid, paths);
    expect(aurora.object.getObjectByName('aurora-curtain-north')!.visible).toBe(false);
    expect(aurora.object.getObjectByName('aurora-band-north')!.visible).toBe(true);
    aurora.setCurtain(true);
    expect(aurora.object.getObjectByName('aurora-curtain-north')!.visible).toBe(true);
    aurora.dispose();
  });
});
