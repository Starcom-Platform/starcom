/**
 * Where a sealed chat message goes (plan item 2.7): the relays that can reach
 * its recipients and, unless this build names internal relays, the chat
 * relays, which everyone's sealed inbox reads. A build with internal relays
 * (the cohort's) keeps chat off public relays altogether.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { chatRelaysFor, emitSealedChat, subscribeSealedChat, type SealedChatMessage } from '../sealedChat';
import { chatProviderRelays } from '../../nostr/publishTargets';

afterEach(() => { delete process.env.VITE_NOSTR_INTERNAL_RELAYS; });

describe('where a chat message goes', () => {
  it('over the chat relays too, when this build names no internal relay', () => {
    expect(chatRelaysFor(['b'.repeat(64)])).toEqual(chatProviderRelays());
  });

  it('only over the internal relays when this build names them', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://relay.internal.example';
    expect(chatRelaysFor(['b'.repeat(64)])).toEqual(['wss://relay.internal.example']);
  });
});

describe('a message that arrives before a screen shows it', () => {
  it('is told to each screen that opens later this session, not lost at startup', () => {
    const early: SealedChatMessage = { id: 'e1', senderId: 'c'.repeat(64), recipients: [], content: 'First.', timestamp: 1, postQuantum: true, decryptionFailed: false };
    emitSealedChat(early);
    const directWindows: SealedChatMessage[] = [];
    const teamTab: SealedChatMessage[] = [];
    const stopA = subscribeSealedChat((m) => directWindows.push(m));
    const stopB = subscribeSealedChat((m) => teamTab.push(m));
    expect(directWindows).toEqual([early]);
    expect(teamTab).toEqual([early]);
    stopA(); stopB();
  });
});
