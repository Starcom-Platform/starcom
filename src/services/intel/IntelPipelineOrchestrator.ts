/**
 * IntelPipelineOrchestrator — Step 2.4.3 (Intel Error Handling)
 *
 * Coordinates the multi-stage intel publish pipeline:
 *   1. IPFS Upload → hash
 *   2. Blockchain Anchor → transactionId
 *   3. Nostr Broadcast → eventId
 *   4. Verification → VerificationDetails
 *
 * Each stage runs independently with retry + timeout. If a stage fails the
 * pipeline continues to the next stage (partial publish) instead of aborting.
 * Results are aggregated into a PipelineResult with per-stage status.
 */

import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'IntelPipeline' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage = 'ipfs' | 'blockchain' | 'nostr' | 'verification';

export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface PipelineStageResult<T = unknown> {
  stage: PipelineStage;
  status: StageStatus;
  data?: T;
  error?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  retryCount: number;
}

export interface PipelineResult {
  reportId: string;
  stages: {
    ipfs: PipelineStageResult<{ hash: string; url: string }>;
    blockchain: PipelineStageResult<{ transactionId: string }>;
    nostr: PipelineStageResult<{ eventId: string; relaysOk: number }>;
    verification: PipelineStageResult<{ overall: string; checkCount: number }>;
  };
  overall: 'complete' | 'partial' | 'failed';
  startedAt: number;
  completedAt: number;
}

/** Callback fired whenever a stage transitions. */
export type StageProgressCallback = (
  stage: PipelineStage,
  status: StageStatus,
  detail?: string
) => void;

// ---------------------------------------------------------------------------
// Service interfaces (dependency-injected for testability)
// ---------------------------------------------------------------------------

export interface IpfsUploader {
  uploadIntelPackage(
    pkg: unknown,
    creator: string,
    visibility?: string
  ): Promise<{ success: boolean; hash: string; url: string; error?: string }>;
}

/**
 * An anchorer proves a hash existed before a given time.
 *
 * NO IMPLEMENTATION SHIPS. BlockchainAnchorService supplied one over Solana and
 * was removed: it needed a connected wallet's signTransaction callback, no
 * signing UI ever existed, so every attempt failed structurally — and the
 * property it bought is one nothing in this pipeline consumes, in exchange for
 * a funded wallet and a permanent public transaction.
 *
 * The interface is kept because it is chain-agnostic and the seam is real:
 * OpenTimestamps provides the same proof free via Bitcoin, with no wallet, no
 * fees and no chain SDK, and would slot in here. Until something does, the
 * stage reports itself skipped with a reason rather than pretending to run.
 */
export interface BlockchainAnchorer {
  anchorToBlockchain(
    ipfsHash: string,
    contentType: string,
    visibility: string,
    creator: unknown,
    signTransaction: unknown,
    metadata?: unknown
  ): Promise<{ success: boolean; transactionId?: string; error?: string }>;
}

export interface NostrBroadcaster {
  publishIntelReport(
    payload: unknown,
    signer?: unknown
  ): Promise<{ success: boolean; eventId?: string; relaysOk?: number; error?: string }>;
}

export interface VerificationRunner {
  verify(
    ipfsCid?: string,
    solanaTx?: string,
    nostrEventId?: string
  ): Promise<{ overall: string; checkCount: number }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  /** Max retries per stage (default 2) */
  maxRetries?: number;
  /** Base retry delay in ms — exponential backoff (default 1000) */
  retryDelayMs?: number;
  /** Per-stage timeout in ms (default 30000) */
  stageTimeoutMs?: number;
  /** Skip blockchain stage entirely */
  skipBlockchain?: boolean;
  /** Skip nostr stage entirely */
  skipNostr?: boolean;
}

const DEFAULTS: Required<PipelineConfig> = {
  maxRetries: 2,
  retryDelayMs: 1000,
  stageTimeoutMs: 30_000,
  skipBlockchain: false,
  skipNostr: false,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class IntelPipelineOrchestrator {
  private ipfs: IpfsUploader;
  private blockchain: BlockchainAnchorer | null;
  private nostr: NostrBroadcaster;
  private verifier: VerificationRunner;
  private config: Required<PipelineConfig>;

  constructor(
    ipfs: IpfsUploader,
    /** Optional: none ships today. Absent means the anchor stage is skipped. */
    blockchain: BlockchainAnchorer | null,
    nostr: NostrBroadcaster,
    verifier: VerificationRunner,
    config?: PipelineConfig
  ) {
    this.ipfs = ipfs;
    this.blockchain = blockchain;
    this.nostr = nostr;
    this.verifier = verifier;
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Execute the full publish pipeline for a single intel report.
   */
  async execute(
    params: {
      reportId: string;
      pkg: unknown;
      creator: string;
      visibility?: string;
      signTransaction?: unknown;
      metadata?: unknown;
      nostrPayload?: unknown;
      nostrSigner?: unknown;
      /** What the report rests on, cited on the announcement (D-MX, MX22). */
      cites?: ReadonlyArray<{ eventId: string; relay?: string }>;
    },
    onProgress?: StageProgressCallback
  ): Promise<PipelineResult> {
    const startedAt = Date.now();
    const notify = onProgress ?? (() => {});

    // 1 — IPFS Upload
    const ipfsResult = await this.runStage<{ hash: string; url: string }>(
      'ipfs',
      async () => {
        const res = await this.ipfs.uploadIntelPackage(
          params.pkg,
          params.creator,
          params.visibility
        );
        if (!res.success) throw new Error(res.error ?? 'IPFS upload failed');
        return { hash: res.hash, url: res.url };
      },
      notify
    );

    // 2 — Blockchain Anchor (depends on IPFS hash)
    let blockchainResult: PipelineStageResult<{ transactionId: string }>;
    if (!this.blockchain || this.config.skipBlockchain || ipfsResult.status === 'failed') {
      const reason = !this.blockchain
        ? 'no anchorer configured'
        : this.config.skipBlockchain ? 'configured skip' : 'IPFS failed';
      blockchainResult = {
        stage: 'blockchain',
        status: 'skipped',
        retryCount: 0,
        error: `Skipped: ${reason}`,
      };
      notify('blockchain', 'skipped', reason);
    } else {
      blockchainResult = await this.runStage<{ transactionId: string }>(
        'blockchain',
        async () => {
          const res = await this.blockchain!.anchorToBlockchain(
            ipfsResult.data!.hash,
            'intel-package',
            params.visibility,
            params.creator,
            params.signTransaction,
            params.metadata
          );
          if (!res.success) throw new Error(res.error ?? 'Anchor failed');
          return { transactionId: res.transactionId! };
        },
        notify
      );
    }

    // 3 — Nostr Broadcast (uses IPFS + optional blockchain tx)
    let nostrResult: PipelineStageResult<{ eventId: string; relaysOk: number }>;
    if (this.config.skipNostr || ipfsResult.status === 'failed') {
      const reason = this.config.skipNostr ? 'configured skip' : 'IPFS failed';
      nostrResult = {
        stage: 'nostr',
        status: 'skipped',
        retryCount: 0,
        error: `Skipped: ${reason}`,
      };
      notify('nostr', 'skipped', reason);
    } else {
      nostrResult = await this.runStage<{ eventId: string; relaysOk: number }>(
        'nostr',
        async () => {
          const payload = params.nostrPayload ?? {
            title: 'Intel Report',
            ipfsCid: ipfsResult.data!.hash,
            solanaTx: blockchainResult.data?.transactionId,
            visibility: params.visibility,
            ...(params.cites?.length ? { cites: params.cites } : {}),
          };
          const res = await this.nostr.publishIntelReport(payload, params.nostrSigner);
          if (!res.success) throw new Error(res.error ?? 'Broadcast failed');
          return { eventId: res.eventId!, relaysOk: res.relaysOk ?? 0 };
        },
        notify
      );
    }

    // 4 — Verification (uses whatever succeeded)
    const verificationResult = await this.runStage<{ overall: string; checkCount: number }>(
      'verification',
      async () => {
        return this.verifier.verify(
          ipfsResult.data?.hash,
          blockchainResult.data?.transactionId,
          nostrResult.data?.eventId
        );
      },
      notify
    );

    const stages = {
      ipfs: ipfsResult,
      blockchain: blockchainResult,
      nostr: nostrResult,
      verification: verificationResult,
    };

    const completedAt = Date.now();

    // Determine overall outcome
    const coreStages = [ipfsResult, blockchainResult, nostrResult];
    const successCount = coreStages.filter(s => s.status === 'success').length;
    const skippedCount = coreStages.filter(s => s.status === 'skipped').length;
    const activeCount = coreStages.length - skippedCount;
    let overall: PipelineResult['overall'];
    if (successCount === activeCount && activeCount > 0) {
      overall = 'complete';
    } else if (successCount > 0) {
      overall = 'partial';
    } else {
      overall = 'failed';
    }

    const result: PipelineResult = {
      reportId: params.reportId,
      stages,
      overall,
      startedAt,
      completedAt,
    };

    log.info(`Pipeline ${overall}: ${successCount}/${activeCount} stages succeeded`, {
      reportId: params.reportId,
      durationMs: completedAt - startedAt,
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // Stage runner with retry + timeout
  // -------------------------------------------------------------------------

  private async runStage<T>(
    stage: PipelineStage,
    operation: () => Promise<T>,
    notify: StageProgressCallback
  ): Promise<PipelineStageResult<T>> {
    const maxRetries = this.config.maxRetries;
    const baseDelay = this.config.retryDelayMs;
    const timeout = this.config.stageTimeoutMs;
    let lastError: string | undefined;
    let retryCount = 0;
    const stageStart = Date.now();

    notify(stage, 'running');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await this.withTimeout(operation(), timeout);
        const durationMs = Date.now() - stageStart;

        notify(stage, 'success');
        return { stage, status: 'success', data, durationMs, retryCount };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        retryCount = attempt + 1;

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          log.warn(`Stage ${stage} attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: lastError });
          await this.sleep(delay);
        }
      }
    }

    const durationMs = Date.now() - stageStart;
    notify(stage, 'failed', lastError);
    log.error(`Stage ${stage} failed after ${retryCount} attempts`, { error: lastError });
    return { stage, status: 'failed', error: lastError, durationMs, retryCount };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      promise
        .then(v => { clearTimeout(timer); resolve(v); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
