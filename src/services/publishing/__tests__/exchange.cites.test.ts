/**
 * The Exchange's review shows what the announcement cites, and sends exactly
 * that (decision D-MX: MX3, MX22).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const publish = vi.fn(async () => ({ id: 'pub-1', url: 'https://example.test/p/pub-1' }));
vi.mock('../../exchange/PublishAdapter', () => ({ publishAdapter: { publish: (...a: unknown[]) => publish(...(a as [])) } }));

import { reviewExchangePackage } from '../exchange';
import { currentReview, decideReview } from '../publishReview';
import type { PackageManifest } from '../../exchange/types';

const A = 'a'.repeat(64);
const RELAY = 'wss://relay.example';
const manifest = { id: 'pkg-1', name: 'Seen at the anchor', assets: [], reports: [], visibility: 'public' } as unknown as PackageManifest;

afterEach(async () => {
  publish.mockClear();
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe("the Exchange's review", () => {
  it('lists each observation the announcement cites, and sends exactly those', async () => {
    const outcome = reviewExchangePackage(manifest, [{ eventId: A, relay: RELAY }]);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    const cited = currentReview()!.content.fields.filter((f) => /^Cites/.test(f.label));
    expect(cited).toHaveLength(1);
    expect(cited[0].value).toContain(A.slice(0, 8));
    expect(cited[0].value).toContain(RELAY);
    // Confirmed as a person confirms it, the publisher statement acknowledged.
    decideReview(currentReview()!.id, true, { acknowledged: true });
    await outcome;
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ manifest, cites: [{ eventId: A, relay: RELAY }] }));
  });

  it('warns of no long number for an id whose hex digits begin or end in numerals', async () => {
    const id = `36480614${'a'.repeat(50)}123456`;
    const outcome = reviewExchangePackage(manifest, [{ eventId: id }]);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    expect(currentReview()!.content.fields.find((f) => f.label === 'Cites')?.value).toContain(id);
    expect(currentReview()!.highlights.filter((h) => h.kind === 'long-number')).toEqual([]);
    decideReview(currentReview()!.id, false);
    expect(await outcome).toBeNull();
  });

  it('lists nothing as cited for a package that rests on nothing', async () => {
    const outcome = reviewExchangePackage(manifest);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    expect(currentReview()!.content.fields.some((f) => /^Cites/.test(f.label))).toBe(false);
    decideReview(currentReview()!.id, false);
    expect(await outcome).toBeNull();
  });
});
