/**
 * The verifier a portfolio carries in its own page (decision D-EX, EX12, EX29): every signed event
 * checked offline, with no library, in the advisor's browser. Checked here against events nostr-tools
 * signed: a signed event passes; one with its words, its date, its key or its signature changed fails;
 * and the function still works copied out of this module into a page by its source alone.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { verifyNostrEvents } from '../portfolioVerifier';

const signed = (content: string, kind = 30023, tags: string[][] = [['t', 'starcom_intel']]) =>
  finalizeEvent({ kind, created_at: 1_791_800_000, tags, content }, generateSecretKey());

describe('verifyNostrEvents', () => {
  it('passes events nostr-tools signed, whatever their words', async () => {
    const events = [signed('The river rose 3 m overnight.'), signed('Ünïcödé «quotes» \\ "and" \n lines 号', 1111, [['e', 'a'.repeat(64)]]), signed('')];
    expect(await verifyNostrEvents(events)).toEqual(events.map((e) => ({ id: e.id, ok: true })));
  });

  it('fails an event whose words, date, key or signature were changed, and says which part', async () => {
    const e = signed('The river rose 3 m overnight.');
    const other = getPublicKey(generateSecretKey());
    const results = await verifyNostrEvents([
      { ...e, content: 'The river rose 4 m overnight.' },
      { ...e, created_at: e.created_at + 1 },
      { ...e, pubkey: other },
      { ...e, sig: `${e.sig.slice(0, 127)}${e.sig[127] === '0' ? '1' : '0'}` },
    ]);
    expect(results.map((r) => r.ok)).toEqual([false, false, false, false]);
    expect(results[0].why).toBe('its id is not the hash of its contents');
    expect(results[3].why).toBe('its signature does not check');
  });

  it('refuses what is not an event at all, without throwing', async () => {
    const results = await verifyNostrEvents([{ id: 'x' } as never]);
    expect(results).toEqual([{ id: 'x', ok: false, why: 'it is not a signed event' }]);
  });

  it('works from its source alone, as a portfolio page carries it', async () => {
    const copied = new Function(`return ${verifyNostrEvents.toString()}`)() as typeof verifyNostrEvents;
    const e = signed('Copied into a page.');
    expect(await copied([e, { ...e, content: 'changed' }])).toEqual([{ id: e.id, ok: true }, { id: e.id, ok: false, why: 'its id is not the hash of its contents' }]);
  });
});
