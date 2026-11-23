// CountrySelectionContext.tsx — the shared "which country is currently
// selected" primitive that unifies the two previously-independent ways to
// select a country: clicking/selecting one on the 3D globe
// (useNationalTerritories3D's onSelectChange, wired through
// useCountryInfoOverlay.ts) and picking one from GlobalHeader's search bar.
// Before this, clicking a search result only moved the camera
// (GlobeContext.setFocusLocation) — it never opened the Piece 2 info popup,
// even though the two features read as connected to a user. Mirrors
// GlobeContext.tsx's simple shape exactly (ephemeral, session-only state, no
// localStorage persistence — selection isn't a "setting").
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type { CountryHoverInfo } from '../geopolitical/hooks/useNationalTerritories3D';
import { playSfx } from '../services/audio/sfxLibrary';

export type CountrySelectionInfo = CountryHoverInfo;

interface CountrySelectionContextType {
  selectedCountry: CountrySelectionInfo | null;
  selectCountry: (info: CountrySelectionInfo | null) => void;
}

const CountrySelectionContext = createContext<CountrySelectionContextType | undefined>(undefined);

export const CountrySelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedCountry, setSelectedCountry] = useState<CountrySelectionInfo | null>(null);

  const selectCountry = useCallback((info: CountrySelectionInfo | null) => {
    setSelectedCountry(info);
    // A country picked is a target marked (Designate). Its panel opens a frame
    // later, and the mark is what plays (sfxLibrary.ts).
    if (info) playSfx('designate');
  }, []);

  return (
    <CountrySelectionContext.Provider value={{ selectedCountry, selectCountry }}>
      {children}
    </CountrySelectionContext.Provider>
  );
};

/**
 * The shared selection. `{ optional: true }` gives null outside a CountrySelectionProvider rather than
 * throwing: for a layer hook a test may render bare (Diplomacy, D-DP DP16).
 */
export function useCountrySelection(): CountrySelectionContextType;
export function useCountrySelection(options: { optional: true }): CountrySelectionContextType | null;
export function useCountrySelection(options?: { optional?: boolean }): CountrySelectionContextType | null {
  const context = useContext(CountrySelectionContext);
  if (!context && !options?.optional) throw new Error('useCountrySelection must be used within a CountrySelectionProvider');
  return context ?? null;
}
