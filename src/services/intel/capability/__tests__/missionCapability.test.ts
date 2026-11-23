/**
 * The point of these tests is the REFUSALS.
 *
 * A capability system that grants correctly but refuses sloppily is worse than
 * none, because it looks like enforcement. Each case below is an attack this
 * has to survive without any authority to consult.
 *
 * Real keys sign real events here — only then does a forgery test mean
 * anything — so this runs in node, the same as the other signing suites:
 * jsdom's Uint8Array is a different realm's, and @noble's byte check rejects
 * it inside getEventHash.
 *
 * @vitest-environment node
 */
import { mintRootGrant, delegateGrant } from './grantFixtures';
import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import {
  verifyGrantChain, readGrant, missionResource, CAPABILITY_KIND,
  mintRootGrantSigned, delegateGrantSigned, type GrantSigner,
} from '../missionCapability';

const creatorSk = generateSecretKey();
const creator = getPublicKey(creatorSk);
const colleagueSk = generateSecretKey();
const colleague = getPublicKey(colleagueSk);
const strangerSk = generateSecretKey();
const stranger = getPublicKey(strangerSk);

const RESOURCE = missionResource('mission-1');
const expectFor = (holder: string) => ({
  resource: RESOURCE, action: 'dispatch' as const, holder, rootIssuer: creator,
});

describe('mission capability — grants', () => {
  it('the creator holds dispatch on their own mission', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    expect(verifyGrantChain([root], expectFor(creator)).ok).toBe(true);
  });

  it('a holder can delegate to a colleague, and the chain verifies', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    expect(verifyGrantChain([root, delegated], expectFor(colleague)).ok).toBe(true);
  });

  it('reads back what a grant asserts', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    expect(readGrant(root)).toMatchObject({ resource: RESOURCE, action: 'dispatch', issuer: creator, holder: creator });
    expect(root.kind).toBe(CAPABILITY_KIND);
  });
});

describe('mission capability — signer path (what publish actually calls)', () => {
  /** The duck-typed shape nostrIdentityService.asSigner() produces. */
  const signerFor = (sk: Uint8Array): GrantSigner => ({
    getPublicKey: async () => getPublicKey(sk),
    signEvent: async (event) => finalizeEvent(event as never, sk),
  });

  it('a creator with no stored chain can mint one and immediately dispatch', async () => {
    // This is the self-heal branch in MissionService.assertMayDispatch: the
    // root grant is derivable from the mission, so a creator who cleared
    // their storage is not locked out of their own mission.
    const root = await mintRootGrantSigned(RESOURCE, signerFor(creatorSk));
    expect(verifyGrantChain([root], expectFor(creator)).ok).toBe(true);
  });

  it('a stranger self-healing the same way still gets nothing', async () => {
    // Same code path, different key. The root check is against the mission's
    // createdBy, so minting is not a way in.
    const forged = await mintRootGrantSigned(RESOURCE, signerFor(strangerSk));
    expect(verifyGrantChain([forged], expectFor(stranger)).ok).toBe(false);
  });

  it('delegation through the signer path verifies too', async () => {
    const root = await mintRootGrantSigned(RESOURCE, signerFor(creatorSk));
    const delegated = await delegateGrantSigned(root, colleague, signerFor(creatorSk));
    expect(verifyGrantChain([root, delegated], expectFor(colleague)).ok).toBe(true);
  });
});

describe('mission capability — refusals', () => {
  it('SELF-REPORT GRANTS NOTHING: a stranger cannot mint themselves authority', () => {
    const forged = mintRootGrant(RESOURCE, stranger, strangerSk);
    const check = verifyGrantChain([forged], expectFor(stranger));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('does not start from whoever created this mission');
  });

  it('refuses a delegation issued by someone who never held it', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    const stolen = delegateGrant(root, stranger, strangerSk);
    const check = verifyGrantChain([root, stolen], expectFor(stranger));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('did not hold it');
  });

  it('refuses a chain whose links do not attenuate each other', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    const otherRoot = mintRootGrant(RESOURCE, creator, creatorSk, new Date(Date.now() + 1000));
    const delegated = delegateGrant(otherRoot, colleague, creatorSk);
    const check = verifyGrantChain([root, delegated], expectFor(colleague));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('does not attenuate');
  });

  it('refuses a tampered grant — the signature no longer matches', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    const tampered = { ...root, tags: root.tags.map((t) => (t[0] === 'holder' ? ['holder', stranger] : t)) };
    const check = verifyGrantChain([tampered], expectFor(stranger));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('not validly signed');
  });

  it('refuses a grant for a different mission', () => {
    const root = mintRootGrant(missionResource('mission-OTHER'), creator, creatorSk);
    const check = verifyGrantChain([root], expectFor(creator));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('different resource');
  });

  it('refuses a valid chain that empowers somebody else', () => {
    const root = mintRootGrant(RESOURCE, creator, creatorSk);
    const delegated = delegateGrant(root, colleague, creatorSk);
    const check = verifyGrantChain([root, delegated], expectFor(stranger));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('different operator');
  });

  it('refuses an empty chain rather than defaulting open', () => {
    const check = verifyGrantChain([], expectFor(creator));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('No capability');
  });
});
