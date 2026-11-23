/**
 * Psi Watch's places on the globe (decision D-PW, step 5, PW32–PW33), from the kit's fixtures over the areas the app
 * serves: an alert's bright edge while it holds, a window's fill fading with its curve without being rebuilt, a tested
 * place's dotted edge with its result, and a retired Zone saying what holds it now.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { alertGlyphSvg, PSI_ZONE_LOOKS, PSI_ZONES_TYPE, WINDOW_PEAK_OPACITY, useGlobePsiZones } from '../useGlobePsiZones';
import { DATA_SCALES } from '../../../../styles/tokens';
import type { PsiPlaceLayer } from '../../../../services/psiWatch/psiPlaces';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});

// The kit's alert holds from 26 Oct 13:00Z to 28 Oct 01:00Z; its window peaks at 1 Nov 20:28:27Z.
const IN_ALERT = (1793019600 + 3600) * 1000;
const WINDOW_EXACT = 1793564907 * 1000;
const only = (layer: PsiPlaceLayer): Record<PsiPlaceLayer, boolean> => ({ PsiRifts: false, PsiWindows: false, PsiZones: false, [layer]: true });
const layerOf = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === PSI_ZONES_TYPE)!;
const said = (scene: THREE.Scene) => {
  const found: string[] = [];
  layerOf(scene).traverse((c) => {
    for (const line of (c.userData.lines ?? []) as { tooltip?: string }[]) if (line.tooltip) found.push(line.tooltip);
    if ((c as THREE.Mesh).isMesh && typeof c.userData.tooltip === 'string') found.push(c.userData.tooltip);
  });
  return [...new Set(found)];
};
const fills = (scene: THREE.Scene) => {
  const found: THREE.Mesh[] = [];
  layerOf(scene).traverse((c) => { if ((c as THREE.Mesh).isMesh && c.userData.psiWindow) found.push(c as THREE.Mesh); });
  return found;
};

describe('useGlobePsiZones', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // The kit's invented alerts, results and windows show only in a tab opened with ?psi=kit (PW48, restored 2 Nov).
    window.history.replaceState({}, '', '/?psi=kit');
  });
  afterEach(() => { window.history.replaceState({}, '', '/'); window.sessionStorage.clear(); });

  it('draws an alert as its Zone\'s bright edge, saying until when it holds and what now holds a retired Zone', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiZones({ scene, active: only('PsiRifts'), cursorMs: IN_ALERT }));
    await waitFor(() => expect(result.current.places).toHaveLength(1));
    expect(result.current.places[0]).toMatchObject({ code: 'zone:sahel', retiredInto: 6 });
    await waitFor(() => expect(said(scene)).toEqual([
      'Psi Watch: three channels high together, Sahel Zone (FIXTURE). Holds until 28 Oct 01:00Z.'
        + ' Sahel Zone, one of the first Zones, retired: drawn as the 6 Zones that now hold it.',
    ]));
  });

  it("keys a layer from the cursor's copy alone: now's copy, side by side, never takes the key away (PW73)", async () => {
    resetLegendsForTest();
    const scene = new THREE.Scene();
    const cursor = renderHook(() => useGlobePsiZones({ scene, active: only('PsiWindows'), cursorMs: WINDOW_EXACT, split: 'cursor' }));
    const now = renderHook(() => useGlobePsiZones({ scene, active: only('PsiWindows'), cursorMs: WINDOW_EXACT, split: 'now' }));
    await waitFor(() => expect(cursor.result.current.places.length).toBeGreaterThan(0));
    await waitFor(() => expect(now.result.current.places.length).toBeGreaterThan(0));
    now.unmount();
    expect(getLegends().map((l) => l.layerId)).toContain('PsiWindows');
    cursor.unmount();
    expect(getLegends().map((l) => l.layerId)).not.toContain('PsiWindows');
  });

  it("fills a window as strongly as its curve stands, and fades it with the cursor without rebuilding it", async () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(({ cursorMs }) => useGlobePsiZones({ scene, active: only('PsiWindows'), cursorMs }), {
      initialProps: { cursorMs: WINDOW_EXACT },
    });
    await waitFor(() => expect(fills(scene).length).toBeGreaterThan(0));
    const before = fills(scene);
    const peak = (before[0].material as THREE.MeshBasicMaterial).opacity;
    expect(peak).toBeCloseTo(WINDOW_PEAK_OPACITY, 2);
    // The sky's aqua for a window; the ground's violet for an alert's glyph (PW66).
    expect((before[0].material as THREE.MeshBasicMaterial).color.getHexString().toUpperCase()).toBe(DATA_SCALES.psiWatch.slice(1));
    expect(alertGlyphSvg()).toContain(`stroke="${DATA_SCALES.psiGround}"`);
    expect(said(scene)[0]).toMatch(/^Psi Watch focus window \(FIXTURE places\): 100% of its peak, at 1 Nov 20:28Z/);
    rerender({ cursorMs: WINDOW_EXACT - 3 * 3600 * 1000 });
    await waitFor(() => expect((fills(scene)[0].material as THREE.MeshBasicMaterial).opacity).toBeLessThan(peak));
    expect(fills(scene)).toEqual(before);
    const share = Math.round(result.current.places[0].weight! * 100);
    expect(said(scene)[0]).toContain(`${share}% of its peak, at 1 Nov 17:28Z`);
  });

  it('draws a tested place as a dotted edge, with its result as published', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiZones({ scene, active: only('PsiZones'), cursorMs: IN_ALERT }));
    await waitFor(() => expect(said(scene).length).toBe(1));
    expect(said(scene)[0]).toBe('PSI-9001, tested in Sahel Zone: rate ratio 1.04 (p 0.38). Sahel Zone, one of the first Zones, retired: drawn as the 6 Zones that now hold it.');
    expect(result.current.unmatched).toEqual([{ layer: 'PsiZones', code: 'zone:sahel/sector:nile-butana-barka' }]);
    expect(PSI_ZONE_LOOKS.PsiZones.dashed).toBe(true);
    expect(PSI_ZONE_LOOKS.PsiZones.linewidth).toBeLessThan(PSI_ZONE_LOOKS.PsiRifts.linewidth);
  });

  it('draws nothing while its layers are off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiZones({ scene, active: { PsiRifts: false, PsiWindows: false, PsiZones: false }, cursorMs: IN_ALERT }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.places).toEqual([]);
    expect(layerOf(scene).children).toEqual([]);
  });
});
