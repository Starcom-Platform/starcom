/**
 * Managing a team's relay from Starcom (plan item 2.3, step 5): NIP-86 calls,
 * each signed with NIP-98 by the person managing, and access requests an
 * admin approves there.
 *
 * NIP-43 lets a person join only with a claim. For someone with none yet, the
 * request is signed by their key and sent to an admin however they already
 * talk; the signature proves the key's owner asked, so a mistyped npub cannot
 * be allowed by accident. Nothing here is published.
 *
 * Against stand-in relays on this machine.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import { standInRelay, stopStandInRelays, localFetch } from '../../nostr/__tests__/standInRelay';
import { listMembers, allowMember, removeMember, banMember, createClaim, listClaims, revokeClaim, revokeEveryone, relayManagers } from '../relayManagement';
import { makeAccessRequest, readAccessRequest } from '../accessRequest';
import { checkMembership } from '../joinTeam';
import { isJoinedRelay } from '../../nostr/joinedRelays';
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

const AISHA = 'b'.repeat(64);

beforeEach(() => {
  installStorageShim();
  nostrService.forgetIdentity();
  globalThis.fetch = localFetch as typeof fetch;
});
afterEach(async () => { await stopStandInRelays(); });

describe('managing a relay (NIP-86 over NIP-98)', () => {
  it('allows, lists, removes and bans members, as the admin who signed each call', async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin] });

    await allowMember(relay.url, AISHA);
    expect(await listMembers(relay.url)).toEqual([{ pubkey: AISHA }]);
    await removeMember(relay.url, AISHA);
    expect(await listMembers(relay.url)).toEqual([]);
    await banMember(relay.url, 'c'.repeat(64), 'spam');
    expect(relay.banned).toEqual(['c'.repeat(64)]);
    expect(relay.managementCalls.every((c) => c.by === admin)).toBe(true);
  });

  it('creates a claim an invite can carry, and revokes it', async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin] });

    const claim = await createClaim(relay.url);
    expect(claim).toMatch(/^[a-z0-9-]{12,}$/);
    expect(await listClaims(relay.url)).toEqual([claim]);
    await revokeClaim(relay.url, claim);
    expect(await listClaims(relay.url)).toEqual([]);
  });

  it("says a key that may not manage the relay is refused, in words", async () => {
    nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: ['f'.repeat(64)] });
    await expect(listMembers(relay.url)).rejects.toThrow(/may not manage/);
  });

  it("revokes everyone at a cohort's end: every member and every claim", async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin], claims: ['c-1', 'c-2'] });
    await allowMember(relay.url, AISHA);
    await allowMember(relay.url, 'd'.repeat(64));

    expect(await revokeEveryone(relay.url, { keep: [admin] })).toMatchObject({ removed: 2, claimsRevoked: 2 });
    expect(relay.allowed).toEqual([]);
    expect(relay.claims).toEqual([]);
  });

  it("keeps everyone who manages the relay, as the relay names them, not only the admin doing it (decision R4)", async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const secondAdmin = 'e'.repeat(64);
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin, secondAdmin], listsAssignees: true, claims: ['c-1'] });
    await allowMember(relay.url, AISHA);
    await allowMember(relay.url, secondAdmin);

    expect(await relayManagers(relay.url)).toEqual([admin, secondAdmin]);
    const done = await revokeEveryone(relay.url, { keep: [admin] });
    expect(done).toMatchObject({ removed: 1, claimsRevoked: 1 });
    expect(done.kept).toEqual(expect.arrayContaining([admin, secondAdmin]));
    expect(relay.allowed).toEqual([secondAdmin]);
  });

  it("falls back to the relay's own description for who manages it: its owner and its own key", async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin], nip11: { supported_nips: [42, 43, 86] } });
    expect(await relayManagers(relay.url)).toEqual([relay.relayPubkey]);
  });

  it('says nobody is known to manage a relay whose description names no keys', async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin], nip11: { supported_nips: [42], self: null, pubkey: null } });
    expect(await relayManagers(relay.url)).toBeNull();
  });

  it('says nobody is known to manage a relay that answers neither', async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const relay = await standInRelay({ requiresSignIn: true, admins: [admin] });
    expect(await relayManagers(relay.url)).toBeNull();
  });
});

describe('an access request', () => {
  it("carries the requester's key and note, signed, and reads back as theirs", async () => {
    const requester = nostrService.ensureIdentity('asking to join a team');
    const text = await makeAccessRequest({ relay: 'wss://relay.newark.example', note: 'Intake 2026-11 #14' });

    expect(readAccessRequest(text)).toMatchObject({
      request: { relay: 'wss://relay.newark.example', note: 'Intake 2026-11 #14', requester, npub: nip19.npubEncode(requester) },
    });
  });

  it('is refused when changed after signing, so a key cannot be swapped in', async () => {
    nostrService.ensureIdentity('asking to join a team');
    const text = await makeAccessRequest({ relay: 'wss://relay.newark.example', note: 'Intake 2026-11 #14' });
    const [prefix, body] = text.split(':');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    decoded.content = decoded.content.replace('#14', '#15');
    const tampered = `${prefix}:${Buffer.from(JSON.stringify(decoded)).toString('base64url')}`;

    expect(readAccessRequest(tampered)).toMatchObject({ refused: expect.stringMatching(/signature/i) });
  });

  it('is refused when it is not an access request at all', () => {
    expect(readAccessRequest('hello')).toMatchObject({ refused: expect.any(String) });
  });
});

describe('asking, being allowed, and finding oneself in', () => {
  it("keeps the relay only once the relay's signed member list names the person", async () => {
    const admin = nostrService.ensureIdentity('managing a relay');
    const adminKey = nostrService.exportNsec();
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, admins: [admin], nip11: { name: 'Newark desk relay', supported_nips: [42, 43, 86] } });
    nostrService.forgetIdentity();

    const requester = nostrService.ensureIdentity('asking to join a team');
    const requesterKey = nostrService.exportNsec();
    const text = await makeAccessRequest({ relay: relay.url, note: 'Intake 2026-11 #14' });
    // A members-only relay, as zooid is, will not show a non-member its member list at all.
    expect(await checkMembership(relay.url)).toMatchObject({ joined: false, reason: expect.stringMatching(/your request has not been allowed yet/) });
    expect(isJoinedRelay(relay.url)).toBe(false);

    nostrService.importNsec(adminKey);
    const read = readAccessRequest(text);
    if (!('request' in read)) throw new Error(read.refused);
    await allowMember(relay.url, read.request.requester, read.request.note);

    nostrService.importNsec(requesterKey);
    expect(await checkMembership(relay.url)).toEqual({ joined: true, relayPubkey: relay.relayPubkey, team: 'Newark desk relay' });
    expect(isJoinedRelay(relay.url)).toBe(true);
    expect(relay.members).toEqual([requester]);
  });

  it('says a relay that publishes no member list cannot tell them, and keeps nothing', async () => {
    const me = nostrService.ensureIdentity('asking to join a team');
    const relay = await standInRelay({ requiresSignIn: true, members: (k) => k === me, noMemberList: true, nip11: { supported_nips: [42, 43] } });
    expect(await checkMembership(relay.url)).toMatchObject({ joined: false, reason: expect.stringMatching(/publishes no member list/) });
    expect(isJoinedRelay(relay.url)).toBe(false);
  });

  it('keeps nothing from a relay that lets anyone read, before signing anything', async () => {
    const me = nostrService.ensureIdentity('asking to join a team');
    const relay = await standInRelay({ requiresSignIn: false, nip11: { supported_nips: [42, 43] } });
    expect(await checkMembership(relay.url)).toMatchObject({ joined: false, reason: expect.stringMatching(/^Starcom will not use .* for a team/) });
    expect(relay.signIns.some((s) => s.pubkey === me)).toBe(false);
    expect(isJoinedRelay(relay.url)).toBe(false);
  });
});
