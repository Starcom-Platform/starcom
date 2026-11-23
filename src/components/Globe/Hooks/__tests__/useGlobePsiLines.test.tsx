/**
 * Planet lines on the globe (decision D-PW, step 4, PW20–PW22): the open sky event's bodies, four lines each, in
 * their looks, labelled and hovered, placed where the globe places every other point.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { PSI_LINE_LOOKS, PSI_LINES_TYPE, toScene, useGlobePsiLines } from '../useGlobePsiLines';
import { getPsiLinesState, resetPsiLinesForTests, setPsiLinesAllBodies, setPsiLinesEvent } from '../../../../services/psiWatch/psiLinesStore';
import { resetLayerChoicesForTests, setLayerChoice } from '../../../../features/globe/rail/layerChoices';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD, latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../../globeAltitudes';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

// The kit's Moon–Mars square: exact 27 Oct 2026 02:18:06Z, its window from 26 Oct 21:10:48Z to 27 Oct 07:24:35Z.
const MOON_MARS = { title: 'Moon and Mars at change (square)', bodies: ['Moon', 'Mars'] as const, from: 1793049048, until: 1793085875, exact: 1793067486.485 };
const layerOf = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === PSI_LINES_TYPE)!;
const tooltips = (scene: THREE.Scene) => layerOf(scene).children.flatMap((c) => (c.children ?? []).flatMap((b) => (b.userData.lines ?? []).map((l: { tooltip: string }) => l.tooltip)));
const labels = (scene: THREE.Scene) => {
  const found: string[] = [];
  layerOf(scene).traverse((c) => { if (c.userData.type === 'psiLineLabel') found.push(c.userData.text); });
  return found;
};

describe('useGlobePsiLines', () => {
  // jsdom draws no canvas: the labels are made, their letters are not.
  beforeEach(() => { resetPsiLinesForTests(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });

  it("draws the open event's bodies, four lines each, labelled, at exact while the cursor is outside its window", () => {
    const scene = new THREE.Scene();
    act(() => setPsiLinesEvent({ ...MOON_MARS, bodies: [...MOON_MARS.bodies] }));
    const { result } = renderHook(() => useGlobePsiLines({ scene, active: true, cursorMs: Date.UTC(2026, 9, 26, 14) }));
    expect(result.current.at).toBe(Math.floor(MOON_MARS.exact) * 1000 + 485);
    expect(result.current.lines.map((l) => `${l.body} ${l.angle}`)).toEqual(['Moon MC', 'Moon IC', 'Moon ASC', 'Moon DSC', 'Mars MC', 'Mars IC', 'Mars ASC', 'Mars DSC']);
    expect(labels(scene).filter((t) => !t.includes('·')).sort()).toEqual(['Mars ASC', 'Mars DSC', 'Mars IC', 'Mars MC', 'Moon ASC', 'Moon DSC', 'Moon IC', 'Moon MC']);
    expect(tooltips(scene)).toContain('Mars MC: where Mars stands overhead, at 27 Oct 02:18Z');
  });

  it("draws each line's band and the event's parans, both on, each a switch; parans the event's bodies' only (PW81–PW84)", () => {
    resetLayerChoicesForTests();
    resetLegendsForTest();
    const scene = new THREE.Scene();
    act(() => setPsiLinesEvent({ ...MOON_MARS, bodies: [...MOON_MARS.bodies] }));
    const { rerender } = renderHook(() => useGlobePsiLines({ scene, active: true, cursorMs: 0 }));
    const kinds = () => {
      const found: Record<string, number> = {};
      layerOf(scene).traverse((c) => { const t = c.userData.type; if (t === 'psiLineBand' || t === 'psiParan') found[t] = (found[t] ?? 0) + 1; });
      return found;
    };
    expect(kinds().psiLineBand).toBeGreaterThanOrEqual(8);
    expect(kinds().psiParan).toBe(6);
    const paranLabels = labels(scene).filter((t) => t.includes('·'));
    expect(paranLabels).toHaveLength(6);
    expect(paranLabels.every((t) => /^(Moon|Mars) (MC|IC|ASC|DSC) · (Moon|Mars) (MC|IC|ASC|DSC)$/.test(t))).toBe(true);
    const tips: string[] = [];
    layerOf(scene).traverse((c) => { if (c.userData.type === 'psiParan') tips.push(c.userData.tooltip); });
    expect(tips[0]).toMatch(/^A paran: (Moon|Mars) \w+ as (Moon|Mars) \w+, at about \d+° [NS], at 27 Oct 02:18Z$/);
    const key = getLegends().find((l) => l.layerId === 'PsiLines');
    expect(key?.swatches?.map((sw) => sw.label)).toEqual(["a body's line", "a line's orb: the Moon ±1°, the Sun, Mercury and Venus ±2°, the rest ±1°", 'a paran']);
    expect(getPsiLinesState().drawn).toMatchObject({ bodies: ['Moon', 'Mars'], bands: true });
    // All ten bodies' lines: still the event's parans alone.
    act(() => setPsiLinesAllBodies(true));
    rerender();
    expect(kinds().psiParan).toBe(6);
    act(() => { setLayerChoice('PsiLines', 'psi:bands', false); setLayerChoice('PsiLines', 'psi:parans', false); });
    rerender();
    expect(kinds()).toEqual({});
    expect(getPsiLinesState().drawn).toMatchObject({ bands: false });
    resetLayerChoicesForTests();
  });

  it('moves with the cursor inside the window, by the minute', () => {
    const scene = new THREE.Scene();
    act(() => setPsiLinesEvent({ ...MOON_MARS, bodies: [...MOON_MARS.bodies] }));
    const inside = (MOON_MARS.from + 3600) * 1000 + 25_000;
    const { result } = renderHook(() => useGlobePsiLines({ scene, active: true, cursorMs: inside }));
    expect(result.current.at).toBe(inside);
    expect(tooltips(scene)).toContain('Mars MC: where Mars stands overhead, at 26 Oct 22:11Z');
  });

  it('draws all ten bodies on the switch, and nothing while the layer is off', () => {
    const scene = new THREE.Scene();
    act(() => { setPsiLinesEvent({ ...MOON_MARS, bodies: [...MOON_MARS.bodies] }); setPsiLinesAllBodies(true); });
    const { result, rerender } = renderHook(({ active }) => useGlobePsiLines({ scene, active, cursorMs: 0 }), { initialProps: { active: true } });
    expect(new Set(result.current.lines.map((l) => l.body)).size).toBe(10);
    rerender({ active: false });
    expect(result.current.lines).toEqual([]);
    expect(labels(scene)).toEqual([]);
  });

  it("keys the layer from the cursor's copy alone: now's copy, side by side, never takes the key away (PW73)", () => {
    resetLegendsForTest();
    const scene = new THREE.Scene();
    act(() => setPsiLinesEvent({ ...MOON_MARS, bodies: [...MOON_MARS.bodies] }));
    const cursor = renderHook(() => useGlobePsiLines({ scene, active: true, cursorMs: 0, split: 'cursor' }));
    const now = renderHook(() => useGlobePsiLines({ scene, active: true, cursorMs: 0, split: 'now' }));
    now.unmount();
    expect(getLegends().map((l) => l.layerId)).toContain('PsiLines');
    cursor.unmount();
    expect(getLegends().map((l) => l.layerId)).not.toContain('PsiLines');
  });

  it('draws the MC solid, the IC dashed, and the horizon curves thinner (PW22)', () => {
    expect(PSI_LINE_LOOKS.MC.dashed).toBe(false);
    expect(PSI_LINE_LOOKS.IC.dashed).toBe(true);
    expect(PSI_LINE_LOOKS.ASC.linewidth).toBeLessThan(PSI_LINE_LOOKS.MC.linewidth);
    expect(PSI_LINE_LOOKS.DSC.linewidth).toBeLessThan(PSI_LINE_LOOKS.MC.linewidth);
  });

  it('places a point where the globe places every other one', () => {
    const frame = new THREE.Group();
    frame.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    for (const [lat, lng] of [[0, 0], [40, -23.85], [-33.9, 151.2], [60, 179.5]]) {
      const marker = new THREE.Object3D();
      marker.position.copy(toScene(lat, lng));
      frame.add(marker);
      frame.updateMatrixWorld(true);
      const world = marker.getWorldPosition(new THREE.Vector3());
      expect(world.distanceTo(latLngToGlobeWorld(lat, lng, 100 * SURFACE_LINES))).toBeLessThan(1e-6);
      frame.remove(marker);
    }
  });
});
