import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LayerRegistry } from '../LayerRegistry';

describe('LayerRegistry', () => {
  it('builds and activates a layer, attaching its group to the scene', () => {
    const registry = new LayerRegistry();
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    registry.register({ id: 'test', order: 1, build: () => group });

    registry.activate('test', scene);

    expect(scene.children).toContain(group);
    expect(registry.getStatus('test')).toBe('active');
  });

  it('only invokes the build closure once while the built group is cached (idempotent build)', () => {
    const registry = new LayerRegistry();
    const build = vi.fn(() => new THREE.Group());
    registry.register({ id: 'test', order: 1, build });

    registry.build('test');
    registry.build('test');
    registry.build('test');

    expect(build).toHaveBeenCalledTimes(1);
  });

  it('suspend detaches the group from the scene but keeps it cached, so re-activate reuses the same object without rebuilding', () => {
    const registry = new LayerRegistry();
    const scene = new THREE.Scene();
    const build = vi.fn(() => new THREE.Group());
    registry.register({ id: 'test', order: 1, build });
    registry.activate('test', scene);
    const firstGroup = scene.children[0];

    registry.suspend('test', scene);
    expect(scene.children).not.toContain(firstGroup);

    registry.activate('test', scene);
    expect(scene.children).toContain(firstGroup);
    expect(build).toHaveBeenCalledTimes(1);
  });

  describe('dispose', () => {
    it('removes the group from the scene, nulls the cached group, and marks the layer disposed', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      registry.register({ id: 'test', order: 1, build: () => group });
      registry.activate('test', scene);

      registry.dispose('test', scene);

      expect(scene.children).not.toContain(group);
      expect(registry.getStatus('test')).toBe('disposed');
    });

    it('calls the layer\'s own dispose hook before clearing the group', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const disposeHook = vi.fn();
      registry.register({ id: 'test', order: 1, build: () => group, dispose: disposeHook });
      registry.activate('test', scene);

      registry.dispose('test', scene);

      expect(disposeHook).toHaveBeenCalledWith(group);
    });

    // The reason reset() (below) exists at all: dispose() is intentionally
    // terminal, so it's the wrong tool for a toggleable overlay that gets
    // disabled and re-enabled repeatedly against the same module-level
    // registry singleton.
    it('is terminal: activate() is a permanent no-op afterward, even with a fresh build closure', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const build = vi.fn(() => new THREE.Group());
      registry.register({ id: 'test', order: 1, build });
      registry.activate('test', scene);
      registry.dispose('test', scene);

      registry.activate('test', scene);

      expect(registry.getStatus('test')).toBe('disposed');
      expect(scene.children.length).toBe(0);
      expect(build).toHaveBeenCalledTimes(1); // not called again post-dispose
    });
  });

  describe('reset', () => {
    // This is the exact bug fixed in useNationalTerritories3D.ts's disable
    // effect: a caller whose build() closure reads a ref it reassigns to a
    // brand-new group on every re-enable (e.g. territoriesGroupRef.current)
    // needs the registry to actually forget the old cached group on
    // disable — otherwise activate() keeps re-attaching (or, pre-fix,
    // failing to re-attach at all) the stale one, and the caller's fresh
    // replacement is never attached to the scene.
    it('nulls the cached group and returns status to "registered", so a later build() re-invokes the closure', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      let currentGroup = new THREE.Group();
      const build = vi.fn(() => currentGroup);
      registry.register({ id: 'test', order: 1, build });
      registry.activate('test', scene);
      const firstGroup = scene.children[0];
      expect(build).toHaveBeenCalledTimes(1);

      registry.reset('test', scene);
      expect(scene.children).not.toContain(firstGroup);
      expect(registry.getStatus('test')).toBe('registered');

      // Caller rebuilds with a new object, exactly as useNationalTerritories3D
      // does on re-enable (territoriesGroupRef.current = newGroup).
      currentGroup = new THREE.Group();
      registry.activate('test', scene);

      expect(build).toHaveBeenCalledTimes(2);
      expect(scene.children).toContain(currentGroup);
      expect(scene.children).not.toContain(firstGroup);
    });

    it('full disable -> re-enable cycle on the same registry instance correctly shows the layer again', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      let currentGroup = new THREE.Group();
      registry.register({ id: 'test', order: 1, build: () => currentGroup });
      registry.activate('test', scene);

      // Disable
      registry.reset('test', scene);
      expect(scene.children.length).toBe(0);

      // Re-enable, mirroring useNationalTerritories3D's "initial activation"
      // effect: a new group is built and the same id is activated again.
      currentGroup = new THREE.Group();
      registry.activate('test', scene);

      expect(scene.children).toContain(currentGroup);
      expect(registry.getStatus('test')).toBe('active');
    });

    it('calls the layer\'s own dispose hook before clearing the group, same as dispose()', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      const disposeHook = vi.fn();
      registry.register({ id: 'test', order: 1, build: () => group, dispose: disposeHook });
      registry.activate('test', scene);

      registry.reset('test', scene);

      expect(disposeHook).toHaveBeenCalledWith(group);
    });

    it('is a no-op once the layer has been fully disposed (disposed stays terminal)', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const build = vi.fn(() => new THREE.Group());
      registry.register({ id: 'test', order: 1, build });
      registry.activate('test', scene);
      registry.dispose('test', scene);

      registry.reset('test', scene);

      expect(registry.getStatus('test')).toBe('disposed');
    });

    it('is a safe no-op for an unknown layer id', () => {
      const registry = new LayerRegistry();
      expect(() => registry.reset('nope')).not.toThrow();
    });

    it('works without a scene argument (group is cleared but not removed from any scene)', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      registry.register({ id: 'test', order: 1, build: () => new THREE.Group() });
      registry.activate('test', scene);

      expect(() => registry.reset('test')).not.toThrow();
      expect(registry.getStatus('test')).toBe('registered');
      // Group is still in the scene since we didn't pass it — this documents
      // existing behavior (callers must pass scene to fully detach), shared
      // with dispose()'s identical contract.
      expect(scene.children.length).toBe(1);
    });
  });

  describe('replace', () => {
    it('takes the earlier group out of whatever scene holds it and disposes it, and builds from the new definition', () => {
      const registry = new LayerRegistry();
      const oldScene = new THREE.Scene();
      const scene = new THREE.Scene();
      const stale = new THREE.Group();
      stale.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
      const oldDispose = vi.fn();
      registry.register({ id: 'test', order: 1, build: () => stale, dispose: oldDispose });
      registry.activate('test', oldScene);

      const fresh = new THREE.Group();
      registry.replace({ id: 'test', order: 1, build: () => fresh });
      expect(oldScene.children).not.toContain(stale);
      expect(oldDispose).toHaveBeenCalledWith(stale);
      expect(stale.children).toHaveLength(0);
      expect(registry.getStatus('test')).toBe('registered');

      registry.activate('test', scene);
      expect(scene.children).toEqual([fresh]);
    });

    it('registers a layer it has never seen, and one a dispose() had closed for good', () => {
      const registry = new LayerRegistry();
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      registry.replace({ id: 'new', order: 1, build: () => group });
      registry.activate('new', scene);
      expect(scene.children).toContain(group);

      registry.dispose('new', scene);
      const again = new THREE.Group();
      registry.replace({ id: 'new', order: 1, build: () => again });
      registry.activate('new', scene);
      expect(scene.children).toEqual([again]);
    });
  });
});
