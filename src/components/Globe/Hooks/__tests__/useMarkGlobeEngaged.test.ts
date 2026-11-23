/**
 * The globe counts as used once a person has moved it: a drag, scroll or touch that
 * changed the view, counted when it ends (decision D-F, step 3). Counted at the end,
 * nothing opens over the globe while it is still being moved. And a press that moves
 * nothing is not a move: the click that opens a report fires the same events, and the
 * support ask must not open on top of the report just opened.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMarkGlobeEngaged } from '../useMarkGlobeEngaged';
import { hasEngagedWithGlobe, resetGlobeEngagementForTests } from '../../globeEngagement';

/** A globe whose controls a person can press, move and let go of. */
function fakeGlobe() {
  const listeners = new Map<string, Set<() => void>>();
  const controls = {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    ref: { current: { controls: () => controls } },
    fire: (...types: string[]) => types.forEach((type) => listeners.get(type)?.forEach((fn) => fn())),
    listening: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

beforeEach(() => resetGlobeEngagementForTests());

describe('useMarkGlobeEngaged', () => {
  it("marks the globe used when a person's move ends", () => {
    const globe = fakeGlobe();
    renderHook(() => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready: true }));

    globe.fire('start', 'change', 'change', 'end');

    expect(hasEngagedWithGlobe()).toBe(true);
  });

  it('does not count a move still under way', () => {
    const globe = fakeGlobe();
    renderHook(() => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready: true }));

    globe.fire('start', 'change');

    expect(hasEngagedWithGlobe()).toBe(false);
  });

  it('does not count a press that moved nothing, like the click that opens a report', () => {
    const globe = fakeGlobe();
    renderHook(() => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready: true }));

    globe.fire('start', 'end');

    expect(hasEngagedWithGlobe()).toBe(false);
  });

  it('does not count a view moved in code, followed by a click', () => {
    // A move made in code, like the turn to the first reports, changes the view with
    // no press before it.
    const globe = fakeGlobe();
    renderHook(() => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready: true }));

    globe.fire('change', 'change', 'start', 'end');

    expect(hasEngagedWithGlobe()).toBe(false);
  });

  it('listens once the globe is ready', () => {
    const globe = fakeGlobe();
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready }),
      { initialProps: { ready: false } },
    );
    expect(globe.listening()).toBe(0);

    rerender({ ready: true });
    globe.fire('start', 'change', 'end');

    expect(hasEngagedWithGlobe()).toBe(true);
  });

  it('stops listening when the globe goes', () => {
    const globe = fakeGlobe();
    const { unmount } = renderHook(() => useMarkGlobeEngaged({ globeRef: globe.ref as never, ready: true }));
    expect(globe.listening()).toBe(3);

    unmount();

    expect(globe.listening()).toBe(0);
  });
});
