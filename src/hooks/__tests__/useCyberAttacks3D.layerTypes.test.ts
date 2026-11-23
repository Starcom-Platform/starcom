/**
 * Verifies useCyberAttacks3D's layerTypes gating: indicators/density are two
 * independently-toggled real renderings of the same real cluster data (see
 * cyberAttackClustering.ts), following the same "one sub-mode, N toggled real
 * layers" shape as GeoPolitical's ConflictZones (useConflictZones3D.ts).
 *
 * Each sub-layer is one object with a point per cluster (screenPoints.ts), tagged
 * with its CYBER_MARKER_LAYERS type.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D, CYBER_MARKER_LAYERS } from '../useCyberAttacks3D';
import type { CyberAttackData } from '../../types/CyberAttacks';

function makeAttack(overrides: Partial<CyberAttackData> = {}): CyberAttackData {
  return {
    id: 'attack-1',
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 4,
    metadata: { source: 'Test Source', confidence: 0.85 },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    },
    ...overrides
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

/** The sub-layer's object, if drawn, and how many clusters it draws. */
function layer(group: THREE.Group, type: string) {
  const found = group.children.filter((c) => c.userData.type === type);
  expect(found.length).toBeLessThanOrEqual(1);
  const points = found[0] as THREE.Points | undefined;
  return points && { points, count: points.geometry.getAttribute('position').count };
}

describe('useCyberAttacks3D — layerTypes gating', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([makeAttack()]);
    disposeMock.mockClear();
    // Re-established every test: this project's global test setup
    // (src/setupVitest.ts) runs vi.restoreAllMocks() in its own afterEach after every
    // single test, which resets a vi.fn()-created mock's implementation (it has no
    // "original" to restore to) — so a constructor mock set up once at module load
    // would silently return undefined starting from the second test in this file.
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: disposeMock
    }) as unknown as RealTimeAttackService; });
  });

  it('defaults to indicators-only when layerTypes is not provided (preserves existing behavior)', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, { updateInterval: 999999 })
    );

    await waitFor(() => expect(result.current.attacksGroup.children.length).toBeGreaterThan(0));
    expect(layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)?.count).toBe(1);
    expect(layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.density)).toBeUndefined();
  });

  it('draws one indicator per country, not per record', async () => {
    getDataMock.mockResolvedValue([
      makeAttack({ id: 'a' }),
      makeAttack({ id: 'b' }),
      makeAttack({ id: 'c', trajectory: { source: { latitude: 50, longitude: 10, countryCode: 'DEU', confidence: 0.8 } } } as Partial<CyberAttackData>),
    ]);
    const { result } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));

    await waitFor(() => expect(result.current.clusters.length).toBe(2));
    const indicators = layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators);
    expect(indicators?.count).toBe(2);
    expect((indicators?.points.userData.clusters as { countryCode: string }[]).map((c) => c.countryCode).sort()).toEqual(['DEU', 'USA']);
  });

  it('opens each country\'s count by list from its indicator, and nothing from the bloom beneath it (C5)', async () => {
    getDataMock.mockResolvedValue([
      makeAttack({ id: 'a' }),
      makeAttack({ id: 'c', trajectory: { source: { latitude: 50, longitude: 10, countryCode: 'DEU', confidence: 0.8 } } } as Partial<CyberAttackData>),
    ]);
    const { result } = renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, {
      updateInterval: 999999, layerTypes: { indicators: true, density: true, enrichment: false, knownGroups: false },
    }));

    await waitFor(() => expect(result.current.clusters.length).toBe(2));
    const indicators = layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)!;
    const clusters = indicators.points.userData.clusters as { countryCode: string }[];
    const opens = indicators.points.userData.opens as Array<{ heading: string }>;
    expect(opens.map((set) => set.heading)).toEqual(clusters.map((c) => `Cyber Threats · ${c.countryCode}`));
    expect(layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.density)!.points.userData.opens).toBeUndefined();
  });

  it('renders no indicator when layerTypes.indicators is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: false, density: false, enrichment: false, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.clusters.length).toBe(1));
    expect(result.current.attacksGroup.children.length).toBe(0);
  });

  it('renders density when layerTypes.density is on, alongside indicators, beneath them', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: true, enrichment: false, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(2));
    const density = layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.density);
    const indicators = layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators);
    expect(density?.count).toBe(1);
    expect(indicators?.count).toBe(1);
    expect(density!.points.renderOrder).toBeLessThan(indicators!.points.renderOrder);
  });

  it('renders only density when indicators is off but density is on', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: false, density: true, enrichment: false, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(1));
    expect(layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.density)?.count).toBe(1);
    expect(layer(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)).toBeUndefined();
  });

  it('density marker uses additive blending, distinguishing it from the solid indicator marker', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: true, enrichment: false, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(2));
    const blending = (type: string) => (layer(result.current.attacksGroup, type)!.points.material as THREE.Material).blending;
    expect(blending(CYBER_MARKER_LAYERS.density)).toBe(THREE.AdditiveBlending);
    expect(blending(CYBER_MARKER_LAYERS.indicators)).toBe(THREE.NormalBlending);
  });
});
