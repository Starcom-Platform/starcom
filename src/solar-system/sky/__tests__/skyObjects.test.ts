/**
 * What Sky from a place draws (plan D5): a star's place in the catalogue's axes, its size by magnitude and colour by
 * B−V, how dark the night is and how bright the day by the Sun's altitude.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { daylightOf, eqjUnit, nightOf, starColour, starPixels } from '../skyObjects';

describe("Sky from a place's drawing", () => {
  it('places a star in the catalogue axes: the equinox on x, the pole on z', () => {
    expect(eqjUnit(0, 0).toArray().map((x) => Number(x.toFixed(9)))).toEqual([1, 0, 0]);
    expect(eqjUnit(90, 0).toArray().map((x) => Number(x.toFixed(9)))).toEqual([0, 1, 0]);
    expect(eqjUnit(123, 90).z).toBeCloseTo(1, 12);
  });

  it('sizes a star by its magnitude and colours it by its B−V', () => {
    expect(starPixels(-1.46)).toBeCloseTo(7.9, 1);
    expect(starPixels(-3)).toBe(8);
    expect(starPixels(6)).toBe(1.2);
    expect(starPixels(3)).toBeGreaterThan(starPixels(5));
    const [r1, , b1] = starColour(-0.3);
    const [r2, , b2] = starColour(1.5);
    expect(b1).toBeGreaterThan(r1 - 0.4);
    expect(r2).toBe(1);
    expect(b2).toBeLessThan(0.6);
    expect(starColour(null)).toEqual([1, 1, 1]);
  });

  it('darkens the night by the Sun: full below 15° under the horizon, gone by day', () => {
    expect(nightOf(-30)).toBe(1);
    expect(nightOf(10)).toBe(0);
    expect(nightOf(-8)).toBeGreaterThan(0);
    expect(nightOf(-8)).toBeLessThan(1);
    expect(daylightOf(30)).toEqual({ day: 1, twilight: 0 });
    expect(daylightOf(-30)).toEqual({ day: 0, twilight: 0 });
    expect(daylightOf(-5).twilight).toBeGreaterThan(0);
  });
});
