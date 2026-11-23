/**
 * The Solar System kit's scale on the rail (critique-2026-11-01, OR9; plan D2): bound to the person's own scale, kept
 * in this browser. Anything but a scale is ignored.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRailBindings } from '../railBindings';
import { RAIL_SPECS } from '../railSpecs';
import { choosableLayerChoices } from '../railHandle';
import { resetSolarScaleForTests, solarScale } from '../../../../solar-system/solarScale';

beforeEach(() => { localStorage.clear(); resetSolarScaleForTests(); });
afterEach(() => { resetSolarScaleForTests(); });

describe("the solar system's scale on the rail", () => {
  it('reads and sets the person\'s scale', () => {
    const { result } = renderHook(() => useRailBindings('SolarSystem'));
    expect(result.current['solar:scale'].value).toBe('compact');
    act(() => result.current['solar:scale'].set('true'));
    expect(solarScale()).toBe('true');
    expect(localStorage.getItem('starcom:solar-scale')).toBe('true');
    expect(result.current['solar:scale'].value).toBe('true');
    act(() => result.current['solar:scale'].set('diagram'));
    expect(solarScale()).toBe('diagram');
    act(() => result.current['solar:scale'].set('sideways'));
    expect(solarScale()).toBe('diagram');
  });

  it('wears the scale in force on its button, and is none of the choices a handle sets', () => {
    expect(RAIL_SPECS.SolarSystem.face).toBe('solar:scale');
    expect(RAIL_SPECS.SolarSystem.controls.every((c) => c.bound)).toBe(true);
    expect(choosableLayerChoices()).not.toHaveProperty('SolarSystem');
  });
});
