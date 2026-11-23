/**
 * Share handle v75, as published: Eco Disasters' quakes coloured by magnitude or by depth (D-EQ, EQ5), a layer choice
 * the handle can set.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v75', () => {
  it('is at version 75', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(75);
  });

  it("lets the quakes' colour be chosen", () => {
    expect(SHARE_HANDLE_CONTRACT.layerChoices.EcologicalDisasters).toContain('eco:colour');
  });
});
