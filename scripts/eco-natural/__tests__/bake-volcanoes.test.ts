import { describe, it, expect } from 'vitest';
import { parseVolcanoFeatures } from '../bake-volcanoes';

const rawFeature = (overrides: Partial<{ lng: number; lat: number; Volcano_Number: number; Volcano_Name: string }> = {}) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [overrides.lng ?? 157.711, overrides.lat ?? 52.062] as [number, number] },
  properties: {
    Volcano_Number: overrides.Volcano_Number ?? 300053,
    Volcano_Name: overrides.Volcano_Name ?? 'Khodutka',
    Primary_Volcano_Type: 'Stratovolcano(es)',
    Last_Eruption_Year: -300,
    Country: 'Russia',
    Region: 'Northwestern Pacific Volcanic Regions',
    Elevation: 2039,
    Tectonic_Setting: 'Subduction zone / Continental crust (> 25 km)'
  }
});

describe('parseVolcanoFeatures', () => {
  it('maps a real-shaped GVP volcano feature to the trimmed baked shape', () => {
    const { volcanoes, dropped } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 1, features: [rawFeature()] });

    expect(dropped).toBe(0);
    expect(volcanoes).toEqual([
      {
        id: 300053,
        name: 'Khodutka',
        lat: 52.062,
        lng: 157.711,
        type: 'Stratovolcano(es)',
        lastEruptionYear: -300,
        country: 'Russia',
        region: 'Northwestern Pacific Volcanic Regions',
        elevation: 2039,
        tectonicSetting: 'Subduction zone / Continental crust (> 25 km)'
      }
    ]);
  });

  it('drops entries with non-finite coordinates instead of throwing', () => {
    const bad = rawFeature({ lat: NaN });
    const { volcanoes, dropped } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 1, features: [bad] });
    expect(volcanoes).toEqual([]);
    expect(dropped).toBe(1);
  });

  it('drops entries missing a real volcano number or name', () => {
    const noNumber = { ...rawFeature(), properties: { ...rawFeature().properties, Volcano_Number: undefined as unknown as number } };
    const noName = { ...rawFeature(), properties: { ...rawFeature().properties, Volcano_Name: '' } };
    const { volcanoes, dropped } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 2, features: [noNumber, noName] });
    expect(volcanoes).toEqual([]);
    expect(dropped).toBe(2);
  });

  it('preserves a real negative Last_Eruption_Year (BCE dates, e.g. -300) rather than treating it as falsy/missing', () => {
    const { volcanoes } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 1, features: [rawFeature()] });
    expect(volcanoes[0].lastEruptionYear).toBe(-300);
  });

  it('keeps real volcanoes with an unknown (null) eruption year as null, not a fabricated default', () => {
    const noEruption = { ...rawFeature(), properties: { ...rawFeature().properties, Last_Eruption_Year: undefined as unknown as number } };
    const { volcanoes } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 1, features: [noEruption] });
    expect(volcanoes[0].lastEruptionYear).toBeNull();
  });

  it('preserves a real eruption year of 0 (1 BCE/CE boundary) rather than treating the falsy number as missing', () => {
    const yearZero = { ...rawFeature(), properties: { ...rawFeature().properties, Last_Eruption_Year: 0 } };
    const { volcanoes } = parseVolcanoFeatures({ type: 'FeatureCollection', totalFeatures: 1, features: [yearZero] });
    expect(volcanoes[0].lastEruptionYear).toBe(0);
  });
});
