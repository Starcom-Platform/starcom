/**
 * Share handle v78, as published: two layers side by side (D-CM, CM3), set and read by the handle, and recorded by
 * cards (schema 36) and clips (schema 12).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CAPTURE_SCHEMA_VERSION } from '../shareCardProvenance';
import { GLOBE_CLIP_SCHEMA_VERSION } from '../clipProvenance';

describe('contract v78', () => {
  it('is at version 78', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(78);
  });

  it('sets and reads a comparison of two layers', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setCompare.args).toBe(1);
    expect(SHARE_HANDLE_CONTRACT.methods.setCompare.options).toEqual(expect.arrayContaining(['left', 'right']));
    expect(SHARE_HANDLE_CONTRACT.methods.getCompare).toEqual({ args: 0, options: [] });
  });

  it('records it on cards and clips', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(36);
    expect(GLOBE_CLIP_SCHEMA_VERSION).toBeGreaterThanOrEqual(12);
  });
});
