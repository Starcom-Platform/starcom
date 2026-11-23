/**
 * Verifies useCyberAttacks3D's Known Threat Groups wiring: real MITRE reference data
 * (mocked here — the real fetch/filter/cache logic is tested against a fixture in
 * MitreAttackReferenceService.test.ts) is fetched lazily only when layerTypes.knownGroups
 * is on, and exposed via the hook's return value rather than rendered as globe markers
 * (real MITRE group records don't carry a structured per-group geo-coordinate).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D } from '../useCyberAttacks3D';
import type { CyberAttackData } from '../../types/CyberAttacks';
import type { MitreReferenceData } from '../../types/MitreAttack';

function makeAttack(): CyberAttackData {
  return {
    id: 'attack-1',
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 4,
    metadata: { source: 'Test Source', confidence: 0.85, realIp: '1.2.3.4' },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    }
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();
const disposeMock = vi.fn();
const getMitreReferenceDataMock = vi.fn<() => Promise<MitreReferenceData>>();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));
vi.mock('../../services/threat-intel/MitreAttackReferenceService', () => ({
  getMitreReferenceData: () => getMitreReferenceDataMock()
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

const REAL_SAMPLE: MitreReferenceData = {
  groups: [{ id: 'intrusion-set--1', mitreId: 'G0082', name: 'APT38', aliases: ['BeagleBoyz'], description: 'real', techniqueIds: ['T1055.011'] }],
  techniques: [{ id: 'attack-pattern--1', mitreId: 'T1055.011', name: 'Extra Window Memory Injection' }],
  malware: [{ id: 'malware--1', mitreId: 'S0061', name: 'HDoor' }],
  fetchedAt: Date.now()
};

describe('useCyberAttacks3D — Known Threat Groups (MITRE reference)', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([makeAttack()]);
    disposeMock.mockClear();
    getMitreReferenceDataMock.mockReset().mockResolvedValue(REAL_SAMPLE);
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: disposeMock
    }) as unknown as RealTimeAttackService; });
  });

  it('does not fetch MITRE reference data when layerTypes.knownGroups is off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, { updateInterval: 999999 })
    );

    await waitFor(() => expect(result.current.clusters.length).toBe(1));
    expect(getMitreReferenceDataMock).not.toHaveBeenCalled();
    expect(result.current.mitreReference).toBeNull();
  });

  it('fetches real MITRE reference data lazily when layerTypes.knownGroups is on', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: false, knownGroups: true }
      })
    );

    await waitFor(() => expect(result.current.mitreReference).not.toBeNull());
    expect(getMitreReferenceDataMock).toHaveBeenCalledTimes(1);
    expect(result.current.mitreReference?.groups[0].name).toBe('APT38');
  });

  it('does not render any additional globe markers for the known-groups layer', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: true, density: false, enrichment: false, knownGroups: true }
      })
    );

    await waitFor(() => expect(result.current.mitreReference).not.toBeNull());
    // Just the one real indicator marker — knownGroups contributes zero scene objects.
    expect(result.current.attacksGroup.children.length).toBe(1);
  });

  it('does not re-fetch once already loaded', async () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useCyberAttacks3D(true, scene, null, {
          updateInterval: 999999,
          layerTypes: { indicators: true, density: false, enrichment: false, knownGroups: enabled }
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(result.current.mitreReference).not.toBeNull());
    rerender({ enabled: true });
    rerender({ enabled: true });

    expect(getMitreReferenceDataMock).toHaveBeenCalledTimes(1);
  });
});
