/**
 * A message said to a team, or to you, while you were on another screen was
 * announced nowhere, and the header's badge counted open windows, not what was
 * unread (plan item 9.12, walk C8). A notice now names who wrote and where,
 * never the text, once per message; the header counts what is unread
 * (decision G5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nip19 } from 'nostr-tools';

const hudInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/hudNotifications', () => ({ hudInfo: (...a: unknown[]) => hudInfo(...a) }));

const AISHA = 'b'.repeat(64);
const ME = 'a'.repeat(64);
const CAMDEN = 'wss://relay.camden.example';

async function load() {
  const sealed = await import('../sealedChat');
  const unread = await import('../chatUnread');
  const { learnName } = await import('../../identity/names');
  const { realTimeTeamService } = await import('../../RealTimeTeamService');
  return { ...sealed, ...unread, learnName, teams: realTimeTeamService };
}
const said = (over: Partial<import('../sealedChat').SealedChatMessage> = {}): import('../sealedChat').SealedChatMessage => ({
  id: 'm1', senderId: AISHA, recipients: [ME], content: 'Berth 4 at 02:00.', timestamp: Date.now(),
  postQuantum: true, decryptionFailed: false, ...over,
});

beforeEach(() => { vi.resetModules(); localStorage.clear(); hudInfo.mockReset(); });

describe('chat notices and what is unread', () => {
  it('names who wrote to a team and which, never the text, and counts it unread', async () => {
    const { emitSealedChat, startChatNotices, unreadCount, learnName, teams } = await load();
    learnName(AISHA, 'Aisha', 'team');
    await teams.createTeam({ name: 'Camden desk', relayUrl: CAMDEN, relayPubkey: '9'.repeat(64) }, 'me', ME);
    const stop = startChatNotices();

    emitSealedChat(said({ team: CAMDEN }));

    expect(hudInfo.mock.calls).toEqual([['New message', 'Aisha wrote to Camden desk.']]);
    expect(JSON.stringify(hudInfo.mock.calls)).not.toContain('Berth 4');
    expect(unreadCount()).toBe(1);
    stop();
  });

  it('says who wrote to you, by a short key when there is no name', async () => {
    const { emitSealedChat, startChatNotices } = await load();
    const stop = startChatNotices();
    emitSealedChat(said({ id: 'dm-1' }));
    const npub = nip19.npubEncode(AISHA);
    expect(hudInfo.mock.calls).toEqual([['New message', `${npub.slice(0, 14)}…${npub.slice(-6)} wrote to you.`]]);
    stop();
  });

  it('once per message, however often it arrives', async () => {
    const { emitSealedChat, startChatNotices, unreadCount } = await load();
    const stop = startChatNotices();
    emitSealedChat(said());
    emitSealedChat(said());
    expect(hudInfo).toHaveBeenCalledTimes(1);
    expect(unreadCount()).toBe(1);
    stop();
  });

  it('does not raise a message again once it has been read', async () => {
    const { emitSealedChat, startChatNotices, lookAt, unreadCount } = await load();
    const stop = startChatNotices();
    emitSealedChat(said({ id: 'twice' }));
    lookAt(`dm:${AISHA}`)();
    emitSealedChat(said({ id: 'twice' }));
    expect(hudInfo).toHaveBeenCalledTimes(1);
    expect(unreadCount()).toBe(0);
    stop();
  });

  it('does not raise a message still unread again when the notices restart', async () => {
    const { emitSealedChat, startChatNotices } = await load();
    const first = startChatNotices();
    emitSealedChat(said({ id: 'kept-unread' }));
    first();
    const second = startChatNotices();
    emitSealedChat(said({ id: 'kept-unread' }));
    expect(hudInfo).toHaveBeenCalledTimes(1);
    second();
  });

  it('raises nothing for what you wrote yourself', async () => {
    const { emitSealedChat, startChatNotices, unreadCount } = await load();
    const { nostrIdentityService } = await import('../../identity/NostrIdentityService');
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    const stop = startChatNotices();
    emitSealedChat(said({ id: 'mine', senderId: ME }));
    expect(hudInfo).not.toHaveBeenCalled();
    expect(unreadCount()).toBe(0);
    stop();
  });

  it('says nothing of what it is told from before', async () => {
    const { emitSealedChat, startChatNotices, unreadCount } = await load();
    emitSealedChat(said({ id: 'earlier' }));
    const stop = startChatNotices();
    await new Promise((r) => setTimeout(r, 20));
    expect(hudInfo).not.toHaveBeenCalled();
    expect(unreadCount()).toBe(0);
    stop();
  });

  it('counts nothing while its conversation is in view, and clears it when looked at', async () => {
    const { emitSealedChat, startChatNotices, unreadCount, lookAt } = await load();
    const stop = startChatNotices();

    const release = lookAt(`team:${CAMDEN}`);
    emitSealedChat(said({ id: 'seen', team: CAMDEN }));
    expect(hudInfo).not.toHaveBeenCalled();
    expect(unreadCount()).toBe(0);
    release();

    emitSealedChat(said({ id: 'unseen', team: CAMDEN }));
    emitSealedChat(said({ id: 'elsewhere' }));
    expect(unreadCount()).toBe(2);
    const again = lookAt(`team:${CAMDEN}`);
    expect(unreadCount()).toBe(1);
    again();
    stop();
  });

  // Every screen that shows chat listens after this one: it must never keep a message from them.
  it('never keeps a message from the screens that listen after it', async () => {
    const { emitSealedChat, startChatNotices, subscribeSealedChat } = await load();
    hudInfo.mockImplementation(() => { throw new Error('notices are down'); });
    const stop = startChatNotices();
    const shown: string[] = [];
    const stopShowing = subscribeSealedChat((m) => { shown.push(m.id); });
    emitSealedChat(said({ id: 'still-shown' }));
    expect(shown).toContain('still-shown');
    stopShowing();
    stop();
  });

  it('keeps what is unread across a reload', async () => {
    const first = await load();
    const stop = first.startChatNotices();
    first.emitSealedChat(said({ id: 'kept' }));
    stop();

    vi.resetModules();
    const { unreadCount } = await import('../chatUnread');
    expect(unreadCount()).toBe(1);
  });
});
