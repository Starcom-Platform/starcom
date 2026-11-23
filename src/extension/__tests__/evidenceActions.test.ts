/**
 * What the person does with kept evidence (decision D-EX, E2, W8; EX15): check its files again against
 * the hashes its custody record names, and sign a record that came in unsigned, with their own key, at
 * their own click, which may make the key.
 *
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { recheckEvidence, signEvidence } from '../evidenceActions';
import { custodyEvent, custodyRecord } from '../evidenceItems';
import type { KeptCustody } from '../keepEvidence';
import type { Capture } from '../protocol';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const enc = (s: string) => new TextEncoder().encode(s);
const kept = { 'page.html': enc('<p>The river rose.</p>'), 'text.txt': enc('The river rose.') };
const capture: Capture = {
  id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z', page: { url: 'https://news.example.org/flood', title: 'Flood' },
  files: [
    { name: 'page.html', type: 'text/html', size: kept['page.html'].length, sha256: sha(kept['page.html']) },
    { name: 'text.txt', type: 'text/plain', size: kept['text.txt'].length, sha256: sha(kept['text.txt']) },
  ],
};

describe('recheckEvidence', () => {
  it('says of each file whether it still matches its hash, and which is missing', async () => {
    const files = new Map([[capture.files![0].sha256, new Blob([kept['page.html']])]]);
    const result = await recheckEvidence(capture, {
      getFile: async (hash) => files.get(hash),
      sha256Hex: async (bytes) => sha(bytes),
    });
    expect(result).toEqual([{ name: 'page.html', state: 'matches' }, { name: 'text.txt', state: 'missing' }]);
    files.set(capture.files![1].sha256, new Blob([enc('The river rose 4 m.')]));
    expect((await recheckEvidence(capture, { getFile: async (h) => files.get(h), sha256Hex: async (b) => sha(b) }))[1]).toEqual({ name: 'text.txt', state: 'differs' });
  });
});

describe('signEvidence', () => {
  it('signs the record the evidence came in with, keeps it signed, and says so in the item', async () => {
    const unsigned = custodyEvent(custodyRecord(capture, '0.1.0'));
    let record: KeptCustody = { captureId: 'ev1', capture, unsigned };
    let content = 'The custody record is not signed yet: this browser had no Starcom key when it came in.';
    const sign = vi.fn(async (event) => ({ ...event, id: 'e'.repeat(64), pubkey: 'f'.repeat(64), sig: '0'.repeat(128) }));
    const event = await signEvidence('item-1', {
      getRecord: async () => record,
      putRecord: async (_id, next) => { record = next; },
      sign,
      updateItemContent: (_id, next) => { content = next; },
    });
    expect(sign).toHaveBeenCalledWith(unsigned);
    expect(event.id).toBe('e'.repeat(64));
    expect(record).toEqual({ captureId: 'ev1', capture, event });
    expect(content).toContain(`Custody record ${'e'.repeat(64)}, signed by ${'f'.repeat(64)}.`);
  });

  it('keeps what else the record holds, its completed timestamps among it', async () => {
    const unsigned = custodyEvent(custodyRecord(capture, '0.1.0'));
    const anchored = { checkedAt: '2026-10-12T08:00:00.000Z', block: { height: 971047, hash: 'h', merkleRoot: 'm', minedAt: '2026-10-12T05:02:23Z', checkedWith: ['mempool.space'] }, proofs: {} };
    let record: KeptCustody = { captureId: 'ev1', capture, unsigned, anchored };
    const event = await signEvidence('item-1', {
      getRecord: async () => record,
      putRecord: async (_id, next) => { record = next; },
      sign: async (e) => ({ ...e, id: 'e'.repeat(64), pubkey: 'f'.repeat(64), sig: '0'.repeat(128) }),
      updateItemContent: () => {},
    });
    expect(record).toEqual({ captureId: 'ev1', capture, event, anchored });
  });

  it('refuses a record already signed: a custody record is signed once, when it is first owned', async () => {
    const record: KeptCustody = { captureId: 'ev1', capture, event: { id: 'e', pubkey: 'f', sig: 's', kind: 20097, created_at: 1, tags: [], content: '' } };
    await expect(signEvidence('item-1', { getRecord: async () => record, putRecord: async () => {}, sign: vi.fn(), updateItemContent: () => {} }))
      .rejects.toThrow('This evidence is signed already');
  });
});
