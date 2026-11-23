// Simple Layer Registry (Phase Infra-0 skeleton)
import * as THREE from 'three';
import { clearGroup } from './utils/disposal';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'LayerRegistry' });

export interface LayerDefinition {
  id: string;
  order: number;
  build: () => THREE.Group;        // Build geometry group (idempotent if already built)
  onActivate?: (group: THREE.Group) => void;  // Hook when activated
  onSuspend?: (group: THREE.Group) => void;   // Hook when suspended (detached)
  dispose?: (group: THREE.Group) => void;     // Full cleanup
}

interface LayerState {
  def: LayerDefinition;
  group: THREE.Group | null;
  status: 'registered' | 'built' | 'active' | 'suspended' | 'disposed';
}

export class LayerRegistry {
  private layers: Map<string, LayerState> = new Map();
  private dirty = false;

  register(def: LayerDefinition) {
    if (this.layers.has(def.id)) {
      log.warn(`[LayerRegistry] Layer already registered: ${def.id}`);
      return;
    }
    this.layers.set(def.id, { def, group: null, status: 'registered' });
    this.dirty = true;
  }

  // Register `def` afresh, whatever an earlier caller left under its id: that
  // group leaves the scene it is in and is disposed, and `def` replaces the old
  // definition, so the next activate() builds from this one. register() keeps
  // the first definition and activate() the first group, which suits a layer
  // built once and not a hook that builds its own groups and may mount again,
  // or build again before an earlier build has landed (useNationalTerritories3D):
  // the scene went on drawing the old group while the hook styled its own, which
  // nobody saw.
  replace(def: LayerDefinition) {
    const st = this.layers.get(def.id);
    if (st?.group) {
      st.group.parent?.remove(st.group);
      st.def.dispose?.(st.group);
      clearGroup(st.group);
    }
    this.layers.set(def.id, { def, group: null, status: 'registered' });
    this.dirty = true;
  }

  build(id: string) {
    const st = this.layers.get(id);
    if (!st) return;
    if (st.status === 'disposed') return;
    if (!st.group) {
      st.group = st.def.build();
    }
    st.status = 'built';
  }

  activate(id: string, scene: THREE.Scene) {
    const st = this.layers.get(id);
    if (!st) return;
    if (st.status === 'disposed') return;
    if (!st.group) this.build(id);
    if (st.group && !scene.children.includes(st.group)) {
      // Ensure a stable base renderOrder for the entire layer before attaching
      const baseOrder = st.def.order;
      const applyOrder = (obj: THREE.Object3D) => {
        // Only apply a base order if the object hasn't been explicitly ordered
        if (!('renderOrder' in obj) || obj.renderOrder === 0) {
          obj.renderOrder = baseOrder;
        }
        obj.children.forEach(applyOrder);
      };
      applyOrder(st.group);
      scene.add(st.group);
      st.status = 'active';
      st.def.onActivate?.(st.group);
      this.dirty = true;
    }
  }

  suspend(id: string, scene: THREE.Scene) {
    const st = this.layers.get(id);
    if (!st || !st.group) return;
    if (scene.children.includes(st.group)) {
      scene.remove(st.group);
      st.status = 'suspended';
      st.def.onSuspend?.(st.group);
      this.dirty = true;
    }
  }

  dispose(id: string, scene?: THREE.Scene) {
    const st = this.layers.get(id);
    if (!st) return;
    if (st.group) {
      if (scene && scene.children.includes(st.group)) scene.remove(st.group);
      st.def.dispose?.(st.group);
      clearGroup(st.group);
      st.group = null;
    }
    st.status = 'disposed';
    this.dirty = true;
  }

  // Like dispose(), but leaves the layer usable afterward: status returns
  // to 'registered' instead of the terminal 'disposed', so a later
  // build()/activate() call works normally. dispose() intentionally makes
  // build()/activate() permanent no-ops (see both methods below) — correct
  // for "this layer will never be needed again" (e.g. app shutdown), but
  // wrong for "temporarily turning a toggleable overlay off," which needs
  // the cached group forgotten (so a caller whose build() closure reads a
  // ref it reassigns to a fresh group on every re-enable — e.g.
  // useNationalTerritories3D's territoriesGroupRef — actually gets that
  // fresh group attached next time) without being locked out of ever
  // reactivating.
  reset(id: string, scene?: THREE.Scene) {
    const st = this.layers.get(id);
    if (!st) return;
    if (st.status === 'disposed') return;
    if (st.group) {
      if (scene && scene.children.includes(st.group)) scene.remove(st.group);
      st.def.dispose?.(st.group);
      clearGroup(st.group);
      st.group = null;
    }
    st.status = 'registered';
    this.dirty = true;
  }

  getActiveLayersSorted(): THREE.Group[] {
    const actives: Array<{ order: number; group: THREE.Group }> = [];
    this.layers.forEach(st => {
      if (st.status === 'active' && st.group) actives.push({ order: st.def.order, group: st.group });
    });
    return actives.sort((a,b) => a.order - b.order).map(a => a.group);
  }

  getStatus(id: string) {
    return this.layers.get(id)?.status;
  }
}

export const globalLayerRegistry = new LayerRegistry();
