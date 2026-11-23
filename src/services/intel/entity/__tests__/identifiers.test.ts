import { describe, it, expect } from 'vitest';
import { identifierKind, isIdentifier } from '../identifiers';

describe('identifierKind', () => {
  it('knows an LEI, a Wikidata item, a Nostr key in both forms, and a register number', () => {
    expect(identifierKind('31570010000000034433')).toBe('lei');
    expect(identifierKind('2138009TF1SYOMQLBJ60')).toBe('lei');
    expect(identifierKind('Q169376')).toBe('wikidata');
    expect(identifierKind('6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692')).toBe('key');
    expect(identifierKind('npub1vvqufjq6q9ysne0y3d7qe6gn2k7pnzqy9t7f6445dr2fq5ceu2fqg7t9mv')).toBe('npub');
    expect(identifierKind('02100855')).toBe('number');
    expect(identifierKind('  Q64  ')).toBe('wikidata');
  });

  it('reads a name as a name, even one holding a digit', () => {
    for (const name of ['John Smith', '7-Eleven', '3M', 'Q-Tip', 'Quarry 12', 'THE GO-AHEAD GROUP LIMITED', '123', 'Q0']) {
      expect(identifierKind(name), name).toBeNull();
      expect(isIdentifier(name), name).toBe(false);
    }
  });

  it('does not read nineteen or twenty-one characters as an LEI', () => {
    expect(identifierKind('2138009TF1SYOMQLBJ6')).toBeNull();
    expect(identifierKind('2138009TF1SYOMQLBJ601')).toBeNull();
    // Its last two characters are check digits.
    expect(identifierKind('2138009TF1SYOMQLBJ6X')).toBeNull();
  });
});
