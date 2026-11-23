/**
 * describeView through the share handle (decision D-F, section 18, item 6),
 * mounted as an agent meets it, over a real camera and scene.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));

/*
 * A capture that always succeeds, so whether whenReady reports ready depends on
 * the layout check and nothing else. Without this the fake globe could not
 * render at all, whenReady never reported ready, and the placeholder test
 * passed with the layout check deleted — found by mutating it.
 */
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => ({ dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' }),
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';

/** A globe whose canvas is laid out at the given on-screen size. */
function fakeGlobe(onScreen: { w: number; h: number }) {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: onScreen.w, clientHeight: onScreen.h };
  return {
    current: {
      renderer: () => ({ domElement: canvas }),
      scene: () => ({}),
      camera: () => ({}),
      getGlobeRadius: () => 100,
      pointOfView: (next?: typeof pov) => { if (next) pov = { ...pov, ...next }; return pov; },
      controls: () => undefined,
    },
  };
}

type Handle = {
  describeView: (o?: object) => { preset: string; layers: Array<{ layer: string; inFrame: number; items: Array<{ label: string }> }>; notCounted: string[] };
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];


/*
 * Every card size is composed since IM27: describing a card's picture measures
 * its text first, on a 2D canvas that jsdom does not have. Roughly a real
 * font's width, as the compose tests measure. Before each test: each ends by
 * restoring every mock.
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) })) as never,
  );
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
});

/** A laid-out globe with a real camera looking at 0,0 and one layer of marks. */
function realGlobe() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1280 / 608, 0.1, 10000);
  camera.position.copy(latLngToGlobeWorld(0, 0, 300));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ...latLngToGlobeWorld(5, 5, 101).toArray(),
    ...latLngToGlobeWorld(0, 180, 101).toArray(),
  ], 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial());
  points.userData = { layer: 'Conflict Zones', tooltips: ['Sudan', 'far side'] };
  scene.add(points);
  const canvas = { isConnected: true, clientWidth: 1280, clientHeight: 608, width: 1280, height: 608 };
  return {
    current: {
      renderer: () => ({ domElement: canvas }),
      scene: () => scene,
      camera: () => camera,
      getGlobeRadius: () => 100,
      pointOfView: () => ({ lat: 0, lng: 0, altitude: 2 }),
      controls: () => undefined,
    },
  };
}

describe('describeView', () => {
  it('counts the marks in the card, by layer, and not the far side', () => {
    renderHook(() => useGlobeShareCard({ globeRef: realGlobe() as never, feeds: [], marks: null }));
    const d = handle().describeView({ preset: 'square' });
    expect(d.preset).toBe('square');
    expect(d.layers).toEqual([expect.objectContaining({ layer: 'Conflict Zones', inFrame: 1 })]);
    expect(d.layers[0].items.map((i) => i.label)).toEqual(['Sudan']);
  });

  it('counts what the card keeps, not everything on the canvas', () => {
    // A satellite far out in orbit, beside the planet: on the canvas, outside
    // the crop a card cuts around the globe.
    const globe = realGlobe();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(latLngToGlobeWorld(0, 90, 175).toArray(), 3));
    const far = new THREE.Points(geometry, new THREE.PointsMaterial());
    far.userData = { layer: 'Satellites', tooltips: ['GEO relay'] };
    globe.current.scene().add(far);
    renderHook(() => useGlobeShareCard({ globeRef: globe as never, feeds: [], marks: null }));

    // A card whose picture is the padded planet's square (Discord's size, IM27): the satellite is beside it.
    const d = handle().describeView({ preset: 'embed' });
    const satellites = d.layers.find((l) => l.layer === 'Satellites');
    expect(satellites?.inFrame ?? 0).toBe(0);
  });

  it('refuses an unknown preset', () => {
    renderHook(() => useGlobeShareCard({ globeRef: realGlobe() as never, feeds: [], marks: null }));
    expect(() => handle().describeView({ preset: 'banner' })).toThrow(/Unknown preset/);
  });
});
