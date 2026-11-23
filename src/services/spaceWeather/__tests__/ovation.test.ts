/**
 * NOAA SWPC's OVATION aurora forecast (space-weather-visualization.md, SW3): its 1° grid of
 * the chance of aurora overhead, read as it is served, and the oval it draws.
 */
import { describe, expect, it } from 'vitest';
import { auroraOval, ovationAt, parseOvation } from '../ovation';

/** A served file: lon-major, every longitude 0–359 and latitude −90–90, a value at each, here zero except those given. */
function served(values: Record<string, number> = {}, over: Record<string, unknown> = {}) {
  const coordinates: number[][] = [];
  for (let lon = 0; lon < 360; lon++) for (let lat = -90; lat <= 90; lat++) coordinates.push([lon, lat, values[`${lon},${lat}`] ?? 0]);
  return { 'Observation Time': '2026-10-10T12:14:00Z', 'Forecast Time': '2026-10-10T13:21:00Z', 'Data Format': '[Longitude, Latitude, Aurora]', coordinates, type: 'MultiPoint', ...over };
}

describe('reading OVATION', () => {
  it('reads every cell, and when it was observed and what moment it forecasts', () => {
    const grid = parseOvation(served({ '10,65': 27, '200,-70': 9 }));
    expect(grid).toMatchObject({ observed: '2026-10-10T12:14:00Z', forecast: '2026-10-10T13:21:00Z', max: 27, nonZero: 2 });
    expect(ovationAt(grid, 65, 10)).toBe(27);
    expect(ovationAt(grid, -70, 200)).toBe(9);
    // West of Greenwich as east of it, the way the grid counts.
    expect(ovationAt(grid, -70, -160)).toBe(9);
    expect(ovationAt(grid, 0, 0)).toBe(0);
  });

  it('refuses a file not in the form it states, rather than drawing an aurora in the wrong places', () => {
    expect(() => parseOvation(served({}, { 'Data Format': '[Latitude, Longitude, Aurora]' }))).toThrow('OVATION\'s data format was "[Latitude, Longitude, Aurora]", not "[Longitude, Latitude, Aurora]".');
    expect(() => parseOvation({ ...served(), coordinates: [[0, -90, 5]] })).toThrow('OVATION held 1 cells, not 65,160.');
    expect(() => parseOvation({ ...served(), 'Forecast Time': 'soon' })).toThrow('OVATION\'s forecast time "soon" is not a time.');
  });
});

describe('the oval', () => {
  it('runs through each longitude at the middle of its band, weighted by the chance there, and how strong it is', () => {
    // At longitude 10 the band spans 64–66°N, strongest at 65.
    const grid = parseOvation(served({ '10,64': 10, '10,65': 20, '10,66': 10, '11,70': 4 }));
    const north = auroraOval(grid, 'north');
    expect(north).toHaveLength(360);
    expect(north[10]).toEqual({ lng: 10, lat: 65, peak: 20 });
    expect(north[11]).toEqual({ lng: 11, lat: 70, peak: 4 });
    // A longitude with no aurora has none.
    expect(north[100]).toEqual({ lng: 100, lat: null, peak: 0 });
    // Leaning toward where the chance is greater: 30% at 60°N and 10% at 62°N put the middle at 60.5°N, not 61°N.
    const leaning = auroraOval(parseOvation(served({ '12,60': 30, '12,62': 10 })), 'north');
    expect(leaning[12]).toEqual({ lng: 12, lat: 60.5, peak: 30 });
  });

  it('keeps the hemispheres apart', () => {
    const grid = parseOvation(served({ '10,65': 20, '10,-70': 8 }));
    expect(auroraOval(grid, 'north')[10]).toMatchObject({ lat: 65, peak: 20 });
    expect(auroraOval(grid, 'south')[10]).toMatchObject({ lat: -70, peak: 8 });
  });
});
