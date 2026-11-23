/**
 * FindingsPublisherService — the "Publish Finding" action, mirroring
 * MissionService.publishToNavcom.publishToNavcom's orchestration (build
 * content -> sign with the persisted ML-DSA key -> broadcast).
 *
 * Same mocking approach as MissionService.publishToNavcom.test.ts:
 * FindingsBroadcastService's network layer is already covered for real in
 * FindingsBroadcastService.test.ts, so it's mocked here as a plain class
 * (not vi.fn().mockImplementation — this file's global afterEach calls
 * vi.restoreAllMocks(), which would wipe a mockImplementation on the
 * constructor itself) to isolate what this layer actually owns: building
 * the content, signing it, and handing it to the broadcaster.
 * fake-indexeddb/auto is required because ManifestSigningKeyStore
 * persists its keypair via IndexedDB, which jsdom doesn't provide.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const publishFindingMock = vi.fn();

vi.mock('../FindingsBroadcastService', async (importOriginal) => ({
  // findingRelays and the rest stay real; only the network layer is stubbed.
  ...(await importOriginal<typeof import('../FindingsBroadcastService')>()),
  FindingsBroadcastService: class {
    publishFinding(...args: unknown[]) { return publishFindingMock(...args); }
    dispose() {}
  }
}));

import { publishFinding } from '../FindingsPublisherService';
import { acknowledge } from '../publisherConsent';

/*
 * The publisher acknowledgement is a real gate on publishFinding: Starcom holds
 * no signing key, so a publish is a person signing under their own. These tests
 * exercise everything AFTER that gate, so they acknowledge in setup rather than
 * being exempted from it — the gate itself has its own tests.
 */
beforeEach(() => acknowledge());


function makeFinding(overrides: Partial<CorroboratedFinding> = {}): CorroboratedFinding {
  return {
    entityRef: 'John Smith',
    attribute: 'location',
    value: { lat: 40.7128, lon: -74.006 },
    confidence: 0.81,
    sourceCount: 3,
    algorithmVersion: 2,
    // Known-real by default. publicationPolicy refuses anything that is not
    // explicitly false, including undefined — a fixture that omitted this
    // would be refused, which is the safe direction to fail.
    isMock: false,
    ...overrides
  };
}

describe('FindingsPublisherService.publishFinding', () => {
  beforeEach(() => {
    publishFindingMock.mockReset();
  });

  it('returns the broadcast result on success', async () => {
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 3 });

    const result = await publishFinding(makeFinding());

    expect(result.broadcast.success).toBe(true);
    expect(result.broadcast.eventId).toBe('evt-1');
  });

  it('queues the finding for retry when the broadcast reaches no relay', async () => {
    publishFindingMock.mockResolvedValueOnce({ success: false, error: 'no relays reachable' });

    const result = await publishFinding(makeFinding());

    // Failure must not mean loss: the finding is durably queued, and the
    // caller is told so distinctly from both success and outright error.
    expect(result.broadcast.success).toBe(false);
    expect(result.queued).toBe(true);
  });

  it('propagates broadcast failure without throwing', async () => {
    publishFindingMock.mockResolvedValue({ success: false, error: 'no relays reachable' });

    const result = await publishFinding(makeFinding());

    expect(result.broadcast.success).toBe(false);
    expect(result.broadcast.error).toBe('no relays reachable');
  });

  it('signs and hands a SignedFinding — content + a real ml-dsa-65 signature block — to the broadcaster, never the raw CorroboratedFinding', async () => {
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });

    await publishFinding(makeFinding());

    expect(publishFindingMock).toHaveBeenCalledOnce();
    const [signed] = publishFindingMock.mock.calls[0];
    // v2 claim shape: subjectRef rather than entityRef, and subjectKind on the
    // wire because it changes what the claim means.
    expect(signed.content.claim).toEqual({
      subjectRef: 'John Smith',
      subjectKind: 'unknown',
      attribute: 'location',
      value: { lat: 40.7128, lon: -74.006 },
    });
    expect(signed.signature.alg).toBe('ml-dsa-65');
    expect(typeof signed.signature.pubkey).toBe('string');
    expect(typeof signed.signature.sig).toBe('string');
    // never the source count's underlying identities — CorroboratedFinding
    // never carries them, so there's nothing here to leak in the first place.
    expect(signed).not.toHaveProperty('sourceId');
  });

  it('reuses the SAME persisted signing key across two separate publishes — a verifier can attribute both to one source', async () => {
    publishFindingMock.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });

    await publishFinding(makeFinding({ entityRef: 'Entity One' }));
    const [firstSigned] = publishFindingMock.mock.calls[0];

    await publishFinding(makeFinding({ entityRef: 'Entity Two' }));
    const [secondSigned] = publishFindingMock.mock.calls[1];

    expect(firstSigned.signature.pubkey).toBe(secondSigned.signature.pubkey);
  });
});

describe('FindingsPublisherService — the ledger keeps each claim\'s address (plan item 5.1)', () => {
  it('records the Nostr key that signed the event, so the claim can be reviewed', async () => {
    const { publishedFindingsLedger } = await import('../PublishedFindingsLedger');
    publishFindingMock.mockReset().mockResolvedValue({ success: true, eventId: 'evt-addr', relaysOk: 1, nostrPubkey: 'f'.repeat(64) });
    const finding = makeFinding();
    await publishFinding(finding);
    const entry = publishedFindingsLedger.all().find((e) => e.eventId === 'evt-addr');
    expect(entry?.nostrPubkey).toBe('f'.repeat(64));
  });
});
