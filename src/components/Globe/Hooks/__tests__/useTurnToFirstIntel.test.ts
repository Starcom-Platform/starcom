/**
 * On a first visit the globe turns to the first reports that arrive, with the move
 * Show on Globe uses, unless the person has already moved it (decision D-F, step 1).
 * All 7 reports a first visit received on 2026-09-15 were in the United States,
 * while the globe faced 0°N 0°E and showed two of them at its edge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { setGlobePointOfView } = vi.hoisted(() => ({ setGlobePointOfView: vi.fn() }));
vi.mock('../../../../utils/globeCameraMath', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/globeCameraMath')>()),
  setGlobePointOfView,
}));

import { useTurnToFirstIntel } from '../useTurnToFirstIntel';
import { SHOW_ON_GLOBE_MOVE } from '../../showOnGlobeMove';
import { centreOf } from '../../../../services/intel/globe/linkedRecordPlacement';

const WASHINGTON = { latitude: 38.9072, longitude: -77.0369 };
const SEATTLE = { latitude: 47.600607, longitude: -122.196808 };

/** A globe whose controls can be dragged by a person. */
function fakeGlobe() {
  const listeners = new Map<string, () => void>();
  const controls = {
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const globe = { controls: () => controls, pointOfView: vi.fn() };
  return { ref: { current: globe }, drag: () => listeners.get('start')?.() };
}

type Props = { reports: { latitude: number; longitude: number }[]; ready: boolean; showingRecord: boolean };

function mount(globe: ReturnType<typeof fakeGlobe>, initial: Partial<Props> = {}) {
  return renderHook((props: Props) => useTurnToFirstIntel({ globeRef: globe.ref as never, ...props }), {
    initialProps: { reports: [], ready: true, showingRecord: false, ...initial },
  });
}

beforeEach(() => {
  setGlobePointOfView.mockClear();
});

describe('useTurnToFirstIntel', () => {
  it('turns to the first reports when nobody has moved the globe, with the Show on Globe move', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe);

    rerender({ reports: [WASHINGTON, SEATTLE], ready: true, showingRecord: false });

    const centre = centreOf([WASHINGTON, SEATTLE])!;
    expect(setGlobePointOfView).toHaveBeenCalledTimes(1);
    expect(setGlobePointOfView).toHaveBeenCalledWith(
      globe.ref.current,
      { lat: centre.lat, lng: centre.lng, altitude: SHOW_ON_GLOBE_MOVE.altitude },
      SHOW_ON_GLOBE_MOVE.transitionMs,
    );
  });

  it('leaves the globe where the person put it', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe);

    globe.drag();
    rerender({ reports: [WASHINGTON], ready: true, showingRecord: false });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });

  it('turns once, not again as more reports arrive', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe);

    rerender({ reports: [WASHINGTON], ready: true, showingRecord: false });
    rerender({ reports: [WASHINGTON, SEATTLE], ready: true, showingRecord: false });

    expect(setGlobePointOfView).toHaveBeenCalledTimes(1);
  });

  it('does not turn while a Case or Mission is shown on the globe', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe, { showingRecord: true });

    rerender({ reports: [WASHINGTON], ready: true, showingRecord: true });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });

  it('waits for the globe to be ready', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe, { ready: false, reports: [WASHINGTON] });
    expect(setGlobePointOfView).not.toHaveBeenCalled();

    rerender({ reports: [WASHINGTON], ready: true, showingRecord: false });

    expect(setGlobePointOfView).toHaveBeenCalledTimes(1);
  });

  it('does not turn when the reports have no one place to look', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe);

    rerender({ reports: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }], ready: true, showingRecord: false });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });

  it('does not turn later, once the first reports had no one place to look', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe);

    rerender({ reports: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }], ready: true, showingRecord: false });
    rerender({ reports: [WASHINGTON], ready: true, showingRecord: false });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });

  it('does not turn after a Case shown on arrival is cleared: Show on Globe chose the view', () => {
    const globe = fakeGlobe();
    const { rerender } = mount(globe, { showingRecord: true, reports: [SEATTLE] });

    rerender({ reports: [WASHINGTON, SEATTLE], ready: true, showingRecord: false });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });
});

/**
 * An agent choosing the view counts as choosing the view.
 *
 * Reported by Mecha Jono on 2026-09-25, driving the share handle headlessly:
 * setView resolved with the pose they asked for, and a card composed shortly
 * after came back 5° away, toward 39.7°N 84.5°W. This hook was the cause. It
 * stands down when a PERSON drags the globe — the controls fire `start` for a
 * drag, not for a move made in code — so the share handle's setView did not
 * count, and when the first reports arrived ~15 s after load the globe turned
 * to their centre and carried the agent's shot with it.
 *
 * That same centre is also why a fresh profile's getView() read 39.7°N 84.5°W.
 * It is the centre of the reports on the globe, not the viewer's location.
 */
describe('useTurnToFirstIntel — a view chosen in code', () => {
  it('does not turn once the view has been chosen through the share handle', () => {
    const globe = fakeGlobe();
    const viewChosenRef = { current: false };
    const { rerender } = renderHook(
      (props: Props) => useTurnToFirstIntel({ globeRef: globe.ref as never, viewChosenRef, ...props }),
      { initialProps: { reports: [], ready: true, showingRecord: false } },
    );

    viewChosenRef.current = true;
    rerender({ reports: [WASHINGTON, SEATTLE], ready: true, showingRecord: false });

    expect(setGlobePointOfView).not.toHaveBeenCalled();
  });

  it('still turns for a passive first visit when nothing chose the view', () => {
    const globe = fakeGlobe();
    const viewChosenRef = { current: false };
    const { rerender } = renderHook(
      (props: Props) => useTurnToFirstIntel({ globeRef: globe.ref as never, viewChosenRef, ...props }),
      { initialProps: { reports: [], ready: true, showingRecord: false } },
    );

    rerender({ reports: [WASHINGTON, SEATTLE], ready: true, showingRecord: false });

    expect(setGlobePointOfView).toHaveBeenCalledTimes(1);
  });
});
