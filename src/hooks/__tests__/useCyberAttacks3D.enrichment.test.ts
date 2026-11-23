/**
 * Verifies useCyberAttacks3D's OTX enrichment wiring: when layerTypes.enrichment is on,
 * real per-IP OTX data (mocked here — the real fetch/parse logic is tested live against
 * the real endpoint in OTXEnrichmentService.test.ts) gets applied to clusters and rendered
 * as a distinguishing accent.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D, CYBER_MARKER_LAYERS } from '../useCyberAttacks3D';
import type { CyberAttackData } from '../../types/CyberAttacks';
import type { OTXEnrichment } from '../../types/ThreatIntelOTX';

const enrichmentRings = (group: THREE.Group) =>
  group.children.find((c) => c.userData.type === CYBER_MARKER_LAYERS.enrichment) as THREE.Points | undefined;

function makeAttack(overrides: Partial<CyberAttackData> = {}): CyberAttackData {
  return {
    id: 'attack-1',
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 4,
    metadata: { source: 'Test Source', confidence: 0.85, realIp: '1.2.3.4' },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    },
    ...overrides
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();
const disposeMock = vi.fn();
const enrichWithOTXMock = vi.fn<() => Promise<Map<string, OTXEnrichment>>>();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));
// OTX is off until LevelBlue permits it (D-CS, CS9). These tests drive the path as it would run once permitted, and
// one holds that it never runs while it is not.
let otxPermittedNow = true;
vi.mock('../../services/CyberAttacks/OTXEnrichmentService', () => ({
  enrichWithOTX: (...args: unknown[]) => enrichWithOTXMock(...args),
  otxPermitted: () => otxPermittedNow,
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

describe('useCyberAttacks3D — OTX enrichment layer', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([makeAttack()]);
    disposeMock.mockClear();
    enrichWithOTXMock.mockReset().mockResolvedValue(new Map());
    otxPermittedNow = true;
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: disposeMock
    }) as unknown as RealTimeAttackService; });
  });

  it('does not call enrichWithOTX when layerTypes.enrichment is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, { updateInterval: 999999 })
    );

    await waitFor(() => expect(result.current.clusters.length).toBe(1));
    expect(enrichWithOTXMock).not.toHaveBeenCalled();
  });

  it('never calls OTX while it is not permitted, even with the enrichment layer on', async () => {
    otxPermittedNow = false;
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: true, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.clusters.length).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(enrichWithOTXMock).not.toHaveBeenCalled();
  });

  it('calls enrichWithOTX with the real attack IPs when layerTypes.enrichment is on', async () => {
    const scene = new THREE.Scene();
    renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: true, knownGroups: false }
      })
    );

    await waitFor(() => expect(enrichWithOTXMock).toHaveBeenCalledWith(['1.2.3.4']));
  });

  it('renders an enrichment accent mesh once real OTX data resolves for a cluster member', async () => {
    enrichWithOTXMock.mockResolvedValue(new Map([
      ['1.2.3.4', { ip: '1.2.3.4', pulseCount: 5, pulses: [], malwareFamilies: ['Mirai'] }]
    ]));

    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: true, knownGroups: false }
      })
    );

    await waitFor(() => {
      expect(enrichmentRings(result.current.attacksGroup)?.geometry.getAttribute('position').count).toBe(1);
    });
    expect(result.current.clusters[0].realMalwareFamilies).toEqual(['Mirai']);
  });

  it('renders no enrichment mesh when no real OTX data resolves for any member', async () => {
    enrichWithOTXMock.mockResolvedValue(new Map());

    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: true, knownGroups: false }
      })
    );

    await waitFor(() => expect(result.current.attacksGroup.children.length).toBe(1));
    // After the (empty) answer has landed, not merely before it has.
    await waitFor(() => expect(enrichWithOTXMock).toHaveBeenCalled());
    await enrichWithOTXMock.mock.results[0].value;
    expect(enrichmentRings(result.current.attacksGroup)).toBeUndefined();
  });
});
