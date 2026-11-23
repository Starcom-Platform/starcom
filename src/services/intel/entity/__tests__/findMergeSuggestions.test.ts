import { describe, it, expect } from 'vitest';
import { findMergeSuggestions } from '../findMergeSuggestions';

describe('findMergeSuggestions', () => {
  it('suggests a near-miss spelling (a real typo) as a candidate merge', () => {
    const suggestions = findMergeSuggestions(['Acme Corporation', 'Acme Corporatoin']);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].similarity).toBeGreaterThanOrEqual(0.88);
  });

  it('never offers two identifiers as spellings of one name (plan item 3.6)', () => {
    // Each pair scores above the bar by spelling alone, and each is two
    // different things: an LEI, a Wikidata place, a Nostr key, a register number.
    const suggestions = findMergeSuggestions([
      '31570010000000034433', '31570010000000033463',
      'Q169376', 'Q169378',
      '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692',
      '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319611',
      '02100855', '02100856',
      'Jon Smith', 'John Smith',
    ]);
    expect(suggestions.map((s) => [s.nameA, s.nameB])).toEqual([['Jon Smith', 'John Smith']]);
  });

  it('does not suggest genuinely different entities', () => {
    const suggestions = findMergeSuggestions(['John Smith', 'Jane Doe']);
    expect(suggestions).toHaveLength(0);
  });

  it('does not suggest two names already merged by exact-match normalization (option A already handled those)', () => {
    const suggestions = findMergeSuggestions(['John Smith', 'john smith.', '  JOHN SMITH  ']);
    expect(suggestions).toHaveLength(0);
  });

  it('does not suggest a name against itself when repeated exactly', () => {
    const suggestions = findMergeSuggestions(['John Smith', 'John Smith', 'John Smith']);
    expect(suggestions).toHaveLength(0);
  });

  it('sorts suggestions by similarity, most-likely-the-same-entity first', () => {
    const suggestions = findMergeSuggestions([
      'Acme Corporation',
      'Acme Corporatoin', // one-letter transposition — very close
      'Acme Corp'          // a genuinely different (abbreviated) name — likely below threshold, but if not, should rank lower
    ]);
    if (suggestions.length > 1) {
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].similarity).toBeGreaterThanOrEqual(suggestions[i].similarity);
      }
    }
  });

  it('returns an empty array for an empty or single-entity list, not an error', () => {
    expect(findMergeSuggestions([])).toEqual([]);
    expect(findMergeSuggestions(['Solo Entity'])).toEqual([]);
  });
});
