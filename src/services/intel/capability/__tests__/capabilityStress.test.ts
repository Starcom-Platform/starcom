/**
 * Adversarial pass over the dispatch capability.
 *
 * The happy paths and the obvious forgeries are covered in
 * missionCapability.test.ts. This asks the harder question: are there missions
 * that can NEVER be dispatched by anyone, or chains that verify when they
 * should not because of how the chain is walked rather than how it is signed?
 *
 * @vitest-environment node
 */
import { mintRootGrant, delegateGrant } from './grantFixtures';
import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { verifyGrantChain, missionResource } from '../missionCapability';

const aSk = generateSecretKey(); const a = getPublicKey(aSk);
const bSk = generateSecretKey(); const b = getPublicKey(bSk);
const cSk = generateSecretKey(); const c = getPublicKey(cSk);
const RES = missionResource('m1');

describe('capability — missions nobody can ever dispatch', () => {
  it('a mission created without a real identity is permanently undispatchable', () => {
    // IntelWorkspaceManager.currentActorId() falls back to the literal string
    // 'operative' when getPubkey() returns null. That string is not a public
    // key, so NO keypair can ever produce a grant whose issuer equals it: the
    // root check can never pass and the mission can never be published, by
    // anyone, forever — with no recovery path.
    const root = mintRootGrant(RES, a, aSk);
    const check = verifyGrantChain([root], { resource: RES, action: 'dispatch', holder: a, rootIssuer: 'operative' });
    expect(check.ok).toBe(false);
  });

  it('losing the creating key strands the mission — the honest cost of rooting in the resource', () => {
    // Not a defect, but it must be known: clear site data, get a new keypair,
    // and every mission you created becomes undispatchable. Authority is the
    // key, so key loss is authority loss.
    const rotated = generateSecretKey();
    const root = mintRootGrant(RES, getPublicKey(rotated), rotated);
    const check = verifyGrantChain([root], {
      resource: RES, action: 'dispatch', holder: getPublicKey(rotated), rootIssuer: a,
    });
    expect(check.ok).toBe(false);
  });
});

describe('capability — chain-walking attacks', () => {
  it('refuses a chain that loops back on itself', () => {
    const root = mintRootGrant(RES, a, aSk);
    const toB = delegateGrant(root, b, aSk);
    const backToA = delegateGrant(toB, a, bSk);
    // Valid as a chain, and it genuinely does empower A again — A delegated to
    // B and B delegated back. Nothing is forged, so this must PASS: refusing
    // it would mean the walk was checking identity rather than signatures.
    expect(verifyGrantChain([root, toB, backToA], {
      resource: RES, action: 'dispatch', holder: a, rootIssuer: a,
    }).ok).toBe(true);
  });

  it('refuses a chain presented out of order', () => {
    const root = mintRootGrant(RES, a, aSk);
    const toB = delegateGrant(root, b, aSk);
    expect(verifyGrantChain([toB, root], { resource: RES, action: 'dispatch', holder: a, rootIssuer: a }).ok).toBe(false);
  });

  it('refuses a chain with the middle link removed', () => {
    const root = mintRootGrant(RES, a, aSk);
    const toB = delegateGrant(root, b, aSk);
    const toC = delegateGrant(toB, c, bSk);
    // Dropping B's link would let C appear delegated directly by the root.
    expect(verifyGrantChain([root, toC], { resource: RES, action: 'dispatch', holder: c, rootIssuer: a }).ok).toBe(false);
  });

  it('refuses a duplicated root used as its own parent', () => {
    const root = mintRootGrant(RES, a, aSk);
    expect(verifyGrantChain([root, root], { resource: RES, action: 'dispatch', holder: a, rootIssuer: a }).ok).toBe(false);
  });

  it('holds over a long delegation chain rather than degrading', () => {
    let prev = mintRootGrant(RES, a, aSk);
    const chain = [prev];
    let sk = aSk;
    for (let i = 0; i < 25; i++) {
      const nextSk = generateSecretKey();
      prev = delegateGrant(prev, getPublicKey(nextSk), sk);
      chain.push(prev);
      sk = nextSk;
    }
    expect(verifyGrantChain(chain, {
      resource: RES, action: 'dispatch', holder: getPublicKey(sk), rootIssuer: a,
    }).ok).toBe(true);
  });
});
