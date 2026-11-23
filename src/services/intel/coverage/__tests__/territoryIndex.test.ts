/**
 * Resolving a jurisdiction a publisher named to a polygon we can draw.
 *
 * Tested against the real Natural Earth file, not fixtures, because the whole
 * difficulty is in that file's quirks: ISO_A2 is `-99` for eight territories,
 * France among them, and a lookup that reads only that field fails on one of
 * the first places anyone would test.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildTerritoryIndex } from '../territoryIndex';

const geo = JSON.parse(fs.readFileSync('public/geopolitical/world-territories-lod0.geojson', 'utf8'));
const index = buildTerritoryIndex(geo.features);

describe('territoryIndex.byCode', () => {
  it('resolves a plain country code', () => {
    expect(index.byCode('us')?.name).toContain('United States');
  });

  it('resolves FRANCE, whose ISO_A2 is -99 in this dataset', () => {
    // The specific trap. ISO_A2 carries -99 for France and the real code lives
    // in ISO_A2_EH; reading only the first field returns nothing here.
    expect(index.byCode('fr')?.name).toBe('France');
  });

  it('resolves Norway, the same quirk', () => {
    expect(index.byCode('no')?.name).toBe('Norway');
  });

  it('is case and whitespace insensitive, since the tag is whatever was typed', () => {
    expect(index.byCode(' US ')?.name).toBe(index.byCode('us')?.name);
  });

  it('refuses a sub-national code rather than widening it to the country', () => {
    // `us-tx` must NOT resolve to the United States. Drawing a state's subject
    // as its whole country would be a bigger claim than the publisher made,
    // and this dataset has no polygon for Texas.
    expect(index.byCode('us-tx')).toBeNull();
    expect(index.byCode('us-va')).toBeNull();
  });

  it('returns nothing for a code that names no territory', () => {
    expect(index.byCode('zz')).toBeNull();
    expect(index.byCode('')).toBeNull();
  });

  it('gives back geometry a renderer can draw', () => {
    const france = index.byCode('fr');
    expect(france?.geometry.type === 'Polygon' || france?.geometry.type === 'MultiPolygon').toBe(true);
    expect(Array.isArray(france?.geometry.coordinates)).toBe(true);
  });

  it('still resolves a point to a territory, unchanged', () => {
    expect(index.at(48.8566, 2.3522)).toBe('France');
    expect(index.at(-35, -25)).toBeNull();
  });
});

describe('territoryIndex.countries', () => {
  it('lists every country with a code once, by name, for finding one by name (plan item 3.5)', () => {
    const countries = index.countries();
    expect(countries.find((c) => c.code === 'FR')?.name).toBe('France');
    expect(countries.find((c) => c.code === 'NO')?.name).toBe('Norway');
    expect(new Set(countries.map((c) => c.code)).size).toBe(countries.length);
    const names = countries.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('territoryIndex.a2Of', () => {
  it('gives a territory\'s two letters by the ADM0_A3 a country\'s card carries (D-WL), France\'s regions their own', () => {
    expect(index.a2Of('JPN')).toBe('JP');
    expect(index.a2Of('fra')).toBe('FR');
    expect(index.a2Of('GUF')).toBe('GF');
    expect(index.a2Of('XXX')).toBeNull();
  });
});
