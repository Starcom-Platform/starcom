/**
 * The shared tag normaliser. Two of these existed and disagreed; see the
 * module's own header for the defect that produced.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTag } from '../normalizeTag';

describe('normalizeTag', () => {
  it('lowercases, so the case an author typed stops mattering', () => {
    expect(normalizeTag('CRITICAL')).toBe('critical');
    expect(normalizeTag('Critical')).toBe('critical');
    expect(normalizeTag('critical')).toBe('critical');
  });

  /*
   * A person typing into a tag field writes the hash; a Nostr `t` tag does not
   * carry one. Both have to land on the same value or the same tag reads as two.
   */
  it('strips a leading hash, so a typed tag and a relay tag agree', () => {
    expect(normalizeTag('#critical')).toBe('critical');
    expect(normalizeTag('critical')).toBe(normalizeTag('#critical'));
  });

  it('trims, because a comma-separated field leaves spaces behind', () => {
    expect(normalizeTag('  high  ')).toBe('high');
    expect(normalizeTag(' #high ')).toBe('high');
  });

  it('strips only the first hash, leaving the rest of the tag alone', () => {
    expect(normalizeTag('##odd')).toBe('#odd');
    expect(normalizeTag('critical-infrastructure')).toBe('critical-infrastructure');
  });

  /*
   * Tags come out of parsed JSON from a relay, so the type is a promise rather
   * than a guarantee. A throw here would take down the classifier.
   */
  it('survives what untrusted input actually contains', () => {
    expect(normalizeTag(undefined as unknown as string)).toBe('');
    expect(normalizeTag(null as unknown as string)).toBe('');
    expect(normalizeTag('')).toBe('');
  });
});
