/**
 * A team message, sealed to each member (plan item 2.7, slice b). Team
 * channels had no group encryption: the key was looked up under the
 * channel's hashed name, which is nobody's, so every team message went out
 * in plain text, on a channel anyone could work out from the team's id.
 *
 * Now it is sealed to each member, as a direct message is. Members come from
 * the team relay's own signed list (NIP-43): a roster here never hears of
 * someone who joined by invite. The team is named by its relay, the one
 * thing every member's machine agrees on.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { standInRelay, stopStandInRelays, localFetch, type StandIn } from '../../nostr/__tests__/standInRelay';
import type { CyberTeam } from '../../../types/cyberInvestigation';

interface Device { storage: Map<string, string>; idb: IDBFactory }
const device = (): Device => ({ storage: new Map(), idb: new IDBFactory() });
function sitAt({ storage, idb }: Device): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
    setItem: (k: string, v: string) => { storage.set(k, String(v)); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => { storage.clear(); },
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = idb;
}
const until = async (check: () => boolean | Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

let relay: StandIn;

/** What this machine shows after a reload: fresh modules, the same storage. */
async function afterReload(): Promise<Array<import('../sealedChat').SealedChatMessage>> {
  vi.resetModules();
  const { subscribeSealedChat } = await import('../sealedChat');
  const seen: Array<import('../sealedChat').SealedChatMessage> = [];
  const stop = subscribeSealedChat((m) => { seen.push(m); });
  await until(() => seen.length > 0, 3_000);
  stop();
  return seen;
}
let quiet: StandIn;
/** Refuses everyone it does not count a member, as zooid does a removed member. */
let closedToMe: StandIn;
/** Answers nothing at all. */
let hung: StandIn;
/** The chat relay, open to all, where prekey bundles are published and read. */
let chat: StandIn;

/** At this person's machine: their storage, fresh modules, their key, chat started and bundle published, their inbox listening. */
async function machine(secret: Uint8Array, at: Device) {
  sitAt(at);
  vi.resetModules();
  globalThis.fetch = localFetch as typeof fetch;
  const nostrService = (await import('../../nostrService')).default;
  nostrService.importNsec(nip19.nsecEncode(secret));
  const pubkey = getPublicKey(secret);
  const { secureChatIntegration } = await import('../../SecureChatIntegrationService');
  await secureChatIntegration.initialize();
  // Each of them chats: they have used chat with this key, so it announces its bundle (MF15).
  secureChatIntegration.markChatUsed();
  await until(() => chat.held.some((e) => e.kind === 30078 && e.pubkey === pubkey));
  const sealedChat = await import('../sealedChat');
  const sealed = await import('../../nostr/sealedInbox');
  const { APP_KINDS } = await import('../../nostr/kindRegistry');
  const received: Array<import('../sealedChat').SealedChatMessage> = [];
  const stopListening = sealedChat.subscribeSealedChat((m) => { received.push(m); });
  const stopInbox = sealed.startSealedInbox({ [APP_KINDS.CHAT_MESSAGE]: (o) => secureChatIntegration.receiveSealed(o) }, { relays: [relay.url] });
  return {
    pubkey, received,
    teamChat: await import('../teamChat'),
    joinTeam: (await import('../../team/joinTeam')).joinTeam,
    joinRelay: (await import('../../nostr/joinedRelays')).joinRelay,
    teams: (await import('../../RealTimeTeamService')).realTimeTeamService,
    stop: () => { stopListening(); stopInbox(); },
  };
}

/** Whoever the team relay was set up for: its owner, and so a member, as in a zooid config. */
const owners = new Set<string>();

beforeAll(async () => {
  // Members-only, as a team relay must be for Starcom to use it (plan item 2.3a).
  relay = await standInRelay({ requiresSignIn: true, members: (k) => owners.has(k), claims: ['c-1'], nip11: { name: 'Newark desk relay', supported_nips: [42, 43] } });
  quiet = await standInRelay({ requiresSignIn: true, noMemberList: true, nip11: { supported_nips: [42] } });
  closedToMe = await standInRelay({ requiresSignIn: true, members: () => false, claims: ['c-9'], nip11: { supported_nips: [42, 43] } });
  hung = await standInRelay({ requiresSignIn: false, answersNothing: true, nip11: { supported_nips: [42, 43] } });
  chat = await standInRelay({ requiresSignIn: false });
  process.env.VITE_NOSTR_CHAT_RELAYS = chat.url;
  process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
});
afterAll(async () => {
  delete process.env.VITE_NOSTR_CHAT_RELAYS;
  delete process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE;
  await stopStandInRelays();
});

describe('a team message', () => {
  it("reaches every member on the relay's own list, sealed to each, and nobody else", async () => {
    const aishaKey = generateSecretKey(); const aishaDevice = device();
    const chenKey = generateSecretKey(); const chenDevice = device();
    const invite = { relay: relay.url, claim: 'c-1', relayPubkey: relay.relayPubkey!, team: 'Newark desk', inviter: 'x', issuedAt: 0 };

    // Aisha and Chen join by invite, each on their own machine.
    for (const [key, at] of [[aishaKey, aishaDevice], [chenKey, chenDevice]] as const) {
      const m = await machine(key, at);
      expect(await m.joinTeam(invite)).toMatchObject({ joined: true, confirmed: true });
      m.stop();
    }

    // Priya, who made the team, writes to it: the relay is hers. Her roster names nobody else.
    const priyaKey = generateSecretKey();
    owners.add(getPublicKey(priyaKey));
    const priya = await machine(priyaKey, device());
    const team = await priya.teams.createTeam({ name: 'Newark desk', relayUrl: relay.url, relayPubkey: relay.relayPubkey }, priya.pubkey, priya.pubkey);
    priya.joinRelay({ url: relay.url, relayPubkey: relay.relayPubkey!, team: 'Newark desk' });
    expect(await priya.teamChat.teamMembersFor(team)).toEqual({ members: expect.arrayContaining([getPublicKey(aishaKey), getPublicKey(chenKey)]), source: 'relay' });
    const sent = await priya.teamChat.sendTeamMessage(team, 'Night loading confirmed at berth 4.');
    expect(sent).toMatchObject({ postQuantum: true, notReached: [] });
    expect(sent.reached.sort()).toEqual([getPublicKey(aishaKey), getPublicKey(chenKey)].sort());
    priya.stop();
    expect(await afterReload()).toEqual([expect.objectContaining({ senderId: priya.pubkey, content: 'Night loading confirmed at berth 4.', team: priya.teamChat.teamChatKey(team) })]);

    // On the team relay only wraps; nothing on the public chat relay but bundles.
    expect(JSON.stringify([...relay.held, ...chat.held])).not.toContain('Night loading confirmed');
    expect(relay.held.filter((e) => e.kind === 1059)).toHaveLength(2);
    expect(chat.held.every((e) => e.kind === 30078)).toBe(true);
    expect(relay.held.some((e) => e.kind === 42 || e.kind === 40)).toBe(false);

    // Each member reads it, as the same message, said to the team.
    const ids: string[] = [];
    for (const [key, at] of [[aishaKey, aishaDevice], [chenKey, chenDevice]] as const) {
      const m = await machine(key, at);
      expect(await until(() => m.received.some((r) => r.content === 'Night loading confirmed at berth 4.'))).toBe(true);
      const got = m.received.find((r) => r.content === 'Night loading confirmed at berth 4.')!;
      expect(got).toMatchObject({ senderId: priya.pubkey, team: priya.teamChat.teamChatKey(team), postQuantum: true });
      ids.push(got.id);
      m.stop();
    }
    expect(ids[0]).toBe(ids[1]);

    // Dan reads the same relay and is on no list.
    const dan = await machine(generateSecretKey(), device());
    await new Promise((r) => setTimeout(r, 800));
    expect(dan.received.filter((r) => r.team)).toEqual([]);
    dan.stop();
  }, 120_000);

  it("goes to the roster's members when the relay publishes no list, and says so", async () => {
    const priya = await machine(generateSecretKey(), device());
    const aisha = getPublicKey(generateSecretKey());
    const team = await priya.teams.createTeam({ name: 'Quiet desk', relayUrl: quiet.url, relayPubkey: quiet.relayPubkey }, priya.pubkey, priya.pubkey);
    const withAisha = { ...team, members: [...team.members, { pubkey: aisha, name: 'Aisha' }] } as CyberTeam;
    priya.joinRelay({ url: quiet.url, relayPubkey: quiet.relayPubkey!, team: 'Quiet desk' });
    expect(await priya.teamChat.teamMembersFor(withAisha)).toEqual({ members: expect.arrayContaining([aisha]), source: 'roster' });
    priya.stop();
  }, 60_000);

  /*
   * A relay's list that could not be read fell back to the roster kept here,
   * which still names anyone removed, so a removed member was sent the team's
   * messages (plan item 9.8, walk C3). For a team with a relay, nothing is sent
   * when its list cannot be read, and the sender is told why.
   */
  describe('when the relay list cannot be read', () => {
    async function teamOn(stand: StandIn, name: string) {
      const priya = await machine(generateSecretKey(), device());
      const aisha = getPublicKey(generateSecretKey());
      const team = await priya.teams.createTeam({ name, relayUrl: stand.url, relayPubkey: stand.relayPubkey }, priya.pubkey, priya.pubkey);
      // The roster here still names Aisha, as it would after she was removed on the relay.
      const withAisha = { ...team, members: [...team.members, { pubkey: aisha, name: 'Aisha' }] } as CyberTeam;
      priya.joinRelay({ url: stand.url, relayPubkey: stand.relayPubkey!, team: name });
      return { priya, team: withAisha };
    }

    it('sends nothing when the relay will not show it, and says the sender may have been removed', async () => {
      const { priya, team } = await teamOn(closedToMe, 'Camden desk');
      await expect(priya.teamChat.sendTeamMessage(team, 'Hello')).rejects.toThrow(
        "Not sent: Camden desk's relay would not show its member list (restricted: you are not a member of this relay). You may have been removed from Camden desk.",
      );
      expect(closedToMe.held.filter((e) => e.kind === 1059)).toEqual([]);
      priya.stop();
    }, 60_000);

    it('sends nothing when the relay does not answer, and says why', async () => {
      const { priya, team } = await teamOn(hung, 'Trenton desk');
      await expect(priya.teamChat.sendTeamMessage(team, 'Hello')).rejects.toThrow(
        "Not sent: Trenton desk's member list could not be read (its relay did not answer). The list kept here may still name people who were removed.",
      );
      priya.stop();
    }, 60_000);
  });

  it('is not sent, and says why, for a team with no relay or nobody else on it', async () => {
    const priya = await machine(generateSecretKey(), device());
    const noRelay = { id: 't', name: 'Old team', members: [] } as unknown as CyberTeam;
    await expect(priya.teamChat.sendTeamMessage(noRelay, 'Hello')).rejects.toThrow(/has no relay/);
    const alone = await priya.teams.createTeam({ name: 'Alone', relayUrl: quiet.url, relayPubkey: quiet.relayPubkey }, priya.pubkey, priya.pubkey);
    priya.joinRelay({ url: quiet.url, relayPubkey: quiet.relayPubkey!, team: 'Alone' });
    await expect(priya.teamChat.sendTeamMessage(alone, 'Hello')).rejects.toThrow(/No one else is on/);
    priya.stop();
  }, 60_000);
});

/*
 * A key locked with a passphrase (D-KL) signs in to no relay until it is opened. Before 2026-11-20 a locked sender
 * was told "its relay did not answer" and was never asked for the passphrase: found by walking the lock in a browser.
 */
describe('a team message from a locked key', () => {
  const PASS = 'correct horse battery staple';

  /** This person's machine on a later visit: the key kept sealed, nothing opened yet, `answer` standing in for the prompt. */
  async function lockedMachine(secret: Uint8Array, at: Device, answer: 'passphrase' | 'cancel') {
    sitAt(at);
    vi.resetModules();
    globalThis.fetch = localFetch as typeof fetch;
    const keyLock = await import('../../identity/keyLock');
    localStorage.setItem(keyLock.LOCKED_KEY_STORAGE, JSON.stringify(keyLock.sealWithPassphrase(secret, PASS, 4)));
    const asked: string[] = [];
    keyLock.registerUnlockAsker(async (request) => {
      asked.push(request.reason);
      if (answer === 'cancel') return false;
      await request.attempt(PASS);
      return true;
    });
    const nostrService = (await import('../../nostrService')).default;
    const { secureChatIntegration } = await import('../../SecureChatIntegrationService');
    await secureChatIntegration.initialize();
    return {
      pubkey: getPublicKey(secret),
      asked,
      nostrService,
      teamChat: await import('../teamChat'),
      joinRelay: (await import('../../nostr/joinedRelays')).joinRelay,
      teams: (await import('../../RealTimeTeamService')).realTimeTeamService,
    };
  }

  it('asks for the passphrase, then reaches the members', async () => {
    const aishaKey = generateSecretKey();
    const aisha = await machine(aishaKey, device());
    expect(await aisha.joinTeam({ relay: relay.url, claim: 'c-1', relayPubkey: relay.relayPubkey!, team: 'Newark desk', inviter: 'x', issuedAt: 0 })).toMatchObject({ joined: true });
    aisha.stop();

    const priyaKey = generateSecretKey();
    owners.add(getPublicKey(priyaKey));
    const priya = await lockedMachine(priyaKey, device(), 'passphrase');
    expect(priya.nostrService.isLocked()).toBe(true);
    const team = await priya.teams.createTeam({ name: 'Newark desk', relayUrl: relay.url, relayPubkey: relay.relayPubkey }, priya.pubkey, priya.pubkey);
    priya.joinRelay({ url: relay.url, relayPubkey: relay.relayPubkey!, team: 'Newark desk' });

    // Locked, the list is not read, and that is what is said: not a relay that did not answer.
    expect(await priya.teamChat.teamMembersFor(team)).toEqual({ unreadable: 'locked', reason: priya.teamChat.LOCKED_TEAM_READ });

    const before = relay.held.filter((e) => e.kind === 1059).length;
    const sent = await priya.teamChat.sendTeamMessage(team, 'Sent from a locked key, once opened.');
    expect(priya.asked).toEqual(['writing to your team']);
    expect(priya.nostrService.isLocked()).toBe(false);
    expect(sent.reached).toContain(getPublicKey(aishaKey));
    expect(relay.held.filter((e) => e.kind === 1059).length).toBeGreaterThan(before);
  }, 120_000);

  it('sends nothing when the prompt is closed, and says the key is still locked', async () => {
    const priyaKey = generateSecretKey();
    owners.add(getPublicKey(priyaKey));
    const priya = await lockedMachine(priyaKey, device(), 'cancel');
    const team = await priya.teams.createTeam({ name: 'Newark desk', relayUrl: relay.url, relayPubkey: relay.relayPubkey }, priya.pubkey, priya.pubkey);
    priya.joinRelay({ url: relay.url, relayPubkey: relay.relayPubkey!, team: 'Newark desk' });
    const before = relay.held.filter((e) => e.kind === 1059).length;
    await expect(priya.teamChat.sendTeamMessage(team, 'Never sent.')).rejects.toThrow('Nothing was done: your key is still locked.');
    expect(priya.asked).toEqual(['writing to your team']);
    expect(relay.held.filter((e) => e.kind === 1059).length).toBe(before);
  }, 60_000);
});
