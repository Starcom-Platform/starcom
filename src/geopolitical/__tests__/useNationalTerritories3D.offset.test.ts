import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD,
  applyGeoPoliticalSceneCounterOffset,
  countryInfoFromPart
} from '../hooks/useNationalTerritories3D';

describe('useNationalTerritories3D scene counter-offset', () => {
  it('applies -90 degree Y counter-offset to geopolitical groups', () => {
    const group = new THREE.Group();
    expect(group.rotation.y).toBe(0);

    applyGeoPoliticalSceneCounterOffset(group);

    expect(group.rotation.y).toBeCloseTo(GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD, 8);
    expect(group.userData.sceneCounterOffsetRad).toBeCloseTo(GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD, 8);
  });
});

describe('countryInfoFromPart', () => {
  it('returns countryCode and name when both are present', () => {
    expect(countryInfoFromPart({ countryCode: 'RUS', name: 'Russia' })).toEqual({ countryCode: 'RUS', name: 'Russia' });
  });

  it('returns countryCode with an undefined name when name is absent (legacy-path parts)', () => {
    expect(countryInfoFromPart({ countryCode: 'T2' })).toEqual({ countryCode: 'T2', name: undefined });
  });

  it('returns null when countryCode is missing', () => {
    expect(countryInfoFromPart({ name: 'Nowhere' })).toBeNull();
  });

  it('returns null when countryCode is an empty string', () => {
    expect(countryInfoFromPart({ countryCode: '' })).toBeNull();
  });

  it('returns null for a null or undefined part', () => {
    expect(countryInfoFromPart(null)).toBeNull();
    expect(countryInfoFromPart(undefined)).toBeNull();
  });

  it('ignores a non-string name field rather than surfacing garbage', () => {
    const part = { countryCode: 'USA', name: 12345 } as unknown as { countryCode: string; name?: string };
    expect(countryInfoFromPart(part)).toEqual({ countryCode: 'USA', name: undefined });
  });
});
