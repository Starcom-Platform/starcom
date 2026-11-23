/**
 * Loading the LEI coverage asset and turning it into publishable claims.
 *
 * Its own loader rather than a branch in registerSource, because this asset is
 * a JOIN of two registers and carries a boundary that names both. Merging it
 * into a single-register loader would mean one loader holding two provenance
 * stories, and the first thing to go wrong would be a claim citing the wrong
 * snapshot.
 */
import { buildLeiCoverageFindings, buildForeignParentageFindings, type SnapshotProvenance, type LeiCoverageEntry } from './structuralFindings';
import type { FindingAttestation } from '../findings/attestation';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'LeiCoverage' });

export const LEI_COVERAGE_ASSET_URL = '/data/lei-coverage.json';

export function parseLeiCoverageAsset(
  raw: unknown,
): { provenance: SnapshotProvenance; entries: LeiCoverageEntry[] } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'lei coverage asset is not an object' };
  const a = raw as Record<string, unknown>;

  if (!Array.isArray(a.entries)) return { error: 'lei coverage asset has no entries array' };
  if (typeof a.bounding !== 'string' || !a.bounding.trim()) {
    return { error: 'lei coverage asset states no boundary; a count without one cannot be published' };
  }
  // Strict, as everywhere: absence is not completeness.
  if (a.complete !== true) {
    return { error: 'lei coverage asset does not assert completeness (complete !== true)' };
  }
  if (typeof a.snapshot !== 'string' || !a.snapshot.trim()) {
    return { error: 'lei coverage asset has no snapshot date' };
  }
  /**
   * The boundary must name BOTH inputs.
   *
   * This claim joins a register to the LEI index, and a reader who did not
   * know that would read the count as a property of the register alone. If
   * the boundary stops saying so, the asset was built by something that does
   * not share this design.
   */
  if (!/GLEIF/i.test(a.bounding) || !/snapshot/i.test(a.bounding)) {
    return { error: 'lei coverage boundary does not name both joined snapshots' };
  }

  return {
    provenance: {
      bounding: a.bounding,
      complete: true,
      snapshot: a.snapshot,
      source: typeof a.source === 'string' ? a.source : 'Company registers joined to GLEIF',
      ...(typeof a.addressTerm === 'string' && a.addressTerm.trim() ? { addressTerm: a.addressTerm.trim() } : {}),
    },
    entries: a.entries as LeiCoverageEntry[],
  };
}

/**
 * Fetch the coverage asset and build findings from it.
 *
 * Returns empty and logs rather than throwing, so one unavailable asset does
 * not take the analysis surface down. buildLeiCoverageFindings still throws on
 * an incomplete population, because there the choice is between no claim and a
 * false one.
 */
export async function loadLeiCoverageFindings(
  fetchImpl: typeof fetch = fetch,
  url = LEI_COVERAGE_ASSET_URL,
): Promise<FindingAttestation[]> {
  let raw: unknown;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { log.info(`No LEI coverage asset at ${url} (${res.status})`); return []; }
    raw = await res.json();
  } catch (err) {
    log.info(`LEI coverage asset unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const parsed = parseLeiCoverageAsset(raw);
  if ('error' in parsed) {
    log.warn(`Refusing to build findings from the LEI coverage asset: ${parsed.error}`);
    return [];
  }

  try {
    const findings = [
      ...buildLeiCoverageFindings(parsed.entries, parsed.provenance),
      ...buildForeignParentageFindings(parsed.entries, parsed.provenance),
    ];
    log.info(`Built ${findings.length} coverage finding(s), dated ${parsed.provenance.snapshot}`);
    return findings;
  } catch (err) {
    log.warn(`LEI coverage asset rejected: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
