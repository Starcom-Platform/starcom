/**
 * A frame must be of the view the audit asked for (decision D-F, layer audit).
 *
 * Every figure here is from the run that showed the defect: the CyberCommand
 * floor was photographed at 39.95°N 88.97°W alt 1.80R while every other layer in
 * that mode was photographed at the configured 20°N 5°E alt 2.40R, because the
 * app's own turn-to-first-intel moved the globe during the harness's settle. The
 * comparison then reported a quarter of the pixels moved and ~170 marks at 3 px²
 * for three different layers, and those were read as layer content.
 */
import { describe, it, expect } from 'vitest';
import { viewHeld, viewDrift, describeViewDrift, VIEW_TOLERANCE } from '../lib/auditCamera.mjs';

const ATLANTIC = { lat: 20, lng: 5, altitude: 2.4 };
/** What Intel Reports was actually captured at, turned to its own reports. */
const TURNED = { lat: 39.95, lng: -88.97, altitude: 1.8 };

describe('viewHeld', () => {
  it('holds when the camera is where it was put', () => {
    expect(viewHeld(ATLANTIC, { ...ATLANTIC })).toBe(true);
  });

  it('holds through rounding', () => {
    expect(viewHeld(ATLANTIC, { lat: 20.01, lng: 4.99, altitude: 2.401 })).toBe(true);
  });

  /*
   * The case itself.
   */
  it('does not hold for the frame that was compared all afternoon', () => {
    expect(viewHeld(ATLANTIC, TURNED)).toBe(false);
  });

  it('does not hold on a moved altitude alone', () => {
    expect(viewHeld(ATLANTIC, { ...ATLANTIC, altitude: 1.8 })).toBe(false);
  });

  it('does not hold on a moved longitude alone', () => {
    expect(viewHeld(ATLANTIC, { ...ATLANTIC, lng: -88.97 })).toBe(false);
  });

  /*
   * A reading that cannot be taken is not a zero drift. A frame whose view is
   * unknown must not be compared as though it were known — that is the whole
   * defect, restated.
   */
  it('does not hold when the camera cannot be read', () => {
    expect(viewHeld(ATLANTIC, null)).toBe(false);
    expect(viewHeld(ATLANTIC, {})).toBe(false);
    expect(viewHeld(ATLANTIC, { lat: 20, lng: 5 })).toBe(false);
    expect(viewHeld(ATLANTIC, { lat: NaN, lng: 5, altitude: 2.4 })).toBe(false);
    expect(viewHeld(null, ATLANTIC)).toBe(false);
  });

  it('respects a tolerance it is given', () => {
    expect(viewHeld(ATLANTIC, { lat: 21, lng: 5, altitude: 2.4 })).toBe(false);
    expect(viewHeld(ATLANTIC, { lat: 21, lng: 5, altitude: 2.4 }, { degrees: 2, altitude: 0.05 })).toBe(true);
  });
});

describe('viewDrift', () => {
  it('measures how far each axis moved', () => {
    expect(viewDrift(ATLANTIC, TURNED)).toEqual({
      lat: expect.closeTo(19.95, 5),
      lng: expect.closeTo(93.97, 5),
      altitude: expect.closeTo(0.6, 5),
    });
  });

  it('says nothing rather than zero when it cannot tell', () => {
    expect(viewDrift(ATLANTIC, null)).toBeNull();
    expect(viewDrift(ATLANTIC, { lat: 20, lng: 5 })).toBeNull();
  });
});

describe('describeViewDrift', () => {
  it('names both views, so a dropped one can be understood', () => {
    const said = describeViewDrift(ATLANTIC, TURNED);

    expect(said).toContain('20.00°, 5.00° alt 2.40R');
    expect(said).toContain('39.95°, -88.97° alt 1.80R');
  });

  it('says a missing reading is unknown rather than inventing one', () => {
    expect(describeViewDrift(ATLANTIC, null)).toContain('captured unknown');
  });
});

describe('the tolerance itself', () => {
  /*
   * Tight on purpose: the globe eases to exactly the requested position, so
   * anything past rounding means something else moved it. A loose tolerance here
   * would re-admit the very frames this exists to exclude.
   */
  it('is tight enough to exclude the frame that caused this', () => {
    expect(VIEW_TOLERANCE.degrees).toBeLessThan(1);
    expect(VIEW_TOLERANCE.altitude).toBeLessThan(0.1);
  });
});
