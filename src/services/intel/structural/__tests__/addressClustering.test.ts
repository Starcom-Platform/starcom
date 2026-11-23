import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clusterByRegisteredAddress, DEFAULT_MIN_COMPANIES, type RegisteredCompany, type AddressCluster } from '../addressClustering';

const co = (over: Partial<RegisteredCompany> = {}): RegisteredCompany => ({
  number: `0${Math.random().toString().slice(2, 9)}`,
  name: 'ACME LTD',
  addressLine1: '128 CITY ROAD',
  postTown: 'LONDON',
  postcode: 'EC1V 2NX',
  status: 'Active',
  incorporated: '01/06/2020',
  ...over,
});
const many = (n: number, over: Partial<RegisteredCompany> = {}) => Array.from({ length: n }, () => co(over));

describe('grouping', () => {
  it('groups companies that share an address', () => {
    const [c] = clusterByRegisteredAddress(many(60));
    expect(c.companyCount).toBe(60);
    expect(c.companyNumbers).toHaveLength(60);
  });

  it('ignores case and spacing, and nothing else', () => {
    const c = clusterByRegisteredAddress([
      ...many(30, { addressLine1: '128 City Road', postcode: 'ec1v 2nx' }),
      ...many(30, { addressLine1: '128  CITY   ROAD', postcode: 'EC1V 2NX' }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].companyCount).toBe(60);
  });

  it('does not merge addresses that merely look similar', () => {
    // "124" and "128 City Road" are different buildings. Fuzzy matching here
    // would invent a cluster, and a count IS the whole claim.
    const c = clusterByRegisteredAddress([
      ...many(60, { addressLine1: '124 CITY ROAD' }),
      ...many(60, { addressLine1: '128 CITY ROAD' }),
    ]);
    expect(c).toHaveLength(2);
  });

  it('separates the same street in different postcodes', () => {
    const c = clusterByRegisteredAddress([
      ...many(60, { postcode: 'EC1V 2NX' }),
      ...many(60, { postcode: 'N1 7GU' }),
    ]);
    expect(c).toHaveLength(2);
  });

  it('drops entries with no address rather than grouping them together', () => {
    // A shared blank is not a shared address.
    expect(clusterByRegisteredAddress(many(60, { addressLine1: '', postcode: '' }))).toEqual([]);
  });
});

describe('what a cluster reports', () => {
  it('counts active companies separately, because a dissolved one is still a fact', () => {
    const [c] = clusterByRegisteredAddress([
      ...many(40, { status: 'Active' }),
      ...many(20, { status: 'Dissolved' }),
    ]);
    expect(c.companyCount).toBe(60);
    expect(c.activeCount).toBe(40);
  });

  it('reports the incorporation range, converting from DD/MM/YYYY', () => {
    const [c] = clusterByRegisteredAddress([
      ...many(30, { incorporated: '15/03/2019' }),
      ...many(30, { incorporated: '02/11/2023' }),
    ]);
    expect(c.firstIncorporated).toBe('2019-03-15');
    expect(c.lastIncorporated).toBe('2023-11-02');
  });

  it('reports null dates rather than guessing at an unparseable one', () => {
    const [c] = clusterByRegisteredAddress(many(60, { incorporated: 'not a date' }));
    expect(c.firstIncorporated).toBeNull();
  });

  it('is deterministic whatever order the register listed them in', () => {
    const input = many(60);
    const a = clusterByRegisteredAddress(input);
    const b = clusterByRegisteredAddress([...input].reverse());
    expect(b).toEqual(a);
  });
});

describe('the threshold bounds output, it does not claim significance', () => {
  it('omits clusters below the minimum', () => {
    expect(clusterByRegisteredAddress(many(DEFAULT_MIN_COMPANIES - 1))).toEqual([]);
  });

  it('includes one exactly at the minimum', () => {
    expect(clusterByRegisteredAddress(many(DEFAULT_MIN_COMPANIES))).toHaveLength(1);
  });

  it('lowering it produces more facts, not better ones', () => {
    const input = many(3);
    expect(clusterByRegisteredAddress(input, { minCompanies: 2 })[0].companyCount).toBe(3);
  });
});

describe('against the real committed register slice', () => {
  const assetPath = path.join(process.cwd(), 'public/data/companies-house.json');
  const asset = fs.existsSync(assetPath)
    ? JSON.parse(fs.readFileSync(assetPath, 'utf8'))
    : null;

  it('the asset exists, or the assertions below prove nothing', () => {
    expect(asset).not.toBeNull();
    expect(asset.companyCount).toBeGreaterThan(1000);
  });

  it('covers the whole register, not one part of it', () => {
    // The asset once carried `bounding: "Every company whose registered
    // postcode district is ... Complete within that boundary"` while holding a
    // scan of part 1 of 7 — an undercount of roughly seven times, asserting
    // completeness. Nothing in the type system or the test suite could see it;
    // only the row count against the published register could.
    expect(asset.complete).toBe(true);
    expect(asset.partsScanned).toHaveLength(asset.totalParts);
    expect(asset.scannedRows).toBeGreaterThan(5_000_000);
  });

  it('states a boundary that names the snapshot it counted', () => {
    // This string is the entire basis of an enumeration finding's weight, and
    // no consumer can check it. It must at least name what it covers.
    expect(asset.bounding).toContain(asset.snapshot);
    for (const d of asset.districts) expect(asset.bounding).toContain(d);
  });

  it('finds real concentration in a complete geographic slice', () => {
    expect(asset.clusters.length).toBeGreaterThan(0);
    // The largest cluster in this slice is a well-known formation agent.
    expect(asset.clusters[0].companyCount).toBeGreaterThan(1000);
  });

  it('every cluster lists exactly as many company numbers as it counts', () => {
    // A count is the entire claim, so the evidence must match the number.
    for (const c of asset.clusters) {
      expect(c.companyNumbers).toHaveLength(c.companyCount);
      expect(new Set(c.companyNumbers).size).toBe(c.companyCount);
      expect(c.activeCount).toBeLessThanOrEqual(c.companyCount);
    }
  });

  it('cluster totals never exceed the enumerated population', () => {
    const total = asset.clusters.reduce((n: number, c: AddressCluster) => n + c.companyCount, 0);
    expect(total).toBeLessThanOrEqual(asset.companyCount);
  });

  it('carries same-day batches, and none of them is a formation agent', () => {
    // The measured shape of the real data: batches are at SMALL addresses. If
    // one ever appeared with a large denominator it would mean the share bound
    // stopped separating a batch from an agent's ordinary daily volume.
    expect(Array.isArray(asset.batches)).toBe(true);
    for (const b of asset.batches) {
      expect(b.count).toBeGreaterThanOrEqual(5);
      expect(b.count / b.addressTotal).toBeGreaterThanOrEqual(0.5);
      expect(b.companyNumbers).toHaveLength(b.count);
      expect(b.activeCount).toBeLessThanOrEqual(b.count);
    }
  });

  it('a batch address is never one of the big shared-address clusters', () => {
    // Stated separately because it is the whole reason this analysis needed a
    // different population floor from address clustering: at 50+ companies the
    // busiest day is ~0.3% of the address, so nothing there can qualify.
    const clusterAddresses = new Set(asset.clusters.map((c: AddressCluster) => `${c.addressLine1}|${c.postcode}`));
    for (const b of asset.batches) {
      expect(clusterAddresses.has(`${b.addressLine1}|${b.postcode}`)).toBe(false);
    }
  });

  it('reproduces the committed clusters from the same rule the app uses', () => {
    // The asset is produced by the acquisition script's copy of the fold. This
    // re-clusters the committed evidence with the APP's copy and requires the
    // same shape back — so a drift between them shows up against real data,
    // not only against the synthetic corpus in registerFold.test.ts.
    const rows: RegisteredCompany[] = asset.clusters.flatMap((c: AddressCluster) =>
      c.companyNumbers.map((number: string) => ({
        number,
        name: number,
        addressLine1: c.addressLine1,
        postTown: 'LONDON',
        postcode: c.postcode,
        status: 'Active',
        incorporated: '01/01/2020',
      })));

    const reclustered = clusterByRegisteredAddress(rows);

    expect(reclustered.map(c => [c.addressLine1, c.postcode, c.companyCount]))
      .toEqual(asset.clusters.map((c: AddressCluster) => [c.addressLine1, c.postcode, c.companyCount]));
  });
});
