import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobeQualityGovernor } from '../useGlobeQualityGovernor';
import {
  setGlobeQualitySetting, resetGlobeQualityForTests, LOWEST_STEP, QUALITY_STEPS, getGlobeQuality,
} from '../../../../services/globe/globeQuality';
import { noteShareActivity, resetShareActivity } from '../../../../features/globe/capture/shareActivity';

const realRatio = window.devicePixelRatio;

function fakeGlobe(initialRatio: number) {
  const renderer = {
    ratio: initialRatio,
    getPixelRatio() { return this.ratio; },
    setPixelRatio(r: number) { this.ratio = r; },
    info: { render: { frame: 0 } },
  };
  return { renderer, ref: { current: { renderer: () => renderer } } };
}

beforeEach(() => {
  localStorage.clear();
  resetGlobeQualityForTests();
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
});

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { value: realRatio, configurable: true });
});

describe('useGlobeQualityGovernor', () => {
  it('draws at the device ratio and every effect at full detail', () => {
    const { renderer, ref } = fakeGlobe(2);
    const { result } = renderHook(() => useGlobeQualityGovernor(ref));

    expect(renderer.ratio).toBe(2);
    expect(result.current).toBe(QUALITY_STEPS[0]);
  });

  it('applies a lower step to the renderer and hands back what the effects should drop', () => {
    const { renderer, ref } = fakeGlobe(2);
    const { result } = renderHook(() => useGlobeQualityGovernor(ref));

    act(() => setGlobeQualitySetting('low'));
    expect(renderer.ratio).toBe(QUALITY_STEPS[LOWEST_STEP].maxPixelRatio);
    expect(result.current.clouds).toBe(false);
    expect(result.current.atmosphere).toBe(false);

    act(() => setGlobeQualitySetting('high'));
    expect(renderer.ratio).toBe(2);
    expect(result.current.clouds).toBe(true);
  });

  it('holds its step while the share handle is in use, so a session\'s captures match (D-GV GV0.2)', () => {
    let queued: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // jsdom's document is hidden, and the governor measures nothing on a hidden page.
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    try {
      const { renderer, ref } = fakeGlobe(2);
      const { result } = renderHook(() => useGlobeQualityGovernor(ref));
      // Frames 150 ms apart: far under the governor's floor, as on a software renderer.
      const run = (fromMs: number, toMs: number) => {
        for (let t = fromMs; t <= toMs; t += 150) { renderer.info.render.frame += 1; act(() => queued!(t)); }
      };
      noteShareActivity();
      run(1, 40_000);
      // Not one window measured: the governor has not acted, and the step is where it was.
      expect(result.current).toBe(QUALITY_STEPS[0]);
      expect(getGlobeQuality().reason).toBeNull();
      // The same frames with the handle idle: it acts, so the hold above was the handle's.
      resetShareActivity();
      run(40_150, 80_000);
      expect(getGlobeQuality().reason).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
      resetShareActivity();
      delete (document as unknown as { hidden?: boolean }).hidden;
      if (hidden) Object.defineProperty(Document.prototype, 'hidden', hidden);
    }
  });

  it('never draws sharper than the screen', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    const { renderer, ref } = fakeGlobe(1);
    renderHook(() => useGlobeQualityGovernor(ref));
    act(() => setGlobeQualitySetting('high'));
    expect(renderer.ratio).toBe(1);
  });
});
