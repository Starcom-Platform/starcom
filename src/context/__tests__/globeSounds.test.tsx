/**
 * The Globe's two sounds: a place pointed out pings (Target Ping Double), and a
 * country picked is a target marked (Designate). Clearing either is silent.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../services/audio/sfxLibrary', () => ({ playSfx }));

import { GlobeProvider, useGlobeContext } from '../GlobeContext';
import { CountrySelectionProvider, useCountrySelection } from '../CountrySelectionContext';
import type { CountrySelectionInfo } from '../CountrySelectionContext';

const Focus: React.FC<{ at: { lat: number; lng: number } | null }> = ({ at }) => {
  const { setFocusLocation } = useGlobeContext();
  useEffect(() => { setFocusLocation(at); }, [at, setFocusLocation]);
  return null;
};

const Pick: React.FC<{ country: CountrySelectionInfo | null }> = ({ country }) => {
  const { selectCountry } = useCountrySelection();
  useEffect(() => { selectCountry(country); }, [country, selectCountry]);
  return null;
};

describe('the Globe sounds', () => {
  beforeEach(() => { playSfx.mockReset(); });

  it('pings when a place is pointed out, and is silent when the focus is cleared', () => {
    const { rerender } = render(<GlobeProvider><Focus at={{ lat: 48.85, lng: 2.35 }} /></GlobeProvider>);
    expect(playSfx.mock.calls).toEqual([['spot']]);
    rerender(<GlobeProvider><Focus at={null} /></GlobeProvider>);
    expect(playSfx.mock.calls).toEqual([['spot']]);
  });

  it('marks a country picked, and is silent when the pick is cleared', () => {
    const country = { countryCode: 'FR', name: 'France' } as CountrySelectionInfo;
    const { rerender } = render(<CountrySelectionProvider><Pick country={country} /></CountrySelectionProvider>);
    expect(playSfx.mock.calls).toEqual([['designate']]);
    rerender(<CountrySelectionProvider><Pick country={null} /></CountrySelectionProvider>);
    expect(playSfx.mock.calls).toEqual([['designate']]);
  });
});
