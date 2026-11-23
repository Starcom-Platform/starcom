import { describe, expect, it } from 'vitest';
import {
  normalizeRLSHKey,
  resolveRLSHEntityId,
  resolveRLSHGroupId,
  resolveRLSHLocationKey,
  sortRLSHMarkersForNavigation
} from '../rlshIdentityNavigation';

describe('rlshIdentityNavigation policy', () => {
  it('resolves canonical entity and group ids with expected fallback order', () => {
    expect(resolveRLSHEntityId({ entityId: ' entity-1 ', markerId: 'marker-a' })).toBe('entity-1');
    expect(resolveRLSHEntityId({ entityId: '   ', markerId: 'marker-a' })).toBe('marker-a');

    expect(resolveRLSHGroupId({
      entityId: 'entity-1',
      markerId: 'marker-a',
      groupId: ' group-alpha ',
      latitude: 32.7157,
      longitude: -117.1611
    })).toBe('group-alpha');

    expect(resolveRLSHGroupId({
      markerId: 'marker-a',
      latitude: 32.7157,
      longitude: -117.1611
    })).toBe('32.71570|-117.16110');

    expect(resolveRLSHGroupId({ markerId: 'marker-a' })).toBe('marker:marker-a');
  });

  it('supports navigation sort contract: group first, updatedAt desc, id asc', () => {
    const markers = [
      { id: 'z-other', latitude: 40.7128, longitude: -74.006, updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 'group-b', latitude: 32.7157, longitude: -117.1611, updatedAt: '2026-03-03T00:00:00.000Z' },
      { id: 'group-a', latitude: 32.7157, longitude: -117.1611, updatedAt: '2026-03-02T00:00:00.000Z' },
      { id: 'a-other', latitude: 40.7128, longitude: -74.006, updatedAt: '2026-03-01T00:00:00.000Z' }
    ];

    const sorted = sortRLSHMarkersForNavigation(markers, '32.71570|-117.16110');
    expect(sorted.map((marker) => marker.id)).toEqual(['group-b', 'group-a', 'a-other', 'z-other']);
  });

  it('normalizes keys and location generation safely', () => {
    expect(normalizeRLSHKey('  hello ')).toBe('hello');
    expect(normalizeRLSHKey('   ')).toBeNull();

    expect(resolveRLSHLocationKey({ latitude: 32.7157, longitude: -117.1611 })).toBe('32.71570|-117.16110');
    expect(resolveRLSHLocationKey({ latitude: Number.NaN, longitude: -117.1611 })).toBeNull();
  });
});
