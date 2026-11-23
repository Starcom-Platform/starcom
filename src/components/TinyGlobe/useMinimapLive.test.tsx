/**
 * When the minimap may draw (plan item 8.3, block B4; decided 2026-10-01).
 *
 * The minimap is a second globe, with a WebGL context of its own that costs as
 * much as the main one's: 2.6–7 s of frozen page on a machine that draws in
 * software, landing just as the main globe was revealed. It now draws only
 * once the main globe is up, the quality governor has settled at full detail,
 * and the browser is idle; it is given up if the governor steps down later.
 * On a device the governor steps down it is drawn flat, on a 2D canvas, with no
 * WebGL context (decision D-MG, MG1), once the browser is idle: it was a still
 * image there for good, which the owner read as dead.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { GlobeLoadingProvider, useGlobeLoading } from '../../context/GlobeLoadingContext';
import { resetGlobeQualityForTests, setGlobeQualitySetting } from '../../services/globe/globeQuality';
import { useMinimapLive } from './useMinimapLive';

const wrapper = ({ children }: { children: React.ReactNode }) => <GlobeLoadingProvider>{children}</GlobeLoadingProvider>;
const mount = () => renderHook(() => ({ minimap: useMinimapLive(), loading: useGlobeLoading() }), { wrapper });

describe('useMinimapLive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGlobeQualityForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetGlobeQualityForTests();
  });

  it('stays still until the main globe is up', () => {
    setGlobeQualitySetting('high');
    const { result } = mount();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.minimap.live).toBe(false);
    expect(result.current.minimap.why).toMatch(/once the globe has loaded/);
  });

  it('draws when the browser is idle after the globe is up, on a device at full detail', () => {
    setGlobeQualitySetting('high');
    const { result } = mount();
    act(() => { result.current.loading.setGlobeInitialized(true); });
    expect(result.current.minimap.live).toBe(false);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.minimap.live).toBe(true);
  });

  it('waits for auto to settle before drawing', () => {
    const { result } = mount();
    act(() => { result.current.loading.setGlobeInitialized(true); });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.minimap.live).toBe(false);
  });

  it('is drawn flat on a device drawing less, once the browser is idle, never in WebGL', () => {
    setGlobeQualitySetting('low');
    const { result } = mount();
    act(() => { result.current.loading.setGlobeInitialized(true); });
    expect(result.current.minimap.flat).toBe(false);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.minimap.live).toBe(false);
    expect(result.current.minimap.flat).toBe(true);
    expect(result.current.minimap.why).toBe('');
  });

  it('is never flat before the main globe is up, or on a device at full detail', () => {
    setGlobeQualitySetting('low');
    const { result } = mount();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.minimap.flat).toBe(false);
    act(() => { setGlobeQualitySetting('high'); result.current.loading.setGlobeInitialized(true); });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.minimap.flat).toBe(false);
    expect(result.current.minimap.live).toBe(true);
  });

  it('gives WebGL up when quality steps down, and is drawn flat instead', () => {
    setGlobeQualitySetting('high');
    const { result } = mount();
    act(() => { result.current.loading.setGlobeInitialized(true); });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.minimap.live).toBe(true);
    act(() => { setGlobeQualitySetting('low'); });
    expect(result.current.minimap.live).toBe(false);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.minimap.flat).toBe(true);
  });
});
