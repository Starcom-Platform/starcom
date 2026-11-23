import type { Event } from '../../../applications/intelanalyzer/adapters/eventsAdapter';
import type { Observation, Source } from '../../../types/intel/SourceObservation';
import { deriveObservationWeight } from './deriveWeight';
import { observationFingerprint } from '../findings/reproducibility';

/**
 * Observation → Event, the join between the ingest spine and the correlation
 * engine.
 *
 * This is the seam docs/build-order.md calls the "Global" gap: five open-data
 * feeds already flow into the globe and have never reached the analysis layer.
 * Everything downstream — co-occurrence, contradiction, corroboration — reads
 * `Event`, so this mapping is what makes those five sources analytically real
 * rather than decorative.
 *
 * The confidence it emits is DERIVED, and says so via `confidenceBasis`. That
 * matters because the engine compares an observation's confidence against a
 * Report's, and a Report's may have been typed in by a person. Two numbers on
 * the same scale that mean different things is the failure this field exists
 * to make visible.
 */
export function observationsToEvents(
  observations: Observation[],
  sources: Source[],
  now: Date = new Date(),
): Event[] {
  const sourceById = new Map(sources.map(s => [s.id, s]));

  return observations.map((obs) => {
    const source = sourceById.get(obs.sourceId);
    return {
      id: `evt-obs-${obs.id}`,
      title: obs.label,
      timestamp: obs.timestamp,
      category: obs.claim.attribute.toUpperCase(),
      tags: obs.tags,
      lat: obs.geo?.lat,
      lon: obs.geo?.lon,
      geoPrecisionM: obs.geoPrecisionM,
      // An observation from an unregistered source gets the lowest grade
      // rather than a default-average one: an unknown provenance is a reason
      // for less weight, never for typical weight.
      // observedTrust is already clamped to no better than the source
      // baseline (see clampObservedTrust), so preferring it can only ever
      // lower the weight, never raise it on a collector's say-so.
      confidence: deriveObservationWeight(obs, obs.observedTrust ?? source?.trustBaseline ?? 'F', { now }),
      confidenceBasis: 'derived',
      sourceType: 'OBSERVATION',
      // The observation id, not the source id. computeLocationConflicts skips
      // pairs sharing a sourceId ("same record, not a real conflict"), so
      // using the feed's id here would make every event from one feed
      // incapable of corroborating or contradicting any other from that feed.
      sourceId: obs.id,
      // The FEED, not the record. Two rows from one feed are one source, and
      // counting them as two is what D12 was.
      // The ORIGINAL source when the observation was relayed, otherwise the
      // feed that observed it. An aggregator is not a source: a Wikidata
      // statement citing the Global LEI Index belongs to GLEIF's feed, so the
      // two cannot corroborate each other.
      feedId: obs.upstreamSourceId ?? obs.sourceId,
      // Citable only when the source says its record ids are Nostr events.
      sourceEventId:
        source?.recordIdScheme === 'nostr-event' ? obs.sourceRecordId : undefined,
      // Who carried it, when that differs from who observed it.
      relayedVia: obs.upstreamSourceId ? obs.sourceId : undefined,
      // Carried through so corroboration can refuse to count a feed and the
      // feed it republishes as two independent sources.
      derivesFrom: source?.derivesFrom,
      // Scalar claims only. An object claim (a coordinate pair) belongs in
      // lat/lon and is compared by distance; anything else is compared by
      // equality and is normalised here so the engine never has to know what
      // the attribute means.
      // Trimmed, NOT case-folded.
      //
      // Case-folding was right while these were free-text names and became
      // wrong the moment they were identifiers: `Q365` is a Wikidata item and
      // `q365` is not how anyone writes one, so a published claim would have
      // carried a malformed id. Both sides now emit canonical values —
      // Wikidata Q-ids and ISO 3166-1 alpha-2 codes — so folding buys nothing
      // and only corrupts the output.
      //
      // The rule this puts on adapters: emit the canonical form of a value,
      // because the engine compares exactly and will not rescue a sloppy one.
      claim: typeof obs.claim.value === 'string' || typeof obs.claim.value === 'number'
        ? { attribute: obs.claim.attribute, value: String(obs.claim.value).trim() }
        : undefined,
      entityRefs: [obs.subjectEntityRef],
      // Names beside the ids, for a person to read (plan item 3.6). The
      // engine never reads them: it matches on `entityRefs` and `claim`.
      subjectName: obs.subjectName,
      valueLabel: obs.valueLabel,
      feedLabel: obs.upstreamSourceLabel,
      subjectKind: obs.subjectKind,
      /**
       * Mock if EITHER the observation or its source says so.
       *
       * Observation.isMock is documented as "inherited from the Source; never
       * set independently by an adapter" — but nothing enforced that here, and
       * this hop read only the observation. An adapter that built an
       * Observation with isMock:false from a source flagged isMock:true would
       * have laundered fabricated data into the real corpus with one field,
       * and every downstream honesty check would have agreed it was genuine.
       *
       * Taking the worse of the two makes the documented invariant hold
       * whether or not the adapter honoured it. An unregistered source is
       * `undefined` rather than false: unknown provenance is not a claim of
       * authenticity, and publicationPolicy refuses it.
       */
      isMock: obs.isMock === true || source?.isMock === true ? true
        : obs.isMock === false && source?.isMock === false ? false
        : undefined,
      timePrecisionMs: obs.timePrecisionMs,
      fingerprint: observationFingerprint(obs),
    };
  });
}
