/**
 * The layer re-checks its source on a timer. The source is a snapshot built with the
 * deploy, so nearly every re-check finds the same records — and until 2026-09-11 each
 * one, every two seconds:
 *
 *   - re-rendered the globe twice and disposed and redrew every marker, because the
 *     service answers each read with a new array;
 *   - set "loading", so a share card captured in that moment said a loaded layer was
 *     still loading;
 *   - cleared any error, so a card captured then said nothing of a failure that stood
 *     either side of it.
 *
 * And the markers themselves were spheres sized for a globe of radius 1, drawn on one of
 * radius 100: under half a pixel — and, once they were not, drawn before the country
 * fills, which painted over every one on land. The sizes and the draw order are pinned
 * here; whether they read on a card is measured by scripts/audit-globe-layers.mjs.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D, clusterMarkerPx, CYBER_MARKER_LAYERS } from '../useCyberAttacks3D';
import { SCREEN_POINTS_RENDER_ORDER } from '../../components/Globe/screenPoints';
import type { CyberAttackData } from '../../types/CyberAttacks';

function makeAttack(id = 'attack-1'): CyberAttackData {
  return {
    id,
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 5,
    metadata: { source: 'Test Source', confidence: 0.85 },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    },
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

const indicators = (group: THREE.Group) =>
  group.children.find((c) => c.userData.type === CYBER_MARKER_LAYERS.indicators) as THREE.Points | undefined;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useCyberAttacks3D — re-checking a snapshot', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockImplementation(async () => [makeAttack()]);
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: vi.fn()
    }) as unknown as RealTimeAttackService; });
  });

  const loaded = async () => {
    const hook = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));
    await waitFor(() => expect(indicators(hook.result.current.attacksGroup)).toBeDefined());
    return hook;
  };

  it('a re-check that finds the same records redraws nothing', async () => {
    const { result } = await loaded();
    const drawn = indicators(result.current.attacksGroup);
    const attacks = result.current.attacks;

    // A new array of new objects — the same records, as the service returns them.
    await act(async () => { await result.current.refresh(); });

    expect(getDataMock).toHaveBeenCalledTimes(2);
    expect(result.current.attacks).toBe(attacks);
    expect(indicators(result.current.attacksGroup)).toBe(drawn);
  });

  it('a re-check that finds different records does redraw', async () => {
    const { result } = await loaded();
    const drawn = indicators(result.current.attacksGroup);

    getDataMock.mockImplementation(async () => [makeAttack('attack-2')]);
    await act(async () => { await result.current.refresh(); });

    await waitFor(() => expect(indicators(result.current.attacksGroup)).not.toBe(drawn));
  });

  it('says "loading" only until the first answer, never during a re-check', async () => {
    const { result } = await loaded();
    const pending = deferred<CyberAttackData[]>();
    getDataMock.mockImplementation(() => pending.promise);

    let recheck!: Promise<void>;
    act(() => { recheck = result.current.refresh(); });
    expect(result.current.isLoading).toBe(false);

    pending.resolve([makeAttack()]);
    await act(async () => { await recheck; });
    expect(result.current.isLoading).toBe(false);
  });

  it('a first load that fails is reported, and draws nothing', async () => {
    getDataMock.mockImplementation(async () => { throw new Error('snapshot unreadable'); });
    const { result } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));

    await waitFor(() => expect(result.current.error).toBe('snapshot unreadable'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.attacksGroup.children.length).toBe(0);
  });

  it('an error stands while a re-check is in flight, and clears when one succeeds', async () => {
    getDataMock.mockImplementation(async () => { throw new Error('snapshot unreadable'); });
    const { result } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));
    await waitFor(() => expect(result.current.error).toBe('snapshot unreadable'));

    const pending = deferred<CyberAttackData[]>();
    getDataMock.mockImplementation(() => pending.promise);
    let recheck!: Promise<void>;
    act(() => { recheck = result.current.refresh(); });
    expect(result.current.error).toBe('snapshot unreadable');

    pending.resolve([makeAttack()]);
    await act(async () => { await recheck; });
    expect(result.current.error).toBeNull();
    expect(indicators(result.current.attacksGroup)).toBeDefined();
  });

  it('a re-check that fails after a good load keeps the picture, without claiming it did not load', async () => {
    const { result } = await loaded();
    const drawn = indicators(result.current.attacksGroup);

    getDataMock.mockImplementation(async () => { throw new Error('offline'); });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.error).toBeNull();
    expect(result.current.attacks).toHaveLength(1);
    expect(indicators(result.current.attacksGroup)).toBe(drawn);
  });
});

describe('useCyberAttacks3D — markers a person can see', () => {
  it('sizes a country by its count in on-screen pixels: at least 8, capped, never shrinking as it grows', () => {
    expect(clusterMarkerPx(1)).toBe(8);
    // On a card, about 0.87 of that — still over the layer audit's 4×4 px.
    expect(clusterMarkerPx(1) * 0.87).toBeGreaterThanOrEqual(4);
    const sizes = [1, 2, 5, 11, 53, 10_000].map(clusterMarkerPx);
    sizes.slice(1).forEach((s, i) => expect(s).toBeGreaterThanOrEqual(sizes[i]));
    expect(Math.max(...sizes)).toBe(20);
  });

  it('draws each country at its size, with a light rim for the dark worst-severity fill', async () => {
    getDataMock.mockReset().mockImplementation(async () => [makeAttack('a'), makeAttack('b'), makeAttack('c')]);
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: vi.fn()
    }) as unknown as RealTimeAttackService; });
    const { result } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));
    await waitFor(() => expect(indicators(result.current.attacksGroup)).toBeDefined());

    const points = indicators(result.current.attacksGroup)!;
    expect(points.geometry.getAttribute('pointSize').getX(0)).toBe(Math.fround(clusterMarkerPx(3)));
    // The group's order is what three.js sorts by first: at 0, every country fill
    // (a group at 95) painted over every marker beneath it.
    expect(result.current.attacksGroup.renderOrder).toBe(SCREEN_POINTS_RENDER_ORDER);
    const rim = (points.material as THREE.ShaderMaterial).uniforms.rimColor.value as THREE.Color;
    expect(rim.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.9);
  });
});
