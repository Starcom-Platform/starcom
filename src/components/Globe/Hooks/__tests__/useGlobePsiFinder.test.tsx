/**
 * The Finder's place control on the globe (decision D-PW, PW61, PW70): nothing until the plate-boundary archetype is
 * open in Psi Watch; then every Zone filled by its share near a boundary, its share and quakes in the hover.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PSI_FINDER_TYPE, useGlobePsiFinder } from '../useGlobePsiFinder';
import { setFinderOpen, type FinderPlatesFile } from '../../../../services/psiWatch/finder';

vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});
const plates = JSON.parse(readFileSync('public/data/psi-finder-plates.json', 'utf8')) as FinderPlatesFile;
vi.mock('../../../PsiWatch/useFinderPlates', () => ({ useFinderPlates: (enabled: boolean) => (enabled ? plates : null) }));

const fills = (scene: THREE.Scene) => {
  const found: THREE.Mesh[] = [];
  scene.children.find((c) => c.userData.type === PSI_FINDER_TYPE)!.traverse((c) => { if ((c as THREE.Mesh).isMesh && c.userData.psiFinderZone) found.push(c as THREE.Mesh); });
  return found;
};

describe('useGlobePsiFinder', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { act(() => setFinderOpen(null)); vi.restoreAllMocks(); });

  it('fills every Zone by its share near a plate boundary while the archetype is open', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobePsiFinder({ scene, active: true }));
    expect(fills(scene)).toHaveLength(0);
    act(() => setFinderOpen('plates'));
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(200));
    const near = plates.zones.find((z) => z.share === 1)!;
    const mesh = fills(scene).find((m) => m.userData.psiFinderZone === near.code)!;
    expect((mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.62, 5);
    expect(mesh.userData.tooltip).toMatch(/: 100% within 150 km of a plate boundary, \d+ quakes$/);
    act(() => setFinderOpen('rotation'));
    expect(fills(scene)).toHaveLength(0);
  });
});
