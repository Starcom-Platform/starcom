/**
 * The magnetic shield on the globe (decision D-PW, PW7, PW58): IGRF-14 read once, the field's lines for the cursor's
 * year, the anomaly and the dip equator hovered with their year, both poles' tracks ticked by decade, each pole's dot
 * where it stands at the cursor; the legend keyed to the year drawn, forecast past 2025; nothing while it is off.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { MAGNETIC_SHIELD_TYPE, SHIELD_LOOKS, shieldReadiness, useGlobeMagneticShield } from '../useGlobeMagneticShield';
import { resetShieldForTests, SHIELD_DATA_URL } from '../../../../services/psiWatch/shield/useShield';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const BAKED = readFileSync(resolve(__dirname, '../../../../../public/data/psi-igrf14.json'), 'utf8');
const layerOf = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === MAGNETIC_SHIELD_TYPE)!;
const tooltips = (scene: THREE.Scene) => {
  const found: string[] = [];
  // The casing under the tracks says nothing of its own.
  layerOf(scene).traverse((c) => { for (const line of c.userData.lines ?? []) if (line.tooltip) found.push(line.tooltip); });
  return found;
};

describe('useGlobeMagneticShield', () => {
  let fetched: string[];
  beforeEach(() => {
    resetShieldForTests();
    resetLegendsForTest();
    fetched = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(url); return new Response(BAKED, { status: 200 }); }));
  });

  it("draws the cursor's year: the anomaly, the dip equator, both tracks ticked by decade, and each pole's dot", async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeMagneticShield({ scene, active: true, cursorMs: Date.UTC(2026, 9, 30) }));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(fetched).toEqual([SHIELD_DATA_URL]);
    const hovered = tooltips(scene);
    expect(hovered.some((t) => /^The South Atlantic Anomaly, 2026: the field under 30,000 nT, weakest 2\d,\d{3} nT at 2\d\.\d°S [56]\d\.\d°W$/.test(t))).toBe(true);
    expect(hovered).toContain('The dip equator, 2026: where the field lies level');
    expect(hovered).toContain("The north dip pole's track, 1900 to 2030");
    expect(hovered).toContain('The north dip pole in 1950');
    expect(hovered).toContain('The south dip pole in 2020');
    expect(hovered.find((t) => t.startsWith('The north dip pole, 2026: '))).toMatch(/: 8[45]\.\d°N 1[23]\d\.\d°E$/);
    expect(hovered).toContain('The field at 50,000 nT, 2026');
  });

  it('keys the legend to the year drawn, forecast past 2025', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeMagneticShield({ scene, active: true, cursorMs: Date.UTC(2026, 9, 30) }));
    await waitFor(() => expect(result.current).not.toBeNull());
    const legend = getLegends().find((l) => l.layerId === 'MagneticShield')!;
    expect(legend.when).toBe('2026, forecast');
    expect(legend.swatches.map((s) => s.label)).toEqual([
      'the field, every 5,000 nT', 'the South Atlantic Anomaly, under 30,000 nT', 'the dip equator', "a dip pole's track, ticked each decade", 'a dip pole at the cursor',
    ]);
  });

  it('moves the poles with the cursor and keeps the year in 1900 before it', async () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(({ cursorMs }) => useGlobeMagneticShield({ scene, active: true, cursorMs }), { initialProps: { cursorMs: Date.UTC(1950, 0, 1) } });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(tooltips(scene).find((t) => t.startsWith('The north dip pole, 1950: '))).toMatch(/7\d\.\d°N 10\d\.\d°W$/);
    rerender({ cursorMs: Date.UTC(1800, 0, 1) });
    expect(result.current?.clamped).toBe('before');
    expect(getLegends().find((l) => l.layerId === 'MagneticShield')?.when).toBe('1900');
  });

  it('holds a card back until IGRF-14 is drawn', async () => {
    const scene = new THREE.Scene();
    const { result, unmount } = renderHook(() => useGlobeMagneticShield({ scene, active: true, cursorMs: Date.UTC(2026, 9, 30) }));
    expect(shieldReadiness()).toEqual({ ready: false, why: 'IGRF-14 was still loading for the magnetic shield' });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(shieldReadiness().ready).toBe(true);
    unmount();
  });

  it('never holds a card back for a read that failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const scene = new THREE.Scene();
    const { result, unmount } = renderHook(() => useGlobeMagneticShield({ scene, active: true, cursorMs: Date.UTC(2026, 9, 30) }));
    await waitFor(() => expect(shieldReadiness().ready).toBe(true));
    expect(result.current).toBeNull();
    expect(tooltips(scene)).toEqual([]);
    unmount();
  });

  it('draws the anomaly dashed and the field faint', () => {
    expect(SHIELD_LOOKS.anomaly.dashed).toBe(true);
    expect(SHIELD_LOOKS.strength.opacity).toBeLessThan(SHIELD_LOOKS.equator.opacity);
  });

  it('draws nothing and reads nothing while off', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeMagneticShield({ scene, active: false, cursorMs: Date.UTC(2026, 9, 30) }));
    expect(result.current).toBeNull();
    expect(fetched).toEqual([]);
    expect(tooltips(scene)).toEqual([]);
    act(() => undefined);
    expect(getLegends().some((l) => l.layerId === 'MagneticShield')).toBe(false);
  });
});
