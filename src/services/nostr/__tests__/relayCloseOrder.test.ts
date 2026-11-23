/**
 * Joining a team and checking a relay each close their connection when done,
 * and sent a subscription's CLOSE on a socket already closing. nostr-tools
 * sends CLOSE a microtask later; both settled first, and the caller then
 * closed the connection before the CLOSE went, so a browser logged
 * "WebSocket is already in CLOSING or CLOSED state" on every join (seen in the
 * browser check for plan item 9.8). A subscription is now closed before the
 * read settles.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateSecretKey, nip19 } from 'nostr-tools';

// Taken before anything imports nostr-tools or the checks, which capture the
// global WebSocket as they load.
const late = vi.hoisted(() => {
  const sentLate: string[] = [];
  const Native = globalThis.WebSocket;
  globalThis.WebSocket = class RecordingSocket extends Native {
    override send(data: Parameters<WebSocket['send']>[0]): void {
      if (this.readyState !== Native.OPEN) sentLate.push(String(data));
      super.send(data);
    }
  };
  return sentLate;
});

import { standInRelay, stopStandInRelays, localFetch } from './standInRelay';

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

afterEach(async () => {
  late.length = 0;
  await stopStandInRelays();
});

describe('closing a connection after a read', () => {
  it('a relay check sends nothing on a socket it is closing', async () => {
    globalThis.fetch = localFetch as typeof fetch;
    const { checkRelayConformance } = await import('../relayConformance');
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, nip11: { supported_nips: [42, 43] } });
    const report = await checkRelayConformance(relay.url);
    await settle();
    expect(report.keepsItToMembers).toBe(true);
    expect(late).toEqual([]);
  });

  it('joining a team sends nothing on a socket it is closing', async () => {
    globalThis.fetch = localFetch as typeof fetch;
    const nostrService = (await import('../../nostrService')).default;
    nostrService.importNsec(nip19.nsecEncode(generateSecretKey()));
    const { joinTeam } = await import('../../team/joinTeam');
    const relay = await standInRelay({ requiresSignIn: true, members: () => false, claims: ['c-1'], nip11: { name: 'Desk relay', supported_nips: [42, 43] } });
    const joined = await joinTeam({ relay: relay.url, claim: 'c-1', relayPubkey: relay.relayPubkey!, team: 'Desk', inviter: 'x', issuedAt: 0 });
    await settle();
    expect(joined).toMatchObject({ joined: true, confirmed: true });
    expect(late).toEqual([]);
  });
});
