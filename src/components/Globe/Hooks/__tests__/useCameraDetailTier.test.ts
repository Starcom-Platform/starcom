import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { pickDetailTier, useCameraDetailTier, DEFAULT_DETAIL_TIER_THRESHOLDS } from '../useCameraDetailTier';
import { globeCameraTelemetry } from '../../../../services/globe/GlobeCameraTelemetry';

describe('pickDetailTier', () => {
  const thresholds = { highMax: 1.5, mediumMax: 5 };

  it('picks tier 2 (full detail) well below highMax', () => {
    expect(pickDetailTier(0.5, thresholds, null)).toBe(2);
  });

  it('picks tier 1 (reduced) between highMax and mediumMax', () => {
    expect(pickDetailTier(3, thresholds, null)).toBe(1);
  });

  it('picks tier 0 (minimal) at or above mediumMax', () => {
    expect(pickDetailTier(50, thresholds, null)).toBe(0);
  });

  it('applies hysteresis: stays at tier 2 just past highMax rather than immediately dropping to tier 1', () => {
    // highMax=1.5, margin=1.5*0.15=0.225 -> stays tier 2 up to 1.725
    expect(pickDetailTier(1.6, thresholds, 2)).toBe(2);
    expect(pickDetailTier(1.8, thresholds, 2)).toBe(1);
  });

  it('applies hysteresis: stays at tier 1 just below highMax rather than immediately climbing to tier 2', () => {
    expect(pickDetailTier(1.4, thresholds, 1)).toBe(1);
    expect(pickDetailTier(1.2, thresholds, 1)).toBe(2);
  });

  it('applies hysteresis: stays at tier 0 just below mediumMax rather than immediately climbing to tier 1', () => {
    // mediumMax=5, margin=5*0.15=0.75 -> stays tier 0 down to 4.25
    expect(pickDetailTier(4.5, thresholds, 0)).toBe(0);
    expect(pickDetailTier(4, thresholds, 0)).toBe(1);
  });

  it('with no current tier (first decision), uses the plain boundaries with no hysteresis', () => {
    expect(pickDetailTier(1.5, thresholds, null)).toBe(1); // exactly at highMax
    expect(pickDetailTier(5, thresholds, null)).toBe(0); // exactly at mediumMax
  });
});

describe('useCameraDetailTier', () => {
  // globeCameraTelemetry is a real module-level singleton shared across the whole
  // test process — publish a known value before each test rather than relying on
  // whatever a previous test (in this file or another) last left behind.
  beforeEach(() => {
    globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: DEFAULT_DETAIL_TIER_THRESHOLDS.highMax + 1 });
  });

  it('reflects the current real telemetry altitude on mount', () => {
    globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 0.6 });
    const { result } = renderHook(() => useCameraDetailTier());
    expect(result.current).toBe(2);
  });

  it('updates when a real new camera altitude is published', () => {
    globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 0.6 });
    const { result } = renderHook(() => useCameraDetailTier());
    expect(result.current).toBe(2);

    act(() => {
      globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 50 });
    });
    expect(result.current).toBe(0);
  });

  it('does not update when disabled, even if the real camera telemetry changes', () => {
    globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 0.6 });
    const { result } = renderHook(() => useCameraDetailTier(DEFAULT_DETAIL_TIER_THRESHOLDS, false));
    expect(result.current).toBe(2);

    act(() => {
      globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 50 });
    });
    expect(result.current).toBe(2);
  });
});
