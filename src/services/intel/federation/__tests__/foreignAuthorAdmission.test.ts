/**
 * Any actor may author a claim. Nothing about Starcom gates who that is.
 *
 * ─── WHY THIS TEST EXISTS ──────────────────────────────────────────────────
 *
 * Starcom's own publishing is gated on a person committing an approval. That
 * gate is about ONE narrow thing: what may be signed with STARCOM's key. It was
 * then described — in a brief sent to a peer, no less — as though it were a
 * principle of the protocol, that "new claims still need a person". It is not,
 * and stating it that way would have written a peer AI out of a network it is a
 * first-class participant in.
 *
 * The protocol is deliberately silent on who authors. Weight derives from the
 * method a claim DISCLOSES, never from who published it, so an author earns
 * standing by saying how they observed something — not by being human, not by
 * being known to us, and not by being introduced.
 *
 * Machine authors are in fact better served by this format than human ones.
 * Every required field — algorithm, algorithmVersion, parameters, criteria,
 * inputFingerprints, weakBacking — is something a program can populate exactly
 * and a person mostly has to reconstruct from memory.
 *
 * So this pins the property rather than leaving it to be inferred from the
 * absence of an allowlist: an author with no prior relationship to this node is
 * admitted on the merits of what it disclosed.
 */
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ForeignFindingStore } from '../ForeignFindingStore';
import { explainAttestationWeight } from '../../findings/deriveAttestationWeight';

if (!globalThis.crypto) {
  (globalThis as { crypto?: Crypto }).crypto = webcrypto as unknown as Crypto;
}

/** A brand-new identity, standing in for any peer publishing under its own key. */
function strangerKeys() {
  const seed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(seed);
  return ml_dsa65.keygen(seed);
}

function conformantClaim(overrides: Record<string, unknown> = {}) {
  const observed = new Date(Date.now() - 3 * 3600e3).toISOString();
  return {
    schemaVersion: 2,
    claim: {
      subjectRef: 'AS13335',
      subjectKind: 'organization',
      attribute: 'announcedPrefixCount',
      value: 1482,
    },
    method: {
      algorithm: 'bgp-table-enumeration',
      algorithmVersion: 1,
      parameters: { matchedBy: 'equality', windowHours: 0, distanceThresholdKm: 0 },
      sourceCount: 2,
      observedFrom: observed,
      observedTo: observed,
      timePrecisionMs: 3_600_000,
      modality: 'primary_record',
      weakBacking: [],
      criteria: 'Counted distinct announced prefixes for this ASN across 2 route collectors.',
      inputFingerprints: ['ffffffffffffffffffffffffffffffff'],
    },
    publishedAt: observed,
    ...overrides,
  };
}

/** Signs with the peer implementation, which imports no application code. */
async function sign(content: unknown, secretKey: Uint8Array) {
  const peer = await import('../../../../../scripts/peer/peer.mjs');
  return peer.signClaim(content, secretKey);
}

describe('an author this node has never seen', () => {
  it('is admitted with no allowlist, registration, or introduction', async () => {
    const keys = strangerKeys();
    const signed = await sign(conformantClaim(), keys.secretKey);

    const store = new ForeignFindingStore();
    const result = store.accept(signed);

    expect(result.accepted).toBe(true);
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].authorPubkey).toBe(signed.signature.pubkey);
  });

  it('earns its weight from disclosed method, not from who it is', async () => {
    // ONE content object, signed by two different authors. Building it twice
    // would vary publishedAt by a millisecond and leave identity entangled with
    // time — the assertion is that identity alone changes nothing, so identity
    // has to be the only thing that differs.
    const content = conformantClaim();
    const a = await sign(content, strangerKeys().secretKey);
    const b = await sign(content, strangerKeys().secretKey);

    expect(a.signature.pubkey).not.toBe(b.signature.pubkey);
    /*
     * Checked against the derivation the app ACTUALLY uses, not a copy — the
     * duplicate that once lived beside this test has been removed.
     *
     * Both weights are taken at ONE moment. The derivation decays with age against
     * the clock at call time, so two calls microseconds apart differ in the tenth
     * decimal, and exact equality here failed under load while passing in isolation
     * (observed 2026-09-12: 0.49975938105401374 against 0.4997593810317396). The
     * assertion is that identity alone changes nothing, so time must not vary either.
     */
    const at = new Date();
    expect(explainAttestationWeight(a.content, { now: at }).weight)
      .toBe(explainAttestationWeight(b.content, { now: at }).weight);
  });

  it('is refused on what it disclosed, never on whose key signed it', async () => {
    const keys = strangerKeys();
    // Same author as the accepted case above; only the disclosure is worse.
    const thin = conformantClaim();
    (thin.method as Record<string, unknown>).weakBacking = 'not an array';

    const store = new ForeignFindingStore();
    const result = store.accept(await sign(thin, keys.secretKey));

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('malformed');

    // ...and the very same key is admitted the moment it discloses properly.
    const good = store.accept(await sign(conformantClaim(), keys.secretKey));
    expect(good.accepted).toBe(true);
  });
});
