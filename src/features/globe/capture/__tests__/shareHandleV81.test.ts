/**
 * Share handle v81, as published: a story recorded as one clip (D-ST, ST8), clip schema 14.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CLIP_SCHEMA_VERSION } from '../clipProvenance';

describe('contract v81', () => {
  it('is at version 81', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(81);
  });

  it('records a story as one clip, returning what recordClip returns', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.recordStory).toEqual({ args: 1, options: ['story', 'fps', 'quality', 'settleMs', 'endCard'] });
    expect(SHARE_HANDLE_CONTRACT.returns.recordStory).toEqual(SHARE_HANDLE_CONTRACT.returns.recordClip);
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(14);
  });
});
