/**
 * A bundle in parts, each small enough for one gift wrap (plan item 2.4,
 * slice d). NIP-44 encrypts at most 65,535 bytes, and a wrap holds a seal
 * that holds the part, so a part stays well under that: the signed manifest
 * first, then the envelopes packed in order.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { partsOf, assemble, PART_BUDGET, TooLargeForARelay } from '../bundleParts';
import type { BundleFile, RecordEnvelope } from '../../../exchange/bundle';

const envelope = (id: string, size: number): RecordEnvelope => ({
  type: 'report', id, updatedAt: '2026-09-27T12:00:00.000Z', sha256: 'a'.repeat(64),
  record: { id, title: `Report ${id}`, content: 'x'.repeat(size) },
});
const file = (envelopes: RecordEnvelope[]): BundleFile => ({
  format: 'starcom.bundle', version: 1, envelopes,
  manifest: { id: 'b'.repeat(64), kind: 20093, pubkey: 'c'.repeat(64), created_at: 1790500000, tags: [], content: JSON.stringify({ records: [], signature: { sig: 'd'.repeat(6618) } }), sig: 'e'.repeat(128) },
});
const bytes = (text: string) => new TextEncoder().encode(text).length;

describe('a bundle in parts', () => {
  it('comes back whole from its parts, in any order', () => {
    const whole = file([envelope('r1', 100), envelope('r2', 100), envelope('r3', 100)]);
    const parts = partsOf(whole);
    expect(parts.length).toBe(2);
    expect(assemble([...parts].reverse())).toEqual(whole);
  });

  it('keeps every part within what one wrap can carry, splitting as it must', () => {
    const whole = file(Array.from({ length: 12 }, (_, i) => envelope(`r${i}`, 9_000)));
    const parts = partsOf(whole);
    expect(parts.length).toBeGreaterThan(3);
    for (const part of parts) expect(bytes(JSON.stringify(part))).toBeLessThanOrEqual(PART_BUDGET + 500);
    expect(assemble(parts)).toEqual(whole);
  });

  it('names each part by its bundle and its place, so the parts of two bundles never mix', () => {
    const parts = partsOf(file([envelope('r1', 10)]));
    expect(parts[0].tags).toEqual([['bundle', 'b'.repeat(64)], ['part', '0', '2']]);
    expect(parts[1].tags).toEqual([['bundle', 'b'.repeat(64)], ['part', '1', '2']]);
  });

  it('is not whole while any part is missing', () => {
    const parts = partsOf(file([envelope('r1', 30_000), envelope('r2', 30_000), envelope('r3', 30_000)]));
    expect(parts.length).toBe(4);
    expect(assemble(parts.slice(0, 3))).toBeNull();
    expect(assemble(parts.slice(1))).toBeNull();
  });

  it('says which record is too large to go over a relay, and that a file can carry it', () => {
    expect(() => partsOf(file([envelope('r1', 100), { ...envelope('huge', 60_000), record: { id: 'huge', title: 'Port camera archive', content: 'x'.repeat(60_000) } }])))
      .toThrow(TooLargeForARelay);
    expect(() => partsOf(file([envelope('huge', 60_000)]))).toThrow(/too large to send over a relay.*as a file/);
  });
});
