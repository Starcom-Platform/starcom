import { describe, it, expect } from 'vitest';
import { identifierFor } from '../FindingContent';

describe('the d tag, which is the claim identity', () => {
  it('keeps non-Latin subjects distinct', () => {
    // The bug this replaced collapsed every non-alphanumeric to '_', so these
    // three produced one tag — and under a parameterized-replaceable kind a
    // claim about Beijing was silently replaced by a claim about Moscow.
    const tags = ['北京', 'Москва', '東京'].map(s => identifierFor(s, 'location'));

    expect(new Set(tags).size).toBe(3);
    for (const t of tags) expect(t).not.toBe(':location');
  });

  it('keeps subjects distinct that differ only by punctuation', () => {
    const tags = ['Acme Corp', 'Acme-Corp', 'Acme/Corp', 'ACME  CORP']
      .map(s => identifierFor(s, 'location'));

    expect(new Set(tags).size).toBe(4);
  });

  it('cannot be made ambiguous by a colon in either component', () => {
    // "A:B" + "C" and "A" + "B:C" must not produce the same slot.
    expect(identifierFor('A:B', 'C')).not.toBe(identifierFor('A', 'B:C'));
  });

  it('carries no vendor prefix', () => {
    // A shared protocol identifier naming one application forces every other
    // implementation to hardcode it.
    expect(identifierFor('Acme Corp', 'location')).not.toMatch(/starcom/i);
  });

  it('is exactly percent-encode(subject):percent-encode(attribute)', () => {
    // Stated as an equality because the NIP states it normatively: an
    // independent implementation deriving it any other way occupies different
    // slots, and claims never replace or retract each other across the two.
    for (const [s, a] of [['71-75 SHELTON STREET, WC2H 9JQ', 'companiesAtRegisteredAddress'], ['北京', 'location'], ['A:B', 'C']]) {
      expect(identifierFor(s, a)).toBe(`${encodeURIComponent(s)}:${encodeURIComponent(a)}`);
    }
  });

  it('is stable and round-trippable back to its inputs', () => {
    const subject = 'Ministério da Fazenda';
    const attribute = 'headquartersLocation';

    const [encSubject, encAttribute] = identifierFor(subject, attribute).split(':');

    expect(decodeURIComponent(encSubject)).toBe(subject);
    expect(decodeURIComponent(encAttribute)).toBe(attribute);
  });
});
