import { ComposeResult } from './types';
import { IntelPipelineOrchestrator } from '../intel/IntelPipelineOrchestrator';
import ipfsService from '../IPFSService';
import { NostrIntelBroadcastService } from '../intel/NostrIntelBroadcastService';
import { VerificationChainService } from '../intel/VerificationChainService';
import { createLogger } from '@utils/logger';
import { nostrIdentityService } from '../identity/NostrIdentityService';

const log = createLogger({ prefix: 'PublishAdapter' });

export interface PublishResponse {
  id: string;
  url?: string;
  /**
   * Whether the report was successfully broadcast to Nostr relays.
   * Undefined for MockPublishAdapter (no pipeline was actually run).
   * Deliberately not surfacing the pipeline's `verification` stage
   * here yet — VerificationChainService currently runs with no checker
   * adapters wired in, so it would always report a static "0/4,
   * unverified" regardless of what actually happened, which isn't a
   * meaningful signal to show a user.
   */
  nostrPublished?: boolean;
  /** How many relays took the announcement, when it was published. */
  relaysOk?: number;
  /** Why it was not, when no relay took it (plan item 9.3). */
  nostrError?: string;
}

export interface PublishAdapter {
  publish(pkg: ComposeResult): Promise<PublishResponse>;
}

export class MockPublishAdapter implements PublishAdapter {
  async publish(pkg: ComposeResult): Promise<PublishResponse> {
    // simulate latency
    await new Promise(r => setTimeout(r, 50));
    const id = pkg.manifest.id;
    return { id, url: `https://mock.exchange/packages/${id}` };
  }
}

/**
 * Real publish adapter — runs the composed package through the actual
 * IPFS -> blockchain -> Nostr -> verification pipeline instead of
 * simulating a delay and returning a fake mock.exchange URL.
 *
 * Reuses the app-wide `ipfsService` singleton (the same instance
 * `bootstrap.ts` registers and initializes at startup) rather than
 * constructing a second IPFSService — a fresh instance would run its
 * own separate Helia client init and storage state, disconnected from
 * the one the rest of the app already uses.
 *
 * Blockchain anchoring is gone rather than skipped. It was configured off
 * here for a good reason — no wallet-signing UI existed, so it failed
 * structurally on every attempt — and the honest conclusion was that a
 * permanently-skipped stage is not a stage. Anchoring bought one property,
 * proof a hash existed before a given time, which nothing in this pipeline
 * consumes, in exchange for a funded wallet and a permanent public
 * transaction. If the property is wanted, OpenTimestamps supplies it free via
 * Bitcoin with no wallet and no chain SDK, and would be its own stage.
 * IPFS upload, Nostr broadcast, and verification all run for real.
 */
export class IntelPipelinePublishAdapter implements PublishAdapter {
  private readonly orchestrator = new IntelPipelineOrchestrator(
    ipfsService,
    null, // no anchorer ships — see IntelPipelineOrchestrator.BlockchainAnchorer
    new NostrIntelBroadcastService(),
    new VerificationChainService(),
  );

  async publish(pkg: ComposeResult): Promise<PublishResponse> {
    const { manifest } = pkg;

    const result = await this.orchestrator.execute({
      reportId: manifest.id,
      pkg: manifest,
      creator: manifest.author,
      visibility: manifest.visibility,
      // Signed as this app's identity. With no signer the broadcaster looked only
      // for a browser extension, and without one no announcement was ever signed
      // (found by plan item 9.3's check in a browser).
      nostrSigner: nostrIdentityService.asSigner(),
      // What its report rests on, cited on the announcement (D-MX, MX22).
      ...(pkg.cites?.length ? { cites: pkg.cites } : {}),
    });

    const ipfs = result.stages.ipfs;
    if (ipfs.status !== 'success' || !ipfs.data) {
      throw new Error(ipfs.error || 'IPFS upload failed');
    }

    if (result.stages.nostr.status === 'failed') {
      log.warn('Nostr broadcast failed for', manifest.id, '-', result.stages.nostr.error);
    }

    const nostr = result.stages.nostr;
    return {
      id: manifest.id,
      url: ipfs.data.url,
      nostrPublished: nostr.status === 'success',
      ...(nostr.status === 'success' ? { relaysOk: nostr.data?.relaysOk ?? 0 } : { nostrError: nostr.error }),
    };
  }
}

export const publishAdapter: PublishAdapter = new IntelPipelinePublishAdapter();
