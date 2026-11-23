/**
 * Share handle v30, as published: looking by area (BA21). `listReports({ area })`
 * lists what stands in an area, by where each item is listed as standing.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v30', () => {
  it('is at version 30', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(30);
  });

  it('lists reports by area', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.listReports).toEqual({ args: 1, options: ['counts', 'area'] });
  });

  it('frames an area, and cards one from a shot or a batch request (BA22, BA23)', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.frameArea).toEqual({ args: 2, options: ['preset', 'transitionMs', 'settleMs'] });
    expect(SHARE_HANDLE_CONTRACT.returns.frameArea).toEqual(['lat', 'lng', 'altitude', 'outside']);
    expect(SHARE_HANDLE_CONTRACT.shot.built).toContain('subject.area');
    expect(SHARE_HANDLE_CONTRACT.shot.notBuilt).not.toContain('subject.area');
    expect(SHARE_HANDLE_CONTRACT.batchRequest).toContain('area');
  });
});
