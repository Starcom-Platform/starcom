/**
 * Share handle v19, as published: capture mode (block I, item 5; IM20, IM23).
 * A shot's time.at pauses the shared timeline at that moment, with the sun
 * there, and every capture holds motion still at its moment, so the same shot
 * makes the same picture.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v19', () => {
  it('is at version 19', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(19);
  });

  it('builds a shot\'s moment, and lets a raw capture say the moment its motion holds', () => {
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('time.at');
    expect(SHARE_HANDLE_CONTRACT.shot.notBuilt).not.toContain('time.at');
    expect(SHARE_HANDLE_CONTRACT.methods.captureFrame.options).toContain('stillAt');
  });
});
