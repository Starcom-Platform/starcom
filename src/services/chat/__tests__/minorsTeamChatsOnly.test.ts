/**
 * Minors: team chats only (decision D-RS, RS48; rlsh-minors.md, rule 3, from Scouting's no one-on-one contact).
 * Someone who said 13 to 17 sends no one-to-one sealed message and is shown none; a team message counts only when
 * it names a team and reaches at least two people besides its sender, so no one is ever alone with them.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emitSealedChat, sendSealedChat, subscribeSealedChat, MINOR_DIRECT_REFUSAL, type SealedChatMessage } from '../sealedChat';
import { resetAge, setAgeAnswer } from '../../identity/ageAnswer';

const msg = (over: Partial<SealedChatMessage> = {}): SealedChatMessage => ({
  id: Math.random().toString(16).slice(2), senderId: 'a'.repeat(64), recipients: ['b'.repeat(64)], content: 'hello',
  timestamp: 1, postQuantum: false, decryptionFailed: false, ...over,
});

beforeEach(() => resetAge());

describe('minors: team chats only', () => {
  it('sends no one-to-one message for someone 13 to 17, before anything is sealed', async () => {
    setAgeAnswer('16_17');
    const encryptFor = vi.fn();
    await expect(sendSealedChat({ recipients: ['b'.repeat(64)], text: 'hi', encryptFor })).rejects.toThrow(MINOR_DIRECT_REFUSAL);
    expect(encryptFor).not.toHaveBeenCalled();
    expect(MINOR_DIRECT_REFUSAL).toBe('Under 18, Starcom carries no one-to-one messages: team chats only.');
  });

  it('shows someone 13 to 17 no one-to-one message, and no "team" message only one other person reads', () => {
    setAgeAnswer('13_15');
    const seen: string[] = [];
    const stop = subscribeSealedChat((m) => { seen.push(m.content); });
    emitSealedChat(msg({ content: 'direct' }));
    emitSealedChat(msg({ content: 'pretend team', team: 'crew' }));
    emitSealedChat(msg({ content: 'real team', team: 'crew', recipients: ['b'.repeat(64), 'c'.repeat(64)] }));
    expect(seen).toEqual(['real team']);
    stop();
  });

  it('does not replay a one-to-one message that came before the age was given', () => {
    emitSealedChat(msg({ content: 'came first' }));
    setAgeAnswer('16_17');
    const seen: string[] = [];
    const stop = subscribeSealedChat((m) => { seen.push(m.content); });
    expect(seen).not.toContain('came first');
    stop();
  });

  it('shows everyone 18 or over every message, as before', () => {
    setAgeAnswer('18_plus');
    const seen: string[] = [];
    const stop = subscribeSealedChat((m, live) => { if (live) seen.push(m.content); });
    emitSealedChat(msg({ content: 'direct' }));
    expect(seen).toEqual(['direct']);
    stop();
  });
});
