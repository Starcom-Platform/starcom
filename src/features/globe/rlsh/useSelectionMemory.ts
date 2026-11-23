import React, { useCallback, useEffect, useRef } from 'react';
import type { RLSHOverlayMarker } from '../../../interfaces/RLSHOverlay';
import { resolveRLSHGroupId, resolveRLSHLocationKey } from '../../../utils/rlshIdentityNavigation';

interface RLSHReportLike {
  pubkey: string;
  latitude: number;
  longitude: number;
  groupId?: string;
}

interface ModelLike {
  report?: RLSHReportLike;
}

interface UseRLSHSelectionMemoryParams<TModel extends ModelLike> {
  isRLSHMode: boolean;
  models: TModel[];
}

interface RLSHPopupSeed {
  clickedLocationKey: string | null;
  clickedGroupKey: string | null;
  preferredMarkerId: string | null;
  initialPopupMarkerId: string;
}

export interface RLSHSelectionMemoryController {
  getPopupSeedForReport: (clickedReport: RLSHReportLike) => RLSHPopupSeed;
  recordMarkerSelection: (
    marker: RLSHOverlayMarker,
    fallbackGroupKey?: string | null,
    fallbackLocationKey?: string | null
  ) => void;
}

export const useRLSHSelectionMemory = <TModel extends ModelLike>({
  isRLSHMode,
  models
}: UseRLSHSelectionMemoryParams<TModel>): RLSHSelectionMemoryController => {
  const selectedMarkerByGroupKeyRef = useRef<Map<string, string>>(new Map());
  const markerGroupKeyByIdRef = useRef<Map<string, string>>(new Map());
  const selectedMarkerByLocationRef = useRef<Map<string, string>>(new Map());
  const markerLocationByIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isRLSHMode) {
      markerLocationByIdRef.current = new Map();
      markerGroupKeyByIdRef.current = new Map();
      return;
    }

    const locationById = new Map<string, string>();
    const groupKeyById = new Map<string, string>();

    models.forEach((model) => {
      const markerId = model?.report?.pubkey;
      if (!markerId) {
        return;
      }

      const locationKey = resolveRLSHLocationKey({
        latitude: model.report.latitude,
        longitude: model.report.longitude
      });

      const groupKey = resolveRLSHGroupId({
        entityId: markerId,
        markerId,
        groupId: model.report.groupId,
        latitude: model.report.latitude,
        longitude: model.report.longitude
      }, { fallbackToMarkerKey: false });

      if (locationKey) {
        locationById.set(markerId, locationKey);
      }

      if (groupKey) {
        groupKeyById.set(markerId, groupKey);
      }
    });

    markerLocationByIdRef.current = locationById;
    markerGroupKeyByIdRef.current = groupKeyById;
  }, [models, isRLSHMode]);

  const getPopupSeedForReport = useCallback((clickedReport: RLSHReportLike): RLSHPopupSeed => {
    const clickedLocationKey = markerLocationByIdRef.current.get(clickedReport.pubkey)
      || resolveRLSHLocationKey({ latitude: clickedReport.latitude, longitude: clickedReport.longitude });

    const clickedGroupKey = markerGroupKeyByIdRef.current.get(clickedReport.pubkey)
      || resolveRLSHGroupId({
        entityId: clickedReport.pubkey,
        markerId: clickedReport.pubkey,
        groupId: clickedReport.groupId,
        latitude: clickedReport.latitude,
        longitude: clickedReport.longitude
      }, { fallbackToMarkerKey: false })
      || clickedLocationKey;

    const preferredMarkerId = (clickedGroupKey ? selectedMarkerByGroupKeyRef.current.get(clickedGroupKey) || null : null)
      || (clickedLocationKey ? selectedMarkerByLocationRef.current.get(clickedLocationKey) || null : null);

    return {
      clickedLocationKey,
      clickedGroupKey,
      preferredMarkerId,
      initialPopupMarkerId: preferredMarkerId || clickedReport.pubkey
    };
  }, []);

  const recordMarkerSelection = useCallback((
    marker: RLSHOverlayMarker,
    fallbackGroupKey?: string | null,
    fallbackLocationKey?: string | null
  ) => {
    const markerLocationKey = resolveRLSHLocationKey({ latitude: marker.latitude, longitude: marker.longitude })
      || fallbackLocationKey
      || null;

    if (markerLocationKey) {
      selectedMarkerByLocationRef.current.set(markerLocationKey, marker.id);
    }

    const markerGroupKey = markerGroupKeyByIdRef.current.get(marker.id)
      || fallbackGroupKey
      || markerLocationKey;

    if (markerGroupKey) {
      selectedMarkerByGroupKeyRef.current.set(markerGroupKey, marker.id);
    }
  }, []);

  return {
    getPopupSeedForReport,
    recordMarkerSelection
  };
};
