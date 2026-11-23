/**
 * The ψ field on the globe (decision D-PW, PW57, PW78–PW80): the base and IGRF-14 read once, the cursor's minute
 * computed and drawn as one shell; the key names the moment and the core line's year and swatches only the looks on;
 * a card waits for the moment shown, never for a read that failed; side by side, now's copy keys nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { PSI_MODEL_TYPE, psiModelReadiness, useGlobePsiModel } from '../useGlobePsiModel';
import { resetPsiFieldStoreForTests } from '../../../../services/psiWatch/psiField/usePsiField';
import { resetPsiFieldForTests, PSI_BASE_URL } from '../../../../services/psiWatch/psiField/field';
import { resetPsiFieldLooksForTests, setPsiFieldLook } from '../../../../services/psiWatch/psiField/psiFieldLooks';
import { resetShieldForTests, SHIELD_DATA_URL } from '../../../../services/psiWatch/shield/useShield';
import { setObserverState } from '../../../../services/psiWatch/timestream/observer';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import PsiModelSection from '../../../PsiWatch/PsiModelSection';

const read = (name: string) => readFileSync(resolve(__dirname, `../../../../../public/data/${name}`), 'utf8');
const FILES: Record<string, string> = { [PSI_BASE_URL]: read('psi-base.json'), [SHIELD_DATA_URL]: read('psi-igrf14.json') };
const MOMENT = Date.UTC(2026, 9, 30, 14, 0, 30);
const shellOf = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === PSI_MODEL_TYPE)?.children[0] as THREE.Mesh | undefined;

describe('useGlobePsiModel', () => {
  let fetched: string[];
  beforeEach(() => {
    resetPsiFieldStoreForTests();
    resetPsiFieldForTests();
    resetShieldForTests();
    resetLegendsForTest();
    localStorage.clear();
    resetPsiFieldLooksForTests();
    setObserverState(null, false);
    fetched = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      return FILES[url] ? new Response(FILES[url], { status: 200 }) : new Response('', { status: 404 });
    }));
  });

  it("draws the cursor's minute as one shell, the inputs read once, and keys it with the moment and the core line's year", async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiModel({ scene, active: true, cursorMs: MOMENT }));
    expect(psiModelReadiness()).toEqual({ ready: false, why: 'the ψ field was still being computed' });
    await waitFor(() => expect(result.current.current).toBe(true), { timeout: 10_000 });
    expect(psiModelReadiness().ready).toBe(true);
    expect(fetched.sort()).toEqual([PSI_BASE_URL, SHIELD_DATA_URL].sort());
    const field = result.current.at!;
    expect(field.timeMs).toBe(Date.UTC(2026, 9, 30, 14, 0));
    expect(field.year).toBe(2026);
    expect(Math.max(...field.psi)).toBeGreaterThan(0.5);
    expect(Math.max(...field.psi)).toBeLessThan(1);
    expect(shellOf(scene)?.name).toBe('psi-field');
    const legend = getLegends().find((l) => l.layerId === 'PsiModel')!;
    expect(legend.when).toBe('30 Oct 2026 14:00Z, core line 2026');
    expect(legend.swatches.map((s) => s.label)).toEqual(['ψ faint', 'ψ condensed', 'a line at each tenth of ψ']);
  }, 20_000);

  it('swatches only the looks on', async () => {
    setPsiFieldLook('flow', true);
    setPsiFieldLook('heat', false);
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiModel({ scene, active: true, cursorMs: MOMENT }));
    await waitFor(() => expect(result.current.current).toBe(true), { timeout: 10_000 });
    expect(getLegends().find((l) => l.layerId === 'PsiModel')!.swatches.map((s) => s.label))
      .toEqual(['a line at each tenth of ψ', 'raised by the tides', 'lowered by the tides']);
    act(() => setPsiFieldLook('relief', true));
    expect(getLegends().find((l) => l.layerId === 'PsiModel')!.swatches.map((s) => s.label)).toContain('the drive beneath: geoid, spreading ridges, core line, coasts');
  }, 20_000);

  it("keys the layer from the cursor's copy alone, side by side", async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobePsiModel({ scene, active: true, cursorMs: MOMENT, split: 'now' }));
    await waitFor(() => expect(result.current.current).toBe(true), { timeout: 10_000 });
    expect(shellOf(scene)).toBeDefined();
    expect(getLegends().find((l) => l.layerId === 'PsiModel')).toBeUndefined();
    expect(psiModelReadiness().ready).toBe(true);
  }, 20_000);

  it('never holds a card back for a read that failed, and draws nothing while off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(({ active }) => useGlobePsiModel({ scene, active, cursorMs: MOMENT }), { initialProps: { active: true } });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(psiModelReadiness().ready).toBe(true);
    rerender({ active: false });
    expect(shellOf(scene)).toBeUndefined();
    expect(getLegends().find((l) => l.layerId === 'PsiModel')).toBeUndefined();
  });

  it('reads ψ at the observer in the panel, with the core line and the looks', async () => {
    // The East Pacific Rise, where the spreading ridge and the coasts' bands are far apart, under the same minute.
    setObserverState({ lat: -15, lon: -112 }, true);
    render(<PsiModelSection cursorMs={MOMENT} />);
    await waitFor(() => expect(screen.getByTestId('psi-model-core')).toBeTruthy(), { timeout: 10_000 });
    expect(screen.getByTestId('psi-model-core').textContent).toBe("The core's null-flux line as forecast for 2026");
    expect(screen.getByTestId('psi-model-observer').textContent).toMatch(/^ψ (is nought at 15\.0°S 112\.0°W|0\.\d\d at 15\.0°S 112\.0°W, above \d+% of the globe)$/);
    const looks = screen.getByTestId('psi-model-looks');
    expect([...looks.querySelectorAll('button')].map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`))
      .toEqual(['Heat:true', 'Contours:true', 'Relief:false', 'Flow:false']);
  }, 20_000);
});
