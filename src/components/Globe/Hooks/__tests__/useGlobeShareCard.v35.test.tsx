/**
 * Country names in a clip (decision K5, TS10; contract v35): the handle's
 * `recordClip({ countryNames })`, mounted as an agent meets it. A stand-in frame
 * capture draws the names as the names layer would, at what the switch says.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' }, setVisualizationMode: vi.fn() }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));
/** What each frame saw: the clip's names switch, and whether names were drawn in it; and what the recorder was told. */
const captured = vi.hoisted(() => ({
  frames: [] as Array<{ fps: number | null; drawn: boolean }>,
  /** A frame (1-based) whose render draws no names, as one would with the overlay gone mid-clip. */
  dropNamesOnFrame: 0,
  options: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => {
  const clock = await import('../../../../globe-engine/captureClock');
  const look = await import('../../../../globe-engine/countryNamesLook');
  return {
    ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
    captureGlobeFrame: (_target: unknown, options: { width?: number; height?: number } = {}) => {
      // Not counted: the readiness probe whenReady takes (64 px tall, 256 for a far view), which a clip now waits on before its camera moves (H3): not a frame.
      if (options.height === 64 || options.height === 256) return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
      // As the real one: held still around its render, and the names layer noting what it drew.
      clock.stillMotion(Date.now());
      const n = captured.frames.length + 1;
      const drawn = look.namesVisibilityNow() > 0;
      if (n !== captured.dropNamesOnFrame) look.noteCountryNamesDrawn({ drawn, codes: drawn ? ['FRA'] : [], boxes: [] });
      captured.frames.push({ fps: look.clipCountryNames()?.fps ?? null, drawn });
      clock.releaseMotion();
      return { dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' };
    },
  };
});
vi.mock('../../../../features/globe/capture/recordGlobeClip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/capture/recordGlobeClip')>();
  return {
    ...actual,
    recordGlobeClip: (...args: Parameters<typeof actual.recordGlobeClip>) => {
      captured.options.push({ ...(args[2] ?? {}) });
      return actual.recordGlobeClip(...args);
    },
  };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import { captureUnderWay } from '../../../../globe-engine/captureClock';
import { clipCountryNames, resetCountryNamesLookForTest, setCountryNamesReady } from '../../../../globe-engine/countryNamesLook';

function fakeGlobe() {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: 1280, clientHeight: 608 };
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

interface Handle { recordClip: (o: object) => Promise<unknown> }
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const keyframes = [{ lat: 40, lng: -90, altitude: 2, atMs: 0 }, { lat: 40, lng: -80, altitude: 2, atMs: 1000 }];

const mount = () => {
  renderHook(() => useGlobeShareCard({ globeRef: fakeGlobe() as never, feeds: [], marks: null, onViewChosen: vi.fn(), shareReports: [] }));
  // jsdom decodes no image: every clip here is refused at its end card, after all its footage.
  vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_value: string) { setTimeout(() => this.onerror?.(), 0); } });
};

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  captured.frames = [];
  captured.options = [];
  captured.dropNamesOnFrame = 0;
  resetCountryNamesLookForTest();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('recordClip with country names (contract v35)', () => {
  it('draws the names in every frame, at the clip\'s rate, says so to the record, and draws none once it ends', async () => {
    setCountryNamesReady('ready');
    mount();
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, countryNames: true })).rejects.toThrow(/end card/);
    expect(captured.frames).toEqual([{ fps: 2, drawn: true }, { fps: 2, drawn: true }, { fps: 2, drawn: true }]);
    expect(captured.options[0]).toMatchObject({ countryNames: true });
    expect(clipCountryNames()).toBeNull();
    expect(captureUnderWay()).toBe(false);
  });

  it('draws none in a clip that did not ask, whatever the screen shows', async () => {
    setCountryNamesReady('ready');
    mount();
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0 })).rejects.toThrow(/end card/);
    expect(captured.frames.every((f) => f.fps === null && !f.drawn)).toBe(true);
    expect(captured.options[0]).not.toHaveProperty('countryNames');
  });

  it('refuses a clip a frame of which drew no names, and lets the names go', async () => {
    setCountryNamesReady('ready');
    captured.dropNamesOnFrame = 2;
    mount();
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, countryNames: true }))
      .rejects.toThrow(/^The clip asked for country names and the names were not drawn/);
    expect(captured.frames).toHaveLength(2);
    expect(clipCountryNames()).toBeNull();
    expect(captureUnderWay()).toBe(false);
  });

  it('refuses before anything moves when the names cannot be drawn, or the option is not true or false', async () => {
    setCountryNamesReady('fallback');
    mount();
    await expect(handle().recordClip({ keyframes, fps: 2, settleMs: 0, countryNames: true }))
      .rejects.toThrow(/^The clip asked for country names, and the text face/);
    await expect(handle().recordClip({ keyframes, countryNames: 'yes' })).rejects.toThrow(/countryNames is true or false/);
    expect(captured.frames).toEqual([]);
  });
});
