/**
 * Work done at the start of every render of a scene, with the camera it is drawn
 * through: the live view, every card and every clip frame alike.
 *
 * A layer that fades by the camera reads it in its own `onBeforeRender`, but that
 * runs only for an object being drawn, so it cannot decide whether to draw at all,
 * and it runs after the frustum is set, too late to move the camera's planes. The
 * scene's own `onBeforeRender` runs first, before either. three.js gives a scene one
 * such slot; this shares it.
 */
import type * as THREE from 'three';

export type SceneRenderHook = (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void;

const hooksByScene = new WeakMap<THREE.Scene, Set<SceneRenderHook>>();

/** Runs `hook` at the start of every render of `scene`; returns how to stop. */
export function onSceneRender(scene: THREE.Scene, hook: SceneRenderHook): () => void {
  let hooks = hooksByScene.get(scene);
  if (!hooks) {
    const installed = new Set<SceneRenderHook>();
    // Anything already in the slot keeps running, first.
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, drawn, camera, geometry, material, group) {
      previous.call(this, renderer, drawn, camera, geometry, material, group);
      for (const each of installed) each(renderer, camera);
    };
    hooksByScene.set(scene, installed);
    hooks = installed;
  }
  hooks.add(hook);
  const added = hooks;
  return () => {
    added.delete(hook);
  };
}
