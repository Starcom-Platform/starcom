/**
 * Share handle v72, as published: the solar system's scale (critique-2026-11-01, OR9, OR31). `setScale(scale)` draws
 * `"compact"` or `"true"` for this page only, never saved, null returning to the person's; `getScale()` says the scale
 * in force and who chose it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { SOLAR_SCALES } from '../../../../solar-system/solarScale';

describe('contract v72', () => {
  it('is at version 72', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(72);
  });

  it("sets and reads the solar system's scale for a page", () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setScale).toEqual({ args: 1, options: [] });
    expect(SHARE_HANDLE_CONTRACT.methods.getScale).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setScale).toEqual(['scale', 'from']);
    expect(SHARE_HANDLE_CONTRACT.returns.getScale).toEqual(['scale', 'from']);
  });

  it('publishes the scales setScale takes, Diagram since v73, as the app has them', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(73);
    expect(SHARE_HANDLE_CONTRACT.solarScales).toEqual([...SOLAR_SCALES]);
    expect(SHARE_HANDLE_CONTRACT.solarScales).toEqual(['compact', 'true', 'diagram', 'sky']);
  });
});
