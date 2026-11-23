import { useEffect, useState, useSyncExternalStore } from 'react';
import { useGlobeLoading } from '../../context/GlobeLoadingContext';
import { getGlobeQuality, subscribeGlobeQuality } from '../../services/globe/globeQuality';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Whether the minimap may draw, and why not when it may not (plan item 8.3,
 * block B4; decided 2026-10-01).
 *
 * The minimap is a second globe with a WebGL context of its own, as costly as
 * the main one's: 2.6–7 s of frozen page on a machine that draws in software,
 * which landed just as the main globe was revealed. It draws only once the main
 * globe is up and the quality governor has settled at full detail, when the
 * browser is next idle. A device the governor steps down never makes its
 * context, and one stepped down later gives it up: it is drawn `flat` instead,
 * on a 2D canvas, once the browser is idle (decision D-MG, MG1). Until either,
 * it is a still image.
 */
export function useMinimapLive(): { live: boolean; flat: boolean; why: string } {
  const { isGlobeInitialized } = useGlobeLoading();
  const quality = useSyncExternalStore(subscribeGlobeQuality, getGlobeQuality);
  const ready = isGlobeInitialized && quality.settled;
  const wanted: 'webgl' | 'flat' | null = !ready ? null : quality.step === 0 ? 'webgl' : 'flat';
  const [drawn, setDrawn] = useState<'webgl' | 'flat' | null>(null);

  useEffect(() => {
    setDrawn(null);
    if (!wanted) return;
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setDrawn(wanted), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(() => setDrawn(wanted), 500);
    return () => clearTimeout(timer);
  }, [wanted]);

  const live = drawn === 'webgl' && wanted === 'webgl';
  const flat = drawn === 'flat' && wanted === 'flat';
  const why = live || flat ? ''
    : !ready ? 'The minimap starts once the globe has loaded.'
      : 'The minimap is starting.';
  return { live, flat, why };
}
