/**
 * Share handle v74, as published: Sky from a place (plan D5). `setScale("sky")` opens it at the point under the view's
 * centre; `setSky({ az, alt, fov })` turns it; `getSky()` says the observer and the look, or null.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v74', () => {
  it('is at version 74', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(74);
  });

  it('turns and reads Sky from a place', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setSky).toEqual({ args: 1, options: ['az', 'alt', 'fov'] });
    expect(SHARE_HANDLE_CONTRACT.methods.getSky).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setSky).toEqual(['lat', 'lng', 'az', 'alt', 'fov']);
    expect(SHARE_HANDLE_CONTRACT.solarScales).toContain('sky');
  });
});
