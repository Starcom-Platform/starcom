import { getRLSHLocationKey } from './rlshTags';

interface RLSHIdentityInput {
  entityId?: string | null;
  markerId?: string | null;
  groupId?: string | null;
  latitude?: number;
  longitude?: number;
}

interface RLSHSortableMarker {
  id: string;
  updatedAt?: string | null;
  groupId?: string | null;
  latitude: number;
  longitude: number;
}

export const normalizeRLSHKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveRLSHEntityId = ({ entityId, markerId }: Pick<RLSHIdentityInput, 'entityId' | 'markerId'>): string | null => {
  return normalizeRLSHKey(entityId) || normalizeRLSHKey(markerId);
};

export const resolveRLSHLocationKey = ({ latitude, longitude }: Pick<RLSHIdentityInput, 'latitude' | 'longitude'>): string | null => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return getRLSHLocationKey(latitude, longitude);
};

export const resolveRLSHGroupId = (
  identity: RLSHIdentityInput,
  options: { fallbackToMarkerKey?: boolean } = {}
): string | null => {
  const explicitGroupId = normalizeRLSHKey(identity.groupId);
  if (explicitGroupId) {
    return explicitGroupId;
  }

  const locationKey = resolveRLSHLocationKey(identity);
  if (locationKey) {
    return locationKey;
  }

  if (options.fallbackToMarkerKey !== false) {
    const entityId = resolveRLSHEntityId(identity);
    if (entityId) {
      return `marker:${entityId}`;
    }
  }

  return null;
};

export const resolveRLSHGroupRank = (markerGroupId: string | null, initialGroupId: string | null): number => {
  if (!initialGroupId) {
    return 1;
  }

  return markerGroupId === initialGroupId ? 0 : 1;
};

export const toRLSHUpdatedAtTimestamp = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sortRLSHMarkersForNavigation = <T extends RLSHSortableMarker>(
  markers: T[],
  initialGroupId: string | null
): T[] => {
  return [...markers].sort((left, right) => {
    const leftGroup = resolveRLSHGroupId({
      markerId: left.id,
      groupId: left.groupId,
      latitude: left.latitude,
      longitude: left.longitude
    }, { fallbackToMarkerKey: false });

    const rightGroup = resolveRLSHGroupId({
      markerId: right.id,
      groupId: right.groupId,
      latitude: right.latitude,
      longitude: right.longitude
    }, { fallbackToMarkerKey: false });

    const leftGroupRank = resolveRLSHGroupRank(leftGroup, initialGroupId);
    const rightGroupRank = resolveRLSHGroupRank(rightGroup, initialGroupId);

    if (leftGroupRank !== rightGroupRank) {
      return leftGroupRank - rightGroupRank;
    }

    const timeDiff = toRLSHUpdatedAtTimestamp(right.updatedAt) - toRLSHUpdatedAtTimestamp(left.updatedAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.id.localeCompare(right.id);
  });
};
