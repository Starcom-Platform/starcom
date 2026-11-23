/**
 * Share handle v26, as published: Intel Reports about a territory as a whole
 * (BA3) are listed, and featured as their territory: a listed report carries
 * `territories` when it names no place of its own.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v26', () => {
  it('is at version 26', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(26);
  });

  it('lists the territories a report is about as a whole', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toContain('territories');
  });
});
