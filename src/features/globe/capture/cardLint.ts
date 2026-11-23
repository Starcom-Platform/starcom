/**
 * A card's linter (block I, item 5): warnings that come back with every card,
 * for what a poster would want to know before posting it. Each says what it
 * saw and what to do. None stops the card: a refusal is for a card that would
 * mislead, and these are about one that could be better.
 */

/** What Discord takes, Mecha Jono's limit for a card (their v9 proposal's size_limit_bytes). */
export const CARD_BYTES_LIMIT = 8_000_000;

/** The bytes a base64 data URL decodes to: the file's size, without decoding it. */
export const bytesOfDataUrl = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',');
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
};

/** Within this share of the picture's shorter side of an edge, an item is at the edge. */
const EDGE_SHARE = 0.04;

export interface CardLintInput {
  /** The headline was shortened at a word to fit its lines. */
  headlineShortened: boolean;
  /** The label on the picture was shortened at a word to fit. */
  labelShortened: boolean;
  /** Where the featured glyph is in the frame, or null when nothing is featured. */
  featuredAt: { x: number; y: number } | null;
  frame: { width: number; height: number };
  /** The finished card file's size. */
  bytes: number;
  /** How many of the picture's marks a close-up inset covers (IM35); absent without one. */
  insetCovers?: number;
  /** Whether the inset lies over the featured item's label, when no corner was clear of it. */
  insetOverLabel?: boolean;
}

export function lintCard(input: CardLintInput): string[] {
  const warnings: string[] = [];
  if (input.headlineShortened) {
    warnings.push('The headline was shortened to fit; the whole title is in the alt text and the provenance.');
  }
  if (input.labelShortened) {
    warnings.push('The label on the picture was shortened to fit; the headline below carries the title.');
  }
  if (input.featuredAt) {
    const margin = EDGE_SHARE * Math.min(input.frame.width, input.frame.height);
    const { x, y } = input.featuredAt;
    if (x < margin || y < margin || x > input.frame.width - margin || y > input.frame.height - margin) {
      warnings.push('The featured item is at the edge of the picture: frame it again (frameReports) or use framing.fit "view".');
    }
  }
  if (input.insetCovers) {
    warnings.push(
      `The close-up inset covers ${input.insetCovers} ${input.insetCovers === 1 ? 'mark' : 'marks'} on the globe: no corner of the picture `
      + 'was clear. Frame the item again, or leave the inset off (card.inset).',
    );
  }
  if (input.insetOverLabel) {
    warnings.push('The close-up inset lies over the featured item\'s label: no corner was clear of it. Frame the item again, or leave the inset off.');
  }
  if (input.bytes > CARD_BYTES_LIMIT) {
    warnings.push(
      `The card is ${(input.bytes / 1_000_000).toFixed(1)} MB, over the 8 MB Discord takes: `
      + 'ask for image/webp, a lower quality, or output.maxBytes.',
    );
  }
  return warnings;
}
