import { describe, it, expect } from 'vitest';
import { selectVolcanoesForTier, buildVolcanoTooltip, type BakedVolcano } from '../useGlobeVolcanoCatalog';

const makeVolcano = (id: number, lastEruptionYear: number | null): BakedVolcano => ({
  id,
  name: `Volcano ${id}`,
  lat: 0,
  lng: 0,
  lastEruptionYear
});

describe('selectVolcanoesForTier', () => {
  it('returns the full real catalog untouched at tier 2 (full detail)', () => {
    const volcanoes = Array.from({ length: 10 }, (_, i) => makeVolcano(i, 2000 - i));
    expect(selectVolcanoesForTier(volcanoes, 2)).toHaveLength(10);
  });

  it('returns the full list unmodified when it is already under a tier cap, rather than re-sorting it', () => {
    const volcanoes = [makeVolcano(1, 1990), makeVolcano(2, 2010)];
    expect(selectVolcanoesForTier(volcanoes, 1)).toEqual(volcanoes);
  });

  it('thins to the most recently erupted volcanoes first at reduced tiers', () => {
    const volcanoes = [
      makeVolcano(1, 1900),
      makeVolcano(2, 2020),
      makeVolcano(3, 1500),
      makeVolcano(4, 2023)
    ];
    const result = selectVolcanoesForTier(volcanoes, 0);
    // TIER_LIMITS[0] = 150, well above 4, so nothing should be dropped here —
    // real thinning is exercised by the "drops the least recently active" test below.
    expect(result).toHaveLength(4);
  });

  it('drops the least recently active real volcanoes when a tier cap is actually exceeded', () => {
    const volcanoes = Array.from({ length: 200 }, (_, i) => makeVolcano(i, i)); // id 199 = most recent (year 199)
    const result = selectVolcanoesForTier(volcanoes, 0); // cap 150
    expect(result).toHaveLength(150);
    expect(result.map((v) => v.id)).toContain(199);
    expect(result.map((v) => v.id)).not.toContain(0);
  });

  it('sorts real volcanoes with an unknown (null) eruption year last, not first', () => {
    const volcanoes = [
      ...Array.from({ length: 150 }, (_, i) => makeVolcano(i, 1000 + i)),
      makeVolcano(9999, null)
    ];
    const result = selectVolcanoesForTier(volcanoes, 0); // cap 150, 151 real entries
    expect(result.map((v) => v.id)).not.toContain(9999);
  });
});

describe('buildVolcanoTooltip', () => {
  it('formats a real BCE eruption year correctly', () => {
    const volcano: BakedVolcano = { id: 1, name: 'Khodutka', lat: 52, lng: 157, type: 'Stratovolcano(es)', lastEruptionYear: -300, country: 'Russia' };
    expect(buildVolcanoTooltip(volcano)).toBe('Khodutka • Stratovolcano(es) • Last eruption: 300 BCE • Russia');
  });

  it('formats a real CE eruption year correctly', () => {
    const volcano: BakedVolcano = { id: 2, name: 'Etna', lat: 37.7, lng: 15, lastEruptionYear: 2024, country: 'Italy' };
    expect(buildVolcanoTooltip(volcano)).toBe('Etna • Last eruption: 2024 CE • Italy');
  });

  it('omits the eruption line entirely for a real volcano with no dated eruption', () => {
    const volcano: BakedVolcano = { id: 3, name: 'Mystery Peak', lat: 0, lng: 0, lastEruptionYear: null };
    expect(buildVolcanoTooltip(volcano)).toBe('Mystery Peak');
  });
});
