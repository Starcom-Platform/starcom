/**
 * Teammates' calls (decision D-PW, PW44, PW76; step 9b): read from joined team relays only, `psi_call` notes only;
 * a reveal shown once it holds to its seal, named by its team; a seal alone, a reveal that does not hash, a forged
 * signature or one of the operative's own calls shows nothing; one read for every view, ended with the last.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, type Event as NostrEvent } from 'nostr-tools';

const relayState = vi.hoisted(() => ({
  subs: [] as Array<{ relays: string[]; filter: Record<string, unknown>; handlers: { onevent: (e: unknown) => void; oneose?: () => void }; closed: boolean }>,
  closedPools: 0,
}));
vi.mock('../../nostr/relayPool', () => ({
  createRelayPool: () => ({
    subscribeMany: (relays: string[], filter: Record<string, unknown>, handlers: { onevent: (e: unknown) => void; oneose?: () => void }) => {
      const sub = { relays, filter, handlers, closed: false };
      relayState.subs.push(sub);
      return { close: () => { sub.closed = true; } };
    },
    close: () => { relayState.closedPools += 1; },
  }),
}));
vi.mock('../../RealTimeTeamService', () => ({
  realTimeTeamService: {
    getTeams: () => [
      { id: 't1', name: 'Blue Team', relayUrl: 'wss://blue.example/' },
      { id: 't2', name: 'Unjoined Team', relayUrl: 'wss://elsewhere.example' },
      { id: 't3', name: 'No Relay' },
    ],
  },
}));
vi.mock('../../nostr/joinedRelays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/joinedRelays')>()),
  isJoinedRelay: (url: string) => url.startsWith('wss://blue.example'),
}));
vi.mock('../../nostr/accessChanges', () => ({ onAccessChange: () => () => {} }));

import { addCall, resetCallsForTests, revealTemplate, sealTemplate, type CallText, type PsiCall } from '../calls';
import { getTeamCalls, pairCalls, readTeamCalls } from '../teamCalls';

const FROM = Date.UTC(2026, 10, 1, 12);
const UNTIL = Date.UTC(2026, 10, 2, 12);
const text: CallText = {
  window: { address: '31923:abc:w', title: 'Moon and Mars at change (square)', start: FROM / 1000, end: UNTIL / 1000 },
  place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'conflict' }, words: 'Escalation along the border.',
};
const KEY = generateSecretKey();
const call: PsiCall = { id: 'aaaa000011112222', text, salt: '00112233445566778899aabbccddeeff', createdAt: FROM - 2 * 86_400_000 };
const sign = (template: { kind: number; tags: string[][]; content: string }, at: number): NostrEvent => finalizeEvent({ ...template, created_at: at / 1000 }, KEY);
const seal = sign(sealTemplate(call), FROM - 86_400_000);
const reveal = sign(revealTemplate(call, { eventId: seal.id, relay: 'wss://blue.example' }), UNTIL + 3_600_000);
const held = (seals: NostrEvent[], reveals: NostrEvent[]) => [{
  team: 'Blue Team', seals: new Map(seals.map((e) => [e.id, e])), reveals: new Map(reveals.map((e) => [`${e.pubkey}:${e.tags[0][1]}`, e])),
}];

describe('pairCalls', () => {
  it('shows a revealed call that holds to its seal, named by its team alone', () => {
    expect(pairCalls(held([seal], [reveal]), new Set())).toEqual([{
      key: `${seal.pubkey}:${call.id}`, id: call.id, team: 'Blue Team', text, sealedAt: FROM - 86_400_000, revealedAt: UNTIL + 3_600_000,
    }]);
  });

  it('shows nothing of a seal alone, a reveal that does not hash, or one of the operative\'s own calls', () => {
    expect(pairCalls(held([seal], []), new Set())).toEqual([]);
    const otherWords = sign({ ...revealTemplate(call, { eventId: seal.id, relay: 'wss://blue.example' }), content: reveal.content.replace('border', 'coast') }, UNTIL + 3_600_000);
    expect(pairCalls(held([seal], [otherWords]), new Set())).toEqual([]);
    expect(pairCalls(held([seal], [reveal]), new Set([call.id]))).toEqual([]);
  });
});

describe('readTeamCalls', () => {
  beforeEach(() => { relayState.subs.length = 0; relayState.closedPools = 0; resetCallsForTests(); });

  it('reads only joined team relays, for psi_call notes, and tells their revealed calls', async () => {
    const end = readTeamCalls();
    expect(relayState.subs.map((s) => s.relays)).toEqual([['wss://blue.example']]);
    expect(relayState.subs[0].filter).toEqual({ kinds: [30023], '#t': ['psi_call'], limit: 500 });
    const { onevent, oneose } = relayState.subs[0].handlers;
    onevent(seal);
    onevent(reveal);
    // A note whose signature does not verify is refused, though newer at the same address.
    onevent({ ...reveal, id: 'f'.repeat(64), created_at: reveal.created_at + 60, content: reveal.content.replace('border', 'coast') });
    oneose?.();
    expect(getTeamCalls().map((c) => [c.team, c.text.words])).toEqual([['Blue Team', 'Escalation along the border.']]);
    end();
    expect(relayState.subs[0].closed).toBe(true);
    expect(relayState.closedPools).toBe(1);
    expect(getTeamCalls()).toEqual([]);
  });

  it('keeps one read for every view, ended with the last, and leaves out the operative\'s own', () => {
    addCall(call);
    const endA = readTeamCalls();
    const endB = readTeamCalls();
    expect(relayState.subs).toHaveLength(1);
    relayState.subs[0].handlers.onevent(seal);
    relayState.subs[0].handlers.onevent(reveal);
    relayState.subs[0].handlers.oneose?.();
    expect(getTeamCalls()).toEqual([]);
    endA();
    expect(relayState.subs[0].closed).toBe(false);
    endB();
    endB();
    expect(relayState.subs[0].closed).toBe(true);
  });
});
