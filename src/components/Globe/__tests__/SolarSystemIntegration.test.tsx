/**
 * The solar system round the globe (decision K6; GlobeSolarSystemIntegration.tsx): in
 * every mode, driven by each render of the scene, for the moment the globe is lit for.
 */
import { describe, test, expect, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { useGlobeSolarSystemIntegration } from '../GlobeSolarSystemIntegration';
import { releaseMotion, stillMotion } from '../../../globe-engine/captureClock';
import { sunInSky } from '../../../solar-system/bodyPlacement';
import { imageryDrawn } from '../../../globe-engine/imagery';
import { CAMERA_FAR } from '../globeAltitudes';

const PAUSED = Date.UTC(2026, 11, 21, 20, 50);
const STILL = Date.UTC(2027, 1, 22, 12, 0);

/** Shaped like globe.gl: a scene, a camera at the default view, and a renderer 900 pixels tall. */
const makeGlobe = () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, CAMERA_FAR);
  const renderer = { getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
  const moveTo = (distance: number) => {
    camera.position.set(0, 0, distance);
    camera.updateMatrixWorld(true);
  };
  moveTo(350);
  const render = () => scene.onBeforeRender(renderer, scene, camera, undefined as never, undefined as never, undefined as never);
  const ref = { current: { scene: () => scene, camera: () => camera } as unknown as GlobeMethods };
  return { scene, ref, moveTo, render, sun: () => scene.getObjectByName('sun') as THREE.Mesh };
};

describe('useGlobeSolarSystemIntegration', () => {
  afterEach(() => {
    releaseMotion();
    cleanup();
  });

  test('starts the solar system once the globe exists, in any mode, drawing none of it at the default view', async () => {
    const globe = makeGlobe();
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    globe.render();
    expect(globe.sun().visible).toBe(false);
    expect(result.current.sunVisible).toBe(false);
    // Nor does a card credit the planets' or the Moon's maker (TX8).
    expect(imageryDrawn()).not.toContain('planets');
  });

  test('draws it once the camera has backed out past the Earth\'s marks', async () => {
    const globe = makeGlobe();
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    globe.moveTo(400_000);
    globe.render();
    expect(globe.sun().visible).toBe(true);
    await waitFor(() => expect(result.current.sunVisible).toBe(true));
    // A card made now credits the planets' maker and the Moon's (TX8).
    expect(imageryDrawn()).toEqual(expect.arrayContaining(['planets', 'moon']));
  });

  test('marks and names the bodies too small to see, through the camera drawn with', async () => {
    const globe = makeGlobe();
    /*
     * At a moment of its own: names give way by rank where they overlap, and where each
     * falls turns with the sky. Read from the clock, this failed at 23Z to 02Z and 10Z to
     * 13Z, when another body's name lay over the Earth's (measured hour by hour, 2026-10-08).
     */
    const NAMES_APART = Date.UTC(2026, 9, 7, 16, 0);
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref, pausedAt: NAMES_APART }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    // At one scale (C32) the Earth is named backed out to 2 million units; Neptune, up to 3.7 million from the Earth,
    // is in view from the farthest reach, where the inner system's names give way to the Sun's.
    globe.moveTo(2_000_000);
    globe.render();
    expect(globe.scene.getObjectByName('earth-name')?.visible).toBe(true);
    globe.moveTo(8_000_000);
    globe.render();
    expect(globe.scene.getObjectByName('neptune-marker')?.visible).toBe(true);
  });

  test('places the bodies for the moment the timeline is paused at', async () => {
    const globe = makeGlobe();
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref, pausedAt: PAUSED }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    globe.moveTo(400_000);
    globe.render();
    expect(globe.sun().position.distanceTo(sunInSky(new Date(PAUSED)))).toBeLessThan(1e-6);
  });

  test('holds them at a capture\'s still moment for its render', async () => {
    const globe = makeGlobe();
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref, pausedAt: PAUSED }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    globe.moveTo(400_000);
    stillMotion(STILL);
    globe.render();
    expect(globe.sun().position.distanceTo(sunInSky(new Date(STILL)))).toBeLessThan(1e-6);
    releaseMotion();
    globe.render();
    expect(globe.sun().position.distanceTo(sunInSky(new Date(PAUSED)))).toBeLessThan(1e-6);
  });

  test('takes everything out of the scene, and stops drawing, when the globe goes', async () => {
    const globe = makeGlobe();
    const { result, unmount } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref }));
    await waitFor(() => expect(result.current.isActive).toBe(true));
    globe.moveTo(400_000);
    globe.render();
    unmount();
    expect(globe.scene.children).toHaveLength(0);
    expect(imageryDrawn()).not.toContain('planets');
    globe.moveTo(400_000);
    expect(() => globe.render()).not.toThrow();
  });

  test('builds nothing while turned off', async () => {
    const globe = makeGlobe();
    const { result } = renderHook(() => useGlobeSolarSystemIntegration({ globeRef: globe.ref, enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.isActive).toBe(false);
    expect(globe.scene.children).toHaveLength(0);
  });
});
