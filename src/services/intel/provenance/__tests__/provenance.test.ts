/**
 * Whose a record is (BD19, BD21, decided 2026-10-05), from what the record
 * itself shows: yours, a peer's, unknown, or an impersonation. The frame each
 * draws is MIL-STD-2525's: solid cyan, dashed cyan, a yellow "?", a red
 * diamond. Nothing is called an impersonation on a guess: only a record that
 * names an author other than the key that signed it.
 */
import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { reportProvenance, recordProvenance, packageProvenance, provenanceWords } from '../provenance';

const ME = 'a'.repeat(64);
const PRIYA = 'c'.repeat(64);
const MALLORY = 'd'.repeat(64);
const isOwn = (key: string) => key === ME;
const RELAY = [{ action: 'IMPORTED', user: 'nostr' }];

describe('a report', () => {
  it('is yours when written here under your key', () => {
    expect(reportProvenance({ author: ME }, isOwn)).toEqual({ whose: 'own', how: 'written-here' });
  });

  it("is a peer's when it came in their bundle, whoever it names as author", () => {
    expect(reportProvenance({ author: PRIYA, receivedFrom: { pubkey: PRIYA } }, isOwn)).toEqual({ whose: 'peer', how: 'bundle', from: PRIYA });
    // The copy is the one they sent, so it is theirs to answer for.
    expect(reportProvenance({ author: ME, receivedFrom: { pubkey: PRIYA } }, isOwn)).toEqual({ whose: 'peer', how: 'bundle', from: PRIYA });
  });

  it('is yours when the bundle was your own', () => {
    expect(reportProvenance({ author: ME, receivedFrom: { pubkey: ME } }, isOwn)).toEqual({ whose: 'own', how: 'bundle' });
  });

  it("is a peer's when read from a relay, where its author is the key that signed it", () => {
    expect(reportProvenance({ author: PRIYA, history: RELAY }, isOwn)).toEqual({ whose: 'peer', how: 'relay', from: PRIYA });
    expect(reportProvenance({ author: ME, history: RELAY }, isOwn)).toEqual({ whose: 'own', how: 'relay' });
  });

  it('is unknown when it names a key not yours and nothing here was signed by it', () => {
    expect(reportProvenance({ author: PRIYA }, isOwn)).toEqual({ whose: 'unknown', how: 'unsigned', claims: PRIYA });
  });

  it('is unknown when no key is recorded as its author', () => {
    for (const author of [undefined, '', 'anonymous', 'ANALYST', 'nostr']) {
      expect(reportProvenance({ author }, isOwn), String(author)).toEqual({ whose: 'unknown', how: 'no-author' });
    }
  });

  it('is an impersonation only when it names one key and another signed it', () => {
    expect(reportProvenance({ author: PRIYA, signed: { claims: PRIYA, by: MALLORY } }, isOwn))
      .toEqual({ whose: 'impersonation', how: 'mismatch', claims: PRIYA, from: MALLORY });
    // Signed by the key it names: what else it shows decides.
    expect(reportProvenance({ author: PRIYA, history: RELAY, signed: { claims: PRIYA, by: PRIYA } }, isOwn))
      .toEqual({ whose: 'peer', how: 'relay', from: PRIYA });
    // A name is not a key: nothing to compare, so no diamond.
    expect(reportProvenance({ author: PRIYA, history: RELAY, signed: { claims: 'Navcom', by: PRIYA } }, isOwn).whose).toBe('peer');
  });
});

describe('a case or an intel item, which name no author', () => {
  it('is yours when made here, and a peer\'s when it came in their bundle', () => {
    expect(recordProvenance({}, isOwn)).toEqual({ whose: 'own', how: 'made-here' });
    expect(recordProvenance({ receivedFrom: { pubkey: PRIYA } }, isOwn)).toEqual({ whose: 'peer', how: 'bundle', from: PRIYA });
    expect(recordProvenance({ receivedFrom: { pubkey: ME } }, isOwn)).toEqual({ whose: 'own', how: 'bundle' });
  });
});

// Demo material (plan item 0.9) is nobody's work: a seed wrote it.
describe('a sample', () => {
  it('is of unknown origin, said as a sample, whatever key it names', () => {
    expect(recordProvenance({ sample: true }, isOwn)).toEqual({ whose: 'unknown', how: 'sample' });
    expect(reportProvenance({ author: ME, sample: true }, isOwn)).toEqual({ whose: 'unknown', how: 'sample' });
  });
});

describe('the words', () => {
  const label = (key: string) => (key === PRIYA ? 'Priya' : key === MALLORY ? 'npub1mallory' : key);

  it('say whose it is and how that is known', () => {
    expect(provenanceWords({ whose: 'own', how: 'written-here' }, label)).toBe('Yours: written under your key.');
    expect(provenanceWords({ whose: 'own', how: 'made-here' }, label)).toBe('Yours: made in this workspace.');
    expect(provenanceWords({ whose: 'unknown', how: 'sample' }, label)).toBe('Sample: demo material, written by no one.');
    expect(provenanceWords({ whose: 'own', how: 'bundle' }, label)).toBe('Yours: from a bundle you signed.');
    expect(provenanceWords({ whose: 'own', how: 'relay' }, label)).toBe('Yours: published under your key.');
    expect(provenanceWords({ whose: 'peer', how: 'bundle', from: PRIYA }, label)).toBe('From Priya: in a bundle they signed.');
    expect(provenanceWords({ whose: 'peer', how: 'relay', from: PRIYA }, label)).toBe('From Priya: published under their key.');
    expect(provenanceWords({ whose: 'unknown', how: 'unsigned', claims: PRIYA }, label)).toBe('Says it is by Priya, but nothing here was signed by them.');
    expect(provenanceWords({ whose: 'unknown', how: 'no-author' }, label)).toBe('Nobody is recorded as its author.');
    expect(provenanceWords({ whose: 'impersonation', how: 'mismatch', claims: PRIYA, from: MALLORY }, label)).toBe('Says it is from Priya, but npub1mallory signed it.');
  });
});

// BD25: a received package says who it is from (a free string its publisher
// chose) beside the key that signed it, which is the verified fact.
describe('a received package', () => {
  const NAVCOM = 'e'.repeat(64);
  const known: Record<string, string[]> = { navcom: [NAVCOM], priya: [PRIYA] };
  const keysNamed = (name: string) => known[name.trim().toLowerCase()] ?? [];

  it("is a peer's when it claims nothing, the key that signed it, or that key's known name", () => {
    expect(packageProvenance({ signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'peer', how: 'signed', from: PRIYA });
    expect(packageProvenance({ claims: PRIYA, signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'peer', how: 'signed', from: PRIYA });
    expect(packageProvenance({ claims: ' Priya ', signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'peer', how: 'signed', from: PRIYA });
  });

  it('is yours when you signed it', () => {
    expect(packageProvenance({ claims: 'Starcom', signedBy: ME }, isOwn, keysNamed)).toEqual({ whose: 'own', how: 'signed' });
  });

  it('is an impersonation when it claims another key, as hex or npub', () => {
    expect(packageProvenance({ claims: NAVCOM, signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'impersonation', how: 'mismatch', claims: NAVCOM, from: PRIYA });
    expect(packageProvenance({ claims: nip19.npubEncode(NAVCOM), signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'impersonation', how: 'mismatch', claims: NAVCOM, from: PRIYA });
  });

  it('is an impersonation when it claims a name already known for another key', () => {
    expect(packageProvenance({ claims: 'Navcom', signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'impersonation', how: 'mismatch', claims: 'Navcom', from: PRIYA });
  });

  it('is unknown when it claims a name nobody here knows', () => {
    expect(packageProvenance({ claims: 'Night Owls', signedBy: PRIYA }, isOwn, keysNamed)).toEqual({ whose: 'unknown', how: 'unconfirmed', claims: 'Night Owls', from: PRIYA });
  });

  it('says so in words', () => {
    const label = (key: string) => (key === PRIYA ? 'Priya' : key);
    expect(provenanceWords({ whose: 'peer', how: 'signed', from: PRIYA }, label)).toBe('From Priya: a package they signed.');
    expect(provenanceWords({ whose: 'own', how: 'signed' }, label)).toBe('Yours: a package you signed.');
    expect(provenanceWords({ whose: 'unknown', how: 'unconfirmed', claims: 'Night Owls', from: PRIYA }, label))
      .toBe('Says it is from Night Owls, but nothing here ties that name to Priya, who signed it.');
    expect(provenanceWords({ whose: 'impersonation', how: 'mismatch', claims: 'Navcom', from: PRIYA }, label)).toBe('Says it is from Navcom, but Priya signed it.');
  });
});

