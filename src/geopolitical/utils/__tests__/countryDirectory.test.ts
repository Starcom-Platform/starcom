import { describe, it, expect } from 'vitest';
import { latLonToVector3 } from '../latLonToVector3';
import { buildCountryDirectory, extractCountryNames, combineCentroidsAndNames, type DirectorySourcePart } from '../countryDirectory';
import type { CountryCentroid } from '../countryCentroids';

// Same baked-position convention as countryCentroids.test.ts.
function bakedPoint(lat: number, lon: number): [number, number, number] {
  const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
  return [v.x, v.y, -v.z];
}

function triangle(points: [number, number, number][]): { positions: number[]; indices: number[] } {
  return { positions: points.flat(), indices: [0, 1, 2] };
}

describe('buildCountryDirectory', () => {
  it('pairs each resolvable country with its centroid and name', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'RUS', name: 'Russia', ...triangle([bakedPoint(60, 90), bakedPoint(59, 89), bakedPoint(59, 91)]) },
      { countryCode: 'CAN', name: 'Canada', ...triangle([bakedPoint(56, -106), bakedPoint(55, -107), bakedPoint(55, -105)]) }
    ];
    const directory = buildCountryDirectory(parts);
    expect(directory).toHaveLength(2);
    const rus = directory.find((e) => e.countryCode === 'RUS');
    expect(rus).toBeDefined();
    expect(rus!.name).toBe('Russia');
    expect(Number.isFinite(rus!.lat)).toBe(true);
    expect(Number.isFinite(rus!.lng)).toBe(true);
  });

  it('sorts entries by name', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'RUS', name: 'Russia', ...triangle([bakedPoint(60, 90), bakedPoint(59, 89), bakedPoint(59, 91)]) },
      { countryCode: 'CAN', name: 'Canada', ...triangle([bakedPoint(56, -106), bakedPoint(55, -107), bakedPoint(55, -105)]) },
      { countryCode: 'ARG', name: 'Argentina', ...triangle([bakedPoint(-34, -64), bakedPoint(-35, -65), bakedPoint(-35, -63)]) }
    ];
    const directory = buildCountryDirectory(parts);
    expect(directory.map((e) => e.name)).toEqual(['Argentina', 'Canada', 'Russia']);
  });

  it('takes the first non-empty name across a multi-part country and ignores later ones', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'USA', name: 'United States', ...triangle([bakedPoint(40, -100), bakedPoint(39, -101), bakedPoint(39, -99)]) },
      { countryCode: 'USA', name: 'Alaska', ...triangle([bakedPoint(64, -150), bakedPoint(63, -151), bakedPoint(63, -149)]) }
    ];
    const directory = buildCountryDirectory(parts);
    expect(directory).toHaveLength(1);
    expect(directory[0].name).toBe('United States');
  });

  it('falls back to the countryCode as the name when no part carries one', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'XYZ', ...triangle([bakedPoint(0, 0), bakedPoint(-1, -1), bakedPoint(-1, 1)]) }
    ];
    const directory = buildCountryDirectory(parts);
    expect(directory).toHaveLength(1);
    expect(directory[0].name).toBe('XYZ');
  });

  it('omits a country whose geometry never resolves a centroid, even if it has a name', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'ZZZ', name: 'Nowhere', positions: [], indices: [] }
    ];
    expect(buildCountryDirectory(parts)).toEqual([]);
  });

  it('returns an empty array for an empty input array', () => {
    expect(buildCountryDirectory([])).toEqual([]);
  });
});

describe('extractCountryNames', () => {
  it('takes the first non-empty name per countryCode', () => {
    const parts: DirectorySourcePart[] = [
      { countryCode: 'USA', name: 'United States', positions: [], indices: [] },
      { countryCode: 'USA', name: 'Alaska', positions: [], indices: [] }
    ];
    const names = extractCountryNames(parts);
    expect(names.get('USA')).toBe('United States');
  });

  it('skips parts with no countryCode or an empty/whitespace-only name', () => {
    const parts: DirectorySourcePart[] = [
      { name: 'Nowhere', positions: [], indices: [] },
      { countryCode: 'XYZ', name: '   ', positions: [], indices: [] }
    ];
    const names = extractCountryNames(parts);
    expect(names.size).toBe(0);
  });
});

describe('combineCentroidsAndNames', () => {
  it('pairs a centroid with its matching name, sorted by name', () => {
    const centroids = new Map<string, CountryCentroid>([
      ['RUS', { lat: 60, lng: 90 }],
      ['ARG', { lat: -34, lng: -64 }]
    ]);
    const names = new Map([['RUS', 'Russia'], ['ARG', 'Argentina']]);
    const directory = combineCentroidsAndNames(centroids, names);
    expect(directory.map((e) => e.name)).toEqual(['Argentina', 'Russia']);
  });

  it('falls back to the countryCode when no matching name exists', () => {
    const centroids = new Map<string, CountryCentroid>([['XYZ', { lat: 0, lng: 0 }]]);
    const directory = combineCentroidsAndNames(centroids, new Map());
    expect(directory).toEqual([{ countryCode: 'XYZ', name: 'XYZ', lat: 0, lng: 0 }]);
  });

  it('ignores a name whose countryCode has no matching centroid', () => {
    const centroids = new Map<string, CountryCentroid>([['RUS', { lat: 60, lng: 90 }]]);
    const names = new Map([['RUS', 'Russia'], ['GHOST', 'Ghost Country']]);
    const directory = combineCentroidsAndNames(centroids, names);
    expect(directory).toHaveLength(1);
    expect(directory[0].countryCode).toBe('RUS');
  });
});
