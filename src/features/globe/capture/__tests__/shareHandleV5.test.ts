/**
 * Contract v5: featuring one report (decision D-F, section 18, item 2).
 *
 * Additive, like v2–v4. What an agent written against v4 relies on is unchanged,
 * and what v5 adds is declared: three methods, what they return, and the
 * framing limits every one of them keeps.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { SHARE_ALTITUDE_CEILING, SHARE_ALTITUDE_FLOOR } from '../shareReports';

describe('contract v5', () => {
  it('is at version 5 or later: v6 added to it and moved nothing', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(5);
  });

  it('declares the three methods that feature a report', () => {
    // Still callable with nothing: v25 added an optional `{ counts: true }`, and v30 `{ area }`.
    expect(SHARE_HANDLE_CONTRACT.methods.listReports.args).toBe(1);
    expect(SHARE_HANDLE_CONTRACT.methods.listReports.options).toEqual(expect.arrayContaining(['counts']));
    expect(SHARE_HANDLE_CONTRACT.methods.frameReports).toEqual({ args: 2, options: ['preset', 'transitionMs', 'settleMs'] });
    expect(SHARE_HANDLE_CONTRACT.methods.focusReport).toEqual({ args: 1, options: [] });
  });

  it('publishes the framing limits the code keeps, from the code', () => {
    // Declared numbers that drifted from the enforced ones would be a promise
    // the handle does not keep.
    expect(SHARE_HANDLE_CONTRACT.framing).toEqual({
      altitudeFloor: SHARE_ALTITUDE_FLOOR,
      altitudeCeiling: SHARE_ALTITUDE_CEILING,
    });
  });

  it('says what a listed report carries', () => {
    // v8 added `layer` (shareHandleV8.test.ts); every key v5 declared is still there.
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toEqual(expect.arrayContaining([
      'id', 'title', 'variant', 'variantMeans', 'author', 'time', 'precisionM', 'lat', 'lng', 'sharesPlaceWith',
    ]));
    expect(SHARE_HANDLE_CONTRACT.returns.focusReport).toEqual(['featured']);
  });
});
