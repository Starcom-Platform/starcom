/**
 * Names (plan item 2.1, story S2). "A new report says 'Author: anonymous'.
 * Elsewhere a person is a 64-character hex key. There is no screen to set a
 * display name."
 *
 * A name is for reading this screen, kept in this browser. It is never
 * published: not in a package, not in a finding, not as a relay profile.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ownName, setOwnName, nameOf, learnName, subscribeNames, forgetNames, keyLabel, keysNamed,
} from '../names';
import { nostrIdentityService } from '../NostrIdentityService';

const PRIYA = 'a'.repeat(64);
const AISHA = 'b'.repeat(64);

beforeEach(() => {
  forgetNames();
  vi.restoreAllMocks();
});

describe('your own name', () => {
  it('is nothing until you set one, and is kept in this browser once you do', () => {
    expect(ownName()).toBeNull();
    setOwnName('  Priya Raman  ');
    expect(ownName()).toBe('Priya Raman');
    expect(JSON.stringify(localStorage)).toContain('Priya Raman');
  });

  it("names your keys, the signer's and this browser's, as yours", () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(PRIYA);
    vi.spyOn(nostrIdentityService, 'getPubkey').mockReturnValue('c'.repeat(64));
    setOwnName('Priya Raman');

    expect(nameOf(PRIYA)).toMatchObject({ name: 'Priya Raman', source: 'you' });
    expect(nameOf('c'.repeat(64))).toMatchObject({ name: 'Priya Raman', source: 'you' });
  });

  it('clears when set to nothing', () => {
    setOwnName('Priya Raman');
    setOwnName('   ');
    expect(ownName()).toBeNull();
  });
});

describe('names for other keys', () => {
  it('knows nobody it has not been told about', () => {
    expect(nameOf(AISHA)).toBeNull();
    expect(nameOf(null)).toBeNull();
  });

  it('learns a name, and says where it came from', () => {
    learnName(AISHA, 'Aisha Knight', 'team');
    expect(nameOf(AISHA)).toMatchObject({ name: 'Aisha Knight', source: 'team' });
  });

  it("does not let a weaker source rename someone a team has named", () => {
    learnName(AISHA, 'Aisha Knight', 'team');
    learnName(AISHA, 'Totally Aisha', 'bundle');
    expect(nameOf(AISHA)).toMatchObject({ name: 'Aisha Knight', source: 'team' });

    learnName(AISHA, 'A. Knight', 'team');
    expect(nameOf(AISHA)?.name).toBe('A. Knight');
  });

  it('ignores a name that is only whitespace, or a key that is not a key', () => {
    learnName(AISHA, '   ', 'collaborator');
    learnName('not-a-key', 'Someone', 'collaborator');
    expect(nameOf(AISHA)).toBeNull();
    expect(nameOf('not-a-key')).toBeNull();
  });

  it('tells whoever is listening when a name changes', () => {
    const heard = vi.fn();
    const stop = subscribeNames(heard);
    learnName(AISHA, 'Aisha Knight', 'team');
    setOwnName('Priya Raman');
    stop();
    learnName(AISHA, 'A. Knight', 'team');
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

// The words for a key where a component cannot be drawn, as in a hover
// (ProvenanceFrame, BD19): what KeyName shows, as plain text.
describe('a key in words', () => {
  it('is its learned name, "you" for your own, or its short npub', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(PRIYA);
    vi.spyOn(nostrIdentityService, 'getPubkey').mockReturnValue(null);
    expect(keyLabel(PRIYA)).toBe('you');
    setOwnName('Priya Raman');
    expect(keyLabel(PRIYA)).toBe('Priya Raman (you)');
    learnName(AISHA, 'Aisha', 'team');
    expect(keyLabel(AISHA)).toBe('Aisha');
    const other = 'e'.repeat(64);
    expect(keyLabel(other)).toMatch(/^npub1[0-9a-z]{9}…[0-9a-z]{6}$/);
    expect(keyLabel('not a key')).toBe('not a key');
  });
});

// Which keys a name is known for (BD25): a received package that claims a name
// known for another key is an impersonation.
describe('the keys a name is known for', () => {
  it('finds learned names and your own, whatever the case or spaces', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(PRIYA);
    vi.spyOn(nostrIdentityService, 'getPubkey').mockReturnValue(null);
    setOwnName('Priya Raman');
    learnName(AISHA, 'Navcom', 'team');
    expect(keysNamed(' navcom ')).toEqual([AISHA]);
    expect(keysNamed('Priya Raman')).toEqual([PRIYA]);
    expect(keysNamed('Nobody')).toEqual([]);
    expect(keysNamed('')).toEqual([]);
  });
});

