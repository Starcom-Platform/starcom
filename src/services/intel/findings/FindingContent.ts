import type { CorroboratedFinding } from '../../../applications/intelanalyzer/state/correlationUtils';
import { CONFLICT_TIME_WINDOW_HOURS, CONFLICT_DISTANCE_THRESHOLD_KM, CORROBORATION_ALGORITHM_VERSION } from '../../../applications/intelanalyzer/state/correlationUtils';
import { FINDING_SCHEMA_VERSION_V2, type FindingAttestation, type AttestationMethod } from './attestation';
import type { SubjectKind } from '../../../types/intel/SourceObservation';

/**
 * Bumped only when the WIRE SHAPE below changes (field added/removed/
 * retyped) — distinct from CorroboratedFinding's own algorithmVersion,
 * which tracks the corroboration LOGIC that decided a claim qualified.
 * A finding is published with both: this one lets a third-party consumer
 * parse an old event correctly forever, even after the schema evolves;
 * the other lets them know what actually qualified it. Conflating the two
 * would mean a pure wire-format change (e.g. renaming a field) forces a
 * republish/reinterpretation of the corroboration algorithm's meaning, or
 * vice versa — they change for unrelated reasons and need independent
 * version numbers.
 */
export const FINDING_SCHEMA_VERSION = 1;

export interface FindingClaim {
  entityRef: string;
  attribute: string;
  value: unknown;
}

export interface FindingCorroboration {
  sourceCount: number;
  algorithmVersion: number;
  criteria: string;
}

/**
 * The full published payload for one finding — deliberately NOT the same
 * shape as PackageManifest (which carries an `author` field and raw
 * report/intel references, both explicitly disallowed for a finding: see
 * Findings Publisher spec — "never a raw report, never a single-sourced
 * claim, never an analyst identity"). A finding is a standalone claim, a
 * confidence value, and a citation COUNT, nothing that could re-identify
 * the analyst chain behind it.
 */
export interface FindingContent {
  schemaVersion: number;
  claim: FindingClaim;
  confidence: number;
  corroboration: FindingCorroboration;
  publishedAt: string;
}

/*
 * The v1 builder was deleted when the publisher switched to v2.
 *
 * The v1 TYPES above are kept: findings published under schemaVersion 1 are
 * still on relays and consumers must be able to parse them. Building a new one
 * is a different matter — nothing should, so nothing can.
 */

/**
 * The `d`-tag value kind 30082 is addressed by: content-addressed on
 * entity + attribute, normalized.
 *
 * Lives here rather than in FindingsBroadcastService because it is a
 * property of the CLAIM, not of the transport that carries it. Both the
 * broadcaster and the publish outbox need it, and a consumer that mocks
 * the broadcaster must not thereby break the outbox's ability to identify
 * a finding — which is exactly what happened when this lived next to the
 * relay code.
 */
export function findingIdentifier(finding: { content: unknown }): string {
  const c = finding.content as {
    claim?: { entityRef?: string; subjectRef?: string; attribute?: string };
    retracts?: { subjectRef?: string; attribute?: string };
  };
  // v1 says entityRef, v2 says subjectRef, and a retraction names the slot it
  // withdraws. All three MUST produce the same `d` tag or a v2 finding would
  // land beside its v1 predecessor instead of replacing it, and a retraction
  // would withdraw nothing.
  const subject = c.claim?.subjectRef ?? c.claim?.entityRef ?? c.retracts?.subjectRef ?? '';
  const attribute = c.claim?.attribute ?? c.retracts?.attribute ?? '';
  return identifierFor(subject, attribute);
}

/** The `d`-tag derivation itself, so every caller produces byte-identical slots. */
/**
 * The `d` tag: which replaceable slot a claim occupies.
 *
 * Under a parameterized-replaceable kind this string IS the claim's identity.
 * Two claims sharing it are one claim, and the later silently replaces the
 * earlier. So it must be a LOSSLESS, collision-free function of the pair
 * (subjectRef, attribute), and every implementation must derive it identically
 * or their claims never replace or retract each other.
 *
 * This previously returned `starcom_finding_${subjectRef}_${attribute}`,
 * lowercased with every non-alphanumeric collapsed to `_`, and that was wrong
 * in three separate ways:
 *
 *   - IT COLLAPSED NON-LATIN SCRIPTS TO NOTHING. "北京", "Москва" and "東京"
 *     all produced `starcom_finding___location`, so under a replaceable kind a
 *     claim about Beijing was silently replaced by a claim about Moscow. Every
 *     non-Latin subject on earth shared one slot, in a project whose premise
 *     is a global commons.
 *   - It collided within Latin script too: "Acme Corp", "Acme-Corp" and
 *     "Acme/Corp" are three entities and one slot.
 *   - It embedded a vendor name in a shared protocol identifier, so any other
 *     implementation had to hardcode `starcom_` to interoperate.
 *
 * Percent-encoding is lossless and unambiguous — the separator is escaped
 * inside each component, so `"A:B" + "C"` and `"A" + "B:C"` cannot produce the
 * same tag — and `encodeURIComponent` is specified precisely enough that two
 * independent implementations agree byte for byte.
 *
 * Deliberately NOT normalised. Case and whitespace folding is what made the
 * old version lossy; if two publishers disagree about how to write a subject,
 * that is a subject-canonicalisation problem and must be solved where subjects
 * are chosen, not hidden by a slot function that quietly merges them.
 */
export function identifierFor(subjectRef: string, attribute: string): string {
  // Percent-encoded and joined with a colon, per the NIP. Nothing is
  // lowercased, collapsed, or prefixed — see the doc comment above for what
  // each of those cost.
  return `${encodeURIComponent(subjectRef)}:${encodeURIComponent(attribute)}`;
}

/**
 * Build a v2 Finding — an attestation.
 *
 * The difference from v1 is one omission and several additions. v1 published
 * `confidence: 0.72`, a number this instance asserted about its own output. v2
 * publishes the INPUTS instead: source count, the parameters actually used, the
 * observation window, and the coarsest contributing time precision. A consumer
 * runs deriveAttestationWeight() and gets the same number we would.
 *
 * Across a federation that distinction is not stylistic. A declared confidence
 * is worth the publisher's honesty; a derived one is worth what the stated
 * facts are worth, and one operator running five instances cannot manufacture
 * consensus by claiming 1.0 five times.
 *
 * Still never published, by construction rather than by redaction: a raw
 * report, a single-sourced claim, an analyst identity, or any source's
 * identity. sourceCount remains the only trace a source's existence leaves.
 */
export function buildFindingAttestation(
  finding: CorroboratedFinding,
  options: { subjectKind?: SubjectKind; timePrecisionMs?: number; inputFingerprints?: string[]; modality: AttestationMethod['modality']; weakBacking: string[] },
  now: () => Date = () => new Date(),
): FindingAttestation {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION_V2,
    claim: {
      subjectRef: finding.entityRef,
      // Unstated means unknown — never guessed. What a claim is ABOUT changes
      // what it means, so inventing it would corrupt the claim itself.
      /**
       * The finding's own subject kind, unless the caller overrides it.
       *
       * This defaulted to `'unknown'`, which made the correct value optional
       * and the weaker one automatic. A CorroboratedFinding already carries
       * subjectKind — derived from its contributors, and already `'unknown'`
       * when they disagree — so falling back to the literal discarded a
       * computed answer in favour of a guess.
       *
       * The consequence is not cosmetic. Consumers use subjectKind to decide
       * whether "cannot be in two places at once" applies, and to run their
       * own gate on claims about people. A forgetful caller publishing
       * `unknown` about a person makes that gate fail open at the far end.
       */
      subjectKind: options.subjectKind ?? finding.subjectKind ?? 'unknown',
      attribute: finding.attribute,
      value: finding.value,
    },
    method: {
      // Names the comparison that actually ran. See AttestationMethod.algorithm.
      algorithm: finding.matchedBy === 'equality' ? 'attribute-corroboration' : 'location-corroboration',
      algorithmVersion: finding.algorithmVersion ?? CORROBORATION_ALGORITHM_VERSION,
      // The parameters actually used. Version alone cannot re-derive anything:
      // two instances on version 1 with different windows produce different
      // findings and no way to tell them apart.
      /**
       * The parameters actually used. Version alone cannot re-derive anything:
       * two instances on version 1 with different windows produce different
       * findings and no way to tell them apart.
       *
       * The distance and window terms apply ONLY to distance-matched findings.
       * Publishing them on an equality-matched one would describe an algorithm
       * that did not run — there is no 5km radius on "these two registries name
       * the same city".
       */
      parameters: finding.matchedBy === 'equality'
        ? { windowHours: 0, distanceThresholdKm: 0, matchedBy: 'equality' }
        : { windowHours: CONFLICT_TIME_WINDOW_HOURS, distanceThresholdKm: CONFLICT_DISTANCE_THRESHOLD_KM },
      sourceCount: finding.sourceCount,
      // Published, not just described in `criteria`. A consumer computing
      // their own weight needs the fact, not a sentence about it.
      ...(finding.relayedVia?.length ? { relayedVia: [...finding.relayedVia] } : {}),
      observedFrom: finding.observedFrom,
      observedTo: finding.observedTo,
      // A finding is only as precisely timed as its vaguest input. Unstated
      // defaults to a day, matching the observation-side convention.
      timePrecisionMs: options.timePrecisionMs ?? 24 * 60 * 60 * 1000,
      modality: options.modality,
      /**
       * Stated weakness, plus the weakness the claim already knows about.
       *
       * A relayed claim's sources reached us through one editorial path we did
       * not verify — the corroboration term is already discounted for it, and
       * `criteria` already says so in prose. Publishing `weakBacking: []`
       * alongside that was a false positive assertion: the field means "the
       * publisher checked and found none", and here the publisher had found
       * one and written it down twice.
       *
       * Caught by the first real publication candidate, which is the argument
       * for generating one before shipping a format rather than after.
       */
      weakBacking: [
        ...options.weakBacking,
        ...(finding.relayedVia?.length
          ? [`relayed via ${finding.relayedVia.join(', ')}: source independence not verified — these may share one editorial path`]
          : []),
      ],
      /**
       * What was actually done, in a sentence a stranger can evaluate.
       *
       * This was hardcoded to the location algorithm's terms — "within 24h and
       * 5km, no unresolved conflict" — which would have been simply FALSE on an
       * equality-matched finding, describing a distance test that never ran.
       *
       * The relay clause is the harder honesty. Several registries carried by
       * one aggregator are distinct observers who nonetheless share a single
       * editorial path: one editor could add a value citing two registries
       * without checking either, and nothing downstream could detect it. That
       * limit is stated in the claim rather than left for a reader to infer,
       * because the reader has no way to infer it.
       */
      criteria: finding.matchedBy === 'equality'
        ? `${finding.sourceCount} independent sources assert the same ${finding.attribute}, matched by exact identifier`
          + (finding.relayedVia?.length
            ? `; all relayed via ${finding.relayedVia.join(', ')}, whose citations we did not independently verify`
            : '')
        : `${finding.sourceCount}+ independent sources within ${CONFLICT_TIME_WINDOW_HOURS}h and ${CONFLICT_DISTANCE_THRESHOLD_KM}km, no unresolved conflict`,
      // Omitted rather than empty when the caller has no fingerprints: an empty
      // array would claim "this rests on no evidence", which is a different and
      // false statement from "the evidence set was not published".
      ...(options.inputFingerprints?.length ? { inputFingerprints: options.inputFingerprints } : {}),
      /*
       * Taken from the finding rather than from options, because corroboration
       * is what knows which events survived into it — a caller supplying them
       * would be asserting a derivation it did not perform.
       *
       * Omitted rather than empty for the same reason as fingerprints above: an
       * empty array would claim this rests on no fetchable evidence, which is a
       * different and false statement from "none of the sources publish events".
       */
      ...(finding.citedEventIds?.length ? { citedEventIds: finding.citedEventIds } : {}),
    },
    publishedAt: now().toISOString(),
  };
}
