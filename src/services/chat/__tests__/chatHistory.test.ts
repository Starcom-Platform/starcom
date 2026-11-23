/**
 * Chat history that survives a reload (plan item 2.7). The sealed inbox
 * opens each wrap once and remembers that it did, because a post-quantum
 * message cannot be opened twice: so a message must be kept when it is
 * opened, or a reload loses it for good. check:chat found exactly that: B
 * received A's team message on the join page, then opened the Team Chat tab,
 * which reloaded the app, and the message was gone.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import type { SealedChatMessage } from '../sealedChat';

const message = (over: Partial<SealedChatMessage>): SealedChatMessage => ({
  id: 'm1', senderId: 'c'.repeat(64), recipients: ['a'.repeat(64)], content: 'Night loading confirmed.', timestamp: 1790520000000,
  postQuantum: true, decryptionFailed: false, team: 'wss://relay.newark.example', ...over,
});
const collect = async (subscribe: (l: (m: SealedChatMessage) => void) => () => void) => {
  const seen: SealedChatMessage[] = [];
  const stop = subscribe((m) => seen.push(m));
  await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 50));
  stop();
  return seen;
};

describe('chat history', () => {
  it('tells a screen, after a reload, what arrived before it', async () => {
    vi.resetModules();
    (await import('../sealedChat')).emitSealedChat(message({}));

    // A reload: this session's memory is gone; what was kept is not.
    vi.resetModules();
    const after = await import('../sealedChat');
    expect(await collect(after.subscribeSealedChat)).toEqual([message({})]);
  });

  it('keeps what you sent, for after a reload, without telling it to the screen that already shows it', async () => {
    vi.resetModules();
    const now = await import('../sealedChat');
    const live: SealedChatMessage[] = [];
    const stop = now.subscribeSealedChat((m) => live.push(m));
    await now.rememberSentChat(message({ id: 'mine-1', senderId: 'a'.repeat(64), content: 'On my way.' }));
    await new Promise((r) => setTimeout(r, 50));
    stop();
    expect(live.some((m) => m.id === 'mine-1')).toBe(false);

    vi.resetModules();
    const after = await import('../sealedChat');
    expect((await collect(after.subscribeSealedChat)).map((m) => m.id)).toContain('mine-1');
  });
});
