import { describe, it, expect } from 'vitest';
import { buildEnumerationFindingsFromClusters, IncompleteRegisterError, type SnapshotProvenance } from '../structuralFindings';
import { explainAttestationWeight } from '../../findings/deriveAttestationWeight';
import type { AddressCluster } from '../addressClustering';

const cluster = (line1: string, postcode: string, count: number): AddressCluster => ({
  addressLine1: line1,
  postcode,
  companyNumbers: Array.from({ length: count }, (_, i) => String(10000000 + i)),
  companyCount: count,
  activeCount: Math.floor(count * 0.95),
  firstIncorporated: '2018-12-28',
  lastIncorporated: '2024-01-05',
});

const BOUNDING = 'Every company whose registered postcode district is one of: EC1V, from the complete '
  + 'Companies House register snapshot of 2026-08-01 (all 7 parts).';

const CLUSTERS = [cluster('124 CITY ROAD', 'EC1V 2NX', 60)];

const snapshot = (over: Partial<SnapshotProvenance> = {}): SnapshotProvenance => ({
  bounding: BOUNDING,
  complete: true,
  snapshot: '2026-08-01',
  source: 'Companies House — free company data product',
  ...over,
});

const NOW = () => new Date('2026-08-22T00:00:00.000Z');

describe('building enumeration findings from a register', () => {
  it('attests the count as an enumeration, not a corroboration', () => {
    const [f] = buildEnumerationFindingsFromClusters(CLUSTERS, snapshot(), { now: NOW });

    expect(f.method.parameters.matchedBy).toBe('enumeration');
    expect(f.method.sourceCount).toBe(1);
    expect(f.claim.value).toBe(60);
    // The boundary is copied from the source verbatim. If this module reworded
    // it, the sentence could drift from the collection that justifies it.
    expect(f.method.enumeratedBoundary).toBe(BOUNDING);
  });

  it('claims the filing, not the activity', () => {
    const [f] = buildEnumerationFindingsFromClusters(CLUSTERS, snapshot(), { now: NOW });

    // The register records what was FILED as a registered office. A name like
    // `companiesOperatingAt` would assert something the source cannot support,
    // and no weight term would catch the difference.
    expect(f.claim.attribute).toBe('companiesAtRegisteredAddress');
    expect(f.method.criteria).toContain('registered office');
    expect(f.method.criteria).toContain('not evidence of wrongdoing');
  });

  it('REFUSES a register that does not cover its whole boundary', () => {
    // The one that matters. A partial scan does not give a weaker count — it
    // gives a false one, and the enumeration weight takes completeness on
    // trust because no consumer can check it.
    expect(() => buildEnumerationFindingsFromClusters(CLUSTERS, snapshot({ complete: false })))
      .toThrow(IncompleteRegisterError);
  });

  it('REFUSES a register with no stated boundary, even if it claims completeness', () => {
    expect(() => buildEnumerationFindingsFromClusters(CLUSTERS, snapshot({ bounding: '   ' })))
      .toThrow(IncompleteRegisterError);
  });

  it('throws rather than returning nothing, so refusal cannot read as "no clusters"', () => {
    // An empty array is indistinguishable from a clean run that found nothing,
    // and that is the reading under which a wrong number gets published.
    expect(() => buildEnumerationFindingsFromClusters(CLUSTERS, snapshot({ complete: false }))).toThrow();
    expect(buildEnumerationFindingsFromClusters([], snapshot(), { now: NOW })).toEqual([]);
  });

  it('commits to the members without publishing them', () => {
    // A count is the one claim shape a reader holding the same register cannot
    // otherwise check: they can recount and get a different number with no way
    // to see WHICH members differ. The digest answers that in one value, and
    // an event listing 12,645 company numbers is not an event.
    const [f] = buildEnumerationFindingsFromClusters(CLUSTERS, snapshot(), { now: NOW });

    expect(f.method.enumeratedSetDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(f)).not.toContain(CLUSTERS[0].companyNumbers[0]);
  });

  it('digests the SET, not the order the register returned it in', () => {
    // Two implementations reading one register in different orders must agree,
    // or the digest reports a difference that does not exist.
    const shuffled = [{ ...CLUSTERS[0], companyNumbers: [...CLUSTERS[0].companyNumbers].reverse() }];

    const [a] = buildEnumerationFindingsFromClusters(CLUSTERS, snapshot(), { now: NOW });
    const [b] = buildEnumerationFindingsFromClusters(shuffled, snapshot(), { now: NOW });

    expect(b.method.enumeratedSetDigest).toBe(a.method.enumeratedSetDigest);
  });

  it('changes the digest when a single member changes', () => {
    const altered = [{ ...CLUSTERS[0], companyNumbers: [...CLUSTERS[0].companyNumbers.slice(1), '99999999'] }];

    const [a] = buildEnumerationFindingsFromClusters(CLUSTERS, snapshot(), { now: NOW });
    const [b] = buildEnumerationFindingsFromClusters(altered, snapshot(), { now: NOW });

    expect(b.method.enumeratedSetDigest).not.toBe(a.method.enumeratedSetDigest);
  });

  it('attests every cluster it is given, filtering none of them', () => {
    // The cluster floor is applied upstream, where the enumeration happens.
    // Filtering again here would mean the published count came from a
    // different population than the one the boundary describes.
    const many = [
      cluster('124 CITY ROAD', 'EC1V 2NX', 60),
      cluster('5 QUIET LANE', 'EC1V 9ZZ', 3),
      cluster('71-75 SHELTON STREET', 'WC2H 9JQ', 86035),
    ];

    const found = buildEnumerationFindingsFromClusters(many, snapshot(), { now: NOW });

    expect(found).toHaveLength(3);
    expect(found.map(f => f.claim.value)).toEqual([60, 3, 86035]);
  });
});
