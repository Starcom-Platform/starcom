import { describe, it, expect } from 'vitest';
import {
  createPscAccumulator,
  normaliseRegistrationNumber,
} from '../../../../../scripts/lib/pscOverlap.mjs';

const corp = (companyNumber: string, registrationNumber: unknown, name = 'HOLDCO LIMITED') => ({
  company_number: companyNumber,
  data: {
    kind: 'corporate-entity-person-with-significant-control',
    name,
    identification: { registration_number: registrationNumber },
  },
});

describe('normalising a filed registration number', () => {
  it('accepts the two UK company number shapes', () => {
    expect(normaliseRegistrationNumber('07168188')).toBe('07168188');
    expect(normaliseRegistrationNumber('SC303142')).toBe('SC303142');
    expect(normaliseRegistrationNumber('OC355308')).toBe('OC355308');
  });

  it('pads a short numeric filing', () => {
    // "686734" is company 00686734; filers routinely drop leading zeros.
    expect(normaliseRegistrationNumber('686734')).toBe('00686734');
  });

  it('REJECTS all-zero filings, before and after padding', () => {
    // The dangerous sentinel. Padding "0" to eight digits yields "00000000",
    // which passes the format check — measured at 35 such records in one part
    // of 32, all of which would have merged into one fictional entity.
    for (const z of ['0', '00', '000', '00000', '00000000', '000000000']) {
      expect(normaliseRegistrationNumber(z)).toBeNull();
    }
  });

  it('rejects the prose filers write into an identifier field', () => {
    for (const s of ['N/A', 'n/a', 'Not Applicable', 'Na', 'None', 'Unknown', '-', '   ', '']) {
      expect(normaliseRegistrationNumber(s)).toBeNull();
    }
  });

  it('rejects foreign registration numbers rather than guessing at them', () => {
    // A Swiss UID is a real identifier, just not one this join can use. The
    // boundary says UK numbers, so these are out — not silently coerced.
    expect(normaliseRegistrationNumber('CHE-108.562.489')).toBeNull();
    expect(normaliseRegistrationNumber('HRB 12345')).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(normaliseRegistrationNumber(null)).toBeNull();
    expect(normaliseRegistrationNumber(undefined)).toBeNull();
  });
});

describe('accumulating corporate control', () => {
  it('counts distinct companies per controller', () => {
    const acc = createPscAccumulator();
    acc.add(corp('11111111', '07168188'));
    acc.add(corp('22222222', '07168188'));
    acc.add(corp('33333333', '7168188'));   // same controller, unpadded filing

    const [c] = acc.finish({ minCompanies: 3 });

    expect(c.registrationNumber).toBe('07168188');
    expect(c.companyCount).toBe(3);
  });

  it('does not double-count one company filing the same controller twice', () => {
    const acc = createPscAccumulator();
    acc.add(corp('11111111', '07168188'));
    acc.add(corp('11111111', '07168188'));

    expect(acc.finish({ minCompanies: 1 })[0].companyCount).toBe(1);
  });

  it('EXCLUDES individuals, and says how many it excluded', () => {
    // The central safety property. An individual PSC has no stable identifier —
    // only a name and a birth month/year — so counting them across companies
    // would mean a fuzzy join whose false merges are claims about named private
    // individuals.
    const acc = createPscAccumulator();
    acc.add({ company_number: '11111111', data: { kind: 'individual-person-with-significant-control', name: 'MR PETER VALAITIS', date_of_birth: { month: 11, year: 1950 } } });
    acc.add({ company_number: '22222222', data: { kind: 'individual-person-with-significant-control', name: 'MR PETER VALAITIS', date_of_birth: { month: 11, year: 1950 } } });

    expect(acc.finish({ minCompanies: 1 })).toEqual([]);
    expect(acc.stats.individual).toBe(2);
    expect(acc.stats.corporate).toBe(0);
  });

  it('EXCLUDES super-secure PSCs', () => {
    // People whose details are withheld because disclosure would put them at
    // risk of violence. Counted separately so the exclusion is visible.
    const acc = createPscAccumulator();
    acc.add({ company_number: '11111111', data: { kind: 'super-secure-person-with-significant-control' } });

    expect(acc.finish({ minCompanies: 1 })).toEqual([]);
    expect(acc.stats.superSecure).toBe(1);
  });

  it('counts a corporate PSC whose number it cannot use, rather than dropping it silently', () => {
    // Otherwise the boundary would overstate coverage: 9.2% of corporate PSCs
    // file no usable number at all.
    const acc = createPscAccumulator();
    acc.add(corp('11111111', 'N/A'));
    acc.add(corp('22222222', null));

    expect(acc.stats.corporate).toBe(2);
    expect(acc.stats.unusableNumber).toBe(2);
  });

  it('joins on the number and never on the filed name', () => {
    // Measured: 2.11% of numbers appear under more than one filed name, and
    // those are filing variation — LTD vs PLC, "&" vs "AND", typos, renames.
    // Joining on name would split one controller into several.
    const acc = createPscAccumulator();
    acc.add(corp('11111111', '10023274', 'ASSURA FINANCING LTD'));
    acc.add(corp('22222222', '10023274', 'ASSURA FINANCING PLC'));
    acc.add(corp('33333333', '10023274', 'Assura Financing Limited'));

    const [c] = acc.finish({ minCompanies: 3 });

    expect(c.companyCount).toBe(3);
    // Counted, not carried: the field routinely holds a person's name.
    expect(c.nameVariants).toBe(3);
    expect(c).not.toHaveProperty('namesAsFiled');
  });

  it('never emits a filed name, however it was filed', () => {
    // The corporate PSC name field frequently holds a PERSON's name — the
    // contact rather than the entity. Publishing it would name a private
    // individual as controlling thousands of companies on the strength of a
    // data-entry habit, which is the harm individuals are excluded to avoid.
    const acc = createPscAccumulator();
    acc.add(corp('11111111', '09361466', 'JOHN STEPHEN RIVETT ESQ'));
    acc.add(corp('22222222', '09361466', 'FD SECRETARIAL LTD'));

    const [c] = acc.finish({ minCompanies: 2 });

    expect(JSON.stringify(c)).not.toMatch(/RIVETT|SECRETARIAL/i);
    expect(c.nameVariants).toBe(2);
  });

  it('honours the floor as an output bound', () => {
    const acc = createPscAccumulator();
    acc.add(corp('11111111', '07168188'));
    expect(acc.finish({ minCompanies: 10 })).toEqual([]);
    expect(acc.finish({ minCompanies: 1 })).toHaveLength(1);
  });
});
