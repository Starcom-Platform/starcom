import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { markGlobeEngaged } from '../globeEngagement';

type ControlsEvent = 'start' | 'change' | 'end';

interface MovableControls {
  addEventListener(type: ControlsEvent, listener: () => void): void;
  removeEventListener(type: ControlsEvent, listener: () => void): void;
}

interface MovableGlobe {
  controls?: () => MovableControls | undefined;
}

export interface MarkGlobeEngagedInput {
  globeRef: MutableRefObject<MovableGlobe | null | undefined>;
  /** The globe is up. */
  ready: boolean;
}

/**
 * Marks the globe used once a person has moved it (decision D-F, step 3), so the
 * support ask follows the person's use of the globe rather than arriving before it.
 *
 * The controls fire `start` when a person presses, scrolls or touches, `change` as
 * the view moves, and `end` when they let go. It counts at the end, so nothing opens
 * over the globe while it is still being moved, and only if the view changed since
 * the press. A press that moves nothing fires `start` and `end` too, and one of those
 * is the click that opens a report: counting it would open the ask on top of the
 * report. A move made in code, like the turn to the first reports, changes the view
 * with no press before it, so it never counts either.
 *
 * Opening a report counts once the report is closed; Enhanced3DGlobeInteractivity
 * marks that.
 */
export function useMarkGlobeEngaged({ globeRef, ready }: MarkGlobeEngagedInput): void {
  useEffect(() => {
    if (!ready) return undefined;
    const controls = globeRef.current?.controls?.();
    if (!controls) return undefined;
    let moved = false;
    const onStart = () => { moved = false; };
    const onChange = () => { moved = true; };
    const onEnd = () => { if (moved) markGlobeEngaged(); };
    controls.addEventListener('start', onStart);
    controls.addEventListener('change', onChange);
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('end', onEnd);
    };
  }, [ready, globeRef]);
}
