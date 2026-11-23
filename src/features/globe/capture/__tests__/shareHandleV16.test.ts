/**
 * Share handle v16, as published: the composed 9:16 (block I, item 3; decision
 * IM6). `story` is a fixed 1080×1920, its title band above the picture, its
 * facts below, and the picture what the text leaves; describeView plans it as
 * compose makes it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { CARD_PRESETS } from '../shareCardLayout';

describe('contract v16', () => {
  it('is at version 16', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(16);
  });

  it('publishes the composed 9:16 as a preset', () => {
    expect(SHARE_HANDLE_CONTRACT.presets).toContain('story');
    expect(CARD_PRESETS.story).toMatchObject({ width: 1080, height: 1920 });
  });
});
