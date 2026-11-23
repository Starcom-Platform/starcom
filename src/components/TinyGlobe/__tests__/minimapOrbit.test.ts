/**
 * Where the mini-globe's camera is (decision D-MG, mini-globe.md; MG2, MG3, MG5, MG7): it orbits once
 * every 90 s, the planet seeming to turn west to east as Earth does; when the main globe's view moves it
 * turns to face it, holds it 8 s, then orbits on from there; hovering pauses it; reduced motion never
 * orbits.
 */
import { describe, expect, it } from 'vitest';
import { HOLD_MS, MinimapOrbit, ORBIT_PERIOD_MS, TURN_MS } from '../minimapOrbit';

const orbiting = (reducedMotion = false) => new MinimapOrbit({ reducedMotion });
const near = (pose: { lat: number; lng: number }, lat: number, lng: number) => {
  expect(pose.lat).toBeCloseTo(lat, 6);
  expect(((pose.lng - lng + 540) % 360) - 180).toBeCloseTo(0, 6);
};

describe('the mini-globe\'s orbit', () => {
  it('is once every 90 s, about 4° a second', () => {
    expect(ORBIT_PERIOD_MS).toBe(90_000);
    expect(HOLD_MS).toBe(8_000);
  });

  it('faces the main view first and holds it, then turns west to east, once every 90 s, at that latitude', () => {
    const orbit = orbiting();
    orbit.view({ lat: 10, lng: 20 }, 0);
    near(orbit.pose(0), 10, 20);
    near(orbit.pose(HOLD_MS - 1), 10, 20);
    // The camera's longitude falls, so the planet seems to turn eastward under it, as Earth does.
    near(orbit.pose(HOLD_MS + ORBIT_PERIOD_MS / 4), 10, -70);
    near(orbit.pose(HOLD_MS + ORBIT_PERIOD_MS), 10, 20);
  });

  it('orbits from home before it knows the main view', () => {
    const orbit = orbiting();
    near(orbit.pose(0), 20, 0);
    near(orbit.pose(ORBIT_PERIOD_MS / 2), 20, 180);
  });

  it('turns to a new view by the shorter way round, holds it, then orbits on from there', () => {
    const orbit = orbiting();
    orbit.view({ lat: 0, lng: -100 }, 0);
    const t = HOLD_MS + ORBIT_PERIOD_MS * (70 / 360); // orbiting, at longitude -170
    near(orbit.pose(t), 0, -170);
    orbit.view({ lat: -30, lng: 170 }, t);
    near(orbit.pose(t), 0, -170);
    // Halfway through the turn, across the antimeridian: 20° the short way, not 340° the long.
    const mid = orbit.pose(t + TURN_MS / 2);
    expect(Math.abs(Math.abs(mid.lng) - 180)).toBeLessThan(10);
    expect(mid.lat).toBeLessThan(0);
    expect(mid.lat).toBeGreaterThan(-30);
    near(orbit.pose(t + TURN_MS), -30, 170);
    near(orbit.pose(t + TURN_MS + HOLD_MS - 1), -30, 170);
    near(orbit.pose(t + TURN_MS + HOLD_MS + ORBIT_PERIOD_MS / 4), -30, 80);
  });

  it('follows a main view that keeps moving, turning from wherever it is', () => {
    const orbit = orbiting();
    orbit.view({ lat: 0, lng: 0 }, 0);
    orbit.view({ lat: 0, lng: 40 }, 100);
    const partway = orbit.pose(100 + TURN_MS / 2);
    orbit.view({ lat: 0, lng: 60 }, 100 + TURN_MS / 2);
    near(orbit.pose(100 + TURN_MS / 2), partway.lat, partway.lng);
    near(orbit.pose(100 + TURN_MS / 2 + TURN_MS), 0, 60);
  });

  it('does not turn for a view that moved less than a degree', () => {
    const orbit = orbiting();
    orbit.view({ lat: 0, lng: 0 }, 0);
    const t = HOLD_MS + 10_000;
    const before = orbit.pose(t);
    orbit.view({ lat: 0.5, lng: 0.5 }, t);
    near(orbit.pose(t + 500), before.lat, before.lng - (500 * 360) / ORBIT_PERIOD_MS);
  });

  it('stops while hovered, and goes on from where it stopped', () => {
    const paused = orbiting();
    const steady = orbiting();
    for (const orbit of [paused, steady]) orbit.view({ lat: 5, lng: 5 }, 0);
    const t = HOLD_MS + 20_000;
    const at = paused.pose(t);
    paused.hover(true, t);
    near(paused.pose(t + 5_000), at.lat, at.lng);
    paused.hover(false, t + 5_000);
    const later = steady.pose(t + 1_000);
    near(paused.pose(t + 5_000 + 1_000), later.lat, later.lng);
  });

  it('turns to a view that moved while it was hovered, once the pointer leaves', () => {
    const orbit = orbiting();
    orbit.view({ lat: 0, lng: 0 }, 0);
    const t = HOLD_MS + 20_000;
    orbit.hover(true, t);
    const at = orbit.pose(t);
    // A click on the minimap flies the main globe while the pointer is still over it.
    orbit.view({ lat: 40, lng: -75 }, t + 1_000);
    near(orbit.pose(t + 2_000), at.lat, at.lng);
    orbit.hover(false, t + 3_000);
    near(orbit.pose(t + 3_000 + TURN_MS), 40, -75);
    near(orbit.pose(t + 3_000 + TURN_MS + HOLD_MS - 1), 40, -75);
  });

  it('with reduced motion, faces the main view and never orbits', () => {
    const orbit = orbiting(true);
    near(orbit.pose(0), 20, 0);
    near(orbit.pose(ORBIT_PERIOD_MS / 2), 20, 0);
    orbit.view({ lat: 10, lng: 20 }, 1_000);
    near(orbit.pose(1_000), 10, 20);
    near(orbit.pose(1_000 + ORBIT_PERIOD_MS), 10, 20);
    orbit.view({ lat: -10, lng: 100 }, 2_000);
    near(orbit.pose(2_000), -10, 100);
  });
});
