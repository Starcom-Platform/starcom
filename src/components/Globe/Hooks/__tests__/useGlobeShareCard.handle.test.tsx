/**
 * The share handle as an agent meets it — mounted, not read off the contract.
 *
 * Until now nothing mounted useGlobeShareCard. The contract test checks what
 * the handle declares; nothing checked what it DOES. So two fixes made on
 * 2026-09-25 in response to Mecha Jono's first real run had no test that
 * would fail without them:
 *
 *  1. A compose during the first seconds after the handle appeared returned a
 *     200×200 placeholder canvas — laid out at 0×0 — as a card with no Earth,
 *     and no error, because the placeholder is not blank.
 *  2. setView did not tell the first-visit turn that the view had been chosen,
 *     so ~15 s after load the globe swung toward the reports' centre and took
 *     the agent's pose with it.
 *
 * Neither could be reproduced live on a fast machine — the timing gap that
 * exposed them on a Jetson never opened — so these are the evidence.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
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
  whenReady: (o?: { timeoutMs?: number }) => Promise<{ ready: boolean }>;
  compose: (o?: object) => Promise<unknown>;
  setView: (p: object, o?: object) => Promise<unknown>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
});

describe('the placeholder canvas is not the globe', () => {
  it('whenReady does not report ready while the canvas has no layout box', async () => {
    const globeRef = fakeGlobe({ w: 0, h: 0 });
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));

    const r = await handle().whenReady({ timeoutMs: 300 });

    expect(r.ready).toBe(false);
  });

  it('compose refuses rather than returning a card of the placeholder', async () => {
    const globeRef = fakeGlobe({ w: 0, h: 0 });
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));

    await expect(handle().compose({ preset: 'wide' })).rejects.toThrow(/not finished initialising/);
  });
});

describe('a laid-out globe is ready', () => {
  it('whenReady reports ready once the canvas is on screen', async () => {
    // The control for the placeholder test: same fake, laid out. If this fails,
    // the placeholder test above is passing for some other reason.
    const globeRef = fakeGlobe({ w: 1280, h: 608 });
    renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));

    const r = await handle().whenReady({ timeoutMs: 300 });

    expect(r.ready).toBe(true);
  });
});

describe('an agent choosing the view', () => {
  it('setView reports that the view was chosen', async () => {
    const globeRef = fakeGlobe({ w: 1280, h: 608 });
    const onViewChosen = vi.fn();
    renderHook(() => useGlobeShareCard({
      globeRef: globeRef as never, feeds: [], marks: null, onViewChosen,
    }));

    await act(async () => { await handle().setView({ lat: -33.9, lng: 151.2 }, { transitionMs: 0 }); });

    expect(onViewChosen).toHaveBeenCalled();
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
