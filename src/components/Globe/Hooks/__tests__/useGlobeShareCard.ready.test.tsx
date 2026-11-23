/**
 * The Share button means something only once the globe has drawn (11 Nov): on a slow first load the canvas stands on
 * screen for seconds before the Earth is drawn on it, and a Share pressed then was refused as a blank frame. The button
 * stays disabled while every probe frame is blank, and turns ready on the first that is drawn.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' }, setVisualizationMode: vi.fn() }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));
/** Whether the globe has drawn yet: until it has, every capture is refused as blank, as captureGlobeFrame refuses one. */
const globeState = vi.hoisted(() => ({ drawn: false, probes: 0 }));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => {
    globeState.probes += 1;
    if (!globeState.drawn) throw new Error('The captured frame is blank — every sampled pixel is identical.');
    return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
  },
}));

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';

function fakeGlobe() {
  const pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: 1280, clientHeight: 608, width: 1280, height: 608 };
  return {
    current: {
      renderer: () => ({ domElement: canvas }),
      scene: () => ({}),
      camera: () => ({}),
      getGlobeRadius: () => 100,
      pointOfView: () => pov,
      controls: () => undefined,
    },
  };
}

const wait = (ms: number) => act(async () => { await new Promise((done) => { setTimeout(done, ms); }); });

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  globeState.drawn = false;
  globeState.probes = 0;
});

describe('the Share button', () => {
  it('stays disabled while the globe has drawn nothing, and turns ready on its first drawn frame', async () => {
    const { result } = renderHook(() => useGlobeShareCard({ globeRef: fakeGlobe() as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [] }));
    await wait(1200);
    expect(globeState.probes).toBeGreaterThan(0);
    expect(result.current.ready).toBe(false);
    globeState.drawn = true;
    await wait(700);
    expect(result.current.ready).toBe(true);
    // Once ready it asks no more: the probes stop.
    const after = globeState.probes;
    await wait(1100);
    expect(globeState.probes).toBe(after);
  });
});
