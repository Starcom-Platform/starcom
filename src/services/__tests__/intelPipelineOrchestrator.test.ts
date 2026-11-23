// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IntelPipelineOrchestrator,
  type IpfsUploader,
  type BlockchainAnchorer,
  type NostrBroadcaster,
  type VerificationRunner,
  type PipelineResult,
  type StageProgressCallback,
} from '../intel/IntelPipelineOrchestrator';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockIpfs(overrides?: Partial<IpfsUploader>): IpfsUploader {
  return {
    uploadIntelPackage: vi.fn().mockResolvedValue({
      success: true,
      hash: 'QmTestHash123',
      url: 'https://ipfs.io/ipfs/QmTestHash123',
    }),
    ...overrides,
  };
}

function mockBlockchain(overrides?: Partial<BlockchainAnchorer>): BlockchainAnchorer {
  return {
    anchorToBlockchain: vi.fn().mockResolvedValue({
      success: true,
      transactionId: '5xTx123abc',
    }),
    ...overrides,
  };
}

function mockNostr(overrides?: Partial<NostrBroadcaster>): NostrBroadcaster {
  return {
    publishIntelReport: vi.fn().mockResolvedValue({
      success: true,
      eventId: 'nostrevent123',
      relaysOk: 3,
    }),
    ...overrides,
  };
}

function mockVerifier(overrides?: Partial<VerificationRunner>): VerificationRunner {
  return {
    verify: vi.fn().mockResolvedValue({ overall: 'verified', checkCount: 4 }),
    ...overrides,
  };
}

const baseParams = {
  reportId: 'rpt-001',
  pkg: { title: 'Test Report' },
  creator: 'author-pubkey',
  visibility: 'public',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntelPipelineOrchestrator', () => {
  let ipfs: IpfsUploader;
  let blockchain: BlockchainAnchorer;
  let nostr: NostrBroadcaster;
  let verifier: VerificationRunner;

  beforeEach(() => {
    ipfs = mockIpfs();
    blockchain = mockBlockchain();
    nostr = mockNostr();
    verifier = mockVerifier();
  });

  // ---- Happy path ----------------------------------------------------------

  it('completes full pipeline when all stages succeed', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('complete');
    expect(result.stages.ipfs.status).toBe('success');
    expect(result.stages.blockchain.status).toBe('success');
    expect(result.stages.nostr.status).toBe('success');
    expect(result.stages.verification.status).toBe('success');
    expect(result.stages.ipfs.data).toEqual({
      hash: 'QmTestHash123',
      url: 'https://ipfs.io/ipfs/QmTestHash123',
    });
  });

  // ---- Partial publish (blockchain fails) ----------------------------------

  it('returns partial when blockchain fails but IPFS + Nostr succeed', async () => {
    blockchain = mockBlockchain({
      anchorToBlockchain: vi.fn().mockResolvedValue({
        success: false,
        error: 'Insufficient funds',
      }),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('partial');
    expect(result.stages.blockchain.status).toBe('failed');
    expect(result.stages.blockchain.error).toContain('Insufficient funds');
    expect(result.stages.ipfs.status).toBe('success');
    expect(result.stages.nostr.status).toBe('success');
  });

  // ---- Partial publish (nostr fails) ---------------------------------------

  it('returns partial when nostr fails but IPFS + blockchain succeed', async () => {
    nostr = mockNostr({
      publishIntelReport: vi.fn().mockRejectedValue(new Error('All relays rejected')),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('partial');
    expect(result.stages.nostr.status).toBe('failed');
    expect(result.stages.nostr.error).toContain('All relays rejected');
  });

  // ---- IPFS fail cascades ---------------------------------------------------

  it('skips blockchain and nostr when IPFS fails', async () => {
    ipfs = mockIpfs({
      uploadIntelPackage: vi.fn().mockResolvedValue({
        success: false,
        error: 'Storage quota exceeded',
      }),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('failed');
    expect(result.stages.ipfs.status).toBe('failed');
    expect(result.stages.blockchain.status).toBe('skipped');
    expect(result.stages.nostr.status).toBe('skipped');
    // Verification still runs (checks what's available)
  });

  // ---- Retry succeeds on second attempt ------------------------------------

  it('retries a failing stage and succeeds on second attempt', async () => {
    let callCount = 0;
    ipfs = mockIpfs({
      uploadIntelPackage: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Temporary network error');
        return { success: true, hash: 'QmRetried', url: 'https://ipfs.io/ipfs/QmRetried' };
      }),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 1,
      retryDelayMs: 10,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('complete');
    expect(result.stages.ipfs.status).toBe('success');
    expect(result.stages.ipfs.retryCount).toBe(1);
  });

  // ---- Retry exhaustion ---------------------------------------------------

  it('marks stage failed after exhausting retries', async () => {
    blockchain = mockBlockchain({
      anchorToBlockchain: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 2,
      retryDelayMs: 10,
    });
    const result = await orch.execute(baseParams);

    expect(result.stages.blockchain.status).toBe('failed');
    expect(result.stages.blockchain.retryCount).toBe(3); // initial + 2 retries
    expect(result.stages.blockchain.error).toContain('RPC unavailable');
  });

  // ---- Skip flags ----------------------------------------------------------

  it('skips blockchain when skipBlockchain is true', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      skipBlockchain: true,
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.stages.blockchain.status).toBe('skipped');
    expect(blockchain.anchorToBlockchain).not.toHaveBeenCalled();
    // Nostr still runs
    expect(result.stages.nostr.status).toBe('success');
    expect(result.overall).toBe('complete');
  });

  it('skips nostr when skipNostr is true', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      skipNostr: true,
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.stages.nostr.status).toBe('skipped');
    expect(nostr.publishIntelReport).not.toHaveBeenCalled();
    expect(result.overall).toBe('complete');
  });

  // ---- Timeout -------------------------------------------------------

  it('fails a stage that exceeds the timeout', async () => {
    ipfs = mockIpfs({
      uploadIntelPackage: vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      ),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
      stageTimeoutMs: 50,
    });
    const result = await orch.execute(baseParams);

    expect(result.stages.ipfs.status).toBe('failed');
    expect(result.stages.ipfs.error).toContain('Timeout');
  });

  // ---- Progress callback ---------------------------------------------------

  it('fires progress callback for each stage transition', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const transitions: Array<[string, string]> = [];
    const onProgress: StageProgressCallback = (stage, status) => {
      transitions.push([stage, status]);
    };
    await orch.execute(baseParams, onProgress);

    expect(transitions).toContainEqual(['ipfs', 'running']);
    expect(transitions).toContainEqual(['ipfs', 'success']);
    expect(transitions).toContainEqual(['blockchain', 'running']);
    expect(transitions).toContainEqual(['blockchain', 'success']);
    expect(transitions).toContainEqual(['nostr', 'running']);
    expect(transitions).toContainEqual(['nostr', 'success']);
    expect(transitions).toContainEqual(['verification', 'running']);
    expect(transitions).toContainEqual(['verification', 'success']);
  });

  // ---- Passes IPFS hash to downstream stages --------------------------------

  it('passes IPFS hash to blockchain anchor and nostr broadcast', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    await orch.execute(baseParams);

    expect(blockchain.anchorToBlockchain).toHaveBeenCalledWith(
      'QmTestHash123',
      'intel-package',
      'public',
      'author-pubkey',
      undefined,
      undefined
    );

    const nostrCall = (nostr.publishIntelReport as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(nostrCall[0]).toMatchObject({
      ipfsCid: 'QmTestHash123',
      solanaTx: '5xTx123abc',
    });
  });

  // ---- Verification receives whatever succeeded ----------------------------

  it('passes only available refs to verification', async () => {
    blockchain = mockBlockchain({
      anchorToBlockchain: vi.fn().mockResolvedValue({ success: false, error: 'fail' }),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    await orch.execute(baseParams);

    expect(verifier.verify).toHaveBeenCalledWith(
      'QmTestHash123',
      undefined,     // blockchain failed → no tx
      'nostrevent123'
    );
  });

  // ---- Result timing -------------------------------------------------------

  it('records timing metadata', async () => {
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.startedAt).toBeLessThanOrEqual(result.completedAt);
    expect(typeof result.stages.ipfs.durationMs).toBe('number');
    expect(result.reportId).toBe('rpt-001');
  });

  // ---- Verification error doesn't affect overall ----------------------------

  it('still returns complete when verification fails but core stages succeed', async () => {
    verifier = mockVerifier({
      verify: vi.fn().mockRejectedValue(new Error('Verification timeout')),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('complete');
    expect(result.stages.verification.status).toBe('failed');
  });

  // ---- All stages fail -------------------------------------------------

  it('returns failed when all core stages fail', async () => {
    ipfs = mockIpfs({
      uploadIntelPackage: vi.fn().mockResolvedValue({ success: false, error: 'fail' }),
    });
    const orch = new IntelPipelineOrchestrator(ipfs, blockchain, nostr, verifier, {
      maxRetries: 0,
    });
    const result = await orch.execute(baseParams);

    expect(result.overall).toBe('failed');
  });
});
