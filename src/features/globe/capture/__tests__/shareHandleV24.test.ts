/**
 * Share handle v24, as published: Mecha Jono's briefing asks B and D, and their
 * reply on type sizes. A replay is bounded by `replay: { from, until }`, else
 * the set window (BA2); a card is drawn one type step larger where it fits
 * (IM38), and says which (`provenance.typeStep`, capture schema 17).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v24', () => {
  it('is at version 24', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(24);
  });

  it('bounds a replay by a named span, else the set window, else the reports\' own', () => {
    expect(SHARE_HANDLE_CONTRACT.replayBounds).toEqual(['from', 'until']);
    expect(SHARE_HANDLE_CONTRACT.replaySpans).toEqual(['named', 'window', 'reports']);
  });

  it('names the type steps a card can be drawn in', () => {
    expect(SHARE_HANDLE_CONTRACT.typeSteps).toEqual(['larger', 'compact']);
  });
});
