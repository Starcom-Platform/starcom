/**
 * Share handle v20, as published: a card says where its picture is and the
 * band its footer is in (block I, item 5), so a comparison of two cards can
 * leave out the one band that changes with every capture and every build.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v20', () => {
  it('is at version 20', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(20);
  });

  it('returns a card\'s regions from every call that makes one', () => {
    for (const method of ['compose', 'composeFor'] as const) {
      expect(SHARE_HANDLE_CONTRACT.returns[method]).toContain('regions');
    }
  });
});
