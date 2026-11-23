import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RLSHOverlayMarker } from '../../../interfaces/RLSHOverlay';
import { rlshVisualizationService } from '../../../services/RLSHVisualizationService';
import { RLSHPopup } from './RLSHPopup';
import { resolveRLSHGroupId, sortRLSHMarkersForNavigation } from '../../../utils/rlshIdentityNavigation';

export interface RLSHNavigationContext {
  totalCount: number;
  currentPosition: number;
  groupSize: number;
  groupPosition: number;
  groupScoped: boolean;
}

interface RLSHPopupPortalProps {
  initialMarkerId: string;
  // Per docs/architecture/RLSH_IDENTITY_NAVIGATION_POLICY.md's navigation ordering rules —
  // when set, markers sharing this group rank first (most-recently-updated first), so
  // Previous/Next surfaces the rest of the group before spilling into the global list.
  initialGroupId?: string | null;
  onClose: () => void;
  onCloseComplete?: () => void;
  onMarkerChange?: (marker: RLSHOverlayMarker | null) => void;
}

export const RLSHPopupPortal: React.FC<RLSHPopupPortalProps> = ({
  initialMarkerId,
  initialGroupId = null,
  onClose,
  onCloseComplete,
  onMarkerChange
}) => {
  const [markers, setMarkers] = useState<RLSHOverlayMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    let mounted = true;

    const loadMarkers = async () => {
      try {
        setLoading(true);
        setError(null);

        const items = await rlshVisualizationService.getMarkers({ limit: 200 });
        if (!mounted) {
          return;
        }

        const sorted = sortRLSHMarkersForNavigation(items, initialGroupId);
        setMarkers(sorted);
        const foundIndex = sorted.findIndex((marker) => marker.id === initialMarkerId);
        setCurrentIndex(foundIndex >= 0 ? foundIndex : (sorted.length > 0 ? 0 : -1));
      } catch {
        if (!mounted) {
          return;
        }
        setError('Failed to load RLSH markers.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadMarkers();

    return () => {
      mounted = false;
    };
  }, [initialMarkerId, initialGroupId]);

  const currentMarker = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= markers.length) {
      return null;
    }

    return markers[currentIndex];
  }, [markers, currentIndex]);

  const groupMarkers = useMemo(() => {
    if (!initialGroupId) {
      return [];
    }

    return markers.filter((marker) => resolveRLSHGroupId({
      markerId: marker.id,
      latitude: marker.latitude,
      longitude: marker.longitude
    }, { fallbackToMarkerKey: false }) === initialGroupId);
  }, [markers, initialGroupId]);

  const navigationContext: RLSHNavigationContext | undefined = useMemo(() => {
    if (markers.length === 0 || currentIndex < 0 || !currentMarker) {
      return undefined;
    }

    const groupScoped = Boolean(initialGroupId);
    const groupPosition = groupScoped
      ? groupMarkers.findIndex((marker) => marker.id === currentMarker.id) + 1
      : 0;

    return {
      totalCount: markers.length,
      currentPosition: currentIndex + 1,
      groupSize: groupMarkers.length,
      groupPosition,
      groupScoped
    };
  }, [markers.length, currentIndex, currentMarker, initialGroupId, groupMarkers]);

  useEffect(() => {
    onMarkerChange?.(currentMarker);
  }, [currentMarker, onMarkerChange]);

  const handleClose = useCallback(() => {
    onClose();
    onCloseComplete?.();
  }, [onClose, onCloseComplete]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, markers.length - 1));
  }, [markers.length]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  return (
    <RLSHPopup
      marker={currentMarker}
      visible={true}
      loading={loading}
      error={error}
      navigationContext={navigationContext}
      onClose={handleClose}
      onPrevious={markers.length > 1 ? handlePrevious : undefined}
      onNext={markers.length > 1 ? handleNext : undefined}
      hasPrevious={currentIndex > 0}
      hasNext={currentIndex >= 0 && currentIndex < markers.length - 1}
    />
  );
};

export default RLSHPopupPortal;
