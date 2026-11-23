/**
 * useGlobeQualityGovernor — measures how the globe actually runs, and applies the
 * quality step that follows (services/globe/globeQuality.ts says how auto decides).
 *
 * Sharpness is applied here, on the renderer. Clouds and the atmosphere are applied
 * where they are drawn (useGlobeCloudLayer, and Globe's showAtmosphere), from the step
 * this returns.
 *
 * ─── WHAT IS MEASURED ──────────────────────────────────────────────────────
 *
 * The time between frames the renderer actually drew: the gap between animation frames
 * in which `renderer.info.render.frame` advanced. A frame that took the GPU too long
 * delays the next animation frame, so the gap is the cost a viewer feels. A gap is not
 * counted when:
 *   - the tab is hidden;
 *   - the render gate has paused the globe. Animation frames then keep arriving with
 *     nothing drawn, which a slow globe never does, because its animation frames wait
 *     for the drawing;
 *   - it is over five seconds, which is a stall rather than a frame rate;
 *   - it falls in the first six seconds, while textures upload and shaders compile.
 *
 * A window closes after two seconds once it holds enough gaps to take a median of, or
 * after ten seconds regardless.
 *
 * The first version closed every window at two seconds and discarded any with fewer
 * than 20 frames as a pause. Run on the dev globe under software rendering at a 2×
 * device scale, the globe drew about 6 frames a second, 12 a window. So Auto never
 * measured the one kind of device it exists for, and held full detail for a minute.
 * Its tests passed; running it found this.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import type * as THREE from 'three';
import {
  getGlobeQuality, subscribeGlobeQuality, qualityStepOf, reportFrameWindow, type QualityStep,
} from '../../../services/globe/globeQuality';
import { shareActive } from '../../../features/globe/capture/shareActivity';

const WINDOW_MS = 2000;
const MAX_WINDOW_MS = 10_000;
const MIN_GAPS = 5;
const WARMUP_MS = 6000;
const MAX_GAP_MS = 5000;
const IDLE_TICKS_FOR_PAUSE = 3;
const RENDERER_POLL_MS = 250;

type WithRenderer = { renderer?: () => THREE.WebGLRenderer };

const rendererOf = (globeRef: RefObject<unknown>): THREE.WebGLRenderer | null =>
  (globeRef.current as WithRenderer | null)?.renderer?.() ?? null;

const median = (values: number[]): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function useGlobeQualityGovernor(globeRef: RefObject<unknown>): QualityStep {
  const quality = useSyncExternalStore(subscribeGlobeQuality, getGlobeQuality, getGlobeQuality);
  const step = qualityStepOf(quality);

  // Sharpness. The renderer may not exist yet on the first pass, so wait for it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      const renderer = rendererOf(globeRef);
      if (!renderer) {
        timer = setTimeout(apply, RENDERER_POLL_MS);
        return;
      }
      const target = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, step.maxPixelRatio);
      if (renderer.getPixelRatio() !== target) renderer.setPixelRatio(target);
    };
    apply();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [globeRef, step.maxPixelRatio]);

  // Measurement.
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    let lastFrame = -1;
    let lastDrawnAt = 0;
    let idleTicks = 0;
    let startedAt = 0;
    let windowStartedAt = 0;
    let gaps: number[] = [];

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const renderer = rendererOf(globeRef);
      if (!renderer || (typeof document !== 'undefined' && document.hidden)) {
        lastDrawnAt = 0;
        return;
      }
      if (!startedAt) {
        startedAt = now;
        windowStartedAt = now;
      }
      const frame = renderer.info.render.frame;
      if (frame === lastFrame) {
        // Nothing drawn since the last animation frame, several times running: paused.
        if (++idleTicks >= IDLE_TICKS_FOR_PAUSE) lastDrawnAt = 0;
      } else {
        if (lastDrawnAt && now - lastDrawnAt <= MAX_GAP_MS) gaps.push(now - lastDrawnAt);
        lastFrame = frame;
        lastDrawnAt = now;
        idleTicks = 0;
      }
      const elapsed = now - windowStartedAt;
      if ((elapsed >= WINDOW_MS && gaps.length >= MIN_GAPS) || elapsed >= MAX_WINDOW_MS) {
        // Not while the share handle is in use: a session's cards and clip frames must all draw at one step, so the
        // planet's maps, atmosphere and clouds cannot change between two captures (D-GV GV0.2, shareActivity.ts).
        if (now - startedAt >= WARMUP_MS && !shareActive()) {
          reportFrameWindow({ medianMs: median(gaps), frames: gaps.length, at: now }, window.devicePixelRatio || 1);
        }
        gaps = [];
        windowStartedAt = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [globeRef]);

  return step;
}
