// @vitest-environment node
/**
 * Intel Pipeline E2E Integration Test (Step 2.4.5.1)
 *
 * Exercises the full create → IPFS → Solana → Nostr → Verify pipeline
 * using the IntelPipelineOrchestrator with realistic mock services.
 * This validates the wiring and data flow between all stages.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  IntelPipelineOrchestrator,
  type IpfsUploader,
  type BlockchainAnchorer,
  type NostrBroadcaster,
  type VerificationRunner,
  type PipelineResult,
  type PipelineStage,
  type StageStatus,
} from '../../services/intel/IntelPipelineOrchestrator';

describe('Intel Pipeline — E2E Integration', () => {
  // Realistic mocks that track call order and validate data flow
  function buildServices() {
    const callOrder: string[] = [];

    const ipfs: IpfsUploader = {
      uploadIntelPackage: vi.fn().mockImplementation(async (pkg, creator, visibility) => {
        callOrder.push('ipfs');
        expect(creator).toBe('author-pubkey');
        expect(visibility).toBe('public');
        return {
          success: true,
          hash: 'QmE2ETestCID12345',
          url: 'https://ipfs.io/ipfs/QmE2ETestCID12345',
        };
      }),
    };

    const blockchain: BlockchainAnchorer = {
      anchorToBlockchain: vi.fn().mockImplementation(async (ipfsHash) => {
        callOrder.push('blockchain');
        // Validate IPFS hash was correctly passed from stage 1
        expect(ipfsHash).toBe('QmE2ETestCID12345');
        return {
          success: true,
          transactionId: '3xAbCdE2ETxSig',
        };
      }),
    };

    const nostr: NostrBroadcaster = {
      publishIntelReport: vi.fn().mockImplementation(async (payload: any) => {
        callOrder.push('nostr');
        // Validate both IPFS and blockchain results flow through
        expect(payload.ipfsCid).toBe('QmE2ETestCID12345');
        expect(payload.solanaTx).toBe('3xAbCdE2ETxSig');
        return {
          success: true,
          eventId: 'nostr-e2e-event-abc',
          relaysOk: 4,
        };
      }),
    };

    const verifier: VerificationRunner = {
      verify: vi.fn().mockImplementation(async (cid, tx, eventId) => {
        callOrder.push('verification');
        expect(cid).toBe('QmE2ETestCID12345');
        expect(tx).toBe('3xAbCdE2ETxSig');
        expect(eventId).toBe('nostr-e2e-event-abc');
        return { overall: 'verified', checkCount: 4 };
      }),
    };

    return { ipfs, blockchain, nostr, verifier, callOrder };
  }

  it('executes stages in correct order: IPFS → blockchain → nostr → verification', async () => {
    const { ipfs, blockchain, nostr, verifier, callOrder } = buildServices();
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });

    await orch.execute({
      reportId: 'e2e-001',
      pkg: { title: 'E2E Test Report', content: 'Test data' },
      creator: 'author-pubkey',
      visibility: 'public',
    });

    expect(callOrder).toEqual(['ipfs', 'blockchain', 'nostr', 'verification']);
  });

  it('produces a fully verified pipeline result', async () => {
    const { ipfs, blockchain, nostr, verifier } = buildServices();
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });

    const result = await orch.execute({
      reportId: 'e2e-002',
      pkg: { title: 'Verified Report' },
      creator: 'author-pubkey',
      visibility: 'public',
    });

    expect(result.overall).toBe('complete');
    expect(result.stages.ipfs.data).toEqual({
      hash: 'QmE2ETestCID12345',
      url: 'https://ipfs.io/ipfs/QmE2ETestCID12345',
    });
    expect(result.stages.blockchain.data).toEqual({
      transactionId: '3xAbCdE2ETxSig',
    });
    expect(result.stages.nostr.data).toEqual({
      eventId: 'nostr-e2e-event-abc',
      relaysOk: 4,
    });
    expect(result.stages.verification.data).toEqual({
      overall: 'verified',
      checkCount: 4,
    });
    expect(result.reportId).toBe('e2e-002');
  });

  it('handles blockchain failure gracefully — partial publish with IPFS + Nostr', async () => {
    const callOrder: string[] = [];
    const orch = new IntelPipelineOrchestrator(
      {
        uploadIntelPackage: vi.fn().mockResolvedValue({
          success: true, hash: 'QmPartial', url: 'https://ipfs.io/ipfs/QmPartial',
        }),
      },
      {
        anchorToBlockchain: vi.fn().mockRejectedValue(new Error('Insufficient SOL')),
      },
      {
        publishIntelReport: vi.fn().mockImplementation(async (payload: any) => {
          // Nostr should still get IPFS hash even though blockchain failed
          expect(payload.ipfsCid).toBe('QmPartial');
          expect(payload.solanaTx).toBeUndefined();
          return { success: true, eventId: 'partial-nostr', relaysOk: 2 };
        }),
      },
      {
        verify: vi.fn().mockResolvedValue({ overall: 'partial', checkCount: 2 }),
      },
      { maxRetries: 0 }
    );

    const result = await orch.execute({
      reportId: 'e2e-partial',
      pkg: { title: 'Partial Publish' },
      creator: 'author-pubkey',
      visibility: 'public',
    });

    expect(result.overall).toBe('partial');
    expect(result.stages.ipfs.status).toBe('success');
    expect(result.stages.blockchain.status).toBe('failed');
    expect(result.stages.nostr.status).toBe('success');
  });

  it('tracks progress callbacks across the full pipeline', async () => {
    const { ipfs, blockchain, nostr, verifier } = buildServices();
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });

    const transitions: Array<{ stage: PipelineStage; status: StageStatus }> = [];
    const result = await orch.execute(
      {
        reportId: 'e2e-progress',
        pkg: {},
        creator: 'author-pubkey',
        visibility: 'public',
      },
      (stage, status) => transitions.push({ stage, status })
    );

    // Each stage should have running → success transitions
    const stages: PipelineStage[] = ['ipfs', 'blockchain', 'nostr', 'verification'];
    for (const s of stages) {
      expect(transitions).toContainEqual({ stage: s, status: 'running' });
      expect(transitions).toContainEqual({ stage: s, status: 'success' });
    }

    expect(transitions.length).toBe(8); // 4 stages × 2 transitions each
  });

  it('IPFS failure cascades — blockchain and nostr are skipped', async () => {
    const orch = new IntelPipelineOrchestrator(
      { uploadIntelPackage: vi.fn().mockResolvedValue({ success: false, error: 'IPFS down' }) },
      { anchorToBlockchain: vi.fn() },
      { publishIntelReport: vi.fn() },
      { verify: vi.fn().mockResolvedValue({ overall: 'unverified', checkCount: 0 }) },
      { maxRetries: 0 }
    );

    const result = await orch.execute({
      reportId: 'e2e-cascade',
      pkg: {},
      creator: 'author-pubkey',
      visibility: 'public',
    });

    expect(result.overall).toBe('failed');
    expect(result.stages.blockchain.status).toBe('skipped');
    expect(result.stages.nostr.status).toBe('skipped');
  });
});
