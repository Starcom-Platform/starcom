/**
 * The sentence a card or clip uses when the capturing browser had nothing of its
 * own to analyse.
 *
 * It said "Nothing of yours was there to analyse", the globe's own wording since
 * step 2 of decision D-F. That is right in the app, where it is addressed to the
 * person using it. On a card it is read by strangers, and Mecha Jono pointed out
 * (2026-09-25) that it reads as addressed to them. So the card names the browser
 * that made the image, and the app keeps its own wording.
 */
import { describe, it, expect } from 'vitest';
import { EMPTY_REASON_CAVEAT } from '../shareCardProvenance';

describe('the sentence a card uses when the capturing browser had nothing to analyse', () => {
  it('names the browser that made the image, for stills and clips alike', () => {
    expect(EMPTY_REASON_CAVEAT['no-observations']).toBe(
      'The browser that made this image had no observations of its own to analyse, so it '
      + 'shows no analysis. That is not a finding that there is nothing to find.',
    );
  });

  it('never addresses the reader as the owner of the data', () => {
    expect(EMPTY_REASON_CAVEAT['no-observations']).not.toMatch(/\byours?\b/i);
  });
});
