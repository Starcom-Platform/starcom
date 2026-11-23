import type { SubjectKind } from '../../../types/intel/SourceObservation';

/**
 * A Finding as an ATTESTATION.
 *
 * Adopted from `navcom-app/docs/attestation.md`, unchanged, because it is right
 * and because two applications in one ecosystem should be built out of one
 * object:
 *
 *   > A claim, plus who made it, plus how they know, plus how much that is
 *   > worth — signed, and checkable without anyone's permission.
 *
 * With the rule that matters most: **weight is derived from method and age,
 * never declared by the author.**
 *
 * Schema v1 shipped `confidence: 0.72` — a number this instance asserted about
 * its own output. Inside one instance that is harmless. Across a federation it
 * is fatal: every instance can claim 1.0, and one operator running five
 * instances manufactures consensus for free. v2 removes it and ships the
 * inputs instead, so any consumer computes the weight themselves and gets the
 * same answer.
 *
 * That is the difference between a claim you must take on trust and one you can
 * check.
 */

export const FINDING_SCHEMA_VERSION_V2 = 2;

export interface AttestationClaim {
  /** What the claim is about. Never an analyst; the subject of the observation. */
  subjectRef: string;
  /**
   * What kind of thing the subject is.
   *
   * On the wire because it changes what the claim MEANS. "This organisation was
   * at X" and "this person was at X" support different inferences, and a
   * consumer applying an exclusivity rule needs to know which it has.
   */
  subjectKind: SubjectKind;
  attribute: string;
  value: unknown;
}

/**
 * How the claim came to be known — the half of an attestation that makes weight
 * derivable rather than assertable.
 *
 * Everything here is a FACT ABOUT PROVENANCE, not an opinion. A consumer with
 * this block can reproduce the weight, and can attempt to falsify the claim
 * without ever seeing a source identity.
 */
export interface AttestationMethod {
  /** Which algorithm qualified this claim. */
  /**
   * What produced this claim. An OPEN identifier, per the NIP.
   *
   * Was the single literal `'location-corroboration'`, which was accurate
   * while every finding was a distance match and became a false statement the
   * moment one was not: an equality-matched headquarters claim published
   * "location-corroboration" describing an algorithm that never ran. A reader
   * checking our method would have found that before we did.
   */
  algorithm: 'location-corroboration' | 'attribute-corroboration' | string;
  algorithmVersion: number;
  /**
   * HOW the observation was made. A vocabulary, deliberately not a ranking —
   * the consumer ranks it, the same way it derives weight. Ratified
   * network-wide; see the NIP's Modality section.
   */
  modality:
    | 'in_person' | 'field_attested' | 'direct_contact' | 'primary_record'
    | 'secondary_record' | 'inference' | 'self_attested' | 'unknown';
  /**
   * Inputs this publisher knows to be thin, stale, or unreproducible.
   *
   * An empty array is a POSITIVE statement — checked, none found — which is
   * why it has no default here. A builder that quietly defaulted to `[]`
   * would make that assertion on behalf of a caller that never checked, and
   * the whole point of the field is that the publisher stops withholding what
   * it already knows.
   */
  weakBacking: string[];
  /**
   * The parameters ACTUALLY USED, not the algorithm's defaults.
   *
   * Shipping the algorithm version alone is not enough to re-derive anything —
   * two instances running version 1 with different windows produce different
   * findings and no way to tell them apart.
   */
  parameters: {
    /**
     * How the contributing observations were matched.
     *
     * Absent means `'distance'`, preserving every claim published before
     * equality matching existed. Present and `'equality'` means the window and
     * distance terms below are inapplicable rather than merely zero — there is
     * no radius on "two registries name the same city", and a consumer
     * re-deriving weight must not read a 0km threshold as an extremely
     * precise one.
     */
    matchedBy?: 'distance' | 'equality' | 'enumeration';
    windowHours: number;
    /**
     * Distance matching only, and therefore OPTIONAL.
     *
     * Was required, which was accurate while every algorithm matched by
     * distance and became a trap the moment one did not: an algorithm with no
     * radius had to publish `0`, and this field's own sibling comment says
     * plainly that a consumer must not read a 0km threshold as an extremely
     * precise one. Requiring a number meant requiring a misleading one.
     *
     * Nothing in the weight derivation reads it — it is disclosure for a reader
     * re-running a distance match, so its absence costs a non-distance
     * algorithm nothing.
     */
    distanceThresholdKm?: number;
    /**
     * Whatever else the named `algorithm` actually used.
     *
     * The fields above are the corroboration algorithms' terms, and this type
     * had only those — so a second algorithm could not describe its own
     * parameters at all, which is the same closed-`algorithm` mistake one level
     * down. The NIP has always specified this as the values ACTUALLY USED by an
     * implementation-defined identifier, so the type now says that too.
     */
    [key: string]: unknown;
  };
  /** Independent sources agreeing. A COUNT, never identities. */
  sourceCount: number;
  /**
   * For an ENUMERATION claim: the boundary that was counted, in full.
   *
   * Required when `matchedBy` is `'enumeration'`, and its absence is a refusal
   * rather than a default. A count is the entire claim, so a count whose
   * boundary is unstated cannot be checked at all — "40 companies at this
   * address" from data that happened to contain 40 of 400 is not partial, it
   * is false. Publishing the boundary is what lets a reader re-run the count
   * and get the same answer or a different one.
   *
   * Example: "Every company whose registered postcode district is EC1V or
   * WC2H, from the Companies House snapshot of 2026-08-01."
   */
  enumeratedBoundary?: string;

  /**
   * SHA-256 over the sorted member identifiers of an enumeration, as hex.
   *
   * A census can have thousands of contributing inputs, so `inputFingerprints`
   * cannot carry them: an event listing 4,486 company numbers is not an event.
   * But without something, a count is the one claim shape a reader holding the
   * same register still cannot check — they can re-run the count and get a
   * different number with no way to see WHICH members differ.
   *
   * This is a commitment to the set, not a list of it. Anyone with the same
   * boundary recomputes the digest and compares one value; equal means the same
   * members, unequal means look closer. Deliberately its own field rather than
   * a convention layered onto `inputFingerprints`, which means something else —
   * per-input hashes — and would be silently misread by any consumer that
   * already implements it.
   *
   * Members are joined with '\n' after sorting, so the digest depends on the
   * set and not on the order the register happened to yield it in.
   */
  enumeratedSetDigest?: string;
  /**
   * Aggregators every contributing source travelled through, if any.
   *
   * On the wire because a consumer deriving their own weight cannot otherwise
   * tell "five registries agreed" from "five registries as relayed by one
   * editor". The difference matters and it is not inferable from the other
   * fields.
   *
   * Absent means the sources were observed directly. An empty array means the
   * same thing and is accepted, but absent is preferred — see the NIP's note
   * on why an empty list is a weaker statement than no list.
   */
  relayedVia?: string[];
  /** When the underlying observations occurred — ISO 8601 UTC. */
  observedFrom: string;
  observedTo: string;
  /**
   * The COARSEST time precision among contributing observations, in ms.
   *
   * A finding is only as precisely timed as its vaguest input, and a consumer
   * deriving weight needs to know whether "within 24 hours" was established
   * from second-level data or from day-level data.
   */
  timePrecisionMs: number;
  /** Plain-language statement of what qualified this, for a reader who will not run the algorithm. */
  criteria: string;
  /**
   * Hashes of the contributing observations, sorted.
   *
   * The half of falsifiability that belongs to the consumer: it lets a third
   * party fingerprint their OWN observations and see how much of this evidence
   * they hold, without either side revealing content or source identity.
   * Without it, "falsifiable" means only that someone could disagree, not that
   * they could check.
   *
   * See reproducibility.ts on why these are deterministic across instances by
   * necessity, and what that costs.
   */
  inputFingerprints?: string[];
  /**
   * Fetchable Nostr event ids this finding rests on.
   *
   * Distinct from `inputFingerprints`, which are per-input HASHES: a
   * fingerprint proves a reader looked at the same inputs and cannot be walked
   * back to them. These can be fetched from any relay carrying them, which is
   * the property Navcom asked for — "carry the source event ids into every
   * derived Finding, so a third party can walk it back without asking either
   * of us."
   *
   * IDS, NEVER IDENTITIES. An event id is a hash that resolves to a public
   * event; a pubkey or a callsign is a person. Starcom's rule that a Finding
   * never carries source identities is therefore not engaged, and no pubkey
   * belongs in this array — that distinction is the reason the field is safe
   * to publish and the reason it must not be widened.
   *
   * Present only for sources whose records ARE Nostr events. A register's row
   * key is a good record id and not one of these; citing it would produce a
   * reference that resolves to nothing, which is worse than no citation
   * because it looks checkable.
   */
  citedEventIds?: string[];
}

export interface FindingAttestation {
  schemaVersion: number;
  claim: AttestationClaim;
  method: AttestationMethod;
  /**
   * When this instance published the attestation. NOT when the thing happened
   * — that is method.observedFrom/observedTo — and not a confidence.
   *
   * Weight decays from here, so it is an input to derivation rather than a
   * decoration.
   */
  publishedAt: string;
  /**
   * There is deliberately NO `confidence`, `weight`, or `score` field.
   *
   * If you are looking for one, that is the point: derive it with
   * deriveAttestationWeight(). An author cannot tell you how much to trust
   * them.
   */
}
