import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { setGlobePointOfView } from '../../../utils/globeCameraMath';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { SHOW_ON_GLOBE_MOVE } from '../showOnGlobeMove';

interface DraggableControls {
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

interface TurnableGlobe {
  controls?: () => DraggableControls | undefined;
  pointOfView: (...args: never[]) => unknown;
}

export interface TurnToFirstIntelInput {
  globeRef: MutableRefObject<TurnableGlobe | null | undefined>;
  /** The globe is up, and showing Intel Reports. */
  ready: boolean;
  /** The reports the globe is drawing. */
  reports: readonly { latitude: number; longitude: number }[];
  /** A Case or a Mission is shown on the globe. */
  showingRecord: boolean;
  /**
   * Set true when something other than a person has chosen the view — the
   * share handle's setView or recordClip.
   *
   * The controls fire `start` for a drag and not for a move made in code, so
   * an agent driving the share handle was invisible here: its setView landed,
   * the first reports arrived ~15 s after load, and the globe turned to their
   * centre and carried the agent's shot with it. Reported by Mecha Jono on
   * 2026-09-25 as a card composed 5° from the pose that setView had confirmed.
   */
  viewChosenRef?: { current: boolean };
}

/**
 * Turns the globe to the first reports of a visit (decision D-F, step 1).
 *
 * A first visit's reports arrive about fifteen seconds after load, and on 2026-09-15
 * all of them were in the United States while the globe faced 0°N 0°E, so a new
 * visitor saw two at the edge of the planet and nothing else. So when the first
 * reports arrive, the globe turns to where they are, with the same move Show on Globe
 * makes.
 *
 * Only while nobody has moved it. The controls fire `start` when a person drags,
 * scrolls or touches the globe, and not for a move made in code, so from the first
 * of those the view is theirs. It turns once: later reports do not move it again, and
 * reports with no one centre, like pins spread round the planet, get no turn, as with
 * Show on Globe. A Case or a Mission shown on arrival has already chosen the view, so
 * the globe does not turn after it is cleared either.
 */
export function useTurnToFirstIntel({ globeRef, ready, reports, showingRecord, viewChosenRef }: TurnToFirstIntelInput): void {
  const movedByPerson = useRef(false);
  const settled = useRef(false);

  useEffect(() => {
    if (!ready) return undefined;
    const controls = globeRef.current?.controls?.();
    if (!controls) return undefined;
    const onStart = () => {
      movedByPerson.current = true;
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [ready, globeRef]);

  useEffect(() => {
    if (!ready || settled.current) return;
    if (showingRecord) {
      settled.current = true;
      return;
    }
    // A view chosen in code settles it for good, exactly as a person's drag does.
    if (viewChosenRef?.current) {
      settled.current = true;
      return;
    }
    if (movedByPerson.current || reports.length === 0) return;
    const globe = globeRef.current;
    if (!globe) return;
    settled.current = true;
    const target = centreOf(reports);
    if (!target) return;
    setGlobePointOfView(
      globe as unknown as Parameters<typeof setGlobePointOfView>[0],
      { lat: target.lat, lng: target.lng, altitude: SHOW_ON_GLOBE_MOVE.altitude },
      SHOW_ON_GLOBE_MOVE.transitionMs,
    );
  }, [ready, reports, showingRecord, globeRef]);
}
