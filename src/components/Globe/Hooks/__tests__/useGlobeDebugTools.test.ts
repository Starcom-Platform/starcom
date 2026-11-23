/**
 * These three hooks are QA/debug tooling with no coverage worth writing in
 * jsdom — none is meaningfully testable without a real canvas, a real Three.js
 * scene, and a real camera, and the actual verification is live: run the app
 * with `?geoSnap=all` or `?geoDebugOverlay=markers` and confirm the tool does
 * what its name says (see the plan this extraction came from).
 *
 * What IS worth a fast, cheap test: that the one thing standing between these
 * and production — the NODE_ENV gate — actually gates. Losing that during an
 * extraction is the easy mistake to make and the expensive one to ship.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import * as THREE from 'three';
import { useGlobeDebugApi, useGlobeSnapshotTool, useGlobeDebugMarkers } from '../useGlobeDebugTools';

const realEnv = process.env.NODE_ENV;
const setEnv = (v: string) => { (process.env as Record<string, string>).NODE_ENV = v; };

afterEach(() => { setEnv(realEnv ?? 'test'); delete (window as unknown as { __globeDebugApi?: unknown }).__globeDebugApi; });

describe('useGlobeDebugApi', () => {
  it('does nothing outside development', () => {
    setEnv('production');
    renderHook(() => useGlobeDebugApi(createRef(), createRef()));
    expect((window as unknown as { __globeDebugApi?: unknown }).__globeDebugApi).toBeUndefined();
  });

  it('exposes window.__globeDebugApi in development', () => {
    setEnv('development');
    renderHook(() => useGlobeDebugApi(createRef(), createRef()));
    const api = (window as unknown as { __globeDebugApi?: Record<string, unknown> }).__globeDebugApi;
    expect(api).toBeDefined();
    expect(typeof api?.projectLatLngToScreen).toBe('function');
    expect(typeof api?.setAltitude).toBe('function');
    expect(typeof api?.pointOfViewTo).toBe('function');
  });
});

describe('useGlobeSnapshotTool', () => {
  it('does nothing outside development, even with ?geoSnap set', () => {
    setEnv('production');
    const update = vi.fn();
    const globeRef = { current: {} };
    const containerRef = { current: document.createElement('div') };
    const snapDoneRef = { current: false };
    renderHook(() => useGlobeSnapshotTool(globeRef, containerRef, snapDoneRef, update, undefined));
    expect(snapDoneRef.current).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('does nothing in development without a ?geoSnap param', () => {
    setEnv('development');
    const update = vi.fn();
    const globeRef = { current: {} };
    const containerRef = { current: document.createElement('div') };
    const snapDoneRef = { current: false };
    renderHook(() => useGlobeSnapshotTool(globeRef, containerRef, snapDoneRef, update, undefined));
    expect(snapDoneRef.current).toBe(false);
  });
});

describe('useGlobeDebugMarkers', () => {
  it('does nothing outside development', () => {
    setEnv('production');
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } };
    const markerGroupRef = { current: new THREE.Group() };
    renderHook(() => useGlobeDebugMarkers(globeRef, false, markerGroupRef));
    expect(scene.children.includes(markerGroupRef.current)).toBe(false);
  });

  it('adds the origin marker group to the scene in development', () => {
    setEnv('development');
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } };
    const markerGroupRef = { current: new THREE.Group() };
    renderHook(() => useGlobeDebugMarkers(globeRef, false, markerGroupRef));
    expect(scene.children.includes(markerGroupRef.current)).toBe(true);
    // One marker (sphere + short line) at minimum for the always-on origin marker.
    expect(markerGroupRef.current.children.length).toBeGreaterThanOrEqual(2);
  });

  it('removes the marker group from the scene on unmount', () => {
    setEnv('development');
    const scene = new THREE.Scene();
    const globeRef = { current: { scene: () => scene } };
    const markerGroupRef = { current: new THREE.Group() };
    const { unmount } = renderHook(() => useGlobeDebugMarkers(globeRef, false, markerGroupRef));
    expect(scene.children.includes(markerGroupRef.current)).toBe(true);
    unmount();
    expect(scene.children.includes(markerGroupRef.current)).toBe(false);
  });
});
