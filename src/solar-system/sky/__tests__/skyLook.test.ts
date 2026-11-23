/**
 * Sky from a place's look (plan D5; OR42, OR43): it opens at a place looking toward the equator, a third of the way up;
 * a turn keeps the place, the azimuth wraps, the altitude stops at the zenith and just under the horizon, and the view
 * stays between 5° and 120° high.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { closeSky, closeWithoutLift, openSky, resetSkyLookForTests, setSkyLook, skyLook, SKY_FOV_MAX, SKY_FOV_MIN, takeLiftOnClose } from '../skyLook';

afterEach(() => resetSkyLookForTests());

describe("Sky from a place's look", () => {
  it('opens looking toward the equator, a third of the way up', () => {
    expect(openSky(51.5, -0.1)).toMatchObject({ lat: 51.5, lng: -0.1, az: 180, alt: 30, fov: 70 });
    expect(openSky(-33.9, 151.2)).toMatchObject({ az: 0 });
  });

  it('turns and widens, the place kept, within bounds', () => {
    openSky(10, 20);
    setSkyLook({ az: -30, alt: 120, fov: 500 });
    expect(skyLook()).toMatchObject({ lat: 10, lng: 20, az: 330, alt: 90, fov: SKY_FOV_MAX });
    setSkyLook({ alt: -40, fov: 1 });
    expect(skyLook()).toMatchObject({ alt: -10, fov: SKY_FOV_MIN });
  });

  it('lifts the camera over the place on close, unless something else is moving it, and only for that close', () => {
    expect(takeLiftOnClose()).toBe(true);
    closeWithoutLift();
    expect(takeLiftOnClose()).toBe(false);
    expect(takeLiftOnClose()).toBe(true);
  });

  it('does nothing while closed, and closes', () => {
    setSkyLook({ az: 10 });
    expect(skyLook()).toBeNull();
    openSky(0, 0);
    closeSky();
    expect(skyLook()).toBeNull();
  });
});
