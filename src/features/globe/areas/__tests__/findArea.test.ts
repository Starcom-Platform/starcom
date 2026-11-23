/**
 * Finding an area by what it is called (BA24): for the header's search and
 * the report form's finder, so a person can say a report is about the Sahel.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { findAreas } from '../findArea';

describe('finding an area', () => {
  it('by a word of its name as it is typed, a code typed exactly first', () => {
    expect(findAreas('sahel').map((a) => a.code)).toEqual(['zone:sahel']);
    expect(findAreas('ring of').map((a) => a.code)).toEqual(['zone:ring-of-fire']);
    expect(findAreas('eu').map((a) => a.code)[0]).toBe('union:eu');
    expect(findAreas('Union:EU').map((a) => a.code)[0]).toBe('union:eu');
  });

  it('each with its kind and name', () => {
    expect(findAreas('anglo')).toEqual([{ code: 'sphere:anglosphere', name: 'Anglosphere', kind: 'sphere' }]);
  });

  it('several, at most four, for a word they share', () => {
    const africa = findAreas('africa').map((a) => a.code);
    expect(africa[0]).toBe('continent:africa');
    expect(africa).toEqual(expect.arrayContaining(['union:au', 'terra:africana']));
    expect(africa.length).toBeLessThanOrEqual(4);
  });

  it('at most four, however many share what was typed', () => {
    expect(findAreas('a')).toHaveLength(4);
    expect(findAreas('a', 10).length).toBeGreaterThan(4);
  });

  it('none for nothing typed, or for a word no area has', () => {
    expect(findAreas('  ')).toEqual([]);
    expect(findAreas('atlantis')).toEqual([]);
  });
});
