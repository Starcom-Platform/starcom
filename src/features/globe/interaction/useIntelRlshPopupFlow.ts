/**
 * What a click on the globe opens (ADR-0002's popup flow, moved out of Enhanced3DGlobeInteractivity whole): a
 * report's popup, the menu at the click (K8) for a place or an outlined territory (BA9), or an RLSH marker's own
 * popup; and closing them when the globe stops listening for clicks.
 */
import { onIntelPopupRequest } from './intelPopupRequests';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { markerKind } from '../../../interfaces/IntelReportOverlay';
import type { RLSHOverlayMarker } from '../../../interfaces/RLSHOverlay';
import { usePopup } from '../../../components/Popup/PopupManager';
import { IntelReportPopupPortal } from '../../../components/ui/IntelReportPopup/IntelReportPopupPortal';
import { RLSHPopupPortal } from '../../../components/ui/RLSHPopup/RLSHPopupPortal';
import { reportsAtPlace } from '../../../components/Globe/reportPlaces';
import { placeGroupOf, whatAClickOpens, type ClickOpens, type ReportGroup } from '../../../components/Globe/placeMenu';
import { countryAt, type YieldedCountry } from '../../../components/Globe/globeClick';
import { markGlobeEngaged } from '../../../components/Globe/globeEngagement';
import { rlshTelemetryService } from '../../../services/RLSHTelemetryService';
import type { useRLSHSelectionMemory } from '../rlsh/useSelectionMemory';
import type { InteractiveIntelMark } from './interactionState';

export interface GroupMenuState {
  at: { x: number; y: number };
  groups: ReportGroup[];
  country?: YieldedCountry | null;
}

interface UseIntelRlshPopupFlowOptions {
  hasInteractiveMarkers: boolean;
  listensForClicks: boolean;
  clickedModel: InteractiveIntelMark | null;
  clickedGlobeAt: { lat: number; lng: number } | null;
  clearClickedState: () => void;
  /** The click on the globe has been answered. */
  consumeGlobeClick: () => void;
  onHoverChange?: (reportId: string | null) => void;
  intelReportsRef: React.MutableRefObject<IntelReportOverlayMarker[]>;
  territoryGroupsAtRef: React.MutableRefObject<((lat: number, lng: number) => ReportGroup[]) | null>;
  clickPointRef: React.MutableRefObject<{ x: number; y: number }>;
  rlshSelectionMemory: ReturnType<typeof useRLSHSelectionMemory<InteractiveIntelMark>>;
  modelCount: number;
  hideTooltip: () => void;
  hideTerritoryHover: () => void;
}

export function useIntelRlshPopupFlow({
  hasInteractiveMarkers,
  listensForClicks,
  clickedModel,
  clickedGlobeAt,
  clearClickedState,
  consumeGlobeClick,
  onHoverChange,
  intelReportsRef,
  territoryGroupsAtRef,
  clickPointRef,
  rlshSelectionMemory,
  modelCount,
  hideTooltip,
  hideTerritoryHover,
}: UseIntelRlshPopupFlowOptions) {
  const { showPopup, hidePopup } = usePopup();
  const { getPopupSeedForReport, recordMarkerSelection } = rlshSelectionMemory;
  const intelPopupIdRef = useRef<string | null>(null);
  const lastPopupReportRef = useRef<string | null>(null);
  /** The menu at the click (K8), and what it lists. */
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
  const groupMenuRef = useRef(groupMenu);
  groupMenuRef.current = groupMenu;

  const teardownIntelPopupState = useCallback(() => {
    intelPopupIdRef.current = null;
    lastPopupReportRef.current = null;
    clearClickedState();
    onHoverChange?.(null);
  }, [clearClickedState, onHoverChange]);

  const closeIntelPopup = useCallback(() => {
    if (intelPopupIdRef.current) {
      hidePopup(intelPopupIdRef.current);
    } else {
      teardownIntelPopupState();
    }
  }, [hidePopup, teardownIntelPopupState]);

  /**
   * The report popup on these reports, from this one. Given the way back to a
   * place's menu, the reports are that place's alone and it pages through them
   * (K8, BA8): it used to page on past a place into every report on the globe.
   */
  const openIntelPopup = useCallback((reports: IntelReportOverlayMarker[], initial: string, backToPlace?: () => void): string => {
    const popupId = showPopup({
      component: IntelReportPopupPortal as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
      // The frame is the dialog and needs the name; the report title is
      // not known until it loads, so this is static and true throughout.
      label: 'Intel report',
      props: {
        reports,
        initialPubkey: initial,
        ...(backToPlace ? { onBackToPlace: backToPlace } : {}),
        onCloseComplete: () => {
          teardownIntelPopupState();
        },
        onReportChange: (report: IntelReportOverlayMarker | null) => {
          const reportId = report?.pubkey || null;
          lastPopupReportRef.current = reportId;
          onHoverChange?.(reportId);
        }
      },
      backdrop: true,
      onClose: () => {
        teardownIntelPopupState();
        // A report the person opened and closed is the globe used: the support ask
        // may follow it, and never lands on top of it (decision D-F, step 3).
        markGlobeEngaged();
      },
      zIndex: 4000
    });
    intelPopupIdRef.current = popupId;
    lastPopupReportRef.current = initial;
    return popupId;
  }, [showPopup, teardownIntelPopupState, onHoverChange]);

  // A report asked for from a list (Psi Watch's Intel in a window, PW89): opened as a click on its mark opens it.
  useEffect(() => onIntelPopupRequest((id) => {
    const marker = intelReportsRef.current.find((m) => m.pubkey === id);
    if (!marker) return false;
    if (intelPopupIdRef.current) hidePopup(intelPopupIdRef.current);
    openIntelPopup([marker], id);
    return true;
  }), [intelReportsRef, openIntelPopup, hidePopup]);

  /** What a click opens (placeMenu.ts): the report itself, or the menu at the click (K8), offering the country there last (BA20). */
  const openWhatAClickOpens = useCallback((opens: ClickOpens, at: { x: number; y: number }, country: YieldedCountry | null = null) => {
    if (opens.kind === 'nothing') return;
    if (intelPopupIdRef.current) hidePopup(intelPopupIdRef.current);
    hideTooltip();
    hideTerritoryHover();
    if (opens.kind === 'report') openIntelPopup(opens.reports, opens.initial);
    else setGroupMenu({ at, groups: opens.groups, country });
  }, [hidePopup, openIntelPopup, hideTooltip, hideTerritoryHover]);

  /** A report picked from the menu: opened paging through its group, with the way back to the menu (BA8). */
  const pickFromMenu = useCallback((key: string, id: string) => {
    const menu = groupMenuRef.current;
    const group = menu?.groups.find((g) => g.key === key);
    setGroupMenu(null);
    if (!menu || !group) return;
    openIntelPopup(group.members, id, () => setGroupMenu(menu));
  }, [openIntelPopup]);

  // A click on the globe that hit no mark: the reports about the outlined territories there (BA9).
  useEffect(() => {
    const at = clickedGlobeAt;
    if (!at) return;
    consumeGlobeClick();
    const groups = territoryGroupsAtRef.current?.(at.lat, at.lng) ?? [];
    // The click was taken from the country under it, whose panel the menu offers instead (BA20).
    const country = groups.length ? countryAt(clickPointRef.current) : null;
    openWhatAClickOpens(whatAClickOpens(groups, { country: country !== null }), clickPointRef.current, country);
  }, [clickedGlobeAt, consumeGlobeClick, territoryGroupsAtRef, clickPointRef, openWhatAClickOpens]);

  // Update popup visibility based on clicked state using top-level popup manager
  useEffect(() => {
    if (!hasInteractiveMarkers) {
      return;
    }

    const clickedReport = clickedModel?.report;
    if (!clickedReport) {
      return;
    }

    if (intelPopupIdRef.current && lastPopupReportRef.current === clickedReport.pubkey) {
      clearClickedState();
      return;
    }

    if (intelPopupIdRef.current) {
      hidePopup(intelPopupIdRef.current);
    }

    /**
     * Which popup this MARKER gets, asked of the marker.
     *
     * This read `isRLSHMode` — global mode state — while holding
     * `clickedReport`, the very object whose kind was in question. That is only
     * correct while RLSH is the PRIMARY mode, so a pinned RLSH marker got the
     * intel popup: right click, wrong panel.
     */
    const clickedKind = markerKind(clickedReport);
    /*
     * A place drawn as one glyph with a count opens a menu of its reports at the
     * click (K8); a report alone opens, as it always did.
     */
    if (clickedKind !== 'rlsh') {
      openWhatAClickOpens(whatAClickOpens([placeGroupOf(reportsAtPlace(intelReportsRef.current, clickedReport))]), clickPointRef.current);
      clearClickedState();
      return;
    }
    // An RLSH marker: its own popup, as before. Its half of K8 is plan block G.
    // Per docs/architecture/RLSH_IDENTITY_NAVIGATION_POLICY.md: reopening a group
    // (same location/groupId) should resume on whichever marker in that group was
    // last viewed, not always reset to the one physically clicked.
    const rlshSeed = getPopupSeedForReport(clickedReport);
    const popupId = showPopup({
      component: RLSHPopupPortal as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
      // PopupFrame is the dialog and needs the accessible name. Static,
      // because the marker is fetched inside the popup — a name has to be
      // true during the loading branch too.
      label: 'RLSH marker detail',
      props: {
        initialMarkerId: rlshSeed.initialPopupMarkerId,
        initialGroupId: rlshSeed.clickedGroupKey,
        onCloseComplete: () => {
          teardownIntelPopupState();
        },
        onMarkerChange: (marker: RLSHOverlayMarker | null) => {
          const markerId = marker?.id || null;
          lastPopupReportRef.current = markerId;
          onHoverChange?.(markerId);
          if (marker) {
            recordMarkerSelection(marker, rlshSeed.clickedGroupKey, rlshSeed.clickedLocationKey);
          }
        }
      },
      backdrop: true,
      onClose: () => {
        teardownIntelPopupState();
        // A marker the person opened and closed is the globe used (decision D-F, step 3).
        markGlobeEngaged();
      },
      zIndex: 4000
    });

    intelPopupIdRef.current = popupId;
    lastPopupReportRef.current = clickedReport.pubkey;
    hideTooltip();
    clearClickedState();

    // Only an RLSH marker reaches here: the kind came from the clicked marker,
    // never from the mode, so the event names the popup that opened.
    rlshTelemetryService.emit('rlsh_popup_open', {
      markerCount: modelCount,
      result: 'success'
    });
  }, [
    hasInteractiveMarkers,
    // isRLSHMode removed: the kind now comes from the clicked marker, so mode
    // is not an input to this callback. Leaving it here re-created the handler
    // on every mode change for no reason.
    clickedModel,
    showPopup,
    hidePopup,
    teardownIntelPopupState,
    clearClickedState,
    onHoverChange,
    modelCount,
    getPopupSeedForReport,
    recordMarkerSelection,
    openWhatAClickOpens,
    intelReportsRef,
    clickPointRef,
    hideTooltip,
  ]);

  // Close popup, and the menu at the click, when leaving Intel Reports mode or unmounting
  useEffect(() => {
    if (!listensForClicks) {
      closeIntelPopup();
      setGroupMenu(null);
    }

    return () => {
      closeIntelPopup();
    };
  }, [listensForClicks, closeIntelPopup]);

  return { groupMenu, setGroupMenu, pickFromMenu };
}
