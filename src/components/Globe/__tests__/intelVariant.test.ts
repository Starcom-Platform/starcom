/**
 * Which of the four an Intel Report is (decision D-F, step 6, part 4).
 *
 * ─── THE ORDER, AND WHY IT IS THAT ORDER ───────────────────────────────────
 *
 * The author's word first, because Mecha Jono assembles these reports and should
 * be able to say what one is. Then the priority ladder, which is a real signal
 * the app already reads. Then Raw — not as a fallback for "we could not tell",
 * but because `unset` literally means nobody assessed it, which is what raw
 * intel is.
 *
 * What is deliberately NOT inferred: 'Actionable' never comes from a high
 * priority. The ladder says how urgent a report is, not whether anyone can act
 * on it, and reading one as the other would put a claim on the globe that no
 * report ever made. It comes only from an author saying so.
 *
 * Today every report on the relays is `unset`, so today every one is Raw. That
 * is the honest starting state, not a defect — the distinction appears the
 * moment a post carries a tag.
 */
import { describe, it, expect } from 'vitest';
import { INTEL_VARIANTS, intelVariantOf, isIntelVariant } from '../intelVariant';

describe('intelVariantOf: the author said so', () => {
  it('reads an explicit variant tag', () => {
    expect(intelVariantOf({ tags: ['actionable'] })).toBe('actionable');
    expect(intelVariantOf({ tags: ['raw'] })).toBe('raw');
    expect(intelVariantOf({ tags: ['critical'] })).toBe('critical');
  });

  it('reads it in whatever case, and with a hash, as the tag fields produce', () => {
    expect(intelVariantOf({ tags: ['ACTIONABLE'] })).toBe('actionable');
    expect(intelVariantOf({ tags: ['#Raw'] })).toBe('raw');
    expect(intelVariantOf({ tags: [' Critical '] })).toBe('critical');
  });

  /*
   * A report that is both urgent and actionable is drawn as the more urgent
   * thing, matching the priority ladder's own precedence.
   */
  it('draws a report that is both as the more urgent of the two', () => {
    expect(intelVariantOf({ tags: ['actionable', 'critical'] })).toBe('critical');
    expect(intelVariantOf({ tags: ['raw', 'urgent'] })).toBe('critical');
    expect(intelVariantOf({ tags: ['raw', 'actionable'] })).toBe('actionable');
  });

  /*
   * Exact membership, not substring. Only cases that can actually tell the two
   * apart are asserted: 'raw-feed' resolves to Raw either way — by substring, or
   * by falling through to an unset priority — so it proves nothing and is left
   * out.
   */
  it('does not read a tag that merely contains a variant word', () => {
    expect(intelVariantOf({ tags: ['actionable-intelligence'] })).toBe('raw');
    expect(intelVariantOf({ tags: ['critical-infrastructure'] })).toBe('raw');
    expect(intelVariantOf({ tags: ['high-value', 'actionable-item'] })).toBe('raw');
  });
});

describe('intelVariantOf: falling back to the priority the app already reads', () => {
  it('draws a critical priority as Critical', () => {
    expect(intelVariantOf({ tags: ['nostr', 'urgent'] })).toBe('critical');
  });

  it('draws any stated-but-not-critical priority as Standard', () => {
    expect(intelVariantOf({ tags: ['high'] })).toBe('standard');
    expect(intelVariantOf({ tags: ['medium'] })).toBe('standard');
    expect(intelVariantOf({ tags: ['low'] })).toBe('standard');
  });

  /*
   * The case that matters most, because it is every report on the relays today.
   */
  it('draws a report nobody assessed as Raw', () => {
    expect(intelVariantOf({ tags: [] })).toBe('raw');
    expect(intelVariantOf({ tags: ['nostr', 'relay:wss://relay.damus.io', 'geoint'] })).toBe('raw');
  });

  /*
   * A high priority is urgency, not actionability. Reading one as the other
   * would put a claim on the globe that no report made.
   */
  it('never infers Actionable from a priority', () => {
    for (const tag of ['high', 'medium', 'low', 'urgent', 'critical']) {
      expect(intelVariantOf({ tags: [tag] })).not.toBe('actionable');
    }
  });

  it('survives a marker with no tags at all', () => {
    expect(intelVariantOf({ tags: undefined as unknown as string[] })).toBe('raw');
  });
});

describe('the variant vocabulary', () => {
  it('lists exactly the four', () => {
    expect([...INTEL_VARIANTS].sort()).toEqual(['actionable', 'critical', 'raw', 'standard']);
  });

  it('knows a variant from anything else', () => {
    expect(isIntelVariant('critical')).toBe(true);
    expect(isIntelVariant('URGENT')).toBe(false);
    expect(isIntelVariant('constructor')).toBe(false);
    expect(isIntelVariant(undefined)).toBe(false);
  });

  /*
   * Every marker resolves to something drawable. The sprite layer indexes its
   * atlas by variant, so an unlisted value would sample nothing and draw a hole.
   */
  it('always returns one of the four', () => {
    const cases = [[], ['x'], ['critical'], ['actionable'], ['raw'], ['high'], ['nostr']];
    for (const tags of cases) {
      expect(INTEL_VARIANTS).toContain(intelVariantOf({ tags }));
    }
  });
});
