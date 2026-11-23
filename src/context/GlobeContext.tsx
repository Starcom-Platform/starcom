// src/context/GlobeContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { playSfx } from '../services/audio/sfxLibrary';

export interface GlobeFocusPoint {
  lat: number;
  lng: number;
  /** How far out to look from, in globe radii: an area found in the search asks its own (BA24). */
  altitude?: number;
}

/**
 * What the globe is showing in place of every report: a Case or a Mission by
 * id, with its linked reports; a package another node published, with the
 * reports it cites; or what one key published (plan item 9.14, decision G6).
 * A package carries what the globe needs of it, since received packages are
 * read on the Missions screen and nowhere else.
 */
export type ShownOnGlobe =
  | { kind: 'case' | 'mission'; id: string }
  | { kind: 'package'; id: string; signer: string; name: string; cites: string[] }
  | { kind: 'publisher'; id: string };

interface GlobeContextType {
  /**
   * The last place the app was asked to look at. This is durable state, read
   * by several widgets that want to know where attention currently is
   * (TinyGlobe's inset view, FloatingPanelManager's clickedPosition,
   * ContextBridge's collaboration sync). It is deliberately NOT cleared after
   * the camera moves — those consumers want the current focus, not an event.
   */
  focusLocation: GlobeFocusPoint | null;
  setFocusLocation: (location: GlobeFocusPoint | null) => void;
  /**
   * The pending camera-fly REQUEST, which is a different thing from the focus
   * above: it is an event, consumed exactly once by whoever performs the move.
   *
   * The distinction is load-bearing. The main Globe unmounts on every app
   * switch (ApplicationRenderer swaps the tree) while this provider lives at
   * app level, so an effect keyed on `focusLocation` alone re-fires on every
   * remount and re-flies the camera to a target the operator asked about once,
   * ten minutes and three screens ago — forever, since nothing ever set it
   * back to null. Consuming the request fixes that without taking the focus
   * value away from the widgets that legitimately still want to read it.
   */
  focusRequest: GlobeFocusPoint | null;
  consumeFocusRequest: () => void;
  /**
   * The Case or Mission the globe is showing instead of every report, or null.
   *
   * Only which record: the globe reads it and its linked records from the live
   * stores (useShownRecord), so what it draws cannot go stale behind the click
   * that asked for it. Durable like focusLocation, because the globe unmounts
   * on every app switch; it stays until someone clears it.
   */
  shownOnGlobe: ShownOnGlobe | null;
  showRecordOnGlobe: (target: ShownOnGlobe) => void;
  clearShownOnGlobe: () => void;
}

const GlobeContext = createContext<GlobeContextType | undefined>(undefined);

export const GlobeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [focusLocation, setFocusLocationState] = useState<GlobeFocusPoint | null>(null);
  const [focusRequest, setFocusRequest] = useState<GlobeFocusPoint | null>(null);
  const [shownOnGlobe, setShownOnGlobe] = useState<ShownOnGlobe | null>(null);

  const setFocusLocation = useCallback((location: GlobeFocusPoint | null) => {
    setFocusLocationState(location);
    // Asking for the same coordinates twice is still two requests — a repeated
    // "View on Globe" on the same report should re-centre a camera the
    // operator has since dragged away.
    setFocusRequest(location);
    // A place pointed out pings, from whichever screen or teammate asked
    // (Target Ping Double, the operator's pick for a spot on the globe).
    if (location) playSfx('spot');
  }, []);

  const consumeFocusRequest = useCallback(() => setFocusRequest(null), []);
  const showRecordOnGlobe = useCallback((target: ShownOnGlobe) => setShownOnGlobe(target), []);
  const clearShownOnGlobe = useCallback(() => setShownOnGlobe(null), []);

  return (
    <GlobeContext.Provider
      value={{ focusLocation, setFocusLocation, focusRequest, consumeFocusRequest, shownOnGlobe, showRecordOnGlobe, clearShownOnGlobe }}
    >
      {children}
    </GlobeContext.Provider>
  );
};

export const useGlobeContext = () => {
  const context = useContext(GlobeContext);
  if (!context) throw new Error('useGlobeContext must be used within a GlobeProvider');
  return context;
};
