import type { Source } from '../../../../types/intel/SourceObservation';
import type { IntelReliability } from '../../../../types/intel/IntelItemUI';
import type { Intel } from '../../../../models/Intel/Intel';
import { createObservation, ObservationValidationError } from '../createObservation';
import type { AdapterResult, SourceAdapter } from './types';

/**
 * NetRunner OSINT collection → Observation. The sixth source, and the only one
 * that is not an external open-data feed.
 *
 * This is the "migrate NetRunner onto the envelope" task from build-passes
 * II.A.2, done as an adapter rather than as a rewrite of the `Intel` model.
 * That is deliberate: `Intel` has many consumers across NetRunner, and
 * changing it would be a large, risky refactor whose benefit is entirely
 * captured by mapping at the boundary. ADR-0003's compliance check asks that a
 * source "maps into Source/Observation rather than adding a fourth bespoke
 * shape" — an adapter satisfies that. Retiring `Intel` itself is a separate
 * decision with its own cost, not a prerequisite for six sources.
 */

export const NETRUNNER_SOURCE: Source = {
  id: 'netrunner-osint',
  kind: 'osint-bot',
  label: 'NetRunner OSINT Collection',
  // C — fairly reliable. Automated collection against third-party APIs
  // (Shodan, Censys, VirusTotal, TheHarvester) with no human verification
  // step. The tools are sound; what they return about a target is a snapshot
  // of one vantage point, and the bot cannot tell a stale record from a
  // current one.
  trustBaseline: 'C',
  ingestMethod: 'poll',
  isMock: false,
};

/** NetRunner's ReliabilityRating includes 'X' (deception suspected), which is off the A-F scale. */
function asReliability(rating: string | undefined): IntelReliability | undefined {
  if (!rating) return undefined;
  // 'X' is passed through as an unrecognised grade on purpose —
  // clampObservedTrust maps it to the worst grade rather than dropping it.
  return rating as IntelReliability;
}

export class NetRunnerAdapter implements SourceAdapter<Intel> {
  readonly source: Source;

  constructor(source: Source = NETRUNNER_SOURCE) {
    this.source = source;
  }

  toObservations(raw: Intel[]): AdapterResult {
    const observations = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const intel of raw ?? []) {
      if (!intel || typeof intel !== 'object') {
        dropped.push({ reason: 'record is not an object' });
        continue;
      }
      if (!intel.id) {
        dropped.push({ reason: 'no stable upstream identifier' });
        continue;
      }
      if (typeof intel.timestamp !== 'number' || !Number.isFinite(intel.timestamp)) {
        dropped.push({ nativeId: String(intel.id), reason: 'no usable timestamp' });
        continue;
      }

      // The subject is whatever the collection was ABOUT. bridgeMetadata.entityId
      // is the closest thing NetRunner has to a resolved entity; location and
      // collector are fallbacks. Nothing is invented — a record with no
      // attributable subject is dropped.
      const subject = intel.bridgeMetadata?.entityId || intel.location || intel.collectedBy;
      if (!subject) {
        dropped.push({ nativeId: String(intel.id), reason: 'no entityId, location, or collector to attribute the record to' });
        continue;
      }

      const hasGeo = typeof intel.latitude === 'number' && typeof intel.longitude === 'number';

      try {
        observations.push(createObservation(this.source, {
          nativeId: String(intel.id),
          subjectEntityRef: subject,
          claim: {
            attribute: `osint_${(intel.source ?? 'unknown').toLowerCase()}`,
            value: {
              intelSource: intel.source,
              collectedBy: intel.collectedBy,
              verified: intel.verified,
              hash: intel.hash,
              location: intel.location,
            },
          },
          timestamp: new Date(intel.timestamp),
          // Automated collection from a system of record, not a measurement
          // and not a human report.
          method: 'collected',
          geo: hasGeo ? { lat: intel.latitude as number, lon: intel.longitude as number } : undefined,
          label: intel.location
            ? `${intel.source} collection — ${intel.location}`
            : `${intel.source} collection`,
          tags: ['osint', 'netrunner', ...(intel.tags ?? [])],
          // Genuinely unknown: the subject is whatever the collection was
          // about, and NetRunner does not record which kind. 'unknown' is
          // treated as exclusive, so contradiction detection still applies —
          // over-reporting on an unclassified subject is visible, whereas
          // silently disabling the check would not be.
          subjectKind: 'unknown',
          // Self-reported by the collector, and therefore clamped downward
          // only — see clampObservedTrust.
          observedTrust: asReliability(intel.reliability),
        }));
      } catch (err) {
        dropped.push({
          nativeId: String(intel.id),
          reason: err instanceof ObservationValidationError ? err.message : 'unexpected mapping failure',
        });
      }
    }

    return { observations, dropped };
  }
}

export const netrunnerAdapter = new NetRunnerAdapter();
