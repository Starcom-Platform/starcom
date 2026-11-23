/**
 * Delegating dispatch, and obtaining a delegation somebody granted you.
 *
 * Delegation was specified, tested and conformance-vectored, and no operator
 * could actually do it — a chain minted on one device is useless to a
 * colleague on another unless it can travel. So delegation is inherently a
 * TRANSPORT problem, and a "delegate" button that only wrote to local storage
 * would be a feature the delegate could never use.
 *
 * Publishing grants is what makes this work, and is permitted: an earlier
 * revision of the spec forbade it on privacy grounds that did not survive
 * scrutiny — every event here is already signed by the operator's key, so a
 * grant among those keys discloses nothing publishing has not. See
 * missionCapability.ts for the full retraction.
 *
 * WHAT THIS STILL DOES NOT BUY. A fetched chain proves it is internally
 * consistent and empowers you. It does not prove its root is genuinely the
 * mission's creator, because mission creation is not a public event — so this
 * is useful between operators who already share a workspace and trust its
 * records, not as a way to accept authority from a stranger.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import { createLogger } from '../../../utils/logger';
import { missionPackageRelays, missionPackageReadRelays } from '../MissionPackageBroadcastService';
import {
  CAPABILITY_KIND, delegateGrantSigned, readGrant, buildRevocationEvent, isRevocation,
  type GrantSigner, type CapabilityGrant,
} from './missionCapability';

const log = createLogger({ prefix: 'capability-delegation' });

/** Longest chain we will walk. A cycle or a hostile parent tag must terminate. */
const MAX_CHAIN_DEPTH = 32;

/**
 * Mint a delegation and publish it so the holder can obtain it.
 *
 * Returns the new grant. The caller is responsible for recording it locally —
 * the delegator keeps their own copy so the delegation is visible to them even
 * if no relay retained it.
 */
export async function delegateAndPublish(
  parent: NostrEvent,
  holder: string,
  signer: GrantSigner,
  relays: string[] = missionPackageRelays(),
): Promise<{ grant: NostrEvent; relaysOk: number }> {
  const grant = await delegateGrantSigned(parent, holder, signer);
  const relaysOk = await publishCapabilityEvent(grant, relays);
  // A grant nobody stored is a delegation the holder can never fetch. Say so
  // rather than reporting success on the local mint alone.
  if (relaysOk === 0) log.warn('no relay accepted the grant; the holder will not be able to fetch it');
  return { grant, relaysOk };
}

/**
 * Send a signed grant or revocation, as signed. The publish review signs the
 * event it showed and hands it here, so what was reviewed is what goes out
 * (plan item 0.1). Returns how many relays accepted it.
 */
export async function publishCapabilityEvent(
  event: NostrEvent,
  relays: string[] = missionPackageRelays(),
): Promise<number> {
  const pool = createRelayPool();
  let ok = 0;
  await Promise.allSettled(
    pool.publish(relays, event).map(async (p, i) => {
      try {
        await p;
        ok++;
      } catch (err) {
        log.warn(`relay ${relays[i]} rejected capability event ${event.id}:`, err);
      }
    }),
  );
  pool.close(relays);
  return ok;
}

/**
 * Fetch the chain that empowers `holder` on `resource`, walking parents.
 *
 * Returns root-first, the order verifyGrantChain expects. Returns an empty
 * array when no grant addresses this holder — absence of a capability is not
 * an error, it is the ordinary case for a mission somebody else owns.
 */
/**
 * Withdraw a delegation you issued.
 *
 * Publishes to the grant's own slot, which replaces it — see
 * buildRevocationEvent for why that is the mechanism rather than a revocation
 * list, and why it reaches delegations further down without this having to
 * find them.
 *
 * `relaysOk` is reported rather than swallowed for the same reason it is on
 * delegation, and it matters more here: a delegation that reached no relay is
 * an authority nobody can use, while a REVOCATION that reached no relay is an
 * authority still in force while its issuer believes they took it back. A
 * caller showing "revoked" on a zero here would be reporting a wish.
 */
export async function revokeAndPublish(
  grant: CapabilityGrant,
  reason: string,
  signer: GrantSigner,
  relays: string[] = missionPackageRelays(),
): Promise<{ revocation: NostrEvent; relaysOk: number }> {
  const unsigned = buildRevocationEvent({
    resource: grant.resource,
    action: grant.action,
    holder: grant.holder,
    revokedAt: new Date().toISOString(),
    reason,
  });
  const revocation = await signer.signEvent(unsigned);
  return { revocation, relaysOk: await publishCapabilityEvent(revocation, relays) };
}

export async function fetchGrantChain(
  resource: string,
  holder: string,
  // Where grants may be: a Limited mission's grants went to the internal relays (plan item 0.4).
  relays: string[] = missionPackageReadRelays(),
): Promise<NostrEvent[]> {
  const pool = createRelayPool();
  try {
    const leafFilter: Filter = {
      kinds: [CAPABILITY_KIND],
      '#d': [`cap:${resource}:${holder}`],
      limit: 1,
    };
    const [leaf] = await pool.querySync(relays, leafFilter);
    if (!leaf) return [];

    const chain: NostrEvent[] = [leaf];
    let current = leaf;

    for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
      const parentId = readGrant(current)?.parentId;
      if (!parentId) break;

      const [parent] = await pool.querySync(relays, { ids: [parentId], limit: 1 });
      // A dangling parent is a broken chain, not a shorter one. Returning what
      // we have would hand the verifier something that looks rootless and
      // fails for the wrong stated reason.
      if (!parent) {
        /*
         * The commonest reason a parent is missing is that it was REVOKED: a
         * revocation replaces the grant at its slot and relays drop what it
         * replaced, so the id this chain names no longer resolves.
         *
         * The slot is derivable — a delegation's issuer must be the parent's
         * holder — so the withdrawal can be found and returned, and the holder
         * is told their authority was taken back rather than that something is
         * inexplicably broken. Refused either way; only the reason differs, and
         * the reason is the part a person can act on.
         */
        const issuer = current.pubkey;
        const [upstream] = await pool.querySync(relays, {
          kinds: [CAPABILITY_KIND],
          '#d': [`cap:${resource}:${issuer}`],
          limit: 1,
        });
        if (upstream && isRevocation(upstream)) {
          log.info(`chain broken by a revocation upstream, at ${issuer.slice(0, 12)}`);
          return [upstream];
        }
        log.warn(`chain references a parent no relay holds: ${parentId.slice(0, 12)}`);
        return [];
      }
      chain.push(parent);
      current = parent;
    }

    return chain.reverse();
  } finally {
    pool.close(relays);
  }
}
