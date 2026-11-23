/**
 * Share handle v23, as published: a card can carry a close-up of its featured
 * item (`card.inset`, IM34–IM36), for a public venue or a heat town only, and
 * says where it is (`regions.inset`) and what it draws (`provenance.inset`).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v23', () => {
  it('is at version 23', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(23);
  });

  it('builds a shot\'s close-up inset', () => {
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('card.inset');
    expect(SHARE_HANDLE_CONTRACT.shot.notBuilt).not.toContain('card.inset');
  });
});
