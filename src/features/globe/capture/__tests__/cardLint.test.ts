/**
 * A card's linter (block I, item 5): warnings that come back with every card,
 * for what a poster would want to know before posting it. Each says what it saw
 * and what to do; none stops the card, and a clean card has none.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { lintCard, CARD_BYTES_LIMIT } from '../cardLint';

const clean = {
  headlineShortened: false,
  labelShortened: false,
  featuredAt: { x: 540, y: 540 } as { x: number; y: number } | null,
  frame: { width: 1080, height: 1080 },
  bytes: 1_200_000,
};

describe('the card linter', () => {
  it('says nothing of a clean card', () => {
    expect(lintCard(clean)).toEqual([]);
  });

  it('says when the headline was shortened, and where the whole title is', () => {
    expect(lintCard({ ...clean, headlineShortened: true })).toEqual([
      'The headline was shortened to fit; the whole title is in the alt text and the provenance.',
    ]);
  });

  it('says when the label on the picture was shortened', () => {
    expect(lintCard({ ...clean, labelShortened: true })).toEqual([
      'The label on the picture was shortened to fit; the headline below carries the title.',
    ]);
  });

  it('says when the featured item sits at the edge of the picture, and how to fix it', () => {
    for (const at of [{ x: 20, y: 540 }, { x: 1070, y: 540 }, { x: 540, y: 15 }, { x: 540, y: 1060 }]) {
      expect(lintCard({ ...clean, featuredAt: at }), JSON.stringify(at)).toEqual([
        'The featured item is at the edge of the picture: frame it again (frameReports) or use framing.fit "view".',
      ]);
    }
    expect(lintCard({ ...clean, featuredAt: { x: 100, y: 100 } })).toEqual([]);
    expect(lintCard({ ...clean, featuredAt: null })).toEqual([]);
  });

  it(`says when the file is over ${CARD_BYTES_LIMIT / 1_000_000} MB, Discord's limit, and how to shrink it`, () => {
    expect(lintCard({ ...clean, bytes: CARD_BYTES_LIMIT + 1 })).toEqual([
      'The card is 8.0 MB, over the 8 MB Discord takes: ask for image/webp, a lower quality, or output.maxBytes.',
    ]);
    expect(lintCard({ ...clean, bytes: CARD_BYTES_LIMIT })).toEqual([]);
  });
});
