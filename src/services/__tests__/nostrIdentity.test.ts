/**
 * NostrIdentityService — Cycle 0 verification.
 *
 * Before this service existed, nostrService.ts (live chat) and
 * NostrIntelBroadcastService (report/package broadcast) had no shared identity: a
 * user's "chat pubkey" and "report-publishing pubkey" could silently diverge. This
 * verifies nostrIdentityService actually unifies them — not just that its own methods
 * are internally consistent, but that a real NostrIntelBroadcastService.publishIntelReport
 * call, signed via nostrIdentityService.asSigner(), produces an event whose real,
 * cryptographically-verified pubkey matches the one nostrService (and therefore live
 * chat) already uses.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyEvent } from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import nostrService from '../nostrService';
import { NostrIntelBroadcastService } from '../intel/NostrIntelBroadcastService';
import type { IntelBroadcastPayload } from '../intel/NostrIntelBroadcastService';

describe('nostrIdentityService — unifies chat and report-broadcast identity', () => {
  it('has no identity until something needs one, and then the same one as chat', () => {
    // This used to assert a pubkey existed at rest, which was true because the
    // service minted a key on module load — the behaviour that made an identity
    // nobody asked for. Absent is now the correct answer before any signing.
    expect(nostrIdentityService.getPubkey()).toBe(nostrService.getPublicKey());

    const pubkey = nostrIdentityService.ensureLocalIdentity('a test');
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
    // One identity, shared: chat and report broadcast sign as the same person.
    expect(nostrIdentityService.getPubkey()).toBe(nostrService.getPublicKey());
    expect(nostrIdentityService.getPubkey()).toBe(pubkey);
  });

  it('sign() produces a real, verifiable signature under the identity pubkey', () => {
    const event = nostrIdentityService.sign({
      kind: 1,
      content: 'test',
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    });
    expect(event.pubkey).toBe(nostrIdentityService.getPubkey());
    expect(verifyEvent(event)).toBe(true);
  });

  // Hardening pass: finalizeEvent (which sign() delegates to via
  // nostrService.signEvent) mutates whatever object it's given in place —
  // confirmed by reading nostr-tools' own source (pure.js: `const event = t;
  // event.pubkey = ...`). Without a defensive copy, a caller holding a
  // reference to the object it passed in would see it silently transform.
  it('sign() does not mutate the caller\'s input object', () => {
    const unsigned = {
      kind: 1,
      content: 'test',
      tags: [] as string[][],
      created_at: Math.floor(Date.now() / 1000)
    };
    const snapshot = { ...unsigned };
    const event = nostrIdentityService.sign(unsigned);

    expect(unsigned).toEqual(snapshot);
    expect(unsigned).not.toHaveProperty('id');
    expect(unsigned).not.toHaveProperty('pubkey');
    expect(unsigned).not.toHaveProperty('sig');
    expect(event.id).toBeTruthy();
    expect(event.pubkey).toBe(nostrIdentityService.getPubkey());
  });

  it('asSigner() resolves getPublicKey() to the real identity pubkey', async () => {
    const signer = nostrIdentityService.asSigner();
    await expect(signer.getPublicKey()).resolves.toBe(nostrIdentityService.getPubkey());
  });

  it('asSigner().signEvent() produces a real, verifiable signature', async () => {
    const signer = nostrIdentityService.asSigner();
    const event = await signer.signEvent({
      kind: 1,
      content: 'test',
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    });
    expect(event.pubkey).toBe(nostrIdentityService.getPubkey());
    expect(verifyEvent(event)).toBe(true);
  });

  it('a real NostrIntelBroadcastService.publishIntelReport call signed via asSigner() broadcasts under the same identity live chat uses', async () => {
    const broadcastService = new NostrIntelBroadcastService(['wss://test-relay']);
    const publishMock = vi.fn().mockReturnValue([Promise.resolve()]);
    // Same pool-mocking pattern as nostrIntelBroadcast.integration.test.ts — this test
    // is about identity unification, not real relay I/O.
    (broadcastService as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const payload: IntelBroadcastPayload = {
      title: 'Identity unification check',
      ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    };

    const result = await broadcastService.publishIntelReport(payload, nostrIdentityService.asSigner());

    expect(result.success).toBe(true);
    const [, publishedEvent] = publishMock.mock.calls[0];
    expect(publishedEvent.pubkey).toBe(nostrIdentityService.getPubkey());
    expect(publishedEvent.pubkey).toBe(nostrService.getPublicKey());
    expect(verifyEvent(publishedEvent)).toBe(true);
  });
});
