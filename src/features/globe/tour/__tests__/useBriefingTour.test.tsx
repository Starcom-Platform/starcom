/**
 * The briefing tour on the globe (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP3, BP9–BP12).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { holdForCapture } from '../../../../globe-engine/captureClock';
import { FLIGHT_MS, framedPose, STOP_ALTITUDE, type PlaylistId, type TourCandidate, type TourOffer } from '../briefingPlaylist';
import { OPENING_HOLD_MS } from '../tourPlayer';
import { LOAD_WAIT_MS, useBriefingTour, type BriefingTourDeps } from '../useBriefingTour';
import { tourMarker } from '../tourMarker';

const item = (id: string, lat: number, lng: number): TourCandidate => ({
  id, title: `Item ${id}`, position: { lat, lng }, lines: [], why: `Why ${id}`, rank: 0, at: 0, group: id,
});
const START = { lat: 10, lng: 20, altitude: 2.2 };

function world() {
  let pov = { ...START };
  const listeners = new Map<string, Set<() => void>>();
  const controls = {
    addEventListener: (type: string, fn: () => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: () => void) => { listeners.get(type)?.delete(fn); },
  };
  const moves: Array<{ lat: number; lng: number; altitude: number; ms: number }> = [];
  const globe = {
    pointOfView: (next?: typeof pov, ms = 0) => {
      if (next) { pov = { ...pov, ...next }; moves.push({ ...pov, ms }); }
      return pov;
    },
    controls: () => controls,
  };
  /** A person's hand on the globe: what OrbitControls fires, and never for code. */
  const touch = () => listeners.get('start')?.forEach((fn) => fn());
  let now = 0;
  const frames: Array<(t: number) => void> = [];
  const restore = vi.fn();
  let offer: TourOffer | null = null;
  const deps: BriefingTourDeps = {
    globeRef: { current: globe } as never,
    candidatesFor: vi.fn(() => offer),
    show: vi.fn((_id: PlaylistId) => restore),
    reducedMotion: false,
    onViewChosen: vi.fn(),
    now: () => now,
    requestFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelFrame: () => {},
  };
  /** Moves the clock on, a frame at a time, running what each frame asked for. */
  const advance = (ms: number, step = 100) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      act(() => {
        const due = frames.splice(0);
        due.forEach((cb) => cb(now));
        vi.advanceTimersByTime(step);
      });
    }
  };
  return {
    deps, moves, touch, advance, restore,
    /** What the layer offers, its read done. */
    setCandidates: (c: TourCandidate[] | null) => { offer = c === null ? null : { candidates: c, complete: true }; },
    /** What has arrived while the layer is still reading. */
    setArrived: (c: TourCandidate[]) => { offer = { candidates: c, complete: false }; },
    pov: () => pov,
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a briefing tour on the globe', () => {
  it('shows the playlist\'s layers, waits for its items, then flies the camera through them with a caption', () => {
    const w = world();
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    expect(w.deps.show).toHaveBeenCalledWith('war');
    expect(w.deps.onViewChosen).toHaveBeenCalled();
    expect(result.current.state).toBe('loading');
    w.advance(500);
    expect(w.moves).toEqual([]);
    w.setCandidates([item('a', 49, 32), item('b', 15, 30)]);
    w.advance(FLIGHT_MS + 500);
    expect(result.current.state).toBe('playing');
    expect(result.current.caption!.title).toBe('War & Conflict today');
    expect(w.moves.length).toBeGreaterThan(5);
    expect(w.moves.every((m) => m.ms === 0)).toBe(true);
    w.advance(OPENING_HOLD_MS + FLIGHT_MS);
    expect(result.current.caption!.title).toBe('Item a');
    // Framed south of the item, so its caption never covers it (C34).
    expect(w.pov()).toMatchObject(framedPose({ lat: 49, lng: 32 }, STOP_ALTITUDE));
  });

  it('pauses when a person touches the globe, keeps the caption, and resumes from where they left it', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32), item('b', 15, 30)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    w.advance(FLIGHT_MS + OPENING_HOLD_MS + FLIGHT_MS + 300);
    act(() => w.touch());
    expect(result.current.state).toBe('paused');
    const before = w.moves.length;
    w.advance(20_000);
    expect(w.moves.length).toBe(before);
    expect(result.current.caption!.title).toBe('Item a');
    act(() => result.current.resume());
    w.advance(FLIGHT_MS + 200);
    expect(result.current.state).toBe('playing');
    expect(w.moves.length).toBeGreaterThan(before);
  });

  it('ends on Esc: puts back the layers and the moment, and the camera where it was', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    w.advance(FLIGHT_MS + 300);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.state).toBe('off');
    expect(result.current.caption).toBeNull();
    expect(w.restore).toHaveBeenCalledTimes(1);
    expect(w.moves.at(-1)).toMatchObject({ ...START, ms: 1000 });
  });

  it('ends after its last stop, and puts everything back the same way', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('heat'));
    w.advance(FLIGHT_MS + OPENING_HOLD_MS + FLIGHT_MS + 20_000);
    expect(result.current.state).toBe('off');
    expect(w.restore).toHaveBeenCalledTimes(1);
    expect(w.moves.at(-1)).toMatchObject({ ...START, ms: 1000 });
  });

  it('says so, and puts things back, when the playlist has nothing to tour, or its layer does not load', () => {
    const w = world();
    w.setCandidates([]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('raves'));
    w.advance(300);
    expect(result.current.state).toBe('off');
    expect(result.current.notice).toBe('Raver Watch tonight has nothing to tour right now.');
    expect(w.restore).toHaveBeenCalledTimes(1);
    // A tour that never moved the camera leaves it where the person had it.
    expect(w.moves).toEqual([]);

    const late = world();
    const slow = renderHook(() => useBriefingTour(late.deps));
    act(() => slow.result.current.start('war'));
    late.advance(LOAD_WAIT_MS + 500);
    expect(slow.result.current.state).toBe('off');
    expect(slow.result.current.notice).toMatch(/did not load/);
    expect(late.restore).toHaveBeenCalledTimes(1);
  });

  it('waits for the layer to finish reading, then tours what has arrived, saying so', () => {
    const w = world();
    w.setArrived([item('a', 49, 32)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('raves'));
    w.advance(LOAD_WAIT_MS - 1000);
    expect(result.current.state).toBe('loading');
    expect(w.moves).toEqual([]);
    w.advance(2000);
    expect(result.current.state).toBe('playing');
    w.advance(FLIGHT_MS + 500);
    expect(result.current.caption!.why).toMatch(/Still reading The Record: this tours what had arrived$/);
  });

  it('starts at once when the read is done, and gives up when nothing arrived', () => {
    const w = world();
    w.setArrived([item('a', 49, 32)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('raves'));
    w.advance(1000);
    expect(result.current.state).toBe('loading');
    w.setCandidates([item('a', 49, 32)]);
    w.advance(500);
    expect(result.current.state).toBe('playing');

    const empty = world();
    empty.setArrived([]);
    const nothing = renderHook(() => useBriefingTour(empty.deps));
    act(() => nothing.result.current.start('heat'));
    empty.advance(LOAD_WAIT_MS + 500);
    expect(nothing.result.current.notice).toMatch(/did not load/);
  });

  it('never moves the camera while a card or clip is being made, and goes on after (BP11)', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32), item('b', 15, 30)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    w.advance(500);
    const release = holdForCapture();
    const before = w.moves.length;
    w.advance(5_000);
    expect(w.moves.length).toBe(before);
    release();
    w.advance(FLIGHT_MS);
    expect(w.moves.length).toBeGreaterThan(before);
    expect(result.current.state).toBe('playing');
  });

  it('cuts between stops with reduced motion (BP10)', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32), item('b', 15, 30)]);
    const { result } = renderHook(() => useBriefingTour({ ...w.deps, reducedMotion: true }));
    act(() => result.current.start('war'));
    w.advance(OPENING_HOLD_MS + 20_000);
    const poses = w.moves.filter((m) => m.ms === 0).map((m) => [m.lat, m.lng, m.altitude]);
    const framed = (lat: number, lng: number) => { const p = framedPose({ lat, lng }, STOP_ALTITUDE); return [p.lat, p.lng, p.altitude]; };
    expect(poses).toEqual([[49, 32, 2.5], framed(49, 32), framed(15, 30)]);
  });

  it('puts everything back when the globe goes away mid-tour', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32)]);
    const { result, unmount } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    w.advance(500);
    unmount();
    expect(w.restore).toHaveBeenCalledTimes(1);
  });
});

describe('drawing the eye to a stop, and going round (critique C34)', () => {
  it('pings the item a stop holds, at the item and not where the camera aims, and nothing once the tour ends', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32), item('b', 15, 30)]);
    const { result } = renderHook(() => useBriefingTour(w.deps));
    act(() => result.current.start('war'));
    w.advance(FLIGHT_MS + OPENING_HOLD_MS - 200);
    expect(tourMarker()).toBeNull();
    w.advance(FLIGHT_MS + 800);
    expect(tourMarker()).toMatchObject({ lat: 49, lng: 32 });
    expect(tourMarker()!.heldForMs).toBeGreaterThan(0);
    act(() => result.current.end());
    expect(tourMarker()).toBeNull();
  });

  it('goes round again while Loop is on', () => {
    const w = world();
    w.setCandidates([item('a', 49, 32)]);
    const { result } = renderHook(() => useBriefingTour({ ...w.deps, reducedMotion: true }));
    act(() => result.current.setLoop(true));
    act(() => result.current.start('war'));
    w.advance(OPENING_HOLD_MS + 30_000);
    expect(result.current.state).toBe('playing');
    expect(result.current.loop).toBe(true);
    act(() => result.current.setLoop(false));
    w.advance(OPENING_HOLD_MS + 30_000);
    expect(result.current.state).toBe('off');
  });
});
