/**
 * Whether a publish leaves the operator's network is a safety fact an intern
 * has to be able to read off the screen, so it is derived here rather than
 * left to whoever is looking at the URL list.
 */
import { describe, it, expect } from 'vitest';
// The wrapper MissionPackageBroadcastService kept under this name is gone: every
// screen now reads relayReach, which rests on this rule (plan item 0.3).
import { isPrivateRelayUrl as isPrivateRelay } from '../../nostr/publishTargets';

describe('isPrivateRelay', () => {
  it('recognises the local and private-network relays a sandbox would use', () => {
    for (const url of [
      'ws://127.0.0.1:7447', 'ws://localhost:7447', 'ws://[::1]:7447',
      'ws://10.0.0.5:7447', 'ws://192.168.1.20:7447', 'ws://172.16.4.4:7447',
      'wss://relay.team.local', 'wss://relay.ein.internal',
    ]) {
      expect(isPrivateRelay(url), url).toBe(true);
    }
  });

  it('treats every public relay as public', () => {
    for (const url of [
      'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net',
      'wss://nostr.mom', 'wss://relay.wellorder.net',
    ]) {
      expect(isPrivateRelay(url), url).toBe(false);
    }
  });

  /**
   * 172.15 and 172.32 sit OUTSIDE the RFC1918 172.16–172.31 block. A regex
   * written as /^172\./ would call them private and quietly reassure an
   * operator about a publish that does leave their network.
   */
  it('does not over-claim privacy at the edges of the 172.16/12 block', () => {
    expect(isPrivateRelay('ws://172.15.0.1:7447')).toBe(false);
    expect(isPrivateRelay('ws://172.32.0.1:7447')).toBe(false);
    expect(isPrivateRelay('ws://172.16.0.1:7447')).toBe(true);
    expect(isPrivateRelay('ws://172.31.255.254:7447')).toBe(true);
  });

  it('calls an unparseable URL public — over-warning is the safe failure', () => {
    expect(isPrivateRelay('not a url')).toBe(false);
    expect(isPrivateRelay('')).toBe(false);
  });
});
