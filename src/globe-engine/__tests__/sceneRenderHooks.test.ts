/**
 * Work done at the start of every render of a scene (sceneRenderHooks.ts): the
 * solar system decides there whether to draw, and the camera's near plane follows
 * its distance, before the frustum is set.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { onSceneRender } from '../sceneRenderHooks';

const renderer = {} as THREE.WebGLRenderer;
const render = (scene: THREE.Scene, camera: THREE.Camera) =>
  scene.onBeforeRender(renderer, scene, camera, undefined as never, undefined as never, undefined as never);

describe('onSceneRender', () => {
  it('runs each hook at every render, with the renderer and the camera drawn through', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const first = vi.fn();
    const second = vi.fn();
    onSceneRender(scene, first);
    onSceneRender(scene, second);
    render(scene, camera);
    render(scene, camera);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledWith(renderer, camera);
  });

  it('stops a hook that leaves, and keeps the others', () => {
    const scene = new THREE.Scene();
    const leaving = vi.fn();
    const staying = vi.fn();
    const leave = onSceneRender(scene, leaving);
    onSceneRender(scene, staying);
    leave();
    render(scene, new THREE.PerspectiveCamera());
    expect(leaving).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledTimes(1);
  });

  it('keeps whatever was in the scene\'s slot before, running it first', () => {
    const scene = new THREE.Scene();
    const order: string[] = [];
    scene.onBeforeRender = () => { order.push('before'); };
    onSceneRender(scene, () => { order.push('hook'); });
    render(scene, new THREE.PerspectiveCamera());
    expect(order).toEqual(['before', 'hook']);
  });

  it('keeps one scene\'s hooks to that scene', () => {
    const a = new THREE.Scene();
    const b = new THREE.Scene();
    const onA = vi.fn();
    onSceneRender(a, onA);
    onSceneRender(b, vi.fn());
    render(b, new THREE.PerspectiveCamera());
    expect(onA).not.toHaveBeenCalled();
  });
});
