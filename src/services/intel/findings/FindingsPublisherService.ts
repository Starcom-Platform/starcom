import type { CorroboratedFinding } from '../../../applications/intelanalyzer/state/correlationUtils';
import { buildFindingAttestation } from './FindingContent';
import { evaluatePublication, type PublicationPolicyOptions } from './publicationPolicy';
import { signFindingPreferNative } from './signFindingPreferNative';
import { FindingsBroadcastService, BroadcastResult, findingRelays } from './FindingsBroadcastService';
import { whereItGoes } from '../../nostr/publishTargets';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { publishOutbox } from '../outbox/PublishOutbox';
import { publishedFindingsLedger } from './PublishedFindingsLedger';
import { buildRefutation } from './refutation';
import { attestationForCasePosition } from './caseAdjudication';
import type { CaseAdjudicationOptions, AdjudicatedCase } from './caseAdjudication';
import type { FindingRefutation, RefutationGround } from './refutation';
import type { FindingAttestation } from './attestation';
import { buildRetraction, type RetractionReason, type FindingRetraction } from './retraction';
import type { DrainSummary } from '../outbox/OutboxTypes';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'FindingsPublisher' });

export interface PublishFindingResult {
  broadcast: BroadcastResult;
  /**
   * Set when the publication policy refused, and nothing was signed or sent.
   *
   * Distinct from a broadcast failure: refusal is a decision, not an outage,
   * and it must not be retried automatically. The finding is not queued.
   */
  refused?: { reason: string; requiresExplicitConsent: true };
  /**
   * True when the broadcast reached no relay and the finding was queued for
   * a later attempt instead of being dropped. Callers should say so in the
   * UI — "queued, not yet public" is a different fact from "published", and
   * conflating them would be the same class of dishonesty as reporting a
   * security check that never ran.
   */
  queued: boolean;
}

/**
 * The "Publish Finding" action — deliberate, one finding at a time, never
 * automatic the moment computeCorroboratedFindings turns up a new result
 * (see FindingsBroadcastService's doc comment). Mirrors
 * MissionService.publishToNavcom's shape, reusing the same persisted
 * ML-DSA signing key (manifestSigningKeyStore) so a verifier who has
 * pinned this instance's key from a Mission Package can attribute a
 * Finding to the same source, and the same Nostr identity
 * (nostrIdentityService) for the outer event's signature.
 *
 * Deliberately takes a CorroboratedFinding value, not an id to re-fetch —
 * this service has no storage of its own findings (they're always
 * recomputed from live events by computeCorroboratedFindings) and
 * shouldn't invent one just to support a lookup-by-id call shape.
 */
/**
 * The attestation a corroborated finding makes — method included.
 *
 * Extracted so that refuting a peer's claim uses byte-identical method
 * construction to publishing our own. The modality and weakBacking reasoning
 * below is the load-bearing part, and a second copy of it in the refutation
 * path would drift: the refutation would end up describing evidence by
 * different rules than the claim it argues with, and a consumer comparing the
 * two weights would be comparing two different conventions.
 */
function attestationFor(finding: CorroboratedFinding): FindingAttestation {
  // v2 attestation: the method travels, the confidence does not. See
  // docs/spec — a declared confidence is worth the publisher's honesty; a
  // derived one is worth what the stated facts are worth.
  return buildFindingAttestation(finding, {
    subjectKind: finding.subjectKind,
    timePrecisionMs: finding.timePrecisionMs,
    inputFingerprints: finding.contributingFingerprints,
    // A corroborated finding is computed across observations rather than
    // witnessed, so it is an inference regardless of what its inputs were.
    // Overstating this as a primary record would claim the publisher saw
    // something it only calculated.
    modality: finding.modality ?? 'inference',
    // An empty array asserts "checked, none found". This path does not yet
    // track input reproducibility for corroborated findings, so it says that
    // instead of asserting a check it never ran. It will read badly in
    // published claims until it is wired to the freshness guard, which is the
    // correct amount of pressure.
    weakBacking: finding.weakBacking ?? [
      /**
       * Say which KIND of unreproducible this is, rather than only that it is.
       *
       * This published a flat "not-assessed", which is honest but useless: a
       * consumer learns that something was not checked without learning what
       * they could do about it. Two situations hide under it and they differ:
       *
       *   fingerprints published — a consumer holding the same inputs can
       *     confirm they match. Anyone else still cannot re-derive the claim.
       *   no fingerprints — nobody can check anything, including us.
       *
       * The full fix is upstream and is NOT done: SourceObservation carries no
       * archival provenance at all, so whether a contributing source is still
       * fetchable is genuinely unknown here rather than merely uncomputed.
       * Stating a computed value would mean inventing provenance this pipeline
       * does not track, which is the failure weakBacking exists to prevent.
       */
      finding.contributingFingerprints?.length
        ? `inputs fingerprinted but not archived: a consumer holding the same ${finding.contributingFingerprints.length} input(s) can confirm they match, but nobody can re-derive this claim from scratch`
        : 'inputs neither archived nor fingerprinted: this claim cannot be re-derived or checked by anyone, including its publisher',
    ],
  });
}

export async function publishFinding(
  finding: CorroboratedFinding,
  policy: PublicationPolicyOptions = {},
): Promise<PublishFindingResult> {
  const content = attestationFor(finding);
  return publishAttestation(content, { ...policy, isMock: finding.isMock }, finding.entityRef);
}

/** A corroborated finding checked and built for the publish review. */
export function prepareFinding(
  finding: CorroboratedFinding,
  policy: PublicationPolicyOptions = {},
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'attestation' }>, PublishFindingResult> {
  return prepareAttestation(attestationFor(finding), { ...policy, isMock: finding.isMock }, finding.entityRef);
}

/**
 * Publish an attestation that was built elsewhere.
 *
 * Split out of publishFinding when structural (enumeration) findings arrived:
 * those are not CorroboratedFindings and never pass through
 * buildFindingAttestation, but they MUST pass through the same publication
 * gate. Giving them their own publish path would have meant a second door
 * into the relays with its own copy of the policy check — and the copy that
 * drifts is the one that publishes something it shouldn't.
 */
/**
 * A finding-family publish checked and built, not yet signed: what the publish
 * review shows (plan item 0.1). Signing happens only after a yes, over exactly
 * this content.
 */
export type PreparedFindingPublish = (
  | { kind: 'attestation'; content: FindingAttestation; label: string }
  | { kind: 'refutation'; content: FindingRefutation; label: string }
  | { kind: 'retraction'; content: FindingRetraction; slot: string }
) & {
  /**
   * Where it goes, decided when it was prepared, so the review shows where it
   * is sent (plan item 0.4). A case position goes where its case may go; a
   * withdrawal goes where its claim went; everything else goes to the
   * findings relays.
   */
  relays: string[];
};

/** Either something to review, or the reason there is nothing to review. */
export type PrepareOutcome<P, R> = { prepared: P } | { refused: R };

export async function publishAttestation(
  content: FindingAttestation,
  policy: PublicationPolicyOptions = {},
  label = content.claim.subjectRef,
): Promise<PublishFindingResult> {
  const ready = prepareAttestation(content, policy, label);
  return 'refused' in ready ? ready.refused : publishPreparedAttestation(ready.prepared);
}

/**
 * The gates an attestation passes before it is shown or signed. Refusing here
 * leaves nothing behind: no review, no signature, no queued record.
 */
export function prepareAttestation(
  content: FindingAttestation,
  policy: PublicationPolicyOptions = {},
  label = content.claim.subjectRef,
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'attestation' }>, PublishFindingResult> {
  /*
   * "Has this person been told they are the publisher?" was asked here, and
   * only findings passed through here, so a case position from a fresh profile
   * was refused with no way to acknowledge it. The publish review now asks, the
   * first time each key publishes, on every path (plan item 0.1); and the
   * review is the only way anything is published (guard-publish-review).
   */
  // The gate comes BEFORE signing. A refused finding should leave no artifact
  // at all — not a signed payload sitting in memory, not a queued outbox
  // record. Deciding not to publish is not a failed publish.
  const decision = evaluatePublication(content.claim.subjectKind, policy);
  if (decision.allowed === false) {
    log.info(`Publication refused: ${label} (${content.claim.subjectKind})`);
    return {
      refused: {
        broadcast: { success: false, error: 'publication refused by policy' },
        queued: false,
        refused: { reason: decision.reason, requiresExplicitConsent: true },
      },
    };
  }
  return { prepared: { kind: 'attestation', content, label, relays: findingRelays() } };
}

/** Sign exactly the prepared attestation, send it, and record or queue it. */
export async function publishPreparedAttestation(
  prepared: Extract<PreparedFindingPublish, { kind: 'attestation' }>,
): Promise<PublishFindingResult> {
  const { content } = prepared;
  // Prefers the desktop host's isolated signer, where the key is not reachable
  // from any page. Falls back to the browser key, which is.
  const { signed } = await signFindingPreferNative(content);

  const broadcastService = new FindingsBroadcastService(prepared.relays);
  const broadcast = await broadcastService.publishFinding(signed, nostrIdentityService.asSigner());
  broadcastService.dispose();

  // Reached at least one relay: write it down. Until this existed a
  // successful publish left no local trace at all, so the instance could not
  // enumerate its own public claims — which blocks recheck, makes retraction
  // reach only what someone still remembers, and leaves "what have I said?"
  // unanswerable. See PublishedFindingsLedger.
  if (broadcast.success) {
    publishedFindingsLedger.record(content, {
      eventId: broadcast.eventId,
      relaysOk: broadcast.relaysOk,
      // The key that signed THIS claim, not whichever key is current later.
      authorPubkey: signed.signature.pubkey,
      // And the Nostr key that signed the event, for its address (plan item 5.1).
      ...(broadcast.nostrPubkey ? { nostrPubkey: broadcast.nostrPubkey } : {}),
      // Where it went, so a withdrawal goes to the same place.
      relays: prepared.relays,
    });
  }

  // Reached nobody. Queue rather than lose it — see PublishOutbox's doc
  // comment on why silently dropping here is the wrong behaviour for an app
  // that claims censorship-resistant publishing.
  let queued = false;
  if (!broadcast.success) {
    try {
      // With where it was going: a retry must not reach relays this one was never meant for.
      await publishOutbox.enqueue(signed, { relays: prepared.relays });
      queued = true;
    } catch (err) {
      // Queueing failed too (storage unavailable). Report honestly rather
      // than implying the finding is safely parked somewhere.
      queued = false;
      log.error('Broadcast failed AND outbox enqueue failed:', err instanceof Error ? err.message : String(err));
    }
  }

  return { broadcast, queued };
}

/**
 * Publish a refutation of someone's claim.
 *
 * ─── WHY subjectKind IS A PARAMETER ────────────────────────────────────────
 *
 * The publication gate keys on subjectKind, and a refutation's `refutes` block
 * carries subjectRef, attribute, author and publishedAt — but NOT subjectKind.
 * So the gate cannot read it off the payload the way it does for a claim.
 *
 * Left unguarded, refuting would be a way around the person-protection gate:
 * refused a claim about a named individual, publish a refutation naming the
 * same individual instead. The caller must therefore supply the kind of the
 * subject it is arguing about, and the same gate runs before anything is
 * signed.
 *
 * This is also a gap in the NIP, noted where it can be acted on rather than
 * only observed: a RECEIVING node cannot apply its own gate to refutations
 * either, for exactly the same reason. Fixing that means putting subjectKind on
 * the wire, which is a format change and therefore not one to make quietly.
 *
 * ─── WHY THE OUTBOX PATH IS SHARED ─────────────────────────────────────────
 *
 * A refutation that reached nobody is not a refutation. It queues like any
 * other attestation, because the failure mode being avoided — publishing into
 * silence and believing it landed — is identical.
 */
export async function publishRefutation(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  /** The refuter's OWN evidence, in the same shape a claim uses. */
  method: FindingAttestation['method'],
  subjectKind: FindingAttestation['claim']['subjectKind'],
  policy: PublicationPolicyOptions = {},
): Promise<PublishFindingResult> {
  const ready = prepareRefutation(refutes, ground, method, subjectKind, policy);
  return 'refused' in ready ? ready.refused : publishPreparedRefutation(ready.prepared);
}

/** The gate a refutation passes before it is shown or signed, and its content. */
function prepareRefutation(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  method: FindingAttestation['method'],
  subjectKind: FindingAttestation['claim']['subjectKind'],
  policy: PublicationPolicyOptions = {},
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'refutation' }>, PublishFindingResult> {
  const decision = evaluatePublication(subjectKind, policy);
  if (decision.allowed === false) {
    log.info(`Refutation refused: ${refutes.subjectRef} (${subjectKind})`);
    return {
      refused: {
        broadcast: { success: false, error: 'publication refused by policy' },
        queued: false,
        refused: { reason: decision.reason, requiresExplicitConsent: true },
      },
    };
  }
  return { prepared: { kind: 'refutation', content: buildRefutation(refutes, ground, method), label: refutes.subjectRef, relays: findingRelays() } };
}

/** Sign exactly the prepared refutation, send it, and queue it if nobody took it. */
export async function publishPreparedRefutation(
  prepared: Extract<PreparedFindingPublish, { kind: 'refutation' }>,
): Promise<PublishFindingResult> {
  // Prefers the desktop host's isolated signer, where the key is not reachable
  // from any page. Falls back to the browser key, which is.
  const { signed } = await signFindingPreferNative(prepared.content);

  const broadcastService = new FindingsBroadcastService(prepared.relays);
  const broadcast = await broadcastService.publishFinding(signed, nostrIdentityService.asSigner());
  broadcastService.dispose();

  // Deliberately NOT recorded in publishedFindingsLedger. That ledger answers
  // "what claims am I asserting", and a refutation asserts no claim of its own
  // — it argues with someone else's. Filing it there would make retraction and
  // decay operate on a slot this node never occupied.

  let queued = false;
  if (!broadcast.success) {
    try {
      await publishOutbox.enqueue(signed, { relays: prepared.relays });
      queued = true;
    } catch (err) {
      queued = false;
      log.error('Refutation broadcast failed AND outbox enqueue failed:',
        err instanceof Error ? err.message : String(err));
    }
  }

  return { broadcast, queued };
}

/**
 * Publish what a Case concluded.
 *
 * Goes through publishAttestation like any other claim, which is the point: a
 * human adjudication is not a privileged kind of statement, it is a statement
 * whose method happens to be a person reading records. It passes the same
 * publication gate, is signed the same way, and is weighed by consumers with
 * the same derivation.
 *
 * Returns a refusal rather than throwing when the case has stated no position.
 * An unadjudicated case has concluded nothing, and a caller that got an
 * exception here would be being told about a programming error when what
 * happened is that somebody has not finished thinking yet.
 */
export async function publishCaseAdjudication(
  caseRecord: AdjudicatedCase,
  options: CaseAdjudicationOptions,
  policy: PublicationPolicyOptions = {},
): Promise<PublishFindingResult> {
  const ready = prepareCaseAdjudication(caseRecord, options, policy);
  return 'refused' in ready ? ready.refused : publishPreparedAttestation(ready.prepared);
}

/** What a case concluded, checked and built for the publish review. */
export function prepareCaseAdjudication(
  caseRecord: AdjudicatedCase,
  options: CaseAdjudicationOptions,
  policy: PublicationPolicyOptions = {},
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'attestation' }>, PublishFindingResult> {
  const content = attestationForCasePosition(caseRecord, options);
  if (!content) {
    return {
      refused: {
        broadcast: { success: false, error: 'case has stated no position' },
        queued: false,
      },
    };
  }
  // Where the case may go (plan item 0.4). It went to the findings relays
  // whatever the case said, so a Limited or Private case's conclusion reached
  // relays anyone can read and nobody can recall.
  const { relays, refusal } = whereItGoes('FINDING', caseRecord.visibility, 'case', undefined, caseRecord.limitedTo);
  if (refusal) {
    return {
      refused: {
        broadcast: { success: false, error: refusal },
        queued: false,
        refused: { reason: refusal, requiresExplicitConsent: true },
      },
    };
  }
  // The gate reads provenance from the policy; the caller states it on the
  // options, so it cannot be omitted by passing an empty policy object.
  const ready = prepareAttestation(
    content,
    { ...policy, isMock: options.evidenceIsSynthetic },
    options.subjectRef,
  );
  return 'prepared' in ready ? { prepared: { ...ready.prepared, relays } } : ready;
}

/**
 * Refute a peer's claim, using one of your own corroborated findings as the
 * evidence for disagreeing.
 *
 * The local finding supplies the method, which is what makes the refutation
 * weighable rather than merely loud — a consumer derives its weight with the
 * same function it uses on the claim being argued with, and compares like with
 * like. That is also why this takes a finding rather than a free-text reason:
 * there is deliberately no way from here to publish "wrong" with nothing
 * behind it.
 */
export async function refuteWithFinding(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  evidence: CorroboratedFinding,
  subjectKind: FindingAttestation['claim']['subjectKind'],
  policy: PublicationPolicyOptions = {},
): Promise<PublishFindingResult> {
  /**
   * isMock comes from the EVIDENCE, exactly as publishFinding takes it from
   * the finding — and it overrides the caller rather than defaulting under it.
   *
   * Passing `policy` straight through left it undefined, and the gate refuses
   * on `isMock !== false`, so every refutation was refused: the button was
   * wired, typechecked, tested, and could never succeed. That is the wiring
   * stub this codebase keeps producing — it reads as done in review, which is
   * what makes it worse than an honest stub.
   *
   * The order matters more than the presence. Spreading policy LAST would let
   * a caller pass `isMock: false` over demo evidence and publish a refutation
   * built from fabricated data under the real signing key — the bypass the
   * gate exists to stop. The evidence answers for itself.
   */
  return publishRefutation(refutes, ground, attestationFor(evidence).method, subjectKind, {
    ...policy,
    isMock: evidence.isMock,
  });
}

/** A refutation resting on one of your own findings, checked and built for the publish review. */
export function prepareRefuteWithFinding(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  evidence: CorroboratedFinding,
  subjectKind: FindingAttestation['claim']['subjectKind'],
  policy: PublicationPolicyOptions = {},
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'refutation' }>, PublishFindingResult> {
  // isMock from the evidence, over the caller's policy, for the reason above.
  return prepareRefutation(refutes, ground, attestationFor(evidence).method, subjectKind, {
    ...policy,
    isMock: evidence.isMock,
  });
}

/**
 * Retry every queued finding once. Rebuilds and re-signs the outer Nostr
 * event with a current timestamp — the queued payload is the timeless
 * ML-DSA-signed content, deliberately not a stale finalized event (see
 * OutboxTypes' note on `payload`).
 *
 * Not called on a timer by this module. The caller owns cadence: an app
 * shell can drain on startup and on regaining connectivity, and a test can
 * drain deterministically.
 */
export type DrainOutcome =
  | { drained: true; summary: DrainSummary }
  /**
   * Not attempted, and deliberately NOT counted as a failed attempt.
   *
   * A record has a finite retry budget before it is abandoned. Spending it on
   * a precondition we already know is unmet — no Nostr identity, no network —
   * would abandon perfectly good findings for reasons that have nothing to do
   * with whether a relay would accept them. "We did not try" and "we tried and
   * it failed" are different facts, and only the second should cost a retry.
   */
  | { drained: false; reason: 'no-identity' | 'offline' };

/**
 * Something can sign: an extension, or this browser's key. It was this browser's
 * key only, so with an extension and no local key the outbox never drained
 * (plan item 2.2), though every finding in it is signed by the extension.
 */
function canSign(): boolean {
  if (nostrIdentityService.hasExtension()) return true;
  // A locked key (D-KL) cannot sign until the person unlocks it, and the drain runs on its own, so it never asks:
  // it waits, as for no key, and the unlock starts it again (startOutboxDrain).
  return nostrIdentityService.getPubkey() !== null && !nostrIdentityService.isLocked();
}

export function canDrainFindingsOutbox(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return canSign();
}

export async function drainFindingsOutbox(): Promise<DrainOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { drained: false, reason: 'offline' };
  }
  if (!canSign()) {
    return { drained: false, reason: 'no-identity' };
  }

  const broadcastService = new FindingsBroadcastService();
  try {
    const summary = await publishOutbox.drain(async (payload, relays) => {
      // A record carries where it was going (plan item 0.4); records queued
      // before that went to the findings relays, which the shared broadcaster
      // sends to.
      const sender = relays ? new FindingsBroadcastService(relays) : broadcastService;
      const result = await sender.publishFinding(payload, nostrIdentityService.asSigner());
      if (sender !== broadcastService) sender.dispose();
      // A finding that reaches a relay on RETRY is just as published as one
      // that succeeded first time. Recording only the direct path would leave
      // exactly the findings that had trouble missing from the ledger — the
      // ones most worth being able to account for.
      if (result.success) {
        const content = payload.content as FindingAttestation;
        if (content?.claim?.subjectRef) {
          // authorPubkey too — it is in hand on `payload` and was omitted here
          // while the direct path recorded it. CorrelationContext skips any
          // ledger row without one, so a claim that reached a relay only on
          // retry could never be shown as contested. And because record()
          // replaces rather than merges, a later retry of a claim published
          // successfully the first time OVERWROTE a good pubkey with undefined.
          // The comment above already says why the retry path must record: this
          // is the same argument, one field further in.
          publishedFindingsLedger.record(content, {
            eventId: result.eventId,
            relaysOk: result.relaysOk,
            authorPubkey: payload.signature?.pubkey,
            ...(result.nostrPubkey ? { nostrPubkey: result.nostrPubkey } : {}),
            ...(relays ? { relays } : {}),
          });
        }
      }
      return { success: result.success, error: result.error };
    });
    if (summary.attempted > 0) {
      log.info(`Outbox drain: ${summary.sent} sent, ${summary.stillPending} pending, ${summary.abandoned} abandoned`);
    }
    return { drained: true, summary };
  } finally {
    broadcastService.dispose();
  }
}

export type RetractFindingResult =
  | { retracted: true; broadcast: BroadcastResult }
  /**
   * We have no record of publishing this, so there is nothing to withdraw.
   *
   * Distinct from a failed broadcast: broadcasting a retraction for a claim
   * that was never made would assert to the network that we once said
   * something we did not.
   */
  | { retracted: false; reason: 'not-published' }
  | { retracted: false; reason: 'broadcast-failed'; broadcast: BroadcastResult };

/**
 * Withdraw a claim this instance published.
 *
 * This is the first retraction path in the codebase. buildRetraction has
 * existed since W3 with nothing calling it, and the reason it could not be
 * wired was structural rather than incidental: retraction targets a specific
 * published claim, and until PublishedFindingsLedger there was no record of
 * what had been published. You cannot withdraw what you cannot name.
 *
 * Withdrawal works by republishing to the same `d` slot — the relay's
 * parameterized-replaceable semantics mean the retraction REPLACES the claim
 * rather than sitting beside it, so a consumer fetching that slot gets the
 * withdrawal and never the original.
 */
export async function retractFinding(
  slot: string,
  reason: RetractionReason,
  note?: string,
): Promise<RetractFindingResult> {
  const ready = prepareRetraction(slot, reason, note);
  return 'refused' in ready ? ready.refused : publishPreparedRetraction(ready.prepared);
}

/** A withdrawal of one of this instance's own claims, built for the publish review. */
export function prepareRetraction(
  slot: string,
  reason: RetractionReason,
  note?: string,
): PrepareOutcome<Extract<PreparedFindingPublish, { kind: 'retraction' }>, RetractFindingResult> {
  const published = publishedFindingsLedger.get(slot);
  if (!published || published.retractedAt) return { refused: { retracted: false, reason: 'not-published' } };
  const content = buildRetraction(
    { subjectRef: published.content.claim.subjectRef, attribute: published.content.claim.attribute },
    reason,
    note,
  );
  // Where the claim went. Claims recorded before plan item 0.4 went to the findings relays.
  return { prepared: { kind: 'retraction', content, slot, relays: published.relays ?? findingRelays() } };
}

/** Sign exactly the prepared withdrawal, send it, and mark the claim withdrawn only if it landed. */
export async function publishPreparedRetraction(
  prepared: Extract<PreparedFindingPublish, { kind: 'retraction' }>,
): Promise<RetractFindingResult> {
  const { slot } = prepared;
  const { signed } = await signFindingPreferNative(prepared.content);

  const broadcastService = new FindingsBroadcastService(prepared.relays);
  const broadcast = await broadcastService.publishFinding(signed, nostrIdentityService.asSigner());
  broadcastService.dispose();

  if (!broadcast.success) {
    // NOT marked retracted locally. The claim is still standing on every relay
    // that holds it, and a ledger saying otherwise would be the more dangerous
    // of the two errors: it would stop us retrying, while we believed the
    // withdrawal had landed.
    log.error(`Retraction broadcast failed for ${slot}: ${broadcast.error}`);
    return { retracted: false, reason: 'broadcast-failed', broadcast };
  }

  publishedFindingsLedger.markRetracted(slot);
  log.info(`Retracted ${slot} (${prepared.content.reason})`);
  return { retracted: true, broadcast };
}
