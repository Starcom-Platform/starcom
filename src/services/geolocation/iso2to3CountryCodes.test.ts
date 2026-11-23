import { describe, it, expect } from 'vitest';
import { iso2ToIso3, ISO2_TO_ISO3 } from './iso2to3CountryCodes';

describe('iso2ToIso3 (bug-injection verified)', () => {
  it('maps real, well-known ISO2 codes to their real ISO3 equivalents', () => {
    expect(iso2ToIso3('US')).toBe('USA');
    expect(iso2ToIso3('GB')).toBe('GBR');
    expect(iso2ToIso3('AU')).toBe('AUS');
    expect(iso2ToIso3('CN')).toBe('CHN');
  });

  it('is case-insensitive, matching the uppercase codes real data sources actually use', () => {
    expect(iso2ToIso3('us')).toBe('USA');
  });

  it('returns null for an unknown/invalid code rather than a wrong guess', () => {
    expect(iso2ToIso3('ZZ')).toBeNull();
    expect(iso2ToIso3('')).toBeNull();
  });

  it('covers a real, substantial set of countries (baked from a 250-entry live source)', () => {
    expect(Object.keys(ISO2_TO_ISO3).length).toBeGreaterThan(200);
  });
});
