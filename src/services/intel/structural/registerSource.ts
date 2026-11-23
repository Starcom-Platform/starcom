/**
 * Loading the committed register slice and turning it into publishable claims.
 *
 * This is the seam between a data asset and a claim, and it is deliberately
 * narrow: it reads the asset, checks the asset's own account of its
 * completeness, and refuses on anything it cannot verify. It does not repair,
 * default, or infer. A register slice that does not say what it covers cannot
 * produce a count anybody should trust, and quietly substituting a plausible
 * boundary would produce exactly the confident-and-wrong claim the whole
 * attestation model exists to prevent.
 */
import { buildEnumerationFindingsFromClusters, buildBatchFindings, type SnapshotProvenance, type IncorporationBatch } from './structuralFindings';
import { retentionOf } from './assetRetention';
import type { AddressCluster } from './addressClustering';
import type { FindingAttestation } from '../findings/attestation';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'RegisterSource' });

export const REGISTER_ASSET_URL = '/data/companies-house.json';

/**
 * Every committed register, not just the first.
 *
 * Each one carries its own boundary, snapshot date and completeness verdict,
 * so they are read independently: a second jurisdiction being absent or
 * refused must not suppress the first, and nothing is ever merged across
 * registers. A count is only ever a count within ONE stated boundary.
 */
export const REGISTER_ASSET_URLS = [
  '/data/companies-house.json',
  '/data/brreg.json',
];

/**
 * Parse an asset into a snapshot, or explain why it cannot be one.
 *
 * `complete` is read strictly: a missing field is NOT completeness. Older
 * assets predate the field entirely and were in fact partial scans presented
 * as complete, so treating absence as true would resurrect precisely the bug
 * that motivated the field.
 *
 * The asset carries CLUSTERS, not rows — the fetcher counts, because only the
 * thing that read the register parts can say whether it read all of them.
 */
export function parseRegisterAsset(
  raw: unknown,
): { provenance: SnapshotProvenance; clusters: AddressCluster[]; batches: IncorporationBatch[] } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'register asset is not an object' };
  const a = raw as Record<string, unknown>;

  if (!Array.isArray(a.clusters)) return { error: 'register asset has no clusters array' };
  if (typeof a.bounding !== 'string' || !a.bounding.trim()) {
    return { error: 'register asset states no boundary; a count without one cannot be published' };
  }
  if (a.complete !== true) {
    return {
      error: 'register asset does not assert completeness (complete !== true). '
        + 'Re-run scripts/fetch-companies-house.mjs across all parts.',
    };
  }
  if (typeof a.snapshot !== 'string' || !a.snapshot.trim()) {
    return { error: 'register asset has no snapshot date' };
  }

  return {
    provenance: {
      bounding: a.bounding,
      complete: true,
      snapshot: a.snapshot,
      source: typeof a.source === 'string' ? a.source : 'Companies House',
      retention: retentionOf(a),
      // What the register calls the address it holds. Companies House records
      // a "registered office"; Enhetsregisteret records a "registered business
      // address". Close enough to cluster identically, different enough that a
      // claim should use the source's own term rather than one borrowed from
      // another jurisdiction.
      ...(typeof a.addressTerm === 'string' && a.addressTerm.trim()
        ? { addressTerm: a.addressTerm.trim() }
        : {}),
    },
    clusters: a.clusters as AddressCluster[],
    // Absent is empty, not an error: an asset can legitimately contain no
    // qualifying batch, and older assets predate the analysis entirely.
    batches: Array.isArray(a.batches) ? (a.batches as IncorporationBatch[]) : [],
  };
}

/**
 * Fetch the committed register slice and build enumeration findings from it.
 *
 * Returns an empty array and logs on any failure rather than throwing: this
 * runs at app startup alongside other sources, and one unavailable asset
 * should not take the analysis surface down with it. The distinction that
 * matters is preserved elsewhere — buildEnumerationFindings still THROWS on an
 * incomplete register, because there the choice is between no claim and a
 * false one.
 */
export async function loadStructuralFindings(
  fetchImpl: typeof fetch = fetch,
  urls: readonly string[] = REGISTER_ASSET_URLS,
): Promise<FindingAttestation[]> {
  const perRegister = await Promise.all(urls.map((url) => loadOneRegister(fetchImpl, url)));
  return perRegister.flat();
}

async function loadOneRegister(fetchImpl: typeof fetch, url: string): Promise<FindingAttestation[]> {
  let raw: unknown;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { log.info(`No register asset at ${url} (${res.status})`); return []; }
    raw = await res.json();
  } catch (err) {
    log.info(`Register asset unavailable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const parsed = parseRegisterAsset(raw);
  if ('error' in parsed) {
    // Warn, not info. This is a real asset that cannot be used, which is a
    // different situation from not having one.
    log.warn(`Refusing to build findings from ${url}: ${parsed.error}`);
    return [];
  }

  try {
    const findings = [
      ...buildEnumerationFindingsFromClusters(parsed.clusters, parsed.provenance),
      ...buildBatchFindings(parsed.batches, parsed.provenance),
    ];
    log.info(`Built ${findings.length} finding(s) from ${parsed.provenance.source} ${parsed.provenance.snapshot}`);
    return findings;
  } catch (err) {
    log.warn(`Register asset rejected (${url}): ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
