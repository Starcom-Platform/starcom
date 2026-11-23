/**
 * The callsign a person publishes under (decision D-MX, MX7): the author a
 * Mission Package names, chosen to be public. Kept apart from the private
 * display name (names.ts), which can be a real name and is never published.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';
import { publishedCallsign, setPublishedCallsign, authorFor, subscribeCallsign, publishesAsAgent, setPublishesAsAgent, agentFor } from '../callsign';
import { ownName, setOwnName } from '../names';

const KEY = getPublicKey(generateSecretKey());

beforeEach(() => { localStorage.clear(); });

describe('the published callsign', () => {
  it('is none until set, then what it was set to, trimmed; nothing but whitespace clears it', () => {
    expect(publishedCallsign()).toBeNull();
    setPublishedCallsign('  Night Owl ');
    expect(publishedCallsign()).toBe('Night Owl');
    setPublishedCallsign('   ');
    expect(publishedCallsign()).toBeNull();
  });

  it('refuses a key, hex or npub: nobody publishes under a key by name', () => {
    expect(() => setPublishedCallsign(KEY)).toThrow(/key/);
    expect(() => setPublishedCallsign(nip19.npubEncode(KEY))).toThrow(/key/);
    expect(publishedCallsign()).toBeNull();
  });

  it('refuses more than 40 characters, or more than one line', () => {
    expect(() => setPublishedCallsign('x'.repeat(41))).toThrow(/40/);
    expect(() => setPublishedCallsign('Night\nOwl')).toThrow(/one line/);
    setPublishedCallsign('x'.repeat(40));
    expect(publishedCallsign()).toHaveLength(40);
  });

  it('is kept apart from the private name: setting one never sets or clears the other', () => {
    setOwnName('Priya Raman');
    setPublishedCallsign('Night Owl');
    expect(ownName()).toBe('Priya Raman');
    expect(publishedCallsign()).toBe('Night Owl');
    setPublishedCallsign('');
    expect(ownName()).toBe('Priya Raman');
    setOwnName('');
    setPublishedCallsign('Kestrel');
    expect(ownName()).toBeNull();
  });

  it('tells its listeners when it changes', () => {
    let heard = 0;
    const stop = subscribeCallsign(() => { heard++; });
    setPublishedCallsign('Night Owl');
    setPublishedCallsign('');
    stop();
    setPublishedCallsign('Kestrel');
    expect(heard).toBe(2);
  });
});

describe('authorFor', () => {
  it('names the callsign when there is one, and otherwise the signer\'s key, as an npub', () => {
    expect(authorFor(KEY)).toBe(nip19.npubEncode(KEY));
    setPublishedCallsign('Night Owl');
    expect(authorFor(KEY)).toBe('Night Owl');
  });

  it('never names the private display name', () => {
    setOwnName('Priya Raman');
    expect(authorFor(KEY)).toBe(nip19.npubEncode(KEY));
  });
});

describe('an agent\'s key (D-MX, MX14)', () => {
  it('is a person\'s until set, and says so only once set: it names its author as the agent', () => {
    expect(publishesAsAgent()).toBe(false);
    expect(agentFor(KEY)).toBeUndefined();
    setPublishesAsAgent(true);
    expect(agentFor(KEY)).toBe(nip19.npubEncode(KEY));
    setPublishedCallsign('mecha_jono');
    expect(agentFor(KEY)).toBe('mecha_jono');
    setPublishesAsAgent(false);
    expect(agentFor(KEY)).toBeUndefined();
  });

  it('tells the callsign\'s listeners when it changes', () => {
    let heard = 0;
    const stop = subscribeCallsign(() => { heard++; });
    setPublishesAsAgent(true);
    setPublishesAsAgent(false);
    stop();
    expect(heard).toBe(2);
  });
});
