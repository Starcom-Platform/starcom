/**
 * Resource-rooted capabilities for irreversible mission actions.
 *
 * ─── WHY NOT AN ACCESS-CONTROL LIST ────────────────────────────────────────
 *
 * `CollaborationPermissions` stored arrays of user ids that might edit or
 * delete, until they were removed for the reason that follows. A list like
 * that cannot enforce anything here: Starcom is local-first, the
 * record lives in the operator's own storage, and an array they can edit is not
 * a control — it is a note to themselves. caseVisibility.ts says this plainly
 * and refuses to pretend otherwise; this module takes the same position.
 *
 * A signature is different. An operator can edit any field they like and still
 * cannot mint a grant from a key they do not hold, and a receiving peer can
 * check that offline, with no authority to consult.
 *
 * ─── WHY NO SANCTIONING BODY ───────────────────────────────────────────────
 *
 * The Earth Intelligence Network has no institution to issue roles, and asking
 * one to exist would recreate the single point of failure the network is built
 * to avoid. So authority is not granted by anyone: it is ROOTED IN THE
 * RESOURCE. You hold dispatch on a mission because you created it — the
 * mission already records `createdBy` as a real Nostr pubkey — or because
 * somebody who held it delegated to you, in a signed chain anyone can verify.
 *
 * This also honours the rule the source model already runs on: SELF-REPORT
 * GRANTS NOTHING. A grant naming yourself as issuer over a mission you did not
 * create fails verification, because the root is checked against the mission,
 * not against the claim.
 *
 * ─── WHY THEY ARE NOSTR EVENTS ─────────────────────────────────────────────
 *
 * Signing and verification are then the same battle-tested primitives the rest
 * of the app publishes with, and a grant is independently addressable and
 * replaceable like any other record.
 *
 * ─── WHY THESE ARE NOT PUBLISHED, AND WHY THAT IS NOT A PRIVACY RULE ───────
 *
 * An earlier version of this comment said chains must never be broadcast
 * because they would leak operator identities. That was wrong, and the way it
 * was wrong is worth keeping.
 *
 * Every event this app publishes is signed with the operator's key —
 * packages, findings, reports alike — and that same key is the mission's
 * `createdBy` and the feed identity corroboration needs visible to measure
 * independence. A grant among those keys discloses nothing that publishing
 * has not already disclosed, and a grant is a signed statement by its issuer:
 * a deliberate verifiable claim, not a leak. The rule that DOES hold is about
 * COLLABORATORS — third parties added to a mission who signed nothing and
 * chose nothing — and generalising it to the publisher imported a
 * compartment reflex into an open, self-attesting commons.
 *
 * Hiding the chain also had a cost that should have stopped it sooner: it
 * makes dispatch authority a self-report, which is the one thing this module
 * exists to refuse.
 *
 * ─── WHAT IS ACTUALLY TRUE, AND IS STRUCTURAL ──────────────────────────────
 *
 * Verification needs `rootIssuer` taken from the RESOURCE, and the creation
 * of a mission is not a public event on any node. So a peer cannot establish
 * that a chain's root is genuinely that mission's creator — a node could mint
 * a self-rooted chain for a mission it invented and it would verify. That
 * holds for every implementation on this grid, not just this one.
 *
 * Authority is therefore not a verifiable property between nodes; attribution
 * and internal consistency are. A published chain is AUDITABLE, not
 * AUTHORITATIVE. The inter-node decision that remains is whether to admit a
 * publishing NODE at all — see AdmissionPolicy in MissionPackageVerifier.
 */
import { finalizeEvent, verifyEvent, type Event as NostrEvent } from 'nostr-tools';

/** Parameterised-replaceable range, alongside 30023 reports / 30079 packages. */
export const CAPABILITY_KIND = 30081;

/** Attenuable action set. Only irreversible acts are capability-gated. */
export type CapabilityAction = 'dispatch';

export interface CapabilityGrant {
  /** `mission:<id>` — the resource the authority is rooted in. */
  resource: string;
  action: CapabilityAction;
  /** Pubkey that issued this grant. */
  issuer: string;
  /** Pubkey this grant empowers. */
  holder: string;
  /** Event id of the grant this one attenuates. Absent on a root grant. */
  parentId?: string;
  issuedAt: string;
}

export const missionResource = (missionId: string): string => `mission:${missionId}`;

export function buildGrantEvent(grant: Omit<CapabilityGrant, 'issuer'>): Record<string, unknown> {
  const tags: string[][] = [
    ['d', `cap:${grant.resource}:${grant.holder}`],
    ['resource', grant.resource],
    ['action', grant.action],
    ['holder', grant.holder],
  ];
  if (grant.parentId) tags.push(['parent', grant.parentId]);
  return {
    kind: CAPABILITY_KIND,
    created_at: Math.floor(new Date(grant.issuedAt).getTime() / 1000),
    tags,
    content: '',
  };
}

/**
 * Withdraw a grant, by replacing it.
 *
 * ─── WHY REPLACEMENT AND NOT A REVOCATION LIST ─────────────────────────────
 *
 * Kind 30081 is parameterized-replaceable and a grant's slot is
 * `cap:<resource>:<holder>`, so the issuer can publish to that same slot again.
 * Relays keep only the latest event per slot and drop the one it replaces —
 * which means a revocation does not merely ANNOUNCE that a grant is dead, it
 * removes the grant a verifier would otherwise fetch.
 *
 * That matters for delegations further down. A chain is walked by the parent's
 * event id, and the replaced event is gone, so every chain passing through a
 * revoked link fails to assemble at all. Revocation is transitive without
 * anything having to walk downward looking for children — which is just as
 * well, since nothing can: the issuer does not know who their delegate went on
 * to delegate to.
 *
 * ─── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 *
 * The same limit as a retracted claim, and for the same reason: a verifier
 * holding a chain it already fetched, or a relay that kept the replaced event,
 * still has something that verifies. Revocation reaches whoever looks again.
 * See the revalidation obligation in the attested-claims specification.
 */
export function buildRevocationEvent(
  revocation: { resource: string; action: CapabilityAction; holder: string; revokedAt: string; reason: string },
): Record<string, unknown> {
  return {
    kind: CAPABILITY_KIND,
    created_at: Math.floor(new Date(revocation.revokedAt).getTime() / 1000),
    tags: [
      // The SAME slot the grant occupies. This is the whole mechanism.
      ['d', `cap:${revocation.resource}:${revocation.holder}`],
      ['resource', revocation.resource],
      ['action', revocation.action],
      ['holder', revocation.holder],
      ['revoked', revocation.reason],
    ],
    content: '',
  };
}

/**
 * Whether an event at a capability slot is a withdrawal rather than a grant.
 *
 * Checked BEFORE a grant is read, because a revocation carries the same
 * resource/action/holder tags — it has to, or a verifier could not tell which
 * grant it withdraws — and would otherwise parse as a perfectly good grant.
 */
export function isRevocation(event: NostrEvent): boolean {
  return event.kind === CAPABILITY_KIND && event.tags.some((t) => t[0] === 'revoked');
}

const tag = (event: NostrEvent, name: string): string | undefined =>
  event.tags.find((t) => t[0] === name)?.[1];

/**
 * Rebuild an event from its canonical fields alone, before verifying it.
 *
 * nostr-tools' `verifyEvent` short-circuits on a cached symbol property that
 * `finalizeEvent` stamps onto the object:
 *
 *     if (typeof event[verifiedSymbol] === 'boolean') return event[verifiedSymbol];
 *
 * Object spread copies own symbol properties, so `{ ...signed, tags: forged }`
 * carries the stale `true` and verifies WITHOUT the hash ever being recomputed.
 * A test that tampered with a grant's holder tag passed as validly signed.
 *
 * Events arriving over the wire are JSON-parsed and cannot carry the symbol,
 * so this is not a hole in the ingest path — but a capability chain can be
 * assembled in-process, and verification must never rest on an object's claim
 * about itself. Same rule as everywhere else here: self-report grants nothing.
 */
function canonical(event: NostrEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  } as NostrEvent;
}

/** The grant an event asserts, or null if it is not a well-formed grant. */
export function readGrant(event: NostrEvent): CapabilityGrant | null {
  if (event.kind !== CAPABILITY_KIND) return null;
  // A withdrawal is not a grant, and carries the same tags on purpose.
  if (isRevocation(event)) return null;
  const resource = tag(event, 'resource');
  const action = tag(event, 'action');
  const holder = tag(event, 'holder');
  if (!resource || !holder || action !== 'dispatch') return null;
  return {
    resource,
    action,
    issuer: event.pubkey,
    holder,
    parentId: tag(event, 'parent'),
    issuedAt: new Date(event.created_at * 1000).toISOString(),
  };
}

/**
 * Why a chain was refused, as a stable identifier.
 *
 * The conformance vectors assert the CAUSE of a refusal, not merely the
 * verdict — two implementations that reject the same chain for different
 * reasons have not agreed on the rule, they have agreed on the outcome by
 * coincidence. A human sentence cannot carry that comparison across
 * implementations, and changing its wording would break a peer's tests.
 *
 * These strings are part of the published contract. Add to them freely;
 * never rename one.
 */
export type ChainRefusal =
  | 'empty-chain'
  | 'wrong-kind'
  | 'bad-signature'
  | 'malformed-grant'
  | 'resource-mismatch'
  | 'action-mismatch'
  | 'root-issuer-mismatch'
  | 'root-has-parent'
  | 'issuer-not-holder'
  | 'broken-attenuation'
  | 'holder-mismatch'
  | 'revoked';

export interface ChainCheck {
  ok: boolean;
  /**
   * Machine-readable cause, for vectors and cross-implementation comparison.
   * Stable across wording changes to `reason`.
   */
  code?: ChainRefusal;
  /** Stated in the same voice as the rest of the app: what is true, not what is forbidden. */
  reason?: string;
}

/**
 * Verify a delegation chain empowers `holder` to act on `resource`.
 *
 * `rootIssuer` is supplied by the CALLER from the resource itself (a mission's
 * createdBy), never read from the chain — otherwise a chain could nominate its
 * own root and self-report would grant everything.
 */
export function verifyGrantChain(
  chain: NostrEvent[],
  expect: { resource: string; action: CapabilityAction; holder: string; rootIssuer: string },
): ChainCheck {
  if (!chain.length) {
    return { ok: false, code: 'empty-chain', reason: 'No capability was presented for this mission.' };
  }

  let previousHolder: string | null = null;
  let previousId: string | null = null;

  for (const [i, event] of chain.entries()) {
    if (!verifyEvent(canonical(event))) {
      return { ok: false, code: 'bad-signature', reason: `Capability ${i + 1} in the chain is not validly signed.` };
    }
    /*
     * Before malformed. A revocation IS well-formed — it is a deliberate act by
     * the issuer — and reporting it as malformed would tell a holder their
     * capability is broken when in fact it was taken back. Two implementations
     * refusing the same chain for different reasons have agreed on the outcome
     * by coincidence, not on the rule.
     */
    if (isRevocation(event)) {
      const why = tag(event, 'revoked');
      return {
        ok: false,
        code: 'revoked',
        reason: `Capability ${i + 1} in the chain was withdrawn by whoever issued it${why ? `: ${why}` : '.'}`,
      };
    }
    const grant = readGrant(event);
    if (!grant) {
      return { ok: false, code: 'malformed-grant', reason: `Capability ${i + 1} in the chain is not a well-formed grant.` };
    }
    if (grant.resource !== expect.resource || grant.action !== expect.action) {
      return { ok: false, code: 'resource-mismatch', reason: `Capability ${i + 1} is for a different resource or action.` };
    }

    if (i === 0) {
      // Rooted in the resource: only the mission's creator can start a chain.
      if (grant.issuer !== expect.rootIssuer) {
        return {
          ok: false,
          code: 'root-issuer-mismatch',
          reason: 'The chain does not start from whoever created this mission, so it grants nothing.',
        };
      }
      if (grant.parentId) {
        return { ok: false, code: 'root-has-parent', reason: 'The first capability claims a parent, so the chain is incomplete.' };
      }
    } else {
      // Delegation: only a holder can pass on what they hold.
      if (grant.issuer !== previousHolder) {
        return { ok: false, code: 'issuer-not-holder', reason: `Capability ${i + 1} was issued by someone who did not hold it.` };
      }
      if (grant.parentId !== previousId) {
        return { ok: false, code: 'broken-attenuation', reason: `Capability ${i + 1} does not attenuate the one before it.` };
      }
    }

    previousHolder = grant.holder;
    previousId = event.id;
  }

  if (previousHolder !== expect.holder) {
    return { ok: false, code: 'holder-mismatch', reason: 'This capability empowers a different operator.' };
  }
  return { ok: true };
}

/**
 * A `{ getPublicKey, signEvent }` signer — the duck-typed shape the broadcast
 * services already take, so `nostrIdentityService.asSigner()` fits unchanged.
 */
export interface GrantSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrEvent>;
}

/** Mint a root grant under the app's own identity, without handling its key. */
export async function mintRootGrantSigned(
  resource: string,
  signer: GrantSigner,
  issuedAt: Date = new Date(),
): Promise<NostrEvent> {
  const pubkey = await signer.getPublicKey();
  const unsigned = buildGrantEvent({ resource, action: 'dispatch', holder: pubkey, issuedAt: issuedAt.toISOString() });
  return signer.signEvent({ ...unsigned, pubkey });
}

/** Delegate a held grant to another operator, signing as the current identity. */
export async function delegateGrantSigned(
  parent: NostrEvent,
  holder: string,
  signer: GrantSigner,
  issuedAt: Date = new Date(),
): Promise<NostrEvent> {
  const parentGrant = readGrant(parent);
  if (!parentGrant) throw new Error('Cannot delegate from an event that is not a capability grant.');
  const pubkey = await signer.getPublicKey();
  const unsigned = buildGrantEvent({
    resource: parentGrant.resource,
    action: parentGrant.action,
    holder,
    parentId: parent.id,
    issuedAt: issuedAt.toISOString(),
  });
  return signer.signEvent({ ...unsigned, pubkey });
}
