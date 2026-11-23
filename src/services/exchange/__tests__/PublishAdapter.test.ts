import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComposeResult } from '../types';

const uploadIntelPackage = vi.fn();
const publishIntelReport = vi.fn();

vi.mock('../../IPFSService', () => ({
  default: { uploadIntelPackage: (...args: unknown[]) => uploadIntelPackage(...args) }
}));

vi.mock('../../intel/NostrIntelBroadcastService', () => ({
  NostrIntelBroadcastService: vi.fn().mockImplementation(function () { return ({
    publishIntelReport: (...args: unknown[]) => publishIntelReport(...args)
  }); })
}));

/**
 * BlockchainAnchorService is mocked, not merely unused.
 *
 * It is never invoked (skipBlockchain: true), which is why this previously let
 * the real class construct — on the stated assumption that construction is
 * lightweight. It is not: the constructor builds a Solana `Connection` to
 * api.devnet.solana.com, which drags in the whole Solana SDK. That is the same
 * dependency the bundle budget records as roughly a third of the first-visit
 * payload.
 *
 * The cost showed up as a 15-second timeout under full-suite contention, while
 * the file passed four times out of four in isolation. Constructing a network
 * client that the test then refuses to use is expense with no assertion
 * attached, so the constructor is stubbed instead.
 */
vi.mock('../../BlockchainAnchorService', () => ({
  BlockchainAnchorService: vi.fn().mockImplementation(function () { return ({}); }),
}));

function makePkg(overrides: Partial<ComposeResult['manifest']> = {}): ComposeResult {
  return {
    manifest: {
      id: 'pkg-1',
      name: 'Test Package',
      version: '1.0.0',
      description: 'desc',
      visibility: 'public',
      createdAt: new Date().toISOString(),
      author: 'author-pubkey',
      license: 'CC0',
      reports: [],
      intel: [],
      assets: [],
      metadata: {},
      ...overrides
    },
    blob: new Blob(['{}'], { type: 'application/json' })
  };
}

describe('IntelPipelinePublishAdapter', () => {
  beforeEach(() => {
    uploadIntelPackage.mockReset();
    publishIntelReport.mockReset();
  });

  it('uploads to IPFS with the manifest id/author/visibility and returns the real IPFS url', async () => {
    uploadIntelPackage.mockResolvedValue({ success: true, hash: 'QmTest123', url: 'https://ipfs.io/ipfs/QmTest123' });
    publishIntelReport.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 3 });

    const { publishAdapter } = await import('../PublishAdapter');
    const res = await publishAdapter.publish(makePkg());

    expect(uploadIntelPackage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pkg-1', name: 'Test Package' }),
      'author-pubkey',
      'public'
    );
    expect(res).toEqual({ id: 'pkg-1', url: 'https://ipfs.io/ipfs/QmTest123', nostrPublished: true, relaysOk: 3 });
  });

  it('reports nostrPublished: false without failing the whole publish when only the Nostr broadcast fails', async () => {
    uploadIntelPackage.mockResolvedValue({ success: true, hash: 'QmTest456', url: 'https://ipfs.io/ipfs/QmTest456' });
    publishIntelReport.mockResolvedValue({ success: false, error: 'no relays reachable' });

    const { publishAdapter } = await import('../PublishAdapter');
    const res = await publishAdapter.publish(makePkg({ id: 'pkg-2' }));

    // Why no relay took it travels with the result, for the screen to say (plan item 9.3).
    expect(res).toEqual({ id: 'pkg-2', url: 'https://ipfs.io/ipfs/QmTest456', nostrPublished: false, nostrError: 'no relays reachable' });
  });

  // Sent with no signer, the announcement was signed only by a browser
  // extension, and without one never at all (found by plan item 9.3's check).
  it("hands the announcement this app's signer", async () => {
    uploadIntelPackage.mockResolvedValue({ success: true, hash: 'QmTest789', url: 'https://ipfs.io/ipfs/QmTest789' });
    publishIntelReport.mockResolvedValue({ success: true, eventId: 'evt-3', relaysOk: 1 });

    const { publishAdapter } = await import('../PublishAdapter');
    await publishAdapter.publish(makePkg({ id: 'pkg-4' }));

    const signer = publishIntelReport.mock.calls[0][1] as { signEvent?: unknown; getPublicKey?: unknown } | undefined;
    expect(typeof signer?.signEvent).toBe('function');
    expect(typeof signer?.getPublicKey).toBe('function');
  });

  it('throws when the IPFS upload itself fails — there is no package to reference without it', async () => {
    uploadIntelPackage.mockResolvedValue({ success: false, error: 'storage quota exceeded' });
    publishIntelReport.mockResolvedValue({ success: true, eventId: 'evt-2', relaysOk: 2 });

    const { publishAdapter } = await import('../PublishAdapter');
    await expect(publishAdapter.publish(makePkg({ id: 'pkg-3' }))).rejects.toThrow('storage quota exceeded');
  });
});
