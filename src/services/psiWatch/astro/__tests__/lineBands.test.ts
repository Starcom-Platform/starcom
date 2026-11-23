/**
 * Planet lines' bands and parans (D-PW, PW59, PW81–PW84): a place on a line is in its band at 0 km, the band as wide
 * as the kit's orb for its body, an MC band narrowing with latitude; at every paran both bodies are on their lines.
 */
import { describe, expect, it } from 'vitest';
import { altitudeDeg, bandRibbons, bandsHolding, KM_PER_DEG, orbDeg, paransAt } from '../lineBands';
import { horizonCrossing, meridianLines, wrap180 } from '../lines';

const AT = new Date(Date.UTC(2026, 10, 10, 18, 30));

describe('the orbs', () => {
  it("are the kit's, by body: the Moon 1°, the Sun, Mercury and Venus 2°, the rest 1°", () => {
    expect([orbDeg('Moon'), orbDeg('Sun'), orbDeg('Mercury'), orbDeg('Venus'), orbDeg('Mars'), orbDeg('Pluto')]).toEqual([1, 2, 2, 2, 1, 1]);
    expect(KM_PER_DEG).toBeCloseTo(111.195, 2);
  });
});

describe('a place on a band', () => {
  it('is on an MC line at 0 km, its band narrowing with latitude', () => {
    const { mc } = meridianLines('Mars', AT);
    const atEquator = bandsHolding({ lat: 0, lng: mc }, AT, ['Mars']).find((b) => b.angle === 'MC');
    expect(atEquator?.km).toBeCloseTo(0, 6);
    expect(atEquator?.orbKm).toBeCloseTo(KM_PER_DEG, 3);
    const north = bandsHolding({ lat: 60, lng: wrap180(mc + 0.5) }, AT, ['Mars']).find((b) => b.angle === 'MC');
    expect(north?.km).toBeCloseTo(0.5 * KM_PER_DEG * 0.5, 1);
    expect(north?.orbKm).toBeCloseTo(KM_PER_DEG * 0.5, 1);
    expect(bandsHolding({ lat: 0, lng: wrap180(mc + 1.5) }, AT, ['Mars']).some((b) => b.angle === 'MC')).toBe(false);
    // The Sun's orb is twice as wide: the same offset falls inside.
    const sun = meridianLines('Sun', AT);
    expect(bandsHolding({ lat: 0, lng: wrap180(sun.mc + 1.5) }, AT, ['Sun']).some((b) => b.angle === 'MC')).toBe(true);
  });

  it('is on a rising or setting line where the body stands on the horizon, at 0 km', () => {
    const { mc, dec } = meridianLines('Moon', AT);
    const crossing = horizonCrossing(mc, dec, 35);
    if ('state' in crossing) throw new Error('the Moon should rise at 35°');
    const asc = bandsHolding({ lat: 35, lng: crossing.asc }, AT, ['Moon']).find((b) => b.angle === 'ASC');
    const dsc = bandsHolding({ lat: 35, lng: crossing.dsc }, AT, ['Moon']).find((b) => b.angle === 'DSC');
    expect(asc?.km).toBeLessThan(0.5);
    expect(dsc?.km).toBeLessThan(0.5);
    expect(asc?.orbKm).toBeCloseTo(KM_PER_DEG, 3);
  });

  it('is nowhere far from every line', () => {
    const { mc } = meridianLines('Saturn', AT);
    // Half a turn of hour angle from the meridian, at the pole of the horizon: overhead is not a line.
    const overhead = meridianLines('Saturn', AT);
    expect(bandsHolding({ lat: overhead.dec, lng: wrap180(mc + 60) }, AT, ['Saturn']).filter((b) => b.km > 300)).toEqual([]);
  });
});

describe('the ribbons drawn', () => {
  it('are four a body, an MC ribbon its orb either side of its meridian', () => {
    const ribbons = bandRibbons(AT, ['Venus']);
    const kinds = ribbons.map((r) => r.angle);
    expect(kinds.filter((k) => k === 'MC')).toHaveLength(1);
    expect(kinds).toEqual(expect.arrayContaining(['MC', 'IC', 'ASC', 'DSC']));
    const { mc } = meridianLines('Venus', AT);
    const row = ribbons.find((r) => r.angle === 'MC')!.rows[10];
    expect(wrap180(row[1].lng - row[0].lng)).toBeCloseTo(2 * orbDeg('Venus'), 6);
    expect(wrap180((row[0].lng + row[1].lng) / 2 - mc)).toBeCloseTo(0, 6);
  });

  it('keeps each horizon row its orb above and below the horizon', () => {
    const { dec, mc } = meridianLines('Jupiter', AT);
    const altAt = (p: { lat: number; lng: number }) => altitudeDeg(p.lat, dec, wrap180(p.lng - mc));
    const horizonRibbons = bandRibbons(AT, ['Jupiter']).filter((r) => r.angle === 'ASC' || r.angle === 'DSC');
    expect(horizonRibbons.length).toBeGreaterThanOrEqual(2);
    for (const ribbon of horizonRibbons) {
      for (const [lower, upper] of ribbon.rows) {
        expect(altAt(lower)).toBeCloseTo(-orbDeg('Jupiter'), 6);
        expect(altAt(upper)).toBeCloseTo(orbDeg('Jupiter'), 6);
      }
    }
  });
});

describe('the parans', () => {
  it('stand where two lines cross, both bodies on their lines there', () => {
    const parans = paransAt(AT, ['Moon', 'Mars']);
    // Each meridian of each body across the other's horizon (4), and the two horizons (2).
    expect(parans.length).toBe(6);
    for (const p of parans) {
      expect(p.a.body).not.toBe(p.b.body);
      const held = bandsHolding({ lat: p.lat, lng: p.lng }, AT, [p.a.body, p.b.body]);
      expect(held.find((b) => b.body === p.a.body && b.angle === p.a.angle)?.km ?? Infinity).toBeLessThan(1);
      expect(held.find((b) => b.body === p.b.body && b.angle === p.b.angle)?.km ?? Infinity).toBeLessThan(1);
      expect(p.halfWidthDeg).toBe(1);
    }
    // Sorted north to south; none of one body alone.
    expect(parans.map((p) => p.lat)).toEqual([...parans.map((p) => p.lat)].sort((x, y) => y - x));
    expect(paransAt(AT, ['Moon'])).toEqual([]);
  });

  it('take the smaller orb of the two bodies as their half width', () => {
    expect(paransAt(AT, ['Sun', 'Venus']).every((p) => p.halfWidthDeg === 2)).toBe(true);
    expect(paransAt(AT, ['Sun', 'Saturn']).every((p) => p.halfWidthDeg === 1)).toBe(true);
  });
});
