/**
 * normalizeEntityName — Phase 1 (roadmap: "entity resolution, option A").
 * IntelWeb's entity registry and IntelAnalyzer's co-occurrence pairing both
 * previously keyed on the raw string, so "John Smith" and "john smith."
 * silently fragmented into two disconnected entities.
 */
import { describe, it, expect } from 'vitest';
import { normalizeEntityName } from '../normalizeEntityName';

describe('normalizeEntityName', () => {
  it('case-folds', () => {
    expect(normalizeEntityName('John Smith')).toBe(normalizeEntityName('JOHN SMITH'));
    expect(normalizeEntityName('John Smith')).toBe(normalizeEntityName('john smith'));
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeEntityName('  John Smith  ')).toBe(normalizeEntityName('John Smith'));
  });

  it('collapses internal whitespace', () => {
    expect(normalizeEntityName('John   Smith')).toBe(normalizeEntityName('John Smith'));
  });

  it('strips trailing punctuation noise', () => {
    expect(normalizeEntityName('John Smith.')).toBe(normalizeEntityName('John Smith'));
    expect(normalizeEntityName('Acme Corp,')).toBe(normalizeEntityName('Acme Corp'));
  });

  it('does not merge genuinely different names', () => {
    expect(normalizeEntityName('John Smith')).not.toBe(normalizeEntityName('Jane Smith'));
    expect(normalizeEntityName('Acme Corp')).not.toBe(normalizeEntityName('Acme Corporation'));
  });

  it('does not strip meaningful internal punctuation (not the same as a nickname/alias problem)', () => {
    // Deliberately conservative — "J. Smith" stays distinct from "John Smith",
    // since bridging that needs alias resolution, not string normalization.
    expect(normalizeEntityName('J. Smith')).not.toBe(normalizeEntityName('John Smith'));
  });
});
