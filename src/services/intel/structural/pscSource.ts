/**
 * Loading the corporate-control asset and turning it into publishable claims.
 *
 * Same seam and same discipline as registerSource: read the asset, check the
 * asset's own account of its completeness, refuse anything it cannot verify.
 * The boundary sentence is the entire basis of an enumeration's weight and no
 * consumer can check it, so a missing or partial one is a refusal.
 */
import { buildControlFindings, type SnapshotProvenance, type CorporateController } from './structuralFindings';
import { retentionOf } from './assetRetention';
import type { FindingAttestation } from '../findings/attestation';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'PscSource' });

export const PSC_ASSET_URL = '/data/psc-control.json';

export function parsePscAsset(
  raw: unknown,
): { provenance: SnapshotProvenance; controllers: CorporateController[] } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'psc asset is not an object' };
  const a = raw as Record<string, unknown>;

  if (!Array.isArray(a.controllers)) return { error: 'psc asset has no controllers array' };
  if (typeof a.bounding !== 'string' || !a.bounding.trim()) {
    return { error: 'psc asset states no boundary; a count without one cannot be published' };
  }
  // Strict: absence is not completeness. An asset built from a subset of the
  // 32 parts undercounts by an unknown amount.
  if (a.complete !== true) {
    return {
      error: 'psc asset does not assert completeness (complete !== true). '
        + 'Re-run scripts/fetch-psc.mjs across all parts.',
    };
  }
  if (typeof a.snapshot !== 'string' || !a.snapshot.trim()) {
    return { error: 'psc asset has no snapshot date' };
  }
  // The exclusions are load-bearing: a reader who assumed this counted every
  // PSC would read every number wrong. If the boundary stops saying so, the
  // asset was built by something that does not share this design.
  if (!/EXCLUDES individual PSCs/i.test(a.bounding)) {
    return { error: 'psc asset boundary does not state that individual PSCs are excluded' };
  }

  return {
    provenance: {
      bounding: a.bounding,
      complete: true,
      snapshot: a.snapshot,
      source: typeof a.source === 'string' ? a.source : 'Companies House PSC register',
      retention: retentionOf(a),
    },
    controllers: a.controllers as CorporateController[],
  };
}

/**
 * Fetch the committed control asset and build findings from it.
 *
 * Returns empty and logs rather than throwing, so one unavailable asset does
 * not take the analysis surface down. The distinction that matters is kept
 * where it belongs: buildControlFindings still throws on an incomplete
 * register, because there the choice is between no claim and a false one.
 */
export async function loadControlFindings(
  fetchImpl: typeof fetch = fetch,
  url = PSC_ASSET_URL,
): Promise<FindingAttestation[]> {
  let raw: unknown;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) { log.info(`No PSC asset at ${url} (${res.status})`); return []; }
    raw = await res.json();
  } catch (err) {
    log.info(`PSC asset unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const parsed = parsePscAsset(raw);
  if ('error' in parsed) {
    log.warn(`Refusing to build findings from the PSC asset: ${parsed.error}`);
    return [];
  }

  try {
    const findings = buildControlFindings(parsed.controllers, parsed.provenance);
    log.info(`Built ${findings.length} control finding(s) from ${parsed.provenance.source} ${parsed.provenance.snapshot}`);
    return findings;
  } catch (err) {
    log.warn(`PSC asset rejected: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
