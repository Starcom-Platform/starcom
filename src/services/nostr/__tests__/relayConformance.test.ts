/**
 * Whether a relay keeps what a team sends it to the team (plan item 2.3a),
 * checked against relays on this machine that do and do not.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { standInRelay, stopStandInRelays, localFetch } from './standInRelay';
import { checkRelayConformance, whyNotTrusted, type ConformanceReport } from '../relayConformance';
import { APP_KINDS } from '../kindRegistry';

const NIP11 = { name: 'Harbour desk', supported_nips: [1, 11, 42, 43] };
const outcomes = (report: ConformanceReport) => Object.fromEntries(report.results.map((r) => [r.check, r.outcome]));
const member = 'a'.repeat(64);

beforeEach(() => {
  // NIP-11 is read over HTTP from the stand-ins on this machine, and only there.
  globalThis.fetch = localFetch as typeof fetch;
});
afterEach(async () => {
  await stopStandInRelays();
});

describe('checkRelayConformance', () => {
  it('trusts a relay that keeps reads and writes to its members, as zooid does', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: NIP11, members: (k) => k === member });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    expect(outcomes(report)).toEqual({
      'describes-itself': 'holds',
      'asks-who-signs-in': 'holds',
      'reads-need-sign-in': 'holds',
      'writes-need-sign-in': 'holds',
      'outsiders-cannot-read': 'holds',
      'outsiders-cannot-write': 'holds',
    });
    expect(report.keepsItToMembers).toBe(true);
    expect(report.info?.name).toBe('Harbour desk');
    // What the relay said is kept, word for word.
    expect(report.results.find((r) => r.check === 'outsiders-cannot-read')?.relaySaid).toBe('restricted: you are not a member of this relay');
  });

  it('trusts a relay that turns an outsider away at sign-in', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: NIP11, admits: (k) => k === member });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    expect(report.keepsItToMembers).toBe(true);
    expect(report.results.find((r) => r.check === 'outsiders-cannot-read')?.says).toMatch(/turns away a key that is not a member/);
  });

  it('does not trust a relay anyone can read and write', async () => {
    const relay = await standInRelay({ requiresSignIn: false, nip11: NIP11 });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    expect(outcomes(report)).toMatchObject({ 'reads-need-sign-in': 'fails', 'writes-need-sign-in': 'fails' });
    expect(report.keepsItToMembers).toBe(false);
    expect(report.results.find((r) => r.check === 'reads-need-sign-in')?.says).toMatch(/anyone/i);
  });

  it('does not trust an open relay that holds nothing yet: being served at all is the failure', async () => {
    const relay = await standInRelay({ requiresSignIn: false, nip11: NIP11, noMemberList: true });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    expect(outcomes(report)['reads-need-sign-in']).toBe('fails');
    expect(report.keepsItToMembers).toBe(false);
  });

  it('cannot tell from a refusal that is not about signing in, and says what the relay said', async () => {
    const relay = await standInRelay({ requiresSignIn: false, nip11: NIP11, refusesWith: 'error: the database is locked' });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    const reads = report.results.find((r) => r.check === 'reads-need-sign-in')!;
    expect(reads.outcome).toBe('unknown');
    expect(reads.says).toBe('Could not tell: it refused, but not for want of a sign-in.');
    expect(reads.relaySaid).toBe('error: the database is locked');
    expect(report.results.find((r) => r.check === 'writes-need-sign-in')?.outcome).toBe('unknown');
    expect(report.keepsItToMembers).toBe(false);
  });

  it('cannot tell from a refusal of the probe\'s kind whether anyone may write, as The Record answered', async () => {
    const relay = await standInRelay({ requiresSignIn: false, nip11: NIP11, refusesWith: 'blocked: kind 20096 not accepted on this relay' });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    const writes = report.results.find((r) => r.check === 'writes-need-sign-in')!;
    expect(writes.outcome).toBe('unknown');
    expect(writes.relaySaid).toBe('blocked: kind 20096 not accepted on this relay');
  });

  it('does not trust a relay where signing in with any key is enough', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: NIP11 });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 2_000 });
    expect(outcomes(report)).toMatchObject({
      'reads-need-sign-in': 'holds',
      'outsiders-cannot-read': 'fails',
      'outsiders-cannot-write': 'fails',
    });
    expect(report.keepsItToMembers).toBe(false);
  });

  it('does not trust a relay that never asks who is signing in', async () => {
    const relay = await standInRelay({ requiresSignIn: false, asksNoSignIn: true, nip11: NIP11 });
    const started = Date.now();
    const report = await checkRelayConformance(relay.url, { timeoutMs: 1_000 });
    expect(outcomes(report)['asks-who-signs-in']).toBe('fails');
    expect(report.keepsItToMembers).toBe(false);
    // Waited on once, not again for the outsider's checks.
    expect(report.results.find((r) => r.check === 'outsiders-cannot-read')?.says).toBe('Could not tell: it never asked who is signing in.');
    expect(Date.now() - started).toBeLessThan(1_900);
  });

  it('does not trust a relay it could not ask, and says it could not tell', async () => {
    const report = await checkRelayConformance('ws://127.0.0.1:9', { timeoutMs: 1_000 });
    expect(report.keepsItToMembers).toBe(false);
    expect(outcomes(report)['describes-itself']).toBe('fails');
    expect(report.results.filter((r) => r.check !== 'describes-itself').every((r) => r.outcome === 'unknown')).toBe(true);
  });

  it('does not trust a relay whose answers it could not get: could not tell is not a pass', async () => {
    const relay = await standInRelay({ requiresSignIn: true, nip11: NIP11, answersNothing: true });
    const report = await checkRelayConformance(relay.url, { timeoutMs: 500 });
    expect(outcomes(report)).toMatchObject({ 'describes-itself': 'holds', 'reads-need-sign-in': 'unknown', 'writes-need-sign-in': 'unknown' });
    expect(report.results.some((r) => r.outcome === 'fails')).toBe(false);
    expect(report.keepsItToMembers).toBe(false);
    expect(report.results.find((r) => r.check === 'reads-need-sign-in')?.says).toMatch(/^Could not tell: it did not answer in time/);
    expect(report.results.find((r) => r.check === 'writes-need-sign-in')?.says).toMatch(/^Could not tell: it did not answer in time/);
  });

  it('says in one sentence why a relay is not used for a team, or nothing when it is', async () => {
    const open = await standInRelay({ requiresSignIn: false, nip11: NIP11 });
    const kept = await standInRelay({ requiresSignIn: true, nip11: NIP11, members: () => false });
    expect(whyNotTrusted(await checkRelayConformance(open.url, { timeoutMs: 2_000 })))
      .toBe(`Starcom will not use ${open.url} for a team. It serves what it holds to anyone, signed in or not.`);
    expect(whyNotTrusted(await checkRelayConformance(kept.url, { timeoutMs: 2_000 }))).toBeNull();
  });

  it('writes nothing a relay keeps, and signs in with throwaway keys only', async () => {
    const open = await standInRelay({ requiresSignIn: false, nip11: NIP11 });
    await checkRelayConformance(open.url, { timeoutMs: 2_000 });
    // An open relay took the probes; they are ephemeral, so a real relay keeps nothing.
    // (The stand-in keeps everything, its own member list included.)
    const written = open.held.filter((e) => e.pubkey !== open.relayPubkey);
    expect(written.length).toBeGreaterThan(0);
    expect(written.every((e) => e.kind === APP_KINDS.RELAY_PROBE && e.kind >= 20000 && e.kind < 30000)).toBe(true);

    const first = await standInRelay({ requiresSignIn: true, nip11: NIP11, members: () => false });
    const second = await standInRelay({ requiresSignIn: true, nip11: NIP11, members: () => false });
    await checkRelayConformance(first.url, { timeoutMs: 2_000 });
    await checkRelayConformance(second.url, { timeoutMs: 2_000 });
    // A sign-in says who is signing in; a fresh key each time says nothing.
    expect(first.signIns).toHaveLength(1);
    expect(second.signIns).toHaveLength(1);
    expect(first.signIns[0].pubkey).not.toBe(second.signIns[0].pubkey);
  });
});
