/**
 * NostrIntelBroadcastService Integration Tests
 * Step 2.2.4 — Nostr Intel Broadcast
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { NostrIntelBroadcastService } from '../../services/intel/NostrIntelBroadcastService';
import type { IntelBroadcastPayload, BroadcastResult } from '../../services/intel/NostrIntelBroadcastService';

describe('NostrIntelBroadcastService — Step 2.2.4', () => {
  let service: NostrIntelBroadcastService;
  let secretKey: Uint8Array;

  beforeEach(() => {
    service = new NostrIntelBroadcastService(['wss://test-relay']);
    secretKey = generateSecretKey();
  });

  // -----------------------------------------------------------------------
  // 2.2.4.1 — Outbound Publisher
  // -----------------------------------------------------------------------
  describe('2.2.4.1 — Outbound Publisher', () => {
    it('creates service with publish method', () => {
      expect(typeof service.publishIntelReport).toBe('function');
    });

    it('builds unsigned NIP-23 event with kind 30023', () => {
      const payload: IntelBroadcastPayload = {
        title: 'Maritime Intercept',
        ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        solanaTx: 'mock-sig-123',
      };
      const event = service.buildUnsignedEvent(payload);
      expect(event.kind).toBe(30023);
      expect(typeof event.created_at).toBe('number');
      expect(typeof event.content).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // 2.2.4.2 — NIP-23 Event Construction
  // -----------------------------------------------------------------------
  describe('2.2.4.2 — NIP-23 Event with tags', () => {
    const ipfsCid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const solanaTx = '5KtPnGzRsqqWFLcABc7L4wJMf3vB4i2aT3ZRaHVG3';

    it('includes #starcom_intel and -intel tag variants', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
      });
      const tags = event.tags as string[][];
      const tTags = tags.filter(t => t[0] === 't').map(t => t[1]);
      expect(tTags).toContain('starcom_intel');
      expect(tTags).toContain('starcom-intel');
    });

    it('includes IPFS reference tag', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
      });
      const tags = event.tags as string[][];
      const rTags = tags.filter(t => t[0] === 'r').map(t => t[1]);
      expect(rTags).toContain(`ipfs://${ipfsCid}`);
    });

    it('includes Solana reference tag when tx provided', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid, solanaTx,
      });
      const tags = event.tags as string[][];
      const rTags = tags.filter(t => t[0] === 'r').map(t => t[1]);
      expect(rTags).toContain(`solana:${solanaTx}`);
    });

    it('omits Solana tag when no tx provided', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
      });
      const tags = event.tags as string[][];
      const rTags = tags.filter(t => t[0] === 'r').map(t => t[1]);
      expect(rTags.some(r => r.startsWith('solana:'))).toBe(false);
    });

    it('includes geohash tag for coordinates', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
        latitude: 51.5074, longitude: -0.1278,
      });
      const tags = event.tags as string[][];
      const gTags = tags.filter(t => t[0] === 'g');
      expect(gTags.length).toBe(1);
      // London's geohash (51.5074, -0.1278) starts with 'gcpvj'
      expect(gTags[0][1]).toMatch(/^gcpvj/);
    });

    it('includes NIP-23 d-tag identifier', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
      });
      const tags = event.tags as string[][];
      const dTags = tags.filter(t => t[0] === 'd');
      expect(dTags.length).toBe(1);
      expect(dTags[0][1]).toContain('starcom_intel_');
    });

    it('includes extra tags in event', () => {
      const event = service.buildUnsignedEvent({
        title: 'Test', ipfsCid,
        tags: ['osint', 'maritime'],
      });
      const tags = event.tags as string[][];
      const tTags = tags.filter(t => t[0] === 't').map(t => t[1]);
      expect(tTags).toContain('osint');
      expect(tTags).toContain('maritime');
    });

    it('content is valid JSON with required fields', () => {
      const event = service.buildUnsignedEvent({
        title: 'Maritime Alert', ipfsCid, solanaTx, visibility: 'limited',
        latitude: 10, longitude: 20,
      });
      const content = JSON.parse(event.content as string);
      expect(content.title).toBe('Maritime Alert');
      expect(content.ipfsCid).toBe(ipfsCid);
      expect(content.solanaTx).toBe(solanaTx);
      expect(content.visibility).toBe('limited');
      expect(content.lat).toBe(10);
      expect(content.lon).toBe(20);
    });

    /**
     * The reason the field became optional.
     *
     * It was REQUIRED, so every producer had to supply something — and
     * OsintNostrPublisher duly stamped 'UNCLASSIFIED' on every OSINT item it
     * broadcast, a marking nobody had reviewed, on a signed event, to relays
     * that keep what they receive. A required handling field manufactures
     * handling claims at the point of publication.
     *
     * An unstated visibility must therefore be ABSENT from the published
     * content, not defaulted to anything.
     */
    it('omits the key entirely when visibility is unstated', () => {
      const event = service.buildUnsignedEvent({ title: 'Unmarked', ipfsCid });
      const content = JSON.parse(event.content as string);
      expect('visibility' in content).toBe(false);
      expect('classification' in content).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 2.2.4.3 — Sign and Publish
  // -----------------------------------------------------------------------
  describe('2.2.4.3 — Sign and Publish to relay pool', () => {
    it('signs event with secret key and publishes', async () => {
      // Mock pool.publish to capture the event
      const publishMock = vi.fn().mockReturnValue([Promise.resolve()]);
      (service as any).pool = { publish: publishMock, close: vi.fn() };

      const result = await service.publishIntelReport(
        {
          title: 'Test Report',
          ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        secretKey,
      );

      expect(result.success).toBe(true);
      expect(typeof result.eventId).toBe('string');
      expect(result.eventId!.length).toBe(64); // hex SHA-256
      expect(result.relaysOk).toBe(1);

      // Verify pool.publish was called with correct args
      expect(publishMock).toHaveBeenCalledOnce();
      const [relays, event] = publishMock.mock.calls[0];
      expect(relays).toEqual(['wss://test-relay']);
      expect(event.kind).toBe(30023);
      expect(event.sig).toBeDefined();
      expect(event.pubkey).toBe(getPublicKey(secretKey));
    });

    it('returns error when no signer available', async () => {
      const result = await service.publishIntelReport(
        {
          title: 'Test',
          ipfsCid: 'bafytest',
        },
        // no signer, no window.nostr in Node
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No signing method');
    });

    it('signs event via NIP-07 signer interface', async () => {
      const publishMock = vi.fn().mockReturnValue([Promise.resolve()]);
      (service as any).pool = { publish: publishMock, close: vi.fn() };

      const mockPubkey = getPublicKey(secretKey);
      const nip07Signer = {
        getPublicKey: vi.fn().mockResolvedValue(mockPubkey),
        signEvent: vi.fn().mockImplementation(async (event: Record<string, unknown>) => {
          // Simulate NIP-07 signing by using finalizeEvent internally
          return finalizeEvent(event as any, secretKey);
        }),
      };

      const result = await service.publishIntelReport(
        {
          title: 'NIP-07 Report',
          ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
          solanaTx: 'mock-tx',
        },
        nip07Signer,
      );

      expect(result.success).toBe(true);
      expect(nip07Signer.getPublicKey).toHaveBeenCalled();
      expect(nip07Signer.signEvent).toHaveBeenCalled();
    });

    it('reports partial success when some relays reject', async () => {
      const publishMock = vi.fn().mockReturnValue([
        Promise.resolve(),
        Promise.reject(new Error('rate-limited')),
        Promise.resolve(),
      ]);
      const svc = new NostrIntelBroadcastService(['wss://r1', 'wss://r2', 'wss://r3']);
      (svc as any).pool = { publish: publishMock, close: vi.fn() };

      const result = await svc.publishIntelReport(
        {
          title: 'Partial',
          ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        secretKey,
      );

      expect(result.success).toBe(true);
      expect(result.relaysOk).toBe(2);
    });

    it('returns failure when all relays reject', async () => {
      const publishMock = vi.fn().mockReturnValue([
        Promise.reject(new Error('closed')),
      ]);
      (service as any).pool = { publish: publishMock, close: vi.fn() };

      const result = await service.publishIntelReport(
        {
          title: 'Fail',
          ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        secretKey,
      );

      expect(result.success).toBe(false);
      expect(result.relaysOk).toBe(0);
      expect(result.error).toContain('closed');
    });
  });
});
