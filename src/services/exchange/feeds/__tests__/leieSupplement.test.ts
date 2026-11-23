import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCLUSION_BASES, csvRows, monthFromLeie } from '../leieSupplement';

// Made-up rows in the LEIE's own columns: every person, business and number is invented.
const excl = fs.readFileSync(path.join(__dirname, 'fixtures/leie-excl.sample.csv'), 'utf8');
const rein = fs.readFileSync(path.join(__dirname, 'fixtures/leie-rein.sample.csv'), 'utf8');

describe('csvRows', () => {
  it('reads quoted fields, doubled quotes, and either line ending', () => {
    expect(csvRows('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });
});

describe('monthFromLeie: one monthly supplement, counted', () => {
  const month = monthFromLeie('2026-09', excl, rein);

  it('counts the exclusions, the reinstatements, and the people among them', () => {
    expect(month).toMatchObject({ month: '2026-09', exclusions: 6, reinstatements: 1, people: 3, practicesCounted: 1 });
  });

  it('counts everyone by state, category and basis', () => {
    expect(month.byState).toEqual({ FL: 2, NC: 1, CA: 2, TX: 1 });
    expect(month.byBasis).toEqual({ '1128b4': 1, '1128a1': 2, '1128b5': 1, 'BRCH SA': 1, '1128b7': 1 });
    expect(month.byCategory['DME COMPANY']).toBe(1);
  });

  it('names businesses with their state, category, basis and effective date, never their street address', () => {
    expect(month.organisations).toEqual([
      { name: 'EXAMPLE HOSPICE, "THE" INC', state: 'CA', category: 'OTHER BUSINESS', basis: 'BRCH SA', date: '2026-10-20' },
      { name: 'EXAMPLE MEDICAL SUPPLY, LLC', state: 'NC', category: 'DME COMPANY', basis: '1128a1', date: '2026-10-20' },
    ]);
  });

  it("never carries a person's name, birth date, NPI or address, nor a business on a person's row, nor a practice in its owner's name (BF2)", () => {
    const out = JSON.stringify(month);
    for (const s of ['INVENTED', 'PERSONA', '19790101', '1234567890', 'MADE UP LANE', 'BUSINESS PARK', 'PRETEND SURNAME', 'DUALROLE']) expect(out).not.toContain(s);
  });

  it('refuses a file that is not the LEIE', () => {
    expect(() => monthFromLeie('2026-09', 'a,b\n1,2', null)).toThrow(/not an LEIE file/);
  });
});

describe('EXCLUSION_BASES', () => {
  it("gives each code OIG's section and words", () => {
    expect(EXCLUSION_BASES['1128b4']).toEqual({ section: '1128(b)(4)', label: 'License revocation, suspension, or surrender' });
  });
});
