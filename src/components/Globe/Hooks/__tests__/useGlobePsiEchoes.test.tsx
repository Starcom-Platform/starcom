/**
 * An Echo's events on the globe (decision D-PW, PW47, PW54, PW69): nothing until an Echo's returns are found and
 * Psi Watch is shown; then the dots, each return a shade older; the heat as a shell; the Zones filled by their counts,
 * each saying how many in its hover.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PSI_ECHOES_TYPE, useGlobePsiEchoes } from '../useGlobePsiEchoes';
import { setEcho, setEchoLook, type Echo } from '../../../../services/psiWatch/timestream/echoes';
import { readEventSet } from '../../../../services/psiWatch/timestream/eventSets';
import type { PsiSkyEvent } from '../../../../services/psiWatch/psiEvents';

vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});

const DAY = 86_400_000;
// A Zone the areas hold, for the set's two placed events.
const zone = (JSON.parse(readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')) as { features: { properties: { code: string } }[] })
  .features.map((f) => f.properties.code).find((c) => c.startsWith('zone:'))!;
const set = readEventSet({
  set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
  rows: 3, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 11, 31), zones: [zone],
  t: [Date.UTC(1992, 1, 2) / 1000, 3600, (Date.UTC(1992, 3, 3) - Date.UTC(1992, 1, 2)) / 1000 - 3600],
  lat: [1000, 1100, 3300], lon: [2000, 2100, 3500], zone: [0, 0, -1],
});
vi.mock('../../../PsiWatch/Timestream/useEventSet', () => ({ useEventSet: () => set }));

const echo: Echo = {
  address: 'w', title: 't', event: {} as PsiSkyEvent, beforeMs: DAY, afterMs: DAY,
  returns: [Date.UTC(1992, 1, 2), Date.UTC(1992, 3, 3)], isolated: null,
};
const layerOf = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === PSI_ECHOES_TYPE)!;
const drawn = (scene: THREE.Scene, type: string) => {
  const found: THREE.Object3D[] = [];
  layerOf(scene).traverse((c) => { if (c.userData.type === type || (type === 'zone' && c.userData.psiEchoZone)) found.push(c); });
  return found;
};

describe('useGlobePsiEchoes', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); setEchoLook('dots'); });
  afterEach(() => { act(() => setEcho(null)); vi.restoreAllMocks(); });

  it('draws nothing until an Echo\'s returns are found, nor outside Psi Watch', () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook(({ active }) => useGlobePsiEchoes({ scene, active }), { initialProps: { active: false } });
    act(() => setEcho({ ...echo, returns: null }));
    rerender({ active: true });
    expect(layerOf(scene).children).toHaveLength(0);
    act(() => setEcho(echo));
    rerender({ active: false });
    expect(layerOf(scene).children).toHaveLength(0);
  });

  it('draws every return\'s events as dots, the older return fainter', () => {
    const scene = new THREE.Scene();
    act(() => setEcho(echo));
    renderHook(() => useGlobePsiEchoes({ scene, active: true }));
    const [dots] = drawn(scene, 'psiEchoDots') as THREE.Points[];
    const alpha = dots.geometry.getAttribute('color');
    expect(dots.geometry.getAttribute('position').count).toBe(3);
    expect([alpha.getW(0), alpha.getW(2)]).toEqual([0.25, 1]);
  });

  it('draws the heat as one shell, and the Zones filled with their counts', async () => {
    const scene = new THREE.Scene();
    act(() => { setEcho(echo); setEchoLook('heat'); });
    renderHook(() => useGlobePsiEchoes({ scene, active: true }));
    expect(drawn(scene, 'psiEchoHeat')).toHaveLength(1);
    act(() => setEchoLook('zones'));
    await waitFor(() => expect(drawn(scene, 'zone').length).toBeGreaterThan(0));
    expect(drawn(scene, 'zone')[0].userData.tooltip).toMatch(/: 2 events at these returns$/);
  });
});
