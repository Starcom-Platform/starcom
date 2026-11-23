/**
 * Every relay connection Starcom opens (plan item 0.3).
 *
 * A relay with access control asks who is reading before it serves anything
 * (NIP-42). Starcom answered no one, so such a relay refused everything it sent.
 * The pool now signs in, but only to a relay the person has joined: a sign-in
 * tells a relay who is reading, which is not something to hand to any relay that
 * asks.
 *
 * Real sockets against stand-in relays on this machine, in node, because what is
 * under test is the conversation on the wire.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  finalizeEvent, generateSecretKey, getPublicKey,
  type Event, type EventTemplate, type SimplePool,
} from 'nostr-tools';
import { createRelayPool, signInToRelaysAs } from '../relayPool';
import { standInRelay, stopStandInRelays } from './standInRelay';

/** The identity signing in: only what an automatic path may use, so nothing here can create one. */
const identity = {
  pubkey: null as string | null,
  extension: false,
  sign: null as null | ((template: EventTemplate) => Promise<Event>),
  signings: 0,
};
signInToRelaysAs({
  hasExtension: () => identity.extension,
  getPubkey: () => identity.pubkey,
  signWithExisting: (template) => {
    identity.signings++;
    return identity.sign ? identity.sign(template) : Promise.reject(new Error('No identity to sign with'));
  },
});

// ── helpers ──────────────────────────────────────────────────────────────────

const someoneElse = generateSecretKey();
let analyst: Uint8Array;

const note = (secretKey: Uint8Array, content: string): Event =>
  finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content }, secretKey);

const pools: SimplePool[] = [];
const pool = (options?: Parameters<typeof createRelayPool>[0]) => {
  const created = createRelayPool(options);
  pools.push(created);
  return created;
};

/** Everything a read delivers, and each relay's reason for ending it. */
function readAll(from: SimplePool, relays: string[], maxWait = 2000) {
  return new Promise<{ contents: string[]; reasons: string[] }>((resolve) => {
    const contents: string[] = [];
    const sub = from.subscribeMany(relays, { kinds: [1] }, {
      maxWait,
      onevent: (event) => contents.push(event.content),
      oneose: () => sub.close('read everything'),
      onclose: (reasons) => resolve({ contents, reasons: reasons.map((r) => r.reason) }),
    });
  });
}

const challengeOf = (signIn: Event) => signIn.tags.find((t) => t[0] === 'challenge')?.[1];

beforeEach(() => {
  analyst = generateSecretKey();
  const secretKey = analyst;
  identity.pubkey = getPublicKey(secretKey);
  identity.extension = false;
  identity.sign = async (template) => finalizeEvent(template, secretKey);
  identity.signings = 0;
});

afterEach(async () => {
  for (const p of pools.splice(0)) p.destroy();
  await stopStandInRelays();
  delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
  vi.restoreAllMocks();
});

// ── signing in ───────────────────────────────────────────────────────────────

describe('signing in to a relay (NIP-42)', () => {
  it('signs in to a relay the person joined, then reads and writes there', async () => {
    const team = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'held for members')] });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const relays = pool();

    const { contents } = await readAll(relays, [team.url]);
    expect(contents).toEqual(['held for members']);
    expect(team.signIns).toHaveLength(1);
    expect(team.signIns[0].pubkey).toBe(identity.pubkey);
    expect(challengeOf(team.signIns[0])).toBe(team.challenges[0]);

    await expect(Promise.all(relays.publish([team.url], note(analyst, 'from the analyst')))).resolves.toHaveLength(1);
    expect(team.held.map((e) => e.content)).toContain('from the analyst');
  });

  it('never signs in to a relay the person has not joined, whatever it asks', async () => {
    const stranger = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'members only')] });
    const relays = pool();

    const { contents, reasons } = await readAll(relays, [stranger.url]);
    expect(contents).toEqual([]);
    expect(reasons[0]).toMatch(/^auth-required/);
    await expect(relays.publish([stranger.url], note(analyst, 'not for them'))[0]).rejects.toThrow(/auth-required/);

    expect(stranger.signIns).toEqual([]);
    expect(identity.signings).toBe(0);
  });

  it('signs in to the joined relay and not the other when one call names both', async () => {
    const team = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'from the team relay')] });
    const stranger = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'from the stranger')] });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const relays = pool();

    const { contents, reasons } = await readAll(relays, [team.url, stranger.url]);
    expect(contents).toEqual(['from the team relay']);
    expect(reasons).toHaveLength(2);
    expect(reasons.filter((r) => r.startsWith('auth-required'))).toHaveLength(1);

    // Each relay's result stays at its own place in the list, in either order.
    const strangerFirst = await Promise.allSettled(relays.publish([stranger.url, team.url], note(analyst, 'to both')));
    expect(strangerFirst.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
    const teamFirst = await Promise.allSettled(relays.publish([team.url, stranger.url], note(analyst, 'to both again')));
    expect(teamFirst.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);

    expect(team.signIns).toHaveLength(1);
    expect(stranger.signIns).toEqual([]);
  });

  it('delivers an event two relays both hold only once, when one of them needed a sign-in', async () => {
    const shared = note(someoneElse, 'on both relays');
    const team = await standInRelay({ requiresSignIn: true, held: [shared] });
    const open = await standInRelay({ requiresSignIn: false, held: [shared] });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;

    const { contents } = await readAll(pool(), [team.url, open.url]);
    expect(contents).toEqual(['on both relays']);
  });

  it('signs in again on each new connection, answering that connection\'s challenge', async () => {
    const team = await standInRelay({ requiresSignIn: true });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const relays = pool();

    await Promise.all(relays.publish([team.url], note(analyst, 'first')));
    team.dropConnections();
    await vi.waitFor(() => expect(relays.listConnectionStatus().get(`${team.url}/`)).toBeUndefined());
    await Promise.all(relays.publish([team.url], note(analyst, 'after the relay came back')));

    expect(team.challenges).toHaveLength(2);
    expect(team.signIns.map(challengeOf)).toEqual(team.challenges);
    expect(team.held.map((e) => e.content)).toEqual(['first', 'after the relay came back']);
  });

  it('with no identity, signs in to nothing and creates none', async () => {
    identity.pubkey = null;
    identity.sign = null;
    const team = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'members only')] });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const relays = pool();

    const { contents, reasons } = await readAll(relays, [team.url]);
    expect(contents).toEqual([]);
    expect(reasons[0]).toMatch(/^auth-required/);
    await expect(relays.publish([team.url], note(someoneElse, 'unsigned in'))[0]).rejects.toThrow(/auth-required/);

    expect(team.signIns).toEqual([]);
    expect(identity.signings).toBe(0);
  });

  it('does not leave a write or a read waiting when the person declines to sign in', async () => {
    // What nostr-tools does with a signer that refuses: it logs, and never settles.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    identity.pubkey = null;
    identity.extension = true;
    identity.sign = () => Promise.reject(new Error('user rejected'));
    const team = await standInRelay({ requiresSignIn: true, held: [note(someoneElse, 'members only')] });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const relays = pool({ signInWaitMs: 300 });

    const started = Date.now();
    await expect(relays.publish([team.url], note(analyst, 'declined'))[0]).rejects.toThrow(/sign-in/i);
    const { contents } = await readAll(relays, [team.url], 300);
    expect(contents).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('lets a relay that turns the sign-in down say so, and leaves nothing unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const team = await standInRelay({ requiresSignIn: true, admits: () => false });
      process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
      const relays = pool();

      const { reasons } = await readAll(relays, [team.url]);
      expect(reasons[0]).toMatch(/restricted: not a member/);
      await expect(relays.publish([team.url], note(analyst, 'turned down'))[0]).rejects.toThrow(/restricted: not a member/);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });
});

// ── what a relay sends ───────────────────────────────────────────────────────

describe('what a relay sends', () => {
  /*
   * The featured share card says a relay report's signature was checked on
   * intake (shareReports.ts). This is that check.
   */
  it('drops an event whose signature does not verify, before anything sees it', async () => {
    const genuine = note(someoneElse, 'genuine');
    const signed = note(someoneElse, 'forged');
    const forged = { ...signed, sig: signed.sig.replace(/^./, (c) => (c === '0' ? '1' : '0')) };
    const open = await standInRelay({ requiresSignIn: false, held: [genuine, forged] });

    const { contents } = await readAll(pool(), [open.url]);
    expect(contents).toEqual(['genuine']);
  });
});

// ── keeping connections ──────────────────────────────────────────────────────

describe('keeping connections', () => {
  it('pings, never closes a connection for being idle, and waits as long as 2.16 did to connect', () => {
    const relays = pool();
    // Pings keep a tunnel from dropping a quiet connection, and notice a dead one.
    expect(relays.enablePing).toBe(true);
    // nostr-tools 2.25 closes a connection 20 s after its count of open
    // subscriptions reaches zero; a subscription closed twice (by the relay,
    // then by its owner) is counted twice, and the timer then closes the
    // connection under a live subscription. Measured on 2.25.2.
    expect(relays.idleTimeout).toBe(0);
    expect(relays.maxWaitForConnection).toBe(4400);
  });
});

