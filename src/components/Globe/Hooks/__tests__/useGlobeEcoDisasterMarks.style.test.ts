/**
 * Eco Disasters honours the style chosen for it (decision D-F, step 6.3).
 *
 * It draws through TWO paths — this one, on the shared screen-mark hook, and
 * useGlobeVolcanoCatalog — which is why it stood at `not-yet` until both could
 * be wired: honouring a choice in one would have left the layer half styled.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeEcoDisasterMarks } from '../useGlobeEcoDisasterMarks';
import type { MarkerStyleChoices } from '../../markerStyles';

const events = [
  { id: 'e1', lat: 10, lng: 20, sizePx: 11, color: '#ff4d4f', category: 'Wildfire', tooltip: 'a fire' },
];

const drawn = (scene: THREE.Scene) => {
  let found: THREE.Points | undefined;
  scene.traverse((o) => { if ((o as THREE.Points).isPoints && o.userData.type) found = o as THREE.Points; });
  return found;
};

const render = (markerStyles?: MarkerStyleChoices) => {
  const scene = new THREE.Scene();
  renderHook(() => useGlobeEcoDisasterMarks({
    scene, enabled: true, events: events as never, colorMeans: 'hazard type', markerStyles,
  }));
  return scene;
};

afterEach(() => cleanup());

describe('useGlobeEcoDisasterMarks: the chosen style', () => {
  const defines = (scene: THREE.Scene) =>
    (drawn(scene)!.material as THREE.ShaderMaterial).defines ?? {};

  it('draws discs when nothing was chosen', () => {
    expect(defines(render())).not.toHaveProperty('STYLE_RING');
  });

  it('draws rings when rings were chosen', () => {
    expect(defines(render({ EcologicalDisasters: 'ring' }))).toHaveProperty('STYLE_RING');
  });

  /*
   * And says so in its legend, so a shared image explains its own marks rather
   * than leaving a reader to wonder why they are rings. Derived by the shared
   * hook from the style it was given, not remembered here.
   */
  it('says which shape it drew, for the share card to print', async () => {
    const { getLegends } = await import('../../../../services/globe/globeLegendStore');
    render({ EcologicalDisasters: 'ring' });

    const entry = getLegends().find((l) => l.layerId === 'EcologicalDisasters');
    expect(entry?.shapeMeans).toBe('ring');
  });
});
