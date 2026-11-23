/**
 * Starcom keeping an evidence capture (decision D-EX, E2, W8; EX14, EX15): each file taken from Uplink
 * one at a time and kept only if its SHA-256 is the one the capture names; the custody record signed
 * with the key this browser already has, or kept unsigned and saying so, since taking a capture in
 * happens on its own and never makes a key; and nothing kept at all when a file did not arrive whole,
 * so Uplink, never told it was kept, still holds it.
 *
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ArgsOf, Capability, Capture, EvidenceFileName, UplinkAnswer } from '../protocol';
import { bytesToBase64 } from '../bytes';
import { keepEvidence, type EvidenceKeeping } from '../keepEvidence';

const enc = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const files: Record<EvidenceFileName, Uint8Array> = { 'screenshot.png': new Uint8Array([137, 80, 78, 71]), 'page.html': enc('<p>The river rose.</p>'), 'text.txt': enc('The river rose.') };
const capture: Capture = {
  id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z', page: { url: 'https://news.example.org/flood', title: 'Flood' }, scaledTo: 1280,
  files: (Object.keys(files) as EvidenceFileName[]).map((name) => ({ name, type: 'x', size: files[name].length, sha256: sha(files[name]) })),
};

function setup(over: Partial<EvidenceKeeping> = {}, held: Partial<Record<EvidenceFileName, Uint8Array>> = files) {
  const stored = new Map<string, Blob>();
  const records = new Map<string, unknown>();
  const added: string[] = [];
  const keeping: EvidenceKeeping = {
    ask: (async <C extends Capability>(capability: C, _purpose: string, args: ArgsOf[C]) => {
      const { name } = args as { name: EvidenceFileName };
      const bytes = held[name];
      return (bytes
        ? { kind: 'answer', id: 'a', ok: true, result: { base64: bytesToBase64(bytes) } }
        : { kind: 'answer', id: 'a', ok: false, refusal: 'not-found', reason: 'Uplink holds no such file' }) as UplinkAnswer<C>;
    }) as EvidenceKeeping['ask'],
    sha256Hex: async (bytes) => sha(bytes),
    putFile: async (hash, blob) => { stored.set(hash, blob); },
    putRecord: async (itemId, record) => { records.set(itemId, record); },
    sign: vi.fn(async (event) => ({ ...event, id: 'e'.repeat(64), pubkey: 'f'.repeat(64), sig: '0'.repeat(128) })),
    addItem: (item) => { added.push(item.title); return { id: `item-${added.length}` }; },
    uplinkVersion: '0.1.0',
    ...over,
  };
  return { keeping, stored, records, added };
}

describe('keepEvidence', () => {
  it('keeps each file under its hash, signs the custody record, and makes the item', async () => {
    const t = setup();
    expect(await keepEvidence(capture, t.keeping)).toBe('item-1');
    expect([...t.stored.keys()].sort()).toEqual(capture.files!.map((f) => f.sha256).sort());
    expect(t.added).toEqual(['Evidence: Flood']);
    expect(t.records.get('item-1')).toMatchObject({ captureId: 'ev1', event: { id: 'e'.repeat(64), kind: 20097 } });
  });

  it('keeps nothing when a file did not arrive as the capture names it, so Uplink still holds it all', async () => {
    const t = setup({}, { ...files, 'text.txt': enc('The river rose 4 m.') });
    await expect(keepEvidence(capture, t.keeping)).rejects.toThrow('text.txt did not arrive as captured: its SHA-256 differs');
    expect(t.stored.size).toBe(0);
    expect(t.added).toEqual([]);
  });

  it('keeps nothing when Uplink no longer holds a file', async () => {
    const t = setup({}, { 'screenshot.png': files['screenshot.png'] });
    await expect(keepEvidence(capture, t.keeping)).rejects.toThrow('page.html could not be taken from Uplink: Uplink holds no such file');
    expect(t.added).toEqual([]);
  });

  it('keeps the record unsigned, and says so, when this browser has no key yet: it never makes one', async () => {
    const t = setup({ sign: async () => { throw new Error('No identity to sign with. Nothing was signed, and no identity was created.'); } });
    expect(await keepEvidence(capture, t.keeping)).toBe('item-1');
    expect(t.records.get('item-1')).toMatchObject({ captureId: 'ev1', unsigned: { kind: 20097 } });
    expect(t.records.get('item-1')).not.toHaveProperty('event');
  });
});
