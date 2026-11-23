import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { ROTATE_SPEED_CAP, ZOOM_SPEED_CAP, useGlobeCameraNear } from '../useGlobeCameraNear';
import { CAMERA_FAR, CAMERA_NEAR, CAMERA_REACH } from '../../globeAltitudes';

/**
 * Shaped like globe.gl after its own startup: near 0.05, far 125,000, minimum distance
 * 100 + 1.1 × 0.05, maximum 10,000, the camera at the default view, and globe.gl's own
 * listener setting the controls' speeds by altitude at every move.
 */
function fakeGlobe() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 125_000);
  camera.position.set(0, 0, 350);
  let projectionUpdates = 0;
  const update = camera.updateProjectionMatrix.bind(camera);
  camera.updateProjectionMatrix = () => { projectionUpdates++; update(); };
  const controls = Object.assign(new THREE.EventDispatcher<{ change: object }>(), {
    minDistance: 100.055, maxDistance: 10_000, rotateSpeed: 0.3, zoomSpeed: 0.3,
  });
  controls.addEventListener('change', () => {
    const altitude = camera.position.length() / 100 - 1;
    controls.rotateSpeed = altitude * 0.3;
    controls.zoomSpeed = Math.sqrt(altitude) * 0.5;
  });
  const move = (distance: number) => {
    camera.position.set(0, 0, distance);
    controls.dispatchEvent({ type: 'change' });
  };
  const scene = new THREE.Scene();
  const render = () => scene.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, undefined as never, undefined as never, undefined as never);
  return {
    camera, controls, render, move,
    projectionUpdates: () => projectionUpdates,
    ref: { current: { camera: () => camera, controls: () => controls, scene: () => scene } },
  };
}

describe('useGlobeCameraNear', () => {
  it("raises the near plane from globe.gl's 0.05, and updates the projection so it takes effect", () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    expect(globe.camera.near).toBe(CAMERA_NEAR);
    expect(globe.projectionUpdates()).toBe(1);
  });

  it('keeps the surface outside the near plane: the closest approach rises with it', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    expect(globe.controls.minDistance).toBeCloseTo(100 + CAMERA_NEAR * 1.1, 6);
  });

  it('never lowers a minimum distance something else set higher', () => {
    const globe = fakeGlobe();
    globe.controls.minDistance = 150;
    renderHook(() => useGlobeCameraNear(globe.ref));
    expect(globe.controls.minDistance).toBe(150);
  });

  it('lets the camera back out to the whole solar system, and draws that far (K6)', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    expect(globe.controls.maxDistance).toBe(CAMERA_REACH);
    expect(globe.camera.far).toBe(CAMERA_FAR);
  });

  it('moves the near plane out with the camera at each render, and back', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    globe.camera.position.set(0, 0, 200_000);
    globe.render();
    expect(globe.camera.near).toBeCloseTo(200, 6);
    expect(globe.camera.projectionMatrix.elements[14]).toBeCloseTo(
      new THREE.PerspectiveCamera(50, 1, 200, CAMERA_FAR).projectionMatrix.elements[14], 6,
    );
    globe.camera.position.set(0, 0, 350);
    globe.render();
    expect(globe.camera.near).toBe(CAMERA_NEAR);
  });

  it('holds the far plane and the reach at every render, should anything set them back', () => {
    // three-render-objects sets the far plane from globe.gl's sky radius in an update
    // that can land after the hook has run.
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    globe.camera.far = 125_000;
    globe.controls.maxDistance = 50_000;
    globe.render();
    expect(globe.camera.far).toBe(CAMERA_FAR);
    expect(globe.camera.projectionMatrix.elements[10]).toBeCloseTo(
      new THREE.PerspectiveCamera(50, 1, CAMERA_NEAR, CAMERA_FAR).projectionMatrix.elements[10], 9,
    );
    expect(globe.controls.maxDistance).toBe(CAMERA_REACH);
  });

  it('touches nothing at a render where the near plane is already right', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    const before = globe.projectionUpdates();
    globe.render();
    globe.render();
    expect(globe.projectionUpdates()).toBe(before);
  });

  it('stops following once the globe is gone', () => {
    const globe = fakeGlobe();
    const { unmount } = renderHook(() => useGlobeCameraNear(globe.ref));
    unmount();
    globe.camera.position.set(0, 0, 200_000);
    globe.render();
    expect(globe.camera.near).toBe(CAMERA_NEAR);
  });

  it('leaves the controls\' speeds as globe.gl sets them in every view near the globe', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    globe.move(350);
    expect(globe.controls.rotateSpeed).toBeCloseTo(0.75, 9);
    expect(globe.controls.zoomSpeed).toBeCloseTo(Math.sqrt(2.5) * 0.5, 9);
    globe.move(600);
    expect(globe.controls.rotateSpeed).toBeCloseTo(1.5, 9);
  });

  it('holds them in check out at the solar system, where globe.gl\'s would run away', () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeCameraNear(globe.ref));
    globe.move(CAMERA_REACH);
    // globe.gl's would be a turn of more than five revolutions a pixel, and 28-fold a wheel step.
    expect(globe.controls.rotateSpeed).toBe(ROTATE_SPEED_CAP);
    expect(globe.controls.zoomSpeed).toBe(ZOOM_SPEED_CAP);
    expect(1 / 0.95 ** ZOOM_SPEED_CAP).toBeLessThan(1.3);
  });

  it('stops holding them once the globe is gone', () => {
    const globe = fakeGlobe();
    const { unmount } = renderHook(() => useGlobeCameraNear(globe.ref));
    unmount();
    globe.move(CAMERA_REACH);
    expect(globe.controls.zoomSpeed).toBeGreaterThan(ZOOM_SPEED_CAP);
  });
});
