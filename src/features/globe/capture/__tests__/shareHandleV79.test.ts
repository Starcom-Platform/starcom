/**
 * Share handle v79, as published: one layer at two moments side by side (D-CM, CM4), the quakes today, so much earlier
 * or a held window; cards and clips name each half's window (card schema 37, clip schema 13).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CAPTURE_SCHEMA_VERSION } from '../shareCardProvenance';
import { GLOBE_CLIP_SCHEMA_VERSION } from '../clipProvenance';
import { EARLIER_CHOICES } from '../../compare/quakeMoments';

describe('contract v79', () => {
  it('is at version 79', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(79);
  });

  it('takes a layer at another moment, so much earlier or a window held', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setCompare.options).toEqual(expect.arrayContaining(['layer', 'earlier', 'window']));
    expect(SHARE_HANDLE_CONTRACT.compareMomentLayers).toContain('EcologicalDisasters');
    expect(SHARE_HANDLE_CONTRACT.compareEarlier).toEqual([...EARLIER_CHOICES]);
  });

  it('names each half with its window on cards and clips', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(37);
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(13);
  });
});
