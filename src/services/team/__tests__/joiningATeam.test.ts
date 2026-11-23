/**
 * Joining a team's relay (plan item 2.3, steps 2 to 4).
 *
 * An invite code was signed, but resolved only on the machine that made it:
 * the invitee's app looked the team up in its own memory, found nothing, and
 * refused. Its route, /join-team, did not exist. Now an invite is a link in
 * Flotilla's form (`?r=<relay>&c=<claim>`), carrying the relay's own key and
 * the team, signed by whoever invited; and joining asks the relay itself,
 * with NIP-43 against the relay's NIP-11 self-description.
 *
 * Against stand-in relays on this machine: nothing leaves it.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateSecretKey } from 'nostr-tools';
import { standInRelay, stopStandInRelays, localFetch } from '../../nostr/__tests__/standInRelay';
import { readRelayInfo } from '../../nostr/relayInfo';
import { makeInviteLink, readInviteLink } from '../inviteLink';
import { joinTeam } from '../joinTeam';
import { joinedRelays, leaveRelay, isJoinedRelay } from '../../nostr/joinedRelays';
import nostrService from '../../nostrService';

function installStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

beforeEach(() => {
  installStorageShim();
  nostrService.forgetIdentity();
  // NIP-11 is read over HTTP from the stand-ins on this machine, and only there.
  globalThis.fetch = localFetch as typeof fetch;
});
afterEach(async () => {
  for (const r of joinedRelays()) leaveRelay(r.url);
  await stopStandInRelays();
});

describe("reading a relay's self-description (NIP-11)", () => {
  it('reads its own key and whether it takes sign-ins and access requests', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { name: 'Newark desk', supported_nips: [1, 11, 42, 43] } });
    const info = await readRelayInfo(relay.url);
    expect(info).toMatchObject({ name: 'Newark desk', relayPubkey: relay.relayPubkey, signIn: true, accessRequests: true });
  });
});

describe('an invite link', () => {
  it("is Flotilla's ?r=&c= link, carrying the relay's key and the team, signed by who invited", async () => {
    const inviter = nostrService.ensureIdentity('inviting a teammate');
    const link = await makeInviteLink({ relay: 'wss://relay.newark-desk.example', claim: 'c-123', relayPubkey: '9'.repeat(64), team: 'Newark desk' }, 'https://starcom.app');
    const url = new URL(link);
    expect(url.pathname).toBe('/join');
    expect(url.searchParams.get('r')).toBe('wss://relay.newark-desk.example');
    expect(url.searchParams.get('c')).toBe('c-123');

    const read = readInviteLink(url.searchParams);
    expect(read).toMatchObject({ invite: { relay: 'wss://relay.newark-desk.example', claim: 'c-123', relayPubkey: '9'.repeat(64), team: 'Newark desk', inviter } });
  });

  it('is refused when anything in it was changed after signing', async () => {
    nostrService.ensureIdentity('inviting a teammate');
    const url = new URL(await makeInviteLink({ relay: 'wss://relay.newark-desk.example', claim: 'c-123', relayPubkey: '9'.repeat(64), team: 'Newark desk' }, 'https://starcom.app'));
    url.searchParams.set('r', 'wss://relay.somewhere-else.example');
    expect(readInviteLink(url.searchParams)).toMatchObject({ refused: expect.stringMatching(/signature/i) });
  });

  it('is refused when it is not an invite at all', () => {
    expect(readInviteLink(new URLSearchParams('r=wss://x.example'))).toMatchObject({ refused: expect.any(String) });
  });
});

describe('joining', () => {
  const inviteFor = async (relay: { url: string; relayPubkey?: string }, claim: string) => {
    const inviterSecret = generateSecretKey();
    nostrService.importNsec((await import('nostr-tools')).nip19.nsecEncode(inviterSecret));
    const link = await makeInviteLink({ relay: relay.url, claim, relayPubkey: relay.relayPubkey!, team: 'Newark desk' }, 'https://starcom.app');
    nostrService.forgetIdentity();
    const read = readInviteLink(new URL(link).searchParams);
    if (!('invite' in read)) throw new Error(read.refused);
    return read.invite;
  };

  it('signs in, sends the claim, confirms from the relay\'s signed member list, and keeps the relay', async () => {
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'] });
    const invite = await inviteFor(relay, 'c-123');
    const steps: string[] = [];

    const result = await joinTeam(invite, (step) => steps.push(step));

    expect(result).toMatchObject({ joined: true, confirmed: true });
    expect(steps).toEqual(['checking', 'signing-in', 'requesting', 'confirming']);
    expect(relay.members).toEqual([nostrService.getPublicKey()]);
    expect(isJoinedRelay(relay.url)).toBe(true);
  });

  it('says what the relay said when the claim is refused, and joins nothing', async () => {
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'] });
    const invite = await inviteFor(relay, 'c-expired');

    const result = await joinTeam(invite);

    expect(result).toMatchObject({ joined: false, step: 'requesting', reason: expect.stringMatching(/invalid invite code/) });
    expect(isJoinedRelay(relay.url)).toBe(false);
  });

  it('refuses a relay that takes no access requests, before signing anything', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { supported_nips: [1, 11, 42] }, claims: ['c-123'] });
    const invite = await inviteFor(relay, 'c-123');

    expect(await joinTeam(invite)).toMatchObject({ joined: false, step: 'checking', reason: expect.stringMatching(/access requests/i) });
    expect(relay.signIns).toHaveLength(0);
  });

  it("refuses a relay whose own key is not the one the invite names", async () => {
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'] });
    const invite = { ...(await inviteFor(relay, 'c-123')), relayPubkey: '8'.repeat(64) };

    expect(await joinTeam(invite)).toMatchObject({ joined: false, step: 'checking', reason: expect.stringMatching(/key/i) });
    expect(relay.signIns).toHaveLength(0);
  });

  it('does not join a relay that lets anyone read what a team sends it, and signs nothing', async () => {
    const relay = await standInRelay({ requiresSignIn: false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'] });
    const invite = await inviteFor(relay, 'c-123');

    expect(await joinTeam(invite)).toMatchObject({
      joined: false, step: 'checking',
      reason: expect.stringMatching(/^Starcom will not use .* for a team\. It serves what it holds to anyone, signed in or not\. Nothing of yours was sent\.$/),
    });
    // The check signs in with a key made for it; the person's never does.
    expect(relay.signIns.some((s) => s.pubkey === nostrService.getPublicKey())).toBe(false);
    expect(relay.members).toEqual([]);
    expect(isJoinedRelay(relay.url)).toBe(false);
  });

  it('does not join a relay where signing in with any key is enough', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'] });
    const invite = await inviteFor(relay, 'c-123');

    expect(await joinTeam(invite)).toMatchObject({ joined: false, step: 'checking', reason: expect.stringMatching(/signing in is not membership here/) });
    expect(relay.members).toEqual([]);
  });

  it("does not count as joined when the relay's signed member list does not name the person", async () => {
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'], forgetsMembers: true });
    const invite = await inviteFor(relay, 'c-123');

    // Members-only, as zooid is: a key it did not add is not shown the list at all.
    expect(await joinTeam(invite)).toMatchObject({ joined: false, step: 'confirming', reason: expect.stringMatching(/does not count you as a member/) });
    expect(isJoinedRelay(relay.url)).toBe(false);
  });

  it('joins, but says it is unconfirmed, when the relay publishes no member list', async () => {
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [1, 11, 42, 43] }, claims: ['c-123'], noMemberList: true });
    const invite = await inviteFor(relay, 'c-123');

    expect(await joinTeam(invite)).toMatchObject({ joined: true, confirmed: false });
  });
});
