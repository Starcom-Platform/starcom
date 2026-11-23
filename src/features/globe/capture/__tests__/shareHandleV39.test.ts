/**
 * Share handle v39: a briefing playlist as a clip (briefing-playlists.md, BP14–BP21),
 * as the published contract declares it.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { PLAYLISTS } from '../../tour/briefingPlaylist';
import { GLOBE_CLIP_SCHEMA_VERSION } from '../clipProvenance';

describe('share handle v39', () => {
  it('declares recordTour, what it may be told, and that it returns what recordClip returns', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(39);
    // markStyle joined at v54 (plan H4).
    expect(SHARE_HANDLE_CONTRACT.methods.recordTour.options.slice(0, 6)).toEqual(['playlist', 'fps', 'quality', 'settleMs', 'endCard', 'timeoutMs']);
    expect(SHARE_HANDLE_CONTRACT.returns.recordTour).toEqual(SHARE_HANDLE_CONTRACT.returns.recordClip);
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
  });

  it('lists the playlists the tour has, no more and no fewer', () => {
    expect([...SHARE_HANDLE_CONTRACT.playlists]).toEqual([...PLAYLISTS]);
  });
});
