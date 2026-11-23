/**
 * Reading NavCom's labels on the packages this app shows (D-MX, MX1, MX5).
 * Signed with real keys: a forged claim must not count, and a fake verifier
 * would prove nothing about that.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { MissionLabelIngest } from '../MissionLabelIngest';
import type { MissionLabel } from '../missionLabels';

const subs = vi.hoisted(() => ({
  filters: [] as unknown[],
  handlers: [] as Array<{ onevent: (e: NostrEvent) => void; oneose?: () => void }>,
  closed: 0,
}));

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return {
    ...actual,
    SimplePool: class {
      subscribeMany(_relays: string[], filter: unknown, handlers: { onevent: (e: NostrEvent) => void; oneose?: () => void }) {
        subs.filters.push(filter);
        subs.handlers.push(handlers);
        return { close: () => { subs.closed += 1; } };
      }
      close() { /* nothing to close in the fake */ }
    },
  };
});

const operator = generateSecretKey();
const PKG = `30079:${'6'.repeat(64)}:starcom_mission_package_field-heat_relief`;
const OTHER = `30079:${'6'.repeat(64)}:starcom_mission_package_field-other`;

const claim = (coordinate: string, key = operator): NostrEvent => finalizeEvent({
  kind: 1985, created_at: Math.floor(Date.now() / 1000),
  tags: [['L', 'navcom.mission'], ['l', 'claimed', 'navcom.mission'], ['a', coordinate]], content: '',
}, key);

const deliver = (event: NostrEvent) => subs.handlers.forEach((h) => h.onevent(event));

const collect = (relays = ['wss://one', 'wss://two']) => {
  const ingest = new MissionLabelIngest(relays);
  const seen: MissionLabel[] = [];
  ingest.subscribe((l) => seen.push(l));
  return { ingest, seen };
};

beforeEach(() => { subs.filters = []; subs.handlers = []; subs.closed = 0; });

describe('MissionLabelIngest', () => {
  it('asks each relay for navcom.mission labels on the packages it was given, and only those', () => {
    const { ingest } = collect();
    ingest.start([PKG]);
    expect(subs.filters).toHaveLength(2);
    expect(subs.filters[0]).toEqual({ kinds: [1985], '#L': ['navcom.mission'], '#a': [PKG] });
  });

  it('asks nothing when there is nothing to ask about', () => {
    const { ingest } = collect();
    ingest.start(['', '  ']);
    expect(subs.filters).toHaveLength(0);
  });

  it('passes on a verified claim, once, however many relays deliver it', () => {
    const { ingest, seen } = collect();
    ingest.start([PKG]);
    const event = claim(PKG);
    deliver(event);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ value: 'claimed', pubkey: getPublicKey(operator), coordinates: [PKG] });
  });

  it('refuses a claim whose signature does not verify, and one on a package it never asked about', () => {
    const { ingest, seen } = collect();
    ingest.start([PKG]);
    deliver({ ...claim(PKG), content: 'tampered' });
    deliver(claim(OTHER));
    expect(seen).toHaveLength(0);
  });

  it('says when a relay has sent all it holds, so silence before then means nothing', () => {
    const { ingest } = collect();
    const told = vi.fn();
    ingest.onAnswered(told);
    ingest.start([PKG]);
    expect(ingest.relaysAnswered()).toBe(0);
    subs.handlers[0].oneose?.();
    expect(ingest.relaysAnswered()).toBe(1);
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('asks only for the words given, passes on only those, and asks again when the words change (NavCom §5.3)', () => {
    const { ingest, seen } = collect(['wss://one']);
    ingest.start([PKG], ['witnessed', 'settled', 'challenged', 'settled']);
    expect(subs.filters).toEqual([{ kinds: [1985], '#L': ['navcom.mission'], '#a': [PKG], '#l': ['challenged', 'settled', 'witnessed'] }]);
    deliver(claim(PKG));
    const witnessed = finalizeEvent({
      kind: 1985, created_at: Math.floor(Date.now() / 1000),
      tags: [['L', 'navcom.mission'], ['l', 'witnessed', 'navcom.mission'], ['e', 'r'.repeat(64)], ['a', PKG]], content: '',
    }, operator);
    deliver(witnessed);
    expect(seen.map((l) => l.value)).toEqual(['witnessed']);
    ingest.start([PKG], ['challenged', 'settled', 'witnessed']);
    expect(subs.filters).toHaveLength(1);
    ingest.start([PKG]);
    expect(subs.filters).toHaveLength(2);
    expect(subs.filters[1]).toEqual({ kinds: [1985], '#L': ['navcom.mission'], '#a': [PKG] });
  });

  it('closes what it opened, and does not reopen an unchanged watch', () => {
    const { ingest } = collect();
    ingest.start([PKG]);
    ingest.start([PKG]);
    expect(subs.filters).toHaveLength(2);
    ingest.stop();
    expect(subs.closed).toBe(2);
    expect(ingest.relaysAnswered()).toBe(0);
  });
});
