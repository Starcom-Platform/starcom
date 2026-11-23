/**
 * Contract v7: clips worth posting (decision D-F, section 18, item 5). Additive.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { END_CARD_MODES } from '../recordGlobeClip';
import { REPLAY_PACES } from '../replayPace';

describe('contract v7', () => {
  it('is at version 7', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(7);
  });

  it('declares planReportTour and what it returns', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.planReportTour).toEqual({ args: 2, options: ['preset', 'maxStops', 'holdMs', 'travelMs'] });
    expect(SHARE_HANDLE_CONTRACT.returns.planReportTour).toEqual(['keyframes', 'stops', 'durationMs', 'skipped']);
  });

  it('lets recordClip choose its end card, from the modes the recorder has', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.recordClip.options).toContain('endCard');
    expect(SHARE_HANDLE_CONTRACT.methods.recordClip.options).toContain('replay');
    expect([...SHARE_HANDLE_CONTRACT.endCards]).toEqual([...END_CARD_MODES]);
  });

  it('names the replay paces the recorder has, even first as the default', () => {
    expect([...SHARE_HANDLE_CONTRACT.replayPaces]).toEqual([...REPLAY_PACES]);
    expect(SHARE_HANDLE_CONTRACT.replayPaces[0]).toBe('even');
  });

  it('still takes every option recordClip took in v3', () => {
    for (const o of ['keyframes', 'fps', 'quality', 'settleMs']) {
      expect(SHARE_HANDLE_CONTRACT.methods.recordClip.options).toContain(o);
    }
  });
});
