// useCountryInfoOverlay.ts — bridges useNationalTerritories3D's onHoverChange/
// onSelectChange callbacks into the 2D UI layer: a cursor-following tooltip
// on hover, and a click-to-open detail popup via the existing PopupManager
// (the same usePopup()/showPopup() system Enhanced3DGlobeInteractivity.tsx
// already uses for IntelReports — see IntelReportPopupPortal's showPopup call
// for the precedent this mirrors).
//
// Mouse position is tracked independently of useNationalTerritories3D's own
// internal raycasting — the hook only reports WHAT is hovered/selected, not
// WHERE the cursor is on screen; this hook owns that separately (the same
// split Enhanced3DGlobeInteractivity.tsx uses: unifiedInteractionState.mousePosition
// vs. the model-hover state), since positioning is a 2D UI concern, not a
// 3D-scene one.
//
// Selection (unlike hover) is routed through CountrySelectionContext rather
// than opening the popup directly inside onSelectChange — GlobalHeader's
// country search results write into that same context (see GlobalHeader.tsx),
// so a country selected via search opens this exact popup too, not just
// flying the camera. The popup-open/close effect below reacts to
// selectedCountry regardless of which of the two entry points changed it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { usePopup } from '../../components/Popup/PopupManager';
import { useCountrySelection } from '../../context/CountrySelectionContext';
import { useCountryPanelTaken } from '../../context/countryPanel';
import { CountryInfoPopup } from '../../components/ui/CountryInfoPopup/CountryInfoPopup';
import type { CountryHoverInfo } from './useNationalTerritories3D';

export interface UseCountryInfoOverlayResult {
  onHoverChange: (info: CountryHoverInfo | null) => void;
  onSelectChange: (info: CountryHoverInfo | null) => void;
  tooltip: {
    info: CountryHoverInfo | null;
    position: { x: number; y: number };
    visible: boolean;
  };
}

/** What the globe draws, for the popup's sections (Globe.tsx: the sub-mode, a pin or the overlay). */
export interface CountryInfoLayersOn {
  resourceZonesOn?: boolean;
  diplomaticEventsOn?: boolean;
}

export function useCountryInfoOverlay(layersOn: CountryInfoLayersOn = {}): UseCountryInfoOverlayResult {
  const { showPopup, hidePopup, activePopups } = usePopup();
  const { selectedCountry, selectCountry } = useCountrySelection();
  // While a layer has taken the selected country (Diplomacy, D-DP DP16), its panel shows it, not this popup.
  const taken = useCountryPanelTaken();
  const [hoveredCountry, setHoveredCountry] = useState<CountryHoverInfo | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const activePopupIdRef = useRef<string | null>(null);
  // PopupManager.hidePopup always invokes the popup's own onClose, with no
  // way to tell "the user dismissed this" apart from "this hook is closing
  // it to replace it with a new selection's popup." Without this guard,
  // replacing USA's popup with Canada's would call USA's onClose mid-replace
  // — which calls selectCountry(null) — clobbering the {CAN} selection that
  // triggered the replace in the first place, right back to null.
  const isReplacingRef = useRef(false);

  // PopupManager's showPopup is deliberately recreated on every popups.size
  // change (it captures the current size for z-index stacking) — it is NOT
  // reference-stable the way hidePopup is. Reading both through a ref instead
  // of the effect's own dependency array means the open/close effect below
  // reacts only to an actual selectedCountry change, not to showPopup's
  // identity changing every time ANY popup anywhere opens/closes. Without
  // this, opening this popup itself changes popups.size, which produces a
  // new showPopup reference, which would re-trigger the effect and cause it
  // to immediately close-then-reopen the popup it just opened.
  const popupActionsRef = useRef({ showPopup, hidePopup });
  // Read at open, as the popup actions are: a layer turning on or off does not reopen the popup.
  const layersOnRef = useRef(layersOn);
  useEffect(() => {
    popupActionsRef.current = { showPopup, hidePopup };
    layersOnRef.current = layersOn;
  });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  const onHoverChange = useCallback((info: CountryHoverInfo | null) => {
    setHoveredCountry(info);
  }, []);

  // A 3D click/select just writes into the shared context — it no longer
  // opens the popup directly (see the effect below).
  const onSelectChange = useCallback((info: CountryHoverInfo | null) => {
    selectCountry(info);
  }, [selectCountry]);

  // Opens/closes the popup in response to selectedCountry, whether it
  // changed via a 3D click (onSelectChange above) or a GlobalHeader search
  // result (selectCountry called directly there). Deliberately depends only
  // on selectedCountry/selectCountry (both real signals of a selection
  // change) — see popupActionsRef above for why showPopup/hidePopup aren't
  // in this list.
  useEffect(() => {
    const { showPopup: show, hidePopup: hide } = popupActionsRef.current;
    if (activePopupIdRef.current) {
      isReplacingRef.current = true;
      hide(activePopupIdRef.current);
      isReplacingRef.current = false;
      activePopupIdRef.current = null;
    }
    if (selectedCountry && !taken) {
      activePopupIdRef.current = show({
        component: CountryInfoPopup as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
        props: { countryCode: selectedCountry.countryCode, name: selectedCountry.name, ...layersOnRef.current },
        // PopupFrame is the dialog, so it is the thing that needs the name.
        // It was passed none, so the only labelled dialogs were the two
        // redundant ones nested inside it — the outermost, which a screen
        // reader announces on entry, was anonymous.
        label: `${selectedCountry.name || selectedCountry.countryCode} details`,
        backdrop: true,
        zIndex: 4000,
        onClose: () => {
          activePopupIdRef.current = null;
          // Keep the shared selection in sync when the user closes via the
          // popup's own X button / backdrop click / Escape (PopupManager's
          // own close handling) — but NOT when this effect itself triggered
          // the close to replace this popup with a different selection's
          // (see isReplacingRef above).
          //
          // Deferred via queueMicrotask: PopupManager.hidePopup calls this
          // onClose from INSIDE its own setPopups updater function
          // (PopupManager.tsx), and calling a different component's setState
          // (CountrySelectionProvider's) synchronously from within another
          // component's state updater is exactly what React's "Cannot update
          // a component while rendering a different component" warning
          // flags. Deferring one microtask sidesteps that without needing to
          // touch PopupManager.tsx, a shared component well outside this
          // change's scope.
          if (!isReplacingRef.current) {
            queueMicrotask(() => selectCountry(null));
          }
        }
      });
    }
  }, [selectedCountry, selectCountry, taken]);

  // If this overlay unmounts (e.g. Globe.tsx tears down) while a popup from
  // it is still open, close that popup rather than leaving it orphaned.
  useEffect(() => {
    return () => {
      if (activePopupIdRef.current) popupActionsRef.current.hidePopup(activePopupIdRef.current);
    };
  }, []);

  return {
    onHoverChange,
    onSelectChange,
    tooltip: {
      info: hoveredCountry,
      position: mousePosition,
      // Not over an open popup: a report's, opened by a click on its mark, or the country's own (critique C7).
      visible: hoveredCountry !== null && (activePopups?.length ?? 0) === 0
    }
  };
}
