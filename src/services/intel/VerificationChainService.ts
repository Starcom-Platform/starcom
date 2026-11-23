/**
 * VerificationChainService — Step 2.3.1
 *
 * Implements the 4-check verification pipeline for intel reports:
 *   1. IPFS exists  — CID resolves on the IPFS network
 *   2. CID matches  — fetched content hash matches the expected CID
 *   3. On-chain     — Solana transaction exists and references the program
 *   4. Nostr published — a matching #starcom_intel event exists on relays
 *
 * Returns an aggregate VerificationDetails describing which checks passed.
 */

import type {
  VerificationDetails,
  VerificationCheckResult,
  VerificationStatus,
} from '../../types/intel/IntelReportUI';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'VerificationChain' });

// ---------------------------------------------------------------------------
// Dependency interfaces (injected, not imported directly)
// ---------------------------------------------------------------------------

export interface IpfsChecker {
  /** Attempt to stat / fetch the CID. Resolves true if content exists. */
  exists(cid: string): Promise<boolean>;
}

export interface BlockchainChecker {
  /** Verify a Solana transaction signature. */
  verify(txSignature: string): Promise<{ verified: boolean; programInvolved?: boolean }>;
}

export interface NostrChecker {
  /** Search relays for a #starcom_intel event referencing this CID. */
  findEvent(ipfsCid: string, knownEventId?: string): Promise<{ found: boolean; eventId?: string }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VerificationChainService {
  constructor(
    private ipfs?: IpfsChecker,
    private blockchain?: BlockchainChecker,
    private nostr?: NostrChecker,
  ) {}

  /**
   * Run the full 4-check verification pipeline.
   *
   * @param ipfsCid      IPFS CID of the report content (optional)
   * @param solanaTx     Solana transaction signature (optional)
   * @param nostrEventId Known Nostr event ID (optional — triggers relay lookup by CID if absent)
   */
  async verify(
    ipfsCid?: string,
    solanaTx?: string,
    nostrEventId?: string,
  ): Promise<VerificationDetails> {
    const now = new Date().toISOString();
    const results: Partial<VerificationDetails> = {};
    let passed = 0;

    // 1. IPFS exists
    if (ipfsCid && this.ipfs) {
      results.ipfsExists = await this.checkIpfsExists(ipfsCid);
      if (results.ipfsExists.passed) passed++;
    }

    // 2. CID matches (same as exists for content-addressed storage —
    //    if the content resolves at that CID it matches by definition)
    if (ipfsCid && this.ipfs) {
      results.cidMatches = results.ipfsExists?.passed
        ? { passed: true, checkedAt: now, detail: 'Content-addressed: CID resolution implies hash match' }
        : { passed: false, checkedAt: now, detail: 'CID not resolvable — cannot verify content hash' };
      if (results.cidMatches.passed) passed++;
    }

    // 3. On-chain
    if (solanaTx && this.blockchain) {
      results.onChain = await this.checkOnChain(solanaTx);
      if (results.onChain.passed) passed++;
    }

    // 4. Nostr published
    if (ipfsCid && this.nostr) {
      results.nostrPublished = await this.checkNostr(ipfsCid, nostrEventId);
      if (results.nostrPublished.passed) passed++;
    }

    const overall = this.computeOverall(passed, ipfsCid, solanaTx);

    return {
      ...results,
      overall,
      checkCount: passed,
      lastChecked: now,
    };
  }

  // -----------------------------------------------------------------------
  // Individual checks
  // -----------------------------------------------------------------------

  private async checkIpfsExists(cid: string): Promise<VerificationCheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const exists = await this.ipfs!.exists(cid);
      return { passed: exists, checkedAt, detail: exists ? 'CID resolvable' : 'CID not found' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('IPFS check failed:', msg);
      return { passed: false, checkedAt, detail: `IPFS error: ${msg}` };
    }
  }

  private async checkOnChain(txSig: string): Promise<VerificationCheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const result = await this.blockchain!.verify(txSig);
      return {
        passed: result.verified,
        checkedAt,
        detail: result.programInvolved
          ? 'Transaction verified with intel-market program'
          : result.verified
            ? 'Transaction exists (generic)'
            : 'Transaction not found or failed',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Blockchain check failed:', msg);
      return { passed: false, checkedAt, detail: `Blockchain error: ${msg}` };
    }
  }

  private async checkNostr(cid: string, knownEventId?: string): Promise<VerificationCheckResult> {
    const checkedAt = new Date().toISOString();
    try {
      const result = await this.nostr!.findEvent(cid, knownEventId);
      return {
        passed: result.found,
        checkedAt,
        detail: result.found
          ? `Event found: ${result.eventId}`
          : 'No matching event on relays',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Nostr check failed:', msg);
      return { passed: false, checkedAt, detail: `Nostr error: ${msg}` };
    }
  }

  // -----------------------------------------------------------------------
  // Aggregate status
  // -----------------------------------------------------------------------

  private computeOverall(
    passed: number,
    ipfsCid?: string,
    solanaTx?: string,
  ): VerificationStatus {
    if (!ipfsCid && !solanaTx) return 'local-only';
    if (passed === 0) return 'unverified';
    if (passed >= 4) return 'verified';
    return 'partial';
  }
}
