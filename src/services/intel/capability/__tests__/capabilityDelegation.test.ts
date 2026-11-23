/**
 * Delegation is a TRANSPORT problem, and that is the part worth testing.
 *
 * A chain minted on one device is useless to a colleague on another unless it
 * can travel, so the failure modes that matter are about fetching: a chain
 * nobody stored, a parent no relay holds, and a cycle that must terminate
 * rather than spin.
 *
 * @vitest-environment node
 */
import { mintRootGrant, delegateGrant } from './grantFixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';

const published: NostrEvent[] = [];
const relayHas: NostrEvent[] = [];

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return {
    ...actual,
    SimplePool: class {
      publish(relays: string[], event: NostrEvent) {
        published.push(event);
        return relays.map(() => Promise.resolve('ok'));
      }
      async querySync(_relays: string[], filter: { ids?: string[]; '#d'?: string[] }) {
        if (filter.ids) return relayHas.filter((e) => filter.ids!.includes(e.id));
        const d = filter['#d']?.[0];
        return relayHas.filter((e) => e.tags.some((t) => t[0] === 'd' && t[1] === d));
      }
      close() {}
    },
  };
});

const { delegateAndPublish, fetchGrantChain, revokeAndPublish } = await import('../capabilityDelegation');
const { verifyGrantChain, missionResource, readGrant, isRevocation } =
  await import('../missionCapability');

const creatorSk = generateSecretKey();
const creator = getPublicKey(creatorSk);
const colleagueSk = generateSecretKey();
const colleague = getPublicKey(colleagueSk);
const RES = missionResource('m1');

const signer = (sk: Uint8Array) => ({
  getPublicKey: async () => getPublicKey(sk),
  signEvent: async (e: Record<string, unknown>) => finalizeEvent(e as never, sk),
});

beforeEach(() => { published.length = 0; relayHas.length = 0; });

describe('delegateAndPublish', () => {
  it('publishes the grant, because a delegation the holder cannot fetch is not one', async () => {
    const root = mintRootGrant(RES, creator, creatorSk);
    const { grant, relaysOk } = await delegateAndPublish(root, colleague, signer(creatorSk), ['ws://r']);

    expect(relaysOk).toBe(1);
    expect(published).toHaveLength(1);
    expect(verifyGrantChain([root, grant], {
      resource: RES, action: 'dispatch', holder: colleague, rootIssuer: creator,
    }).ok).toBe(true);
  });
});

describe('fetchGrantChain', () => {
  it('returns an empty chain when nothing addresses this holder', async () => {
    // The ordinary case for a mission somebody else owns — not an error.
    expect(await fetchGrantChain(RES, colleague, ['ws://r'])).toEqual([]);
  });

  it('walks parents and returns the chain ROOT-FIRST, as the verifier expects', async () => {
    const root = mintRootGrant(RES, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    relayHas.push(root, delegated);

    const chain = await fetchGrantChain(RES, colleague, ['ws://r']);

    expect(chain.map((e) => e.id)).toEqual([root.id, delegated.id]);
    expect(verifyGrantChain(chain, {
      resource: RES, action: 'dispatch', holder: colleague, rootIssuer: creator,
    }).ok).toBe(true);
  });

  it('refuses a chain whose parent no relay holds, rather than returning a shorter one', async () => {
    // Returning the leaf alone would hand the verifier something that looks
    // rootless and fails for the wrong stated reason.
    const root = mintRootGrant(RES, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    relayHas.push(delegated); // parent deliberately absent

    expect(await fetchGrantChain(RES, colleague, ['ws://r'])).toEqual([]);
  });

  it('terminates on a chain that points at itself', async () => {
    // A hostile or corrupt parent tag must not spin.
    const root = mintRootGrant(RES, creator, creatorSk);
    const selfReferential = { ...root, tags: [...root.tags, ['parent', root.id]] } as NostrEvent;
    relayHas.push(selfReferential);

    const chain = await fetchGrantChain(RES, creator, ['ws://r']);
    expect(chain.length).toBeLessThanOrEqual(33);
  });
});

/**
 * Taking authority back.
 *
 * The mechanism is replacement, not announcement: a withdrawal occupies the
 * grant's own slot, so relays drop the grant a verifier would otherwise fetch.
 * What is worth testing is that it is READ as a withdrawal — it carries the
 * same resource/action/holder tags as the grant, so an implementation reading
 * those first honours authority its issuer took back.
 */
describe('revokeAndPublish', () => {
  it('publishes to the grant\'s own slot, which is what makes it a removal', async () => {
    const root = mintRootGrant(RES, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);

    const { relaysOk } = await revokeAndPublish(readGrant(delegated)!, 'left the operation', signer(creatorSk));

    expect(relaysOk).toBeGreaterThan(0);
    const [revocation] = published;
    const slotOf = (e: NostrEvent) => e.tags.find((t) => t[0] === 'd')?.[1];
    expect(slotOf(revocation)).toBe(slotOf(delegated));
  });

  it('is not readable as a grant, though it carries a grant\'s tags', () => {
    const root = mintRootGrant(RES, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    return revokeAndPublish(readGrant(delegated)!, 'left the operation', signer(creatorSk)).then(({ revocation }) => {
      // It must carry them — a verifier could not otherwise tell which grant is
      // withdrawn — which is exactly why reading them before the marker is the
      // hazard this asserts against.
      expect(revocation.tags.find((t) => t[0] === 'holder')?.[1]).toBe(colleague);
      expect(isRevocation(revocation)).toBe(true);
      expect(readGrant(revocation)).toBeNull();
    });
  });

  it('refuses the chain naming the withdrawal, and says it was revoked', async () => {
    const root = mintRootGrant(RES, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    const { revocation } = await revokeAndPublish(readGrant(delegated)!, 'left the operation', signer(creatorSk));

    relayHas.push(root, revocation);
    const chain = await fetchGrantChain(RES, colleague);
    const check = verifyGrantChain(chain, { resource: RES, action: 'dispatch', holder: colleague, rootIssuer: creator });

    expect(check.ok).toBe(false);
    // Never malformed-grant: a withdrawal is a deliberate act, and telling a
    // holder their capability is broken says the wrong thing about it.
    expect(check.code).toBe('revoked');
    expect(check.reason).toContain('left the operation');
  });

  it('tells a downstream holder they were revoked upstream, not that something broke', async () => {
    /*
     * A → B → C, and A withdraws B's grant. C's chain names B's grant by event
     * id, and that event is gone, so the fetch dangles.
     *
     * Without the probe this is indistinguishable from a relay that never had
     * the parent, and C is told the chain is broken — so C looks for a bug
     * instead of asking why their authority was taken away. The parent's slot
     * is derivable, because a delegation's issuer must be the parent's holder.
     */
    const root = mintRootGrant(RES, creator, creatorSk);
    const toColleague = delegateGrant(root, colleague, creatorSk);
    const strangerSk = generateSecretKey();
    const stranger = getPublicKey(strangerSk);
    const toStranger = delegateGrant(toColleague, stranger, colleagueSk);

    const { revocation } = await revokeAndPublish(readGrant(toColleague)!, 'left the operation', signer(creatorSk));

    // The relay holds the leaf and the withdrawal. `toColleague` is gone — that
    // is what replacement means.
    relayHas.push(root, toStranger, revocation);

    const chain = await fetchGrantChain(RES, stranger);
    const check = verifyGrantChain(chain, { resource: RES, action: 'dispatch', holder: stranger, rootIssuer: creator });
    expect(check.ok).toBe(false);
    expect(check.code).toBe('revoked');
  });

  it('still reports a genuinely missing parent as a broken chain', async () => {
    // The probe must not turn every dangling parent into "revoked". A relay
    // that simply never had the event is a different fact.
    const root = mintRootGrant(RES, creator, creatorSk);
    const toColleague = delegateGrant(root, colleague, creatorSk);
    const strangerSk = generateSecretKey();
    const stranger = getPublicKey(strangerSk);
    const toStranger = delegateGrant(toColleague, stranger, colleagueSk);

    relayHas.push(root, toStranger); // no revocation, and no parent either
    expect(await fetchGrantChain(RES, stranger)).toEqual([]);
  });
});
