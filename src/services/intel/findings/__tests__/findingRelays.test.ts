/**
 * Where a finding goes, and whether that can be pointed somewhere safe.
 *
 * This file existed with a hardcoded list of five public relays and no way to
 * override it. Mission packages gained that ability after a test package was
 * published for real and could not be recalled; findings kept the hardcoded
 * list, so the single most reachable publish button in the app — one click in
 * the analyzer — still had exactly one destination.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { findingRelays } from '../FindingsBroadcastService';

const KEYS = ['VITE_NOSTR_FINDING_RELAYS', 'VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE'];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('findingRelays', () => {
  it('publishes to the public set when nothing is configured', () => {
    const relays = findingRelays();
    expect(relays.length).toBeGreaterThan(1);
    expect(relays.every((r) => r.startsWith('wss://'))).toBe(true);
  });

  it('ADDS a configured relay rather than replacing, by default', () => {
    // The safe default is additive: a developer who adds a local relay has not
    // thereby asked to stop reaching the network, and silently detaching them
    // would be a surprise in the direction of doing less than they asked.
    process.env.VITE_NOSTR_FINDING_RELAYS = 'ws://127.0.0.1:7447';
    const relays = findingRelays();
    expect(relays).toContain('ws://127.0.0.1:7447');
    expect(relays.length).toBeGreaterThan(1);
  });

  it('publishes ONLY to the configured relay when exclusivity is asked for', () => {
    // The property an end-to-end test depends on. Without it, driving the
    // publish button in a browser test broadcasts an attested claim to five
    // public relays, irretrievably — which has already happened once here.
    process.env.VITE_NOSTR_FINDING_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE = 'true';
    expect(findingRelays()).toEqual(['ws://127.0.0.1:7447']);
  });

  it('treats any value other than "true" as not exclusive', () => {
    // Exclusivity removes the network. It is asked for explicitly or not at
    // all; a typo must not quietly detach a node from its peers.
    process.env.VITE_NOSTR_FINDING_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE = 'yes';
    expect(findingRelays().length).toBeGreaterThan(1);
  });

  it('ignores an empty configuration rather than publishing nowhere', () => {
    process.env.VITE_NOSTR_FINDING_RELAYS = '  ,  ';
    process.env.VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE = 'true';
    // Exclusive with nothing to be exclusive TO would silently publish to no
    // relay at all, and report success for reaching zero of zero.
    expect(findingRelays().length).toBeGreaterThan(1);
  });
});
