/**
 * Completing an evidence capture's timestamps (decision D-EX, EX18, W8c follow-up), on real data: the
 * calendars are asked for each proof's completed part, only the calendars Starcom knows, and the block
 * it reaches is checked with two block explorers before anything is called proven.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { completeTimestamps, type CompletionDeps } from '../completeTimestamps';
import { base64ToBytes, bytesToBase64 } from '../bytes';
import type { Capture } from '../protocol';
import { bitcoinAnchors, detachedProof, readDetachedProof, varuint } from '../uplink/opentimestamps';
import { OTS_FIXTURE } from './fixtures/otsUpgrade';

const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const capture = (proof = OTS_FIXTURE.pendingProof): Capture => ({
  id: 'c1', kind: 'evidence', at: '2026-10-12T04:48:00.000Z', page: { url: 'https://example.org/' },
  files: [{ name: 'text.txt', type: 'text/plain', size: 15, sha256: OTS_FIXTURE.fileSha256 }],
  timestamps: { calendars: ['https://alice.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com'], at: '2026-10-12T04:48:01.000Z', proofs: { 'text.txt': proof } },
});
const BLOCK = { hash: OTS_FIXTURE.block.hash, merkleRoot: OTS_FIXTURE.block.merkleRoot, minedAt: OTS_FIXTURE.block.minedAt };

function deps(over: Partial<CompletionDeps> = {}): CompletionDeps & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    calendar: vi.fn(async (url: string) => {
      asked.push(url);
      const base = Object.keys(OTS_FIXTURE.answers).find((c) => url.startsWith(`${c}/timestamp/`));
      return base ? base64ToBytes(OTS_FIXTURE.answers[base]) : null;
    }),
    blocks: vi.fn(async () => [{ source: 'mempool.space', ...BLOCK }, { source: 'blockstream.info', ...BLOCK }]),
    sha256,
    now: () => new Date('2026-10-12T08:00:00.000Z'),
    ...over,
  };
}

describe('completeTimestamps', () => {
  it('completes each proof, checks the block with both explorers, and keeps the completed proofs', async () => {
    const d = deps();
    const done = await completeTimestamps(capture(), d);
    expect(done).toMatchObject({
      anchored: {
        checkedAt: '2026-10-12T08:00:00.000Z',
        block: { height: 971047, hash: OTS_FIXTURE.block.hash, merkleRoot: OTS_FIXTURE.block.merkleRoot, minedAt: '2026-10-12T05:02:23Z', checkedWith: ['mempool.space', 'blockstream.info'] },
      },
    });
    const kept = (done as { anchored: { proofs: Record<string, string> } }).anchored.proofs['text.txt'];
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(kept));
    expect(await bitcoinAnchors(timestamp, fileHash, sha256)).toEqual([{ height: 971047, merkleRoot: OTS_FIXTURE.block.merkleRoot }]);
    expect(d.asked).toHaveLength(2);
    expect(d.asked.every((u) => /^https:\/\/(alice\.btc\.calendar\.opentimestamps\.org|finney\.calendar\.eternitywall\.com)\/timestamp\/[0-9a-f]+$/.test(u))).toBe(true);
  });

  it('says there is no finished proof yet while the calendars give nothing complete, without claiming why', async () => {
    const done = await completeTimestamps(capture(), deps({ calendar: async () => null }));
    expect(done).toEqual({ pending: 'No finished proof yet: Bitcoin may not have confirmed it, or a calendar could not be read. Try again in a few hours.' });
  });

  it('refuses to call it proven when an explorer shows another merkle root for that block', async () => {
    const done = await completeTimestamps(capture(), deps({
      blocks: async () => [{ source: 'mempool.space', ...BLOCK }, { source: 'blockstream.info', ...BLOCK, merkleRoot: 'f'.repeat(64) }],
    }));
    expect(done).toEqual({ failed: 'The proof does NOT match block 971047 as blockstream.info shows it.' });
  });

  it('says it could not check when no explorer answered, rather than calling it proven', async () => {
    const done = await completeTimestamps(capture(), deps({ blocks: async () => [] }));
    expect(done).toEqual({ failed: 'Could not check block 971047: no block explorer answered.' });
  });

  it('says no calendar answered when every calendar refused, never "no finished proof yet"', async () => {
    const done = await completeTimestamps(capture(), deps({ calendar: async () => { throw new Error('alice.btc.calendar.opentimestamps.org answered 503'); } }));
    expect(done).toEqual({ failed: 'No calendar answered: alice.btc.calendar.opentimestamps.org answered 503' });
  });

  it('refuses a proof made for another file', async () => {
    const other = capture();
    other.files![0].sha256 = 'a'.repeat(64);
    expect(await completeTimestamps(other, deps())).toEqual({ failed: 'The proof for text.txt is for another file.' });
  });

  it('asks only the calendars Starcom knows, whatever a proof names', async () => {
    // A proof that also says "pending at evil.example": its own data never chooses where Starcom goes.
    const { fileHash, timestamp } = readDetachedProof(base64ToBytes(OTS_FIXTURE.pendingProof));
    const uri = new TextEncoder().encode('https://evil.example');
    const PENDING = Uint8Array.from([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]);
    timestamp.attestations.push({ tag: PENDING, payload: Uint8Array.from([...varuint(uri.length), ...uri]) });
    const planted = bytesToBase64(detachedProof(fileHash, timestamp));
    const d = deps({ calendar: vi.fn(async () => null) });
    await completeTimestamps(capture(planted), d);
    const asked = (d.calendar as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));
    expect(asked).toHaveLength(2);
    expect(asked.some((u) => u.includes('evil.example'))).toBe(false);
  });

  it('says so when the evidence has no proofs', async () => {
    expect(await completeTimestamps({ ...capture(), timestamps: { ...capture().timestamps!, proofs: {} } }, deps()))
      .toEqual({ failed: 'This evidence has no timestamp proofs.' });
  });
});
