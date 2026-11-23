import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { CountrySelectionProvider, useCountrySelection } from './CountrySelectionContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CountrySelectionProvider>{children}</CountrySelectionProvider>
);

describe('CountrySelectionContext', () => {
  it('defaults to no selected country', () => {
    const { result } = renderHook(() => useCountrySelection(), { wrapper });
    expect(result.current.selectedCountry).toBeNull();
  });

  it('selectCountry sets the selected country', () => {
    const { result } = renderHook(() => useCountrySelection(), { wrapper });

    act(() => {
      result.current.selectCountry({ countryCode: 'USA', name: 'United States' });
    });

    expect(result.current.selectedCountry).toEqual({ countryCode: 'USA', name: 'United States' });
  });

  it('selectCountry(null) clears the selection', () => {
    const { result } = renderHook(() => useCountrySelection(), { wrapper });

    act(() => {
      result.current.selectCountry({ countryCode: 'USA', name: 'United States' });
    });
    act(() => {
      result.current.selectCountry(null);
    });

    expect(result.current.selectedCountry).toBeNull();
  });

  it('a later selectCountry call replaces the previous selection', () => {
    const { result } = renderHook(() => useCountrySelection(), { wrapper });

    act(() => {
      result.current.selectCountry({ countryCode: 'USA', name: 'United States' });
    });
    act(() => {
      result.current.selectCountry({ countryCode: 'CAN', name: 'Canada' });
    });

    expect(result.current.selectedCountry).toEqual({ countryCode: 'CAN', name: 'Canada' });
  });

  it('throws when used outside a CountrySelectionProvider', () => {
    const { result } = renderHook(() => {
      try {
        return useCountrySelection();
      } catch (e) {
        return e as Error;
      }
    });
    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toMatch(/must be used within a CountrySelectionProvider/);
  });
});
