/**
 * VerificationChainService Tests
 * Step 2.3.1 — Verification Chain
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { VerificationChainService } from '../../services/intel/VerificationChainService';
import type { IpfsChecker, BlockchainChecker, NostrChecker } from '../../services/intel/VerificationChainService';

function makeIpfs(exists = true): IpfsChecker {
  return { exists: vi.fn().mockResolvedValue(exists) };
}
function makeBlockchain(verified = true, programInvolved = true): BlockchainChecker {
  return { verify: vi.fn().mockResolvedValue({ verified, programInvolved }) };
}
function makeNostr(found = true, eventId = 'abc123'): NostrChecker {
  return { findEvent: vi.fn().mockResolvedValue({ found, eventId }) };
}

describe('VerificationChainService — Step 2.3.1', () => {

  // -----------------------------------------------------------------------
  // 2.3.1.1 — 4-check verification
  // -----------------------------------------------------------------------
  describe('2.3.1.1 — 4-check verification pipeline', () => {
    it('runs all 4 checks and returns verified when all pass', async () => {
      const svc = new VerificationChainService(makeIpfs(), makeBlockchain(), makeNostr());
      const result = await svc.verify('bafytest', 'tx-sig', 'event-id');

      expect(result.overall).toBe('verified');
      expect(result.checkCount).toBe(4);
      expect(result.ipfsExists?.passed).toBe(true);
      expect(result.cidMatches?.passed).toBe(true);
      expect(result.onChain?.passed).toBe(true);
      expect(result.nostrPublished?.passed).toBe(true);
      expect(result.lastChecked).toBeTruthy();
    });

    it('IPFS check calls exists with the CID', async () => {
      const ipfs = makeIpfs();
      const svc = new VerificationChainService(ipfs, makeBlockchain(), makeNostr());
      await svc.verify('bafytest123', 'tx-sig');
      expect(ipfs.exists).toHaveBeenCalledWith('bafytest123');
    });

    it('blockchain check calls verify with tx signature', async () => {
      const bc = makeBlockchain();
      const svc = new VerificationChainService(makeIpfs(), bc, makeNostr());
      await svc.verify('bafytest', 'solana-tx-abc');
      expect(bc.verify).toHaveBeenCalledWith('solana-tx-abc');
    });

    it('nostr check calls findEvent with CID', async () => {
      const nostr = makeNostr();
      const svc = new VerificationChainService(makeIpfs(), makeBlockchain(), nostr);
      await svc.verify('bafytest', 'tx-sig');
      expect(nostr.findEvent).toHaveBeenCalledWith('bafytest', undefined);
    });
  });

  // -----------------------------------------------------------------------
  // 2.3.1.2 — Verification status on IntelReport
  // -----------------------------------------------------------------------
  describe('2.3.1.2 — Verification status levels', () => {
    it('returns local-only when no CID and no tx', async () => {
      const svc = new VerificationChainService(makeIpfs(), makeBlockchain(), makeNostr());
      const result = await svc.verify();
      expect(result.overall).toBe('local-only');
      expect(result.checkCount).toBe(0);
    });

    it('returns unverified when all checks fail', async () => {
      const svc = new VerificationChainService(
        makeIpfs(false),
        makeBlockchain(false, false),
        makeNostr(false),
      );
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('unverified');
      expect(result.checkCount).toBe(0);
    });

    it('returns verified when all 4 checks pass', async () => {
      const svc = new VerificationChainService(makeIpfs(), makeBlockchain(), makeNostr());
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('verified');
    });
  });

  // -----------------------------------------------------------------------
  // 2.3.1.3 — Partially verified reports
  // -----------------------------------------------------------------------
  describe('2.3.1.3 — Partially verified reports', () => {
    it('returns partial when IPFS exists but blockchain fails', async () => {
      const svc = new VerificationChainService(
        makeIpfs(true),
        makeBlockchain(false, false),
        makeNostr(false),
      );
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('partial');
      expect(result.checkCount).toBe(2); // ipfsExists + cidMatches
      expect(result.ipfsExists?.passed).toBe(true);
      expect(result.cidMatches?.passed).toBe(true);
      expect(result.onChain?.passed).toBe(false);
      expect(result.nostrPublished?.passed).toBe(false);
    });

    it('returns partial when blockchain passes but IPFS missing', async () => {
      const svc = new VerificationChainService(
        makeIpfs(false),
        makeBlockchain(true, true),
        makeNostr(false),
      );
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('partial');
      expect(result.checkCount).toBe(1); // onChain only
    });

    it('returns partial when only Nostr is published', async () => {
      const svc = new VerificationChainService(
        makeIpfs(false),
        makeBlockchain(false, false),
        makeNostr(true),
      );
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('partial');
      expect(result.checkCount).toBe(1);
    });

    it('skips checks when dependencies are not injected', async () => {
      // No IPFS, no blockchain, no Nostr injected
      const svc = new VerificationChainService();
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.overall).toBe('unverified');
      expect(result.checkCount).toBe(0);
      expect(result.ipfsExists).toBeUndefined();
      expect(result.onChain).toBeUndefined();
      expect(result.nostrPublished).toBeUndefined();
    });

    it('handles IPFS error gracefully', async () => {
      const ipfs: IpfsChecker = { exists: vi.fn().mockRejectedValue(new Error('network timeout')) };
      const svc = new VerificationChainService(ipfs, makeBlockchain(), makeNostr());
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.ipfsExists?.passed).toBe(false);
      expect(result.ipfsExists?.detail).toContain('network timeout');
      // onChain and nostr still pass
      expect(result.onChain?.passed).toBe(true);
      expect(result.nostrPublished?.passed).toBe(true);
    });

    it('handles blockchain error gracefully', async () => {
      const bc: BlockchainChecker = { verify: vi.fn().mockRejectedValue(new Error('rpc error')) };
      const svc = new VerificationChainService(makeIpfs(), bc, makeNostr());
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.onChain?.passed).toBe(false);
      expect(result.onChain?.detail).toContain('rpc error');
    });

    it('handles Nostr error gracefully', async () => {
      const nostr: NostrChecker = { findEvent: vi.fn().mockRejectedValue(new Error('relay down')) };
      const svc = new VerificationChainService(makeIpfs(), makeBlockchain(), nostr);
      const result = await svc.verify('bafytest', 'tx-sig');
      expect(result.nostrPublished?.passed).toBe(false);
      expect(result.nostrPublished?.detail).toContain('relay down');
    });
  });

  // -----------------------------------------------------------------------
  // 2.3.1.4 — End-to-end (mocked)
  // -----------------------------------------------------------------------
  describe('2.3.1.4 — End-to-end verification flow', () => {
    it('full pipeline: create → verify all 4 checks', async () => {
      const ipfs = makeIpfs(true);
      const blockchain = makeBlockchain(true, true);
      const nostr = makeNostr(true, 'event-hex-id');
      const svc = new VerificationChainService(ipfs, blockchain, nostr);

      // Simulate a report that went through the full pipeline
      const ipfsCid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
      const solanaTx = '5KtPnGzRsqqWFLcABc7L4wJMf3vB4i2aT3ZRaHVG3';
      const nostrEventId = 'event-hex-id';

      const result = await svc.verify(ipfsCid, solanaTx, nostrEventId);

      expect(result.overall).toBe('verified');
      expect(result.checkCount).toBe(4);

      // All individual checks passed
      expect(result.ipfsExists?.passed).toBe(true);
      expect(result.cidMatches?.passed).toBe(true);
      expect(result.onChain?.passed).toBe(true);
      expect(result.nostrPublished?.passed).toBe(true);
      expect(result.nostrPublished?.detail).toContain('event-hex-id');

      // Verify the right arguments were passed
      expect(ipfs.exists).toHaveBeenCalledWith(ipfsCid);
      expect(blockchain.verify).toHaveBeenCalledWith(solanaTx);
      expect(nostr.findEvent).toHaveBeenCalledWith(ipfsCid, nostrEventId);
    });
  });
});
