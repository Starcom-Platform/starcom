/**
 * Share handle v13, as published: how a card frames the planet (block I, item
 * 2; globe record, section 21). `compose` and `describeView` take a `fit`,
 * what the camera framed or the whole planet, and a shot says it as
 * `framing.fit`. describeView counts the marks in the same window compose
 * renders, so a dry run describes the picture the card will be.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { CARD_FITS } from '../shareCardLayout';

describe('contract v13', () => {
  it('is at version 13', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(13);
  });

  it('lets compose and describeView take a fit, and describeView say which it used', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.compose.options).toEqual(['scale', 'preset', 'fit']);
    expect(SHARE_HANDLE_CONTRACT.methods.describeView.options).toEqual(['preset', 'fit']);
    expect(SHARE_HANDLE_CONTRACT.returns.describeView).toEqual(['preset', 'fit', 'layers', 'notCounted']);
  });

  it('publishes the fits, and the shot\'s framing.fit as built', () => {
    expect(SHARE_HANDLE_CONTRACT.fits).toEqual([...CARD_FITS]);
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('framing.fit');
  });
});
