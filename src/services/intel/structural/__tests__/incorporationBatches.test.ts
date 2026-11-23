import { describe, it, expect } from 'vitest';
// One implementation, in the acquisition script — the app consumes precomputed
// results and never re-runs the detection, so there is no second copy to drift.
import {
  findIncorporationBatches,
  MIN_BATCH_COMPANIES,
  MIN_BATCH_SHARE,
} from '../../../../../scripts/lib/incorporationBursts.mjs';
import { buildBatchFindings, IncompleteRegisterError, type SnapshotProvenance } from '../structuralFindings';
import { explainAttestationWeight } from '../../findings/deriveAttestationWeight';
import type { RegisteredCompany } from '../addressClustering';

const co = (n: number, line1: string, postcode: string, incorporated: string, status = 'Active'): RegisteredCompany => ({
  number: String(10000000 + n), name: `COMPANY ${n} LIMITED`,
  addressLine1: line1, postTown: 'LONDON', postcode, status, incorporated,
});

const PROV: SnapshotProvenance = {
  bounding: 'Every company in EC1V and WC2H, complete Companies House register snapshot 2026-08-01 (all 7 parts).',
  complete: true,
  snapshot: '2026-08-01',
  source: 'Companies House',
};
const NOW = () => new Date('2026-08-22T00:00:00.000Z');

describe('finding same-day incorporation batches', () => {
  it('finds a batch that dominates its address', () => {
    const rows = [
      ...Array.from({ length: 19 }, (_, i) => co(i, '120 CHARING CROSS ROAD', 'WC2H 0JR', '18/07/2025')),
      ...Array.from({ length: 2 }, (_, i) => co(100 + i, '120 CHARING CROSS ROAD', 'WC2H 0JR', '03/01/2019')),
    ];

    const [b] = findIncorporationBatches(rows);

    expect(b.count).toBe(19);
    expect(b.addressTotal).toBe(21);
    expect(b.date).toBe('2025-07-18');
  });

  it('does NOT fire on a formation agent doing steady daily volume', () => {
    // The measured reality, and the opposite of what "burst detection"
    // suggests: at 71-75 Shelton Street the busiest day in twenty years is
    // 264 of 86,035 — 0.3%. An absolute-count rule would flag it every day.
    const rows: RegisteredCompany[] = [];
    for (let day = 1; day <= 28; day++) {
      for (let i = 0; i < 30; i++) {
        rows.push(co(day * 100 + i, '71-75 SHELTON STREET', 'WC2H 9JQ', `${String(day).padStart(2, '0')}/03/2024`));
      }
    }

    expect(findIncorporationBatches(rows)).toEqual([]);
  });

  it('does not report a tiny address at 100%', () => {
    // Three companies filed on one day is 100% of a three-company address and
    // evidence of nothing. The count bound exists for exactly this.
    const rows = Array.from({ length: MIN_BATCH_COMPANIES - 1 }, (_, i) =>
      co(i, '5 QUIET LANE', 'EC1V 9ZZ', '02/02/2022'));

    expect(findIncorporationBatches(rows)).toEqual([]);
  });

  it('counts an unparseable incorporation date toward the address, not the day', () => {
    // Dropping it from both would shrink the denominator and inflate the share
    // of every batch at that address — turning a data defect into a finding.
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => co(i, '1 TEST STREET', 'EC1V 1AA', '10/02/2023')),
      ...Array.from({ length: 6 }, (_, i) => co(100 + i, '1 TEST STREET', 'EC1V 1AA', 'not a date')),
    ];

    // 6 of 12 = 0.5, exactly the bound, so it qualifies; if the unparseable
    // rows were dropped entirely it would read as 6 of 6.
    const [b] = findIncorporationBatches(rows);
    expect(b.addressTotal).toBe(12);
    expect(b.count).toBe(6);
  });

  it('reports one claim per address, carrying its LARGEST batch', () => {
    // Per-day claims at one address share a parameterized-replaceable slot and
    // would silently overwrite each other, so only one is emitted.
    //
    // Exercised at a LOWER share bound on purpose. At the default of 0.5 two
    // days at one address cannot both qualify — their shares would have to sum
    // past 100% — so `otherQualifyingDays` is always 0 there and this
    // selection is untestable at the default. It is still live code: minShare
    // is an option, and at 0.2 several days qualify.
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => co(i, '2 TEST STREET', 'EC1V 1AB', '10/02/2023')),
      ...Array.from({ length: 7 }, (_, i) => co(100 + i, '2 TEST STREET', 'EC1V 1AB', '11/02/2023')),
      ...Array.from({ length: 6 }, (_, i) => co(200 + i, '2 TEST STREET', 'EC1V 1AB', '12/02/2023')),
    ];

    const found = findIncorporationBatches(rows, { minShare: 0.2 });

    expect(found).toHaveLength(1);
    expect(found[0].count).toBe(8);
    expect(found[0].date).toBe('2023-02-10');
    // Not silently lost: the other two days are counted and reported.
    expect(found[0].otherQualifyingDays).toBe(2);
  });

  it('at the default share bound, only one day per address can ever qualify', () => {
    // Stated as a test because it is not obvious and it bounds what the
    // otherQualifyingDays field can mean in published claims: two shares of
    // 0.5 or more cannot coexist at one address.
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => co(i, '3 TEST STREET', 'EC1V 1AC', '10/02/2023')),
      ...Array.from({ length: 7 }, (_, i) => co(100 + i, '3 TEST STREET', 'EC1V 1AC', '11/02/2023')),
    ];

    const [b] = findIncorporationBatches(rows);
    expect(b.otherQualifyingDays).toBe(0);
  });

  it('the bounds are not load-bearing', () => {
    // The only honest defence of a chosen number: show the output does not
    // depend on where in the flat region it was put.
    const rows = [
      ...Array.from({ length: 19 }, (_, i) => co(i, '120 CHARING CROSS ROAD', 'WC2H 0JR', '18/07/2025')),
      ...Array.from({ length: 2 }, (_, i) => co(100 + i, '120 CHARING CROSS ROAD', 'WC2H 0JR', '03/01/2019')),
    ];
    const baseline = findIncorporationBatches(rows);

    for (const minShare of [0.3, 0.4, MIN_BATCH_SHARE]) {
      for (const minCompanies of [5, 6]) {
        expect(findIncorporationBatches(rows, { minShare, minCompanies })).toEqual(baseline);
      }
    }
  });
});

describe('attesting a batch', () => {
  const BATCH = [{
    addressLine1: '120 CHARING CROSS ROAD', postcode: 'WC2H 0JR',
    date: '2025-07-18', count: 19, addressTotal: 21, activeCount: 18,
    companyNumbers: Array.from({ length: 19 }, (_, i) => String(10000000 + i)),
    otherQualifyingDays: 0,
  }];

  it('is a census, weighed on completeness rather than corroboration', () => {
    const [f] = buildBatchFindings(BATCH, PROV, { now: NOW });
    const w = explainAttestationWeight(f, { now: new Date('2026-08-22T00:00:00.000Z') });

    expect(f.method.parameters.matchedBy).toBe('enumeration');
    expect(f.method.enumeratedBoundary).toBe(PROV.bounding);
    expect(w.corroboration).toBe(1);
    // Aged from the snapshot (21 days), not from publication (0 days).
    expect(w.ageDays).toBeCloseTo(21, 0);
  });

  it('states the denominator, so the reader can tell 19-of-21 from 264-of-86035', () => {
    const [f] = buildBatchFindings(BATCH, PROV, { now: NOW });

    expect(f.method.criteria).toContain('19 of the 21 companies (90%)');
    expect(f.method.criteria).toContain('not evidence of wrongdoing');
    expect(f.claim.attribute).toBe('largestSameDayIncorporationBatch');
  });

  it('refuses an incomplete register, exactly as the cluster path does', () => {
    expect(() => buildBatchFindings(BATCH, { ...PROV, complete: false })).toThrow(IncompleteRegisterError);
  });
});
