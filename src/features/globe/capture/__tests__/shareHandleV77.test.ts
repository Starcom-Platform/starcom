/**
 * Share handle v77, as published: a clip's replay replays the quakes drawn as flags, each fading over 1, 4 or 10 s of
 * the clip (D-EQ, EQ21), its record saying so (clip schema 11).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CLIP_SCHEMA_VERSION } from '../clipProvenance';
import { DECAY_CHOICES_S, DEFAULT_DECAY_S } from '../../timebar/playClock';

describe('contract v77', () => {
  it('is at version 77', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(77);
  });

  it("publishes the seconds of a clip a replayed quake may fade over, the time bar's own", () => {
    expect(SHARE_HANDLE_CONTRACT.replayQuakeDecays).toEqual([...DECAY_CHOICES_S]);
    expect(SHARE_HANDLE_CONTRACT.replayQuakeDecays).toContain(DEFAULT_DECAY_S);
  });

  it('records the quakes a clip replayed, from clip schema 11', () => {
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(11);
  });
});
