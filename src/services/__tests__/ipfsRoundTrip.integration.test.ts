// @vitest-environment node
/**
 * IPFS Round-Trip Test (Step 2.4.5.2)
 *
 * Validates that intel data can be serialized, uploaded to IPFS, and
 * retrieved with identical content. Uses a mock IPFS backend (in-memory
 * content-addressable store) so the test is deterministic and CI-safe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// In-memory content-addressable store simulating IPFS behaviour
class MockIPFS {
  private store = new Map<string, Uint8Array>();

  async add(content: Uint8Array | string): Promise<{ cid: string }> {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const hash = createHash('sha256').update(data).digest('hex');
    const cid = `Qm${hash.slice(0, 44)}`;
    this.store.set(cid, data);
    return { cid };
  }

  async cat(cid: string): Promise<Uint8Array> {
    const data = this.store.get(cid);
    if (!data) throw new Error(`CID not found: ${cid}`);
    return data;
  }

  has(cid: string): boolean {
    return this.store.has(cid);
  }
}

describe('IPFS Round-Trip', () => {
  let ipfs: MockIPFS;

  beforeEach(() => {
    ipfs = new MockIPFS();
  });

  it('stores and retrieves a simple string payload', async () => {
    const payload = 'Hello, IPFS!';
    const { cid } = await ipfs.add(payload);

    const retrieved = await ipfs.cat(cid);
    const decoded = new TextDecoder().decode(retrieved);

    expect(decoded).toBe(payload);
  });

  it('stores and retrieves a JSON intel report', async () => {
    const report = {
      title: 'Maritime activity near Strait of Hormuz',
      latitude: 26.5667,
      longitude: 56.2500,
      tags: ['maritime', 'osint'],
      content: 'Observed increased tanker traffic.',
      timestamp: '2025-07-24T12:00:00Z',
    };

    const serialized = JSON.stringify(report);
    const { cid } = await ipfs.add(serialized);

    const retrieved = await ipfs.cat(cid);
    const deserialized = JSON.parse(new TextDecoder().decode(retrieved));

    expect(deserialized).toEqual(report);
  });

  it('produces deterministic CIDs for identical content', async () => {
    const data = 'deterministic test';
    const { cid: cid1 } = await ipfs.add(data);
    const { cid: cid2 } = await ipfs.add(data);

    expect(cid1).toBe(cid2);
  });

  it('produces different CIDs for different content', async () => {
    const { cid: cid1 } = await ipfs.add('content-a');
    const { cid: cid2 } = await ipfs.add('content-b');

    expect(cid1).not.toBe(cid2);
  });

  it('handles binary payloads (Uint8Array)', async () => {
    const binary = new Uint8Array([0x00, 0xFF, 0x42, 0xDE, 0xAD]);
    const { cid } = await ipfs.add(binary);

    const retrieved = await ipfs.cat(cid);
    expect(retrieved).toEqual(binary);
  });

  it('throws on retrieval of unknown CID', async () => {
    await expect(ipfs.cat('QmNonExistentHash')).rejects.toThrow('CID not found');
  });

  it('round-trips a large payload (100KB)', async () => {
    const largePayload = 'x'.repeat(100_000);
    const { cid } = await ipfs.add(largePayload);

    const retrieved = await ipfs.cat(cid);
    expect(new TextDecoder().decode(retrieved)).toBe(largePayload);
  });

  it('verifies CID existence after upload', async () => {
    const { cid } = await ipfs.add('check existence');
    expect(ipfs.has(cid)).toBe(true);
    expect(ipfs.has('QmBogus')).toBe(false);
  });
});
