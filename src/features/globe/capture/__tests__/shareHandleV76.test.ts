/**
 * Share handle v76, as published: the quake kit's plate boundaries and volcanoes on or off (D-EQ, EQ8), and which
 * magnitudes and depths of quake are drawn (EQ6), each a layer choice the handle can set.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v76', () => {
  it('is at version 76', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(76);
  });

  it("lets the quake kit's plates, volcanoes and ranges be chosen", () => {
    expect(SHARE_HANDLE_CONTRACT.layerChoices.EcologicalDisasters).toEqual(expect.arrayContaining(['eco:plates', 'eco:volcanoes', 'eco:magnitudes', 'eco:depths']));
  });
});
