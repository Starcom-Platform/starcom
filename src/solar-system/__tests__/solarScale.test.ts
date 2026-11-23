/**
 * The solar system's scale (critique-2026-11-01, OR9, OR31; plan D1, D2): Compact until the person chooses, their
 * choice kept in this browser, a page's handle drawing its own without changing theirs, a switch gliding on a log
 * scale and settling exactly, the camera's reach following, every body but the Moon placed at the scale in force, and
 * the solar system's being drawn heard only when it comes into view or leaves.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { GLOBE_UNITS_PER_AU as EPHEMERIS_UNITS_PER_AU, kmToGlobeUnits } from '../EphemerisService';
import { DRAWN_UNITS_PER_AU, drawnDistance, drawnRadius, placeInSky, sizeFactorNow, sunInSky } from '../bodyPlacement';
import {
  COMPACT_UNITS_PER_AU, DIAGRAM_MOON_UNITS, DIAGRAM_RING_UNITS, GLOBE_UNITS_PER_AU, MOON_MEAN_DISTANCE_UNITS, SCALE_GLIDE_MS,
  diagramRadiusUnits, diagramWeightNow,
  cameraFarNow, cameraReachNow, darkSkyPossible, noteSolarSystemShown, resetSolarScaleForTests, scaleGliding, setPageSolarScale,
  setSolarScale, skyScaleNow, solarScale, solarScaleFrom, subscribeSolarSystemShown, unitsPerAuNow,
} from '../solarScale';

const KEY = 'starcom:solar-scale';
let clock = 1000;
const settle = () => { clock += SCALE_GLIDE_MS + 1; };

beforeEach(() => {
  localStorage.clear();
  resetSolarScaleForTests();
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { vi.restoreAllMocks(); resetSolarScaleForTests(); });

describe("the solar system's scale", () => {
  it("works in the ephemeris's own units without loading it, Compact where the Sun has stood since 24 October", () => {
    expect(GLOBE_UNITS_PER_AU).toBe(EPHEMERIS_UNITS_PER_AU);
    expect(MOON_MEAN_DISTANCE_UNITS).toBe(kmToGlobeUnits(384_400));
    expect(DRAWN_UNITS_PER_AU).toBe(COMPACT_UNITS_PER_AU);
    expect(COMPACT_UNITS_PER_AU).toBeGreaterThan(118_000);
    expect(COMPACT_UNITS_PER_AU).toBeLessThan(120_000);
  });

  it('is Compact until the person chooses, and keeps their choice in this browser', () => {
    expect(solarScale()).toBe('compact');
    expect(unitsPerAuNow()).toBe(COMPACT_UNITS_PER_AU);
    setSolarScale('true');
    expect(localStorage.getItem(KEY)).toBe('true');
    resetSolarScaleForTests();
    expect(solarScale()).toBe('true');
    expect(solarScaleFrom()).toBe('person');
  });

  it("draws a page's own scale without changing the person's, and gives theirs back on null", () => {
    setPageSolarScale('true');
    expect(solarScale()).toBe('true');
    expect(solarScaleFrom()).toBe('handle');
    expect(localStorage.getItem(KEY)).toBeNull();
    setPageSolarScale(null);
    expect(solarScale()).toBe('compact');
    expect(solarScaleFrom()).toBe('person');
  });

  it('glides from one to the other on a log scale, and settles exactly', () => {
    setSolarScale('true');
    expect(scaleGliding()).toBe(true);
    expect(unitsPerAuNow()).toBe(COMPACT_UNITS_PER_AU);
    clock += SCALE_GLIDE_MS / 2;
    // Halfway through, eased, is halfway on the log: the geometric mean of the two.
    expect(unitsPerAuNow() / Math.sqrt(COMPACT_UNITS_PER_AU * GLOBE_UNITS_PER_AU)).toBeCloseTo(1, 9);
    settle();
    expect(scaleGliding()).toBe(false);
    expect(unitsPerAuNow()).toBe(GLOBE_UNITS_PER_AU);
    expect(skyScaleNow()).toBe(1);
  });

  it('reaches as far as before at Compact, and past Neptune at True', () => {
    expect(cameraReachNow()).toBe(9_000_000);
    expect(cameraFarNow()).toBe(12_800_000);
    setSolarScale('true');
    settle();
    expect(cameraReachNow() / GLOBE_UNITS_PER_AU).toBeCloseTo(35, 9);
    expect(cameraFarNow()).toBeGreaterThan(cameraReachNow() + 30 * GLOBE_UNITS_PER_AU);
  });

  it('places every body but the Moon at the scale in force, the Moon true at both', () => {
    const au = GLOBE_UNITS_PER_AU;
    expect(drawnDistance(au, Astronomy.Body.Sun)).toBe(au * (COMPACT_UNITS_PER_AU / GLOBE_UNITS_PER_AU));
    expect(drawnDistance(MOON_MEAN_DISTANCE_UNITS, Astronomy.Body.Moon)).toBe(MOON_MEAN_DISTANCE_UNITS);
    setSolarScale('true');
    settle();
    expect(drawnDistance(au, Astronomy.Body.Sun)).toBe(au);
    expect(drawnDistance(30 * au, Astronomy.Body.Neptune)).toBe(30 * au);
    expect(drawnDistance(MOON_MEAN_DISTANCE_UNITS, Astronomy.Body.Moon)).toBe(MOON_MEAN_DISTANCE_UNITS);
  });

  it('calls a blank frame the dark sky only at True, the solar system wholly shown and the scale at rest', () => {
    noteSolarSystemShown(1);
    expect(darkSkyPossible()).toBe(false);
    setSolarScale('true');
    expect(darkSkyPossible()).toBe(false);
    settle();
    expect(darkSkyPossible()).toBe(true);
    noteSolarSystemShown(0.5);
    expect(darkSkyPossible()).toBe(false);
  });

  it('glides into Diagram by weight, the other layout holding its own scale meanwhile', () => {
    setSolarScale('diagram');
    expect(diagramWeightNow()).toBe(0);
    expect(skyScaleNow()).toBe(COMPACT_UNITS_PER_AU / GLOBE_UNITS_PER_AU);
    clock += SCALE_GLIDE_MS / 2;
    expect(diagramWeightNow()).toBeCloseTo(0.5, 9);
    expect(skyScaleNow()).toBe(COMPACT_UNITS_PER_AU / GLOBE_UNITS_PER_AU);
    settle();
    expect(diagramWeightNow()).toBe(1);
    // Space weather in the diagram's Sun–Earth gap (OR39): the Earth's ring.
    expect(unitsPerAuNow()).toBe(3 * DIAGRAM_RING_UNITS);
  });

  it('places Diagram on rings: the Sun three rings from the Earth, Jupiter five from the Sun, the Moon five Earth radii out', () => {
    const at = new Date('2026-11-02T08:00:00Z');
    const trueSun = sunInSky(at).normalize();
    setSolarScale('diagram');
    settle();
    const sun = sunInSky(at);
    expect(sun.length()).toBeCloseTo(3 * DIAGRAM_RING_UNITS, 6);
    // Along the Sun's true direction from the Earth.
    expect(sun.clone().normalize().dot(trueSun)).toBeGreaterThan(0.9999);
    expect(placeInSky(Astronomy.Body.Jupiter, at).sub(sun).length()).toBeCloseTo(5 * DIAGRAM_RING_UNITS, 6);
    expect(placeInSky(Astronomy.Body.Neptune, at).sub(sun).length()).toBeCloseTo(8 * DIAGRAM_RING_UNITS, 6);
    expect(placeInSky(Astronomy.Body.Moon, at).length()).toBeCloseTo(DIAGRAM_MOON_UNITS, 6);
  });

  it('sizes Diagram on a log of each body against the Earth, which keeps its size, and nothing elsewhere', () => {
    expect(sizeFactorNow(695_700)).toBe(1);
    setSolarScale('diagram');
    settle();
    expect(diagramRadiusUnits(6371)).toBe(100);
    const sun = drawnRadius(695_700) * sizeFactorNow(695_700);
    const jupiter = drawnRadius(69_911) * sizeFactorNow(69_911);
    const mercury = drawnRadius(2_439.7) * sizeFactorNow(2_439.7);
    expect(sun).toBeCloseTo(diagramRadiusUnits(695_700), 6);
    expect(sun / 100).toBeGreaterThan(1.9);
    expect(sun / 100).toBeLessThan(2.1);
    expect(jupiter / 100).toBeGreaterThan(1.4);
    expect(jupiter / 100).toBeLessThan(1.6);
    expect(mercury / 100).toBeGreaterThan(0.7);
    expect(mercury / 100).toBeLessThan(0.85);
  });

  it('is heard coming into view and leaving it, not every frame', () => {
    const heard = vi.fn();
    const stop = subscribeSolarSystemShown(heard);
    noteSolarSystemShown(0);
    expect(heard).not.toHaveBeenCalled();
    noteSolarSystemShown(0.2);
    noteSolarSystemShown(0.6);
    noteSolarSystemShown(1);
    expect(heard).toHaveBeenCalledTimes(1);
    noteSolarSystemShown(0);
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });
});
