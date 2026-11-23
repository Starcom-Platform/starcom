import { describe, expect, it } from 'vitest';
import { getRLSHGroupKeyFromTags, getRLSHLocationKey, RLSH_GROUP_KEY_TAG_PREFIX } from '../rlshTags';

describe('rlshTags utilities', () => {
  it('extracts explicit group key from tags', () => {
    const tags = ['RLSH', `${RLSH_GROUP_KEY_TAG_PREFIX}group-abc`, 'hero'];
    expect(getRLSHGroupKeyFromTags(tags)).toBe('group-abc');
  });

  it('returns null when group key tag is absent', () => {
    expect(getRLSHGroupKeyFromTags(['RLSH', 'hero'])).toBeNull();
    expect(getRLSHGroupKeyFromTags(null)).toBeNull();
  });

  it('creates stable location keys with fixed precision', () => {
    expect(getRLSHLocationKey(32.7156999, -117.1611001)).toBe('32.71570|-117.16110');
  });

  it('returns null for invalid coordinates', () => {
    expect(getRLSHLocationKey(Number.NaN, -117.1611)).toBeNull();
    expect(getRLSHLocationKey(32.7157, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
