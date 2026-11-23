/**
 * Where a sealed report goes: the recipient's NIP-17 inbox list, kind 10050, and nowhere else (decision D-MX, MX28).
 * Mecha Jono's names wss://nos.lol and wss://relay.primal.net (NavCom's mission interchange, Q10).
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inboxRelays, inboxRelaysFrom, INBOX_LIST_KIND, resetInboxRelaysForTests } from '../inboxRelays';

const KEY = 'a'.repeat(64);
const list = (created_at: number, relays: string[], pubkey = KEY) => ({
  kind: INBOX_LIST_KIND, pubkey, created_at, tags: relays.map((r) => ['relay', r]),
});

describe('inboxRelaysFrom', () => {
  it('reads the newest list this key signed, each relay once', () => {
    expect(inboxRelaysFrom([
      list(100, ['wss://old.example']),
      list(200, ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nos.lol']),
    ], KEY)).toEqual(['wss://nos.lol', 'wss://relay.primal.net']);
  });

  it('takes no list another key signed, nor anything but a wss address', () => {
    expect(inboxRelaysFrom([list(300, ['wss://mallory.example'], 'b'.repeat(64))], KEY)).toEqual([]);
    expect(inboxRelaysFrom([list(100, ['ws://plain.example', 'https://nos.lol', 'wss://nos.lol'])], KEY)).toEqual(['wss://nos.lol']);
    expect(inboxRelaysFrom([{ ...list(100, []), kind: 3 }], KEY)).toEqual([]);
  });
});

describe('inboxRelays', () => {
  beforeEach(() => { resetInboxRelaysForTests(); });

  it('asks for the key\'s inbox list once, and holds what it found for the session', async () => {
    const read = vi.fn(async () => [list(200, ['wss://nos.lol'])] as never);
    expect(await inboxRelays(KEY, read)).toEqual(['wss://nos.lol']);
    expect(await inboxRelays(KEY, read)).toEqual(['wss://nos.lol']);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][1]).toEqual({ kinds: [INBOX_LIST_KIND], authors: [KEY], limit: 1 });
  });

  it('is empty when no list answers, or the read fails, and asks again next time', async () => {
    const read = vi.fn(async () => [] as never);
    expect(await inboxRelays(KEY, read)).toEqual([]);
    expect(await inboxRelays(KEY, vi.fn(async () => { throw new Error('offline'); }))).toEqual([]);
    expect(await inboxRelays(KEY, read)).toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
