/**
 * EntityAliasRegistry — entity resolution, option B. Persists a human's
 * confirm/reject decision on a fuzzy-match suggestion so the same pair
 * never re-prompts, matching the "suggest, never silently merge" discipline
 * the whole entity-resolution research pass established (i2/Maltego both
 * route merges through explicit review, never silent auto-merge).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityAliasRegistry } from '../EntityAliasRegistry';

describe('EntityAliasRegistry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('a pair with no decision yet has no recorded decision', () => {
    const registry = new EntityAliasRegistry();
    expect(registry.getDecision('John Smith', 'Jon Smith')).toBeUndefined();
  });

  it('confirm() persists a decision that a fresh instance can read back', () => {
    const registry = new EntityAliasRegistry();
    registry.confirm('John Smith', 'Jon Smith');

    const reloaded = new EntityAliasRegistry();
    expect(reloaded.getDecision('John Smith', 'Jon Smith')).toBe('confirmed');
  });

  it('reject() persists too, and is distinguishable from confirm()', () => {
    const registry = new EntityAliasRegistry();
    registry.reject('John Smith', 'Jane Doe');

    expect(registry.getDecision('John Smith', 'Jane Doe')).toBe('rejected');
  });

  it('a decision is order-independent — A~B and B~A resolve to the same record', () => {
    const registry = new EntityAliasRegistry();
    registry.confirm('John Smith', 'Jon Smith');

    expect(registry.getDecision('Jon Smith', 'John Smith')).toBe('confirmed');
  });

  it('filterUndecided drops both confirmed and rejected pairs — neither should re-prompt', () => {
    const registry = new EntityAliasRegistry();
    registry.confirm('A', 'B');
    registry.reject('C', 'D');

    const filtered = registry.filterUndecided([
      { nameA: 'A', nameB: 'B', similarity: 0.9 },
      { nameA: 'C', nameB: 'D', similarity: 0.9 },
      { nameA: 'E', nameB: 'F', similarity: 0.9 } // undecided — should survive
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ nameA: 'E', nameB: 'F' });
  });

  it('getConfirmedAliases returns only confirmed decisions, not rejected ones', () => {
    const registry = new EntityAliasRegistry();
    registry.confirm('A', 'B');
    registry.reject('C', 'D');

    const confirmed = registry.getConfirmedAliases();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ nameA: 'A', nameB: 'B', decision: 'confirmed' });
  });

  it('a corrupted (non-array) persisted value does not crash construction', () => {
    localStorage.setItem('intelWorkspace.entityAliasDecisions', '{"not":"an array"}');
    expect(() => new EntityAliasRegistry()).not.toThrow();
    expect(new EntityAliasRegistry().getConfirmedAliases()).toEqual([]);
  });

  it('malformed JSON does not crash construction', () => {
    localStorage.setItem('intelWorkspace.entityAliasDecisions', 'not valid json{');
    expect(() => new EntityAliasRegistry()).not.toThrow();
  });
});
