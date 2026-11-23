/**
 * Mecha Jono's live Psi Watch notes (plan step 5a): only their new key's, read from now (the owner, 3 Nov: no waiting
 * for the key change), the newest of each address, and the kit stepping aside a family at a time.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LivePsiStore, mergeKitAndLive, resetLivePsiForTests, startLivePsi, type LiveNote } from '../livePsi';
import type { KitFixture } from '../kitFixtures';
import type { PsiNote } from '../psiEvents';

const SIGNER = '86f824c3f1e67c60b1dc15ce110648c4de5c3fb879022fbbcc5e8deb720e402c';
const NOW = Math.floor(Date.parse('2026-11-03T12:00:00Z') / 1000);
const note = (over: Partial<PsiNote> & { family?: string; d?: string } = {}): PsiNote => {
  const { family, d, ...rest } = over;
  return {
    kind: 30023,
    pubkey: SIGNER,
    created_at: NOW,
    content: '',
    tags: [['d', d ?? 'psi-field-1'], ['t', 'psi_watch'], ['t', family ?? 'psi_field']],
    ...rest,
  } as PsiNote;
};

afterEach(() => resetLivePsiForTests());

describe("Mecha Jono's live Psi notes", () => {
  it('reads The Record from now: one read, by the new key and the psi_watch topic, in the kit\'s three kinds', () => {
    const pool = { subscribeMany: vi.fn(() => ({ close: vi.fn() })) };
    const stop = startLivePsi({ pool: pool as never, relays: ['wss://example'] });
    const again = startLivePsi({ pool: pool as never, relays: ['wss://example'] });
    expect(pool.subscribeMany).toHaveBeenCalled();
    const filters = (pool.subscribeMany.mock.calls as unknown as Array<[unknown, Array<{ kinds: number[]; authors: string[]; '#t': string[] }>]>)
      .flatMap((call) => call[1]);
    expect(new Set(filters.flatMap((f) => f.kinds))).toEqual(new Set([30023, 30079, 31923]));
    expect(filters.every((f) => f.authors.length === 1 && f.authors[0] === SIGNER && f['#t'][0] === 'psi_watch')).toBe(true);
    stop();
    again();
  });

  it("keeps only the new key's Psi notes, the newest of each address", () => {
    const store = new LivePsiStore();
    expect(store.accept(note({ pubkey: 'f'.repeat(64) }))).toBe(false);
    expect(store.accept(note({ tags: [['d', 'x'], ['t', 'raver_watch']] }))).toBe(false);
    expect(store.accept(note())).toBe(true);
    expect(store.accept(note({ created_at: NOW - 10 }))).toBe(false);
    expect(store.accept(note({ created_at: NOW + 10, content: 'newer' }))).toBe(true);
    expect(store.notes()).toHaveLength(1);
    expect(store.notes()[0].event.content).toBe('newer');
  });

  it('lets the kit step aside a family at a time', () => {
    const kit = [
      { file: 'psi_field.json', family: 'psi_field', event: note() },
      { file: 'psi_sky_event.lunation.json', family: 'psi_sky_event', event: note({ kind: 31923, family: 'psi_sky_event', d: 'sky' }) },
    ] as unknown as KitFixture[];
    const live = [{ family: 'psi_field', event: note({ d: 'live-field' }) }] as unknown as LiveNote[];
    const merged = mergeKitAndLive(kit, live);
    expect(merged.map((f) => f.file)).toEqual(['psi_sky_event.lunation.json', `30023:${SIGNER}:live-field`]);
    expect(mergeKitAndLive(kit, [])).toEqual(kit);
  });
});
