import { describe, it, expect } from 'vitest';
import { clusterByRegisteredAddress as appCluster } from '../addressClustering';
// The acquisition script's own copy — it runs under plain node with no bundler
// and cannot import app code, so the rule is duplicated. This test is the only
// thing keeping the two copies from drifting apart while both publish counts.
import { clusterByRegisteredAddress as scriptCluster } from '../../../../../scripts/lib/clusterRegister.mjs';
import type { RegisteredCompany } from '../addressClustering';

const co = (n: number, line1: string, postcode: string, over: Partial<RegisteredCompany> = {}): RegisteredCompany => ({
  number: String(10000000 + n),
  name: `COMPANY ${n} LIMITED`,
  addressLine1: line1,
  postTown: 'LONDON',
  postcode,
  status: n % 5 === 0 ? 'Dissolved' : 'Active',
  incorporated: `${String((n % 28) + 1).padStart(2, '0')}/0${(n % 9) + 1}/201${n % 10}`,
  ...over,
});

// Deliberately awkward: mixed case, doubled spaces, untrimmed, a sub-threshold
// group, an unparseable date, and rows missing the fields the fold needs.
const CORPUS: RegisteredCompany[] = [
  ...Array.from({ length: 60 }, (_, i) => co(i, '124 CITY ROAD', 'EC1V 2NX')),
  ...Array.from({ length: 55 }, (_, i) => co(100 + i, '  124  city   road ', 'ec1v  2nx')),
  ...Array.from({ length: 51 }, (_, i) => co(200 + i, '71-75 SHELTON STREET', 'WC2H 9JQ')),
  ...Array.from({ length: 9 }, (_, i) => co(300 + i, '5 QUIET LANE', 'EC1V 9ZZ')),
  // Separates COLLAPSING whitespace from REMOVING it. Both folds treat
  // '  124  city   road ' as '124 CITY ROAD'; only a fold that removes spaces
  // also merges '12 4 CITY ROAD' into it — silently adding 52 companies to a
  // published count. Without these rows the whole corpus folds identically
  // under either rule, and this test passed a mutation that broke the fold.
  ...Array.from({ length: 52 }, (_, i) => co(500 + i, '12 4 CITY ROAD', 'EC1V 2NX')),
  ...Array.from({ length: 53 }, (_, i) => co(600 + i, '1 2 4 CITY ROAD', 'EC1V 2NX')),
  co(400, '124 CITY ROAD', 'EC1V 2NX', { incorporated: 'not a date' }),
  co(401, '', 'EC1V 2NX'),
  co(402, '124 CITY ROAD', '   '),
];

describe('the two clustering implementations', () => {
  it('agree exactly on a corpus built to break the fold', () => {
    // Not "roughly agree". Both copies publish counts under the same claim,
    // so any divergence is two numbers presented as one fact.
    expect(scriptCluster(CORPUS)).toEqual(appCluster(CORPUS));
  });

  it('agree on the cluster floor', () => {
    for (const min of [1, 9, 10, 50, 51, 116, 1000]) {
      expect(scriptCluster(CORPUS, { minCompanies: min }))
        .toEqual(appCluster(CORPUS, { minCompanies: min }));
    }
  });

  it('agree that whitespace and case differences are the same address', () => {
    const [biggest] = appCluster(CORPUS);
    expect(biggest.companyCount).toBe(116);
    expect(scriptCluster(CORPUS)[0].companyCount).toBe(116);
  });

  it('agree on ISO dates as well as UK dates, and reject a bare Date.parse', () => {
    // Norway writes ISO, Companies House writes DD/MM/YYYY. Both are parsed
    // explicitly: `Date.parse("03/04/2020")` is March or April depending on the
    // host locale, which would file a company in the wrong month with no error.
    const iso = Array.from({ length: 55 }, (_, i) => co(i, '1 ISO STREET', 'EC1V 1AA', { incorporated: '2020-04-03' }));
    // "April 3, 2020" is chosen because Date.parse ACCEPTS it. A permissive
    // parser would pass it straight through and store it as though it were an
    // ISO date; a string Date.parse rejects would have tested nothing.
    const junk = Array.from({ length: 55 }, (_, i) => co(100 + i, '2 JUNK STREET', 'EC1V 1AB', { incorporated: 'April 3, 2020' }));

    expect(scriptCluster([...iso, ...junk])).toEqual(appCluster([...iso, ...junk]));
    const [isoCluster] = appCluster(iso);
    expect(isoCluster.firstIncorporated).toBe('2020-04-03');
    const [junkCluster] = appCluster(junk);
    expect(junkCluster.firstIncorporated).toBeNull();
    expect(scriptCluster(junk)[0].firstIncorporated).toBeNull();
  });

  it('agree on an empty corpus', () => {
    expect(scriptCluster([])).toEqual(appCluster([]));
  });
});
