/**
 * The publish-destination contract, tested once for every channel that uses it.
 *
 * Six paths publish to relays and only two could be aimed anywhere private, so
 * the same rule was implemented twice and missing four times. These tests are
 * the reason a seventh path gets it right without anyone remembering to ask.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  publishRelays, destinationIsPublic, isPrivateRelayUrl, describeDestination, destinationLine,
  DEFAULT_PUBLISH_RELAYS, internalRelays, relayReach, widestReach, hasJoined,
  chatProviderRelays, emergencyChatRelays, intelSearchRelays, relaysFor, readRelays,
  inboxListTargets, signerProfileRelays,
} from '../publishTargets';
import { NAVCOM_SURFACE_RELAYS, CHAT_PROVIDER_RELAYS, EXTRA_PUBLIC_RELAYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';

const KEYS = [
  'VITE_NOSTR_MISSION_RELAYS', 'VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE',
  'VITE_NOSTR_FINDING_RELAYS', 'VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE',
  'VITE_NOSTR_INTEL_RELAYS', 'VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE',
  'VITE_NOSTR_INTERNAL_RELAYS',
  'VITE_NOSTR_CHAT_RELAYS', 'VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE', 'VITE_NOSTR_INTEL_SEARCH_RELAYS',
];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('publishRelays', () => {
  it('defaults to the public set when nothing is configured', () => {
    expect(publishRelays('INTEL')).toEqual([...DEFAULT_PUBLISH_RELAYS]);
  });

  it('ADDS a configured relay rather than replacing it', () => {
    process.env.VITE_NOSTR_INTEL_RELAYS = 'ws://127.0.0.1:7447';
    const relays = publishRelays('INTEL');
    expect(relays).toContain('ws://127.0.0.1:7447');
    expect(relays.length).toBe(DEFAULT_PUBLISH_RELAYS.length + 1);
  });

  it('replaces them only when exclusivity is asked for explicitly', () => {
    process.env.VITE_NOSTR_INTEL_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE = 'true';
    expect(publishRelays('INTEL')).toEqual(['ws://127.0.0.1:7447']);
  });

  it('keeps channels independent, so isolating one does not isolate another', () => {
    // The bug this prevents is subtle and bad: a developer isolates missions,
    // believes they are safe, and publishes a finding to public relays.
    process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
    expect(publishRelays('MISSION')).toEqual(['ws://127.0.0.1:7447']);
    expect(publishRelays('FINDING')).toEqual([...DEFAULT_PUBLISH_RELAYS]);
  });

  it('treats anything other than "true" as not exclusive', () => {
    // Exclusivity removes the network. A typo must not quietly detach a node.
    process.env.VITE_NOSTR_INTEL_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE = 'yes';
    expect(publishRelays('INTEL').length).toBeGreaterThan(1);
  });

  it('ignores an empty configuration rather than publishing to nowhere', () => {
    // Exclusive with nothing to be exclusive TO would publish to zero relays
    // and report reaching zero of zero as success.
    process.env.VITE_NOSTR_INTEL_RELAYS = ' , ';
    process.env.VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE = 'true';
    expect(publishRelays('INTEL')).toEqual([...DEFAULT_PUBLISH_RELAYS]);
  });
});

describe('isPrivateRelayUrl', () => {
  it.each([
    'ws://127.0.0.1:7447', 'ws://localhost:7447', 'ws://10.0.0.5',
    'ws://192.168.1.9', 'ws://172.16.0.1', 'ws://relay.local', 'ws://relay.internal',
  ])('recognises %s as private', (url) => {
    expect(isPrivateRelayUrl(url)).toBe(true);
  });

  it.each([
    'wss://relay.damus.io', 'wss://nos.lol', 'ws://172.32.0.1', 'ws://8.8.8.8',
  ])('treats %s as public', (url) => {
    expect(isPrivateRelayUrl(url)).toBe(false);
  });

  it('treats an unparseable URL as public', () => {
    // Over-warning costs a second thought; under-warning costs a publish
    // somebody believed was a sandbox exercise.
    expect(isPrivateRelayUrl('not-a-url')).toBe(false);
  });

  it('excludes 172.32, which is outside the private range', () => {
    // 172.16-172.31 is RFC1918; 172.32 is not, and a naive prefix match on
    // "172." would hand an operator a false assurance about a public address.
    expect(isPrivateRelayUrl('ws://172.31.255.254')).toBe(true);
    expect(isPrivateRelayUrl('ws://172.32.0.1')).toBe(false);
  });
});

describe('destinationIsPublic', () => {
  it('is public when ANY relay is public', () => {
    // One public destination makes the act irreversible; the private ones
    // alongside it change nothing about that.
    expect(destinationIsPublic(['ws://127.0.0.1:7447', 'wss://nos.lol'])).toBe(true);
  });

  it('is private only when every relay is', () => {
    expect(destinationIsPublic(['ws://127.0.0.1:7447', 'ws://localhost:8080'])).toBe(false);
  });
});

describe('describeDestination', () => {
  it('states the consequence, not just the fact', () => {
    expect(describeDestination(['wss://nos.lol'])).toMatch(/cannot be recalled/);
    expect(describeDestination(['ws://127.0.0.1:7447'])).toMatch(/nothing leaves your network/);
  });
});

/*
 * Beneath the publish button (plan item 3.7, decision D8): the destination in a
 * few words, naming Navcom beside the relays it means.
 */
describe('destinationLine', () => {
  it('counts the relays by their reach', () => {
    expect(destinationLine(['wss://nos.lol', 'wss://relay.damus.io', 'wss://a.example', 'wss://b.example', 'wss://c.example'])).toBe('Goes to Navcom: 5 public relays');
    expect(destinationLine(['ws://127.0.0.1:7447'])).toBe('Goes to Navcom: 1 local relay');
  });

  it('says both kinds when they are mixed', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
    expect(destinationLine(['wss://team.relay.example'])).toBe('Goes to Navcom: 1 internal relay');
    expect(destinationLine(['wss://nos.lol', 'wss://relay.damus.io', 'wss://a.example', 'wss://team.relay.example']))
      .toBe('Goes to Navcom: 4 relays, 3 public and 1 internal');
  });
});

/*
 * Plan item 0.3. A relay behind the team's tunnel is neither public nor on this
 * network: it is reached over the internet, and it checks who may read. It is
 * internal only when the operator declares it; no relay is assumed internal.
 */
const TEAM_RELAY = 'wss://team.relay.example';

describe('relayReach', () => {
  it('calls a relay on this network local', () => {
    expect(relayReach('ws://127.0.0.1:7447')).toBe('local');
    expect(relayReach('wss://relay.local')).toBe('local');
    expect(relayReach('ws://192.168.1.20:7777')).toBe('local');
  });

  it('calls a relay internal only when the operator declared it', () => {
    expect(relayReach(TEAM_RELAY)).toBe('public');
    process.env.VITE_NOSTR_INTERNAL_RELAYS = `${TEAM_RELAY}, wss://second.relay.example`;
    expect(internalRelays()).toEqual([TEAM_RELAY, 'wss://second.relay.example']);
    expect(relayReach(TEAM_RELAY)).toBe('internal');
    expect(relayReach('wss://nos.lol')).toBe('public');
  });

  it('never counts an internal relay as public, so a Limited publish can go there', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(destinationIsPublic([TEAM_RELAY])).toBe(false);
    expect(destinationIsPublic([TEAM_RELAY, 'wss://nos.lol'])).toBe(true);
  });

  it('names the widest reach among several relays', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(widestReach(['ws://127.0.0.1:7447'])).toBe('local');
    expect(widestReach(['ws://127.0.0.1:7447', TEAM_RELAY])).toBe('internal');
    expect(widestReach([TEAM_RELAY, 'wss://nos.lol'])).toBe('public');
  });
});

/*
 * Signing in (NIP-42) tells a relay who is reading, so it goes only to relays
 * the person has joined: for now the build's declared internal set.
 */
describe('hasJoined', () => {
  it('counts a relay as joined only when the operator declared it', () => {
    expect(hasJoined(TEAM_RELAY)).toBe(false);
    expect(hasJoined('ws://127.0.0.1:7447')).toBe(false);
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(hasJoined(TEAM_RELAY)).toBe(true);
    expect(hasJoined('WSS://Team.Relay.Example/')).toBe(true);
    expect(hasJoined('wss://nos.lol')).toBe(false);
  });
});

describe('describeDestination, with an internal relay', () => {
  it('never says nothing leaves your network of a relay reached through a tunnel', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    const words = describeDestination([TEAM_RELAY]);
    expect(words).not.toMatch(/nothing leaves your network/);
    expect(words).toMatch(/team's relay/);
    expect(words).toMatch(/who may read/);
  });
});

/*
 * Chat had no override at all (plan item 0.3): nostrService, the Nostr chat
 * provider, and emergency mode each read the registry directly, so an operator
 * could not keep a team's chat on the team's relay.
 */
describe('chat relays', () => {
  it('publishes and reads chat on the public surface when nothing is configured', () => {
    expect(publishRelays('CHAT')).toEqual([...NAVCOM_SURFACE_RELAYS]);
  });

  it('adds a configured chat relay, and keeps chat to it only when told to', () => {
    process.env.VITE_NOSTR_CHAT_RELAYS = TEAM_RELAY;
    expect(publishRelays('CHAT')).toEqual([...NAVCOM_SURFACE_RELAYS, TEAM_RELAY]);
    process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
    expect(publishRelays('CHAT')).toEqual([TEAM_RELAY]);
  });

  it('keeps the chat provider its own default, under the same configuration', () => {
    expect(chatProviderRelays()).toEqual([...CHAT_PROVIDER_RELAYS]);
    process.env.VITE_NOSTR_CHAT_RELAYS = TEAM_RELAY;
    process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
    expect(chatProviderRelays()).toEqual([TEAM_RELAY]);
  });

  it('adds no public relay in an emergency once chat is kept to configured relays', () => {
    expect(emergencyChatRelays()).toEqual([...EXTRA_PUBLIC_RELAYS]);
    process.env.VITE_NOSTR_CHAT_RELAYS_EXCLUSIVE = 'true';
    // Exclusive with nothing configured changes nothing, as for every channel.
    expect(emergencyChatRelays()).toEqual([...EXTRA_PUBLIC_RELAYS]);
    process.env.VITE_NOSTR_CHAT_RELAYS = TEAM_RELAY;
    expect(emergencyChatRelays()).toEqual([]);
  });
});

describe('intel search relays', () => {
  it('are the surface unless configured, and configuration replaces them: it names which relays can search', () => {
    expect(intelSearchRelays()).toEqual([...NAVCOM_SURFACE_RELAYS]);
    process.env.VITE_NOSTR_INTEL_SEARCH_RELAYS = `${TEAM_RELAY}, wss://search.relay.example`;
    expect(intelSearchRelays()).toEqual([TEAM_RELAY, 'wss://search.relay.example']);
  });
});

/*
 * Distribution picks the relays (plan item 0.4, decision D2). Limited and
 * Private used to behave the same: a publish refused unless every relay was on
 * this network, so a Limited mission could never be published at all.
 */
describe('relaysFor', () => {
  it('sends Public to the channel\'s relays', () => {
    expect(relaysFor('MISSION', 'public')).toEqual(publishRelays('MISSION'));
  });

  it('sends Limited only where it is not public: the team\'s internal relays', () => {
    expect(relaysFor('MISSION', 'limited')).toEqual([]);
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(relaysFor('MISSION', 'limited')).toEqual([TEAM_RELAY]);
    expect(relaysFor('FINDING', 'limited')).toEqual([TEAM_RELAY]);
  });

  it('also sends Limited to a relay on this network the channel is configured with', () => {
    process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
    expect(relaysFor('MISSION', 'limited')).toEqual(['ws://127.0.0.1:7447']);
  });

  it('never sends Private anywhere, nor anything nobody has decided on', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(relaysFor('MISSION', 'private')).toEqual([]);
    expect(relaysFor('MISSION', undefined)).toEqual([]);
  });
});

describe('reading what went to the internal relays', () => {
  it('reads missions and findings there too, so the team receives what Limited sent; the globe stays public', () => {
    process.env.VITE_NOSTR_INTERNAL_RELAYS = TEAM_RELAY;
    expect(readRelays('MISSION')).toContain(TEAM_RELAY);
    expect(readRelays('FINDING')).toContain(TEAM_RELAY);
    expect(readRelays('INTEL')).not.toContain(TEAM_RELAY);
  });
});

describe('inboxListTargets', () => {
  it('sends a person\'s inbox list where inbox lists are read, except The Record, which refuses that kind from anyone', () => {
    expect(signerProfileRelays()).toContain(THE_RECORD_RELAY);
    expect(inboxListTargets()).toEqual(signerProfileRelays().filter((url) => url !== THE_RECORD_RELAY));
    expect(inboxListTargets().length).toBeGreaterThan(0);
  });
});
