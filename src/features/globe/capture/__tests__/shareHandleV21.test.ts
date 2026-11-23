/**
 * Share handle v21, as published: every card is exactly its size (IM27, IM28),
 * and the contract says each size, so a driver knows what it gets.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { CARD_PRESETS } from '../shareCardLayout';

describe('contract v21', () => {
  it('is at version 21', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(21);
  });

  it('states each size as the whole card, as the layout makes it', () => {
    expect(SHARE_HANDLE_CONTRACT.presetSizes).toEqual({
      wide: [1200, 630], square: [1080, 1080], portrait: [1080, 1350], embed: [1280, 800], story: [1080, 1920],
    });
    for (const [preset, [width, height]] of Object.entries(SHARE_HANDLE_CONTRACT.presetSizes)) {
      expect(CARD_PRESETS[preset as keyof typeof CARD_PRESETS]).toMatchObject({ width, height });
    }
    expect(Object.keys(SHARE_HANDLE_CONTRACT.presetSizes)).toEqual([...SHARE_HANDLE_CONTRACT.presets]);
  });
});
