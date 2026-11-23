/**
 * The baked sky (scripts/sky/bake-sky.mjs; OR41): every star of the Yale Bright Star Catalogue to magnitude 6,
 * brightest first, and the IAU's 88 constellations, 86 with figures, each segment within the sky.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SkyData } from '../sky/skyObjects';

const sky = JSON.parse(readFileSync('public/data/sky/sky-mag6.json', 'utf8')) as SkyData;

describe('the baked sky', () => {
  it('holds the stars to magnitude 6, brightest first, Sirius the brightest', () => {
    expect(sky.magLimit).toBe(6);
    expect(sky.stars.length).toBeGreaterThan(4900);
    expect(sky.stars.length).toBeLessThan(5200);
    expect(sky.stars.every(([, , v]) => v <= 6)).toBe(true);
    expect(sky.stars.every((s, i, all) => i === 0 || all[i - 1][2] <= s[2])).toBe(true);
    const [ra, dec, v] = sky.stars[0];
    expect([Math.round(ra), Math.round(dec), v]).toEqual([101, -17, -1.46]);
  });

  it("holds the IAU's 88, with their figures, and says where both came from", () => {
    expect(sky.constellations).toHaveLength(88);
    expect(sky.constellations.filter((c) => c.lines.length > 0)).toHaveLength(86);
    expect(sky.constellations.find((c) => c.abbr === 'Ori')?.name).toBe('Orion');
    for (const c of sky.constellations) {
      for (const [ra1, dec1, ra2, dec2, weight] of c.lines) {
        for (const ra of [ra1, ra2]) expect(ra >= 0 && ra < 360).toBe(true);
        for (const dec of [dec1, dec2]) expect(Math.abs(dec) <= 90).toBe(true);
        expect([0, 1, 2]).toContain(weight);
      }
    }
    expect(sky.sources.stars).toContain('Yale Bright Star Catalogue');
    expect(sky.sources.lines).toContain('CC BY 4.0');
  });
});
