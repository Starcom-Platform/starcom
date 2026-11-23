/**
 * The Timestream's observer on the globe (decision D-PW, PW43, PW65): a crosshair where the drawer casts its angles,
 * carrying a dot once pinned, and nothing outside Psi Watch; the screen's alone, never in a card or a clip (PW62).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { observerMarkSvg, PSI_OBSERVER_TYPE, useGlobePsiObserver } from '../useGlobePsiObserver';
import { setObserverState } from '../../../../services/psiWatch/timestream/observer';
import { releaseMotion, stillMotion } from '../../../../globe-engine/captureClock';

vi.mock('../../intelReportSprites', () => ({ bakeSvgAtlas: vi.fn(async () => new THREE.Texture()) }));

const marks = (scene: THREE.Scene) => scene.children.find((c) => c.userData.type === PSI_OBSERVER_TYPE)!.children;

describe('useGlobePsiObserver', () => {
  afterEach(() => setObserverState(null, false));

  it('marks the observer, with a dot once pinned', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobePsiObserver({ scene, active: true }));
    expect(marks(scene)).toHaveLength(0);
    act(() => setObserverState({ lat: 12.5, lon: 3 }, false));
    await waitFor(() => expect(marks(scene)).toHaveLength(1));
    expect(marks(scene)[0].userData).toEqual({ type: 'psiObserverMark', pinned: false });
    act(() => setObserverState({ lat: 12.5, lon: 3 }, true));
    await waitFor(() => expect(marks(scene)[0]?.userData.pinned).toBe(true));
    expect(marks(scene)).toHaveLength(1);
    expect(observerMarkSvg(true)).toContain('r="4.5"');
    expect(observerMarkSvg(false)).not.toContain('r="4.5"');
  });

  it('draws nothing outside Psi Watch', async () => {
    const scene = new THREE.Scene();
    setObserverState({ lat: 12.5, lon: 3 }, false);
    renderHook(() => useGlobePsiObserver({ scene, active: false }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(marks(scene)).toHaveLength(0);
  });

  it('hides the crosshair for each capture\'s own render, and shows it again after', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobePsiObserver({ scene, active: true }));
    act(() => setObserverState({ lat: 12.5, lon: 3 }, false));
    const group = scene.children.find((c) => c.userData.type === PSI_OBSERVER_TYPE)!;
    stillMotion(Date.UTC(2026, 10, 1));
    expect(group.visible).toBe(false);
    releaseMotion();
    expect(group.visible).toBe(true);
  });
});
