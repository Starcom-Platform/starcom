/** A kind of sky event's moments from a spec (D-PW, PW94): the lab's sign chosen outright, or any sign. */
import { describe, it, expect } from 'vitest';
import { momentsOf } from '../echoReturns';

const FROM = Date.UTC(2025, 0, 1);
const UNTIL = Date.UTC(2026, 0, 1);

describe('momentsOf', () => {
  it('finds every Full Moon of a year in any sign, and only those in the sign asked', () => {
    const any = momentsOf({ class: 'lunation', sub: 'full', bodies: ['Sun', 'Moon'], frame: 'tropical' }, FROM, UNTIL);
    expect(any.length).toBeGreaterThanOrEqual(12);
    expect(any.length).toBeLessThanOrEqual(13);
    // 14 Mar 2025's Full Moon stood in Virgo, tropical: the one that year.
    const inVirgo = momentsOf({ class: 'lunation', sub: 'full', bodies: ['Sun', 'Moon'], frame: 'tropical', sign: 5 }, FROM, UNTIL);
    expect(inVirgo).toHaveLength(1);
    expect(new Date(inVirgo[0]).toISOString().slice(0, 10)).toBe('2025-03-14');
  });

  it("finds a planet's ingress into the sign asked", () => {
    // Mars entered Leo, tropical, on 18 Apr 2025.
    const into = momentsOf({ class: 'ingress', sub: 'sign', bodies: ['Mars'], sign: 4, frame: 'tropical' }, FROM, UNTIL);
    expect(into.map((ms) => new Date(ms).toISOString().slice(0, 10))).toEqual(['2025-04-18']);
  });
});
