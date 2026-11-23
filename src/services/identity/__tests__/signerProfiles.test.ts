/**
 * Who posted it, read from the posts (decision D-MF, MF4): a signer's name from its own profile (kind 0),
 * taken as known only when the domain its profile names lists the key (NIP-05). Starcom names no one itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profileFromEvent, verifiedSigner, verifySigners } from '../signerProfiles';
import { forgetNames, keysNamed, learnName, nameOf } from '../names';

const KEY = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const PROFILE = { name: 'Mecha Jono', nip05: 'mecha@mecha.jono.archangel.agency', about: 'AI agent.' };

describe('profileFromEvent', () => {
  it('reads the name and the NIP-05 address a profile states', () => {
    expect(profileFromEvent({ content: JSON.stringify(PROFILE) })).toEqual({ name: 'Mecha Jono', nip05: 'mecha@mecha.jono.archangel.agency' });
  });
  it('takes a display name where there is no name, and states nothing from nonsense', () => {
    expect(profileFromEvent({ content: JSON.stringify({ display_name: 'Jono' }) })).toEqual({ name: 'Jono' });
    expect(profileFromEvent({ content: 'not json' })).toEqual({});
  });
});

describe('verifiedSigner', () => {
  it('is its profile name and domain when the domain lists the key', async () => {
    const readProfile = vi.fn(async () => ({ name: 'Mecha Jono', nip05: 'mecha@mecha.jono.archangel.agency' }));
    const lists = vi.fn(async () => true);
    expect(await verifiedSigner(KEY, { readProfile, lists })).toEqual({ name: 'Mecha Jono', domain: 'mecha.jono.archangel.agency' });
    expect(lists).toHaveBeenCalledWith('mecha@mecha.jono.archangel.agency', KEY);
  });
  it('is nothing when the domain does not list it, the profile names no address, or there is no profile', async () => {
    expect(await verifiedSigner(KEY, { readProfile: async () => ({ name: 'Mecha Jono', nip05: 'mecha@x.example' }), lists: async () => false })).toBeNull();
    expect(await verifiedSigner(KEY, { readProfile: async () => ({ name: 'Mecha Jono' }), lists: async () => true })).toBeNull();
    expect(await verifiedSigner(KEY, { readProfile: async () => null, lists: async () => true })).toBeNull();
  });
  it('names a verified key with nothing to call it by its address', async () => {
    expect(await verifiedSigner(KEY, { readProfile: async () => ({ nip05: 'mecha@x.example' }), lists: async () => true })).toEqual({ name: 'mecha@x.example', domain: 'x.example' });
  });
});

describe('verifySigners', () => {
  beforeEach(() => forgetNames());

  it('gives each verified signer its name for the session, once a key, and its name points back to the key', async () => {
    const readProfile = vi.fn(async () => PROFILE);
    const lists = vi.fn(async () => true);
    await verifySigners([KEY, KEY], { readProfile, lists });
    await verifySigners([KEY], { readProfile, lists });
    expect(readProfile).toHaveBeenCalledTimes(1);
    expect(nameOf(KEY)).toEqual({ name: 'Mecha Jono', source: 'nip05', domain: 'mecha.jono.archangel.agency' });
    expect(keysNamed('mecha jono')).toEqual([KEY]);
  });

  it('lets a name a person learned, from a team roster, come before the one a key gives itself', async () => {
    learnName(KEY, 'Jono (roster)', 'team');
    await verifySigners([KEY], { readProfile: async () => PROFILE, lists: async () => true });
    expect(nameOf(KEY)).toEqual({ name: 'Jono (roster)', source: 'team' });
  });

  it('keeps nothing for a signer that does not verify', async () => {
    await verifySigners(['a'.repeat(64)], { readProfile: async () => PROFILE, lists: async () => false });
    expect(nameOf('a'.repeat(64))).toBeNull();
  });

  it('never stores a verified name: a new session asks again', async () => {
    await verifySigners([KEY], { readProfile: async () => PROFILE, lists: async () => true });
    expect(JSON.stringify({ ...localStorage })).not.toContain('Mecha Jono');
  });
});
