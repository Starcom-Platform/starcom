/**
 * Share handle v17, as published: alt text and warnings on every card (block
 * I, item 5). `alt` is written from what the card states and never given;
 * `warnings` come from the card's linter, and renderShot returns them with the
 * plan's.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v17', () => {
  it('is at version 17', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(17);
  });

  it('lets every card carry its alt text and warnings', () => {
    for (const method of ['compose', 'composeFor'] as const) {
      expect(SHARE_HANDLE_CONTRACT.returns[method]).toEqual(expect.arrayContaining(['alt', 'warnings']));
    }
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('output.alt');
    expect(SHARE_HANDLE_CONTRACT.shot.notBuilt).not.toContain('output.alt');
  });
});
