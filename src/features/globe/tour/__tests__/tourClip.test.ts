/**
 * A briefing playlist as a clip (record docs/missions/01-architecture-decisions/briefing-playlists.md,
 * BP14, BP15, BP17): the opening, then as many of the worst stops as fit the clip, each with its
 * flight and hold at the screen's times, and the caption the screen shows at every moment.
 */
import { describe, expect, it } from 'vitest';
import { FLIGHT_MS, planPlaylist, type TourCandidate } from '../briefingPlaylist';
import { OPENING_HOLD_MS, tourCaption } from '../tourPlayer';
import { captionAt, markerAt, planTourClip } from '../tourClip';
import { buildCameraTrack } from '../../capture/cameraTrack';

const item = (id: string, lat: number, lng: number, over: Partial<TourCandidate> = {}): TourCandidate => ({
  id, title: `Item ${id}`, position: { lat, lng }, lines: ['a line'], why: `Why ${id}`, rank: 0, at: 0, group: id, ...over,
});
// Four stops of one line each: held 6.4 s, so a stop and its flight take 8.9 s.
const four = planPlaylist('war', [item('a', 49, 32), item('b', 48, 37, { rank: 1 }), item('c', 15, 30, { rank: 2 }), item('d', 33, 36, { rank: 3 })])!;
const HOLD = four.stops[0].holdMs;
const CAP = { fps: 30, maxFrames: 900 };

describe('which stops a clip keeps', () => {
  it('keeps the worst stops, in the playlist\'s order, while the footage fits the frames a call may hold', () => {
    expect(HOLD).toBe(6400);
    const plan = planTourClip(four, CAP);
    // 3 s + 3 x 8.9 s = 29.7 s: 892 frames at 30 fps; a fourth would be 38.6 s.
    expect(plan.stops.map((s) => s.id)).toEqual(four.stops.slice(0, 3).map((s) => s.candidate.id));
    expect(plan.durationMs).toBe(OPENING_HOLD_MS + 3 * (FLIGHT_MS + HOLD));
    expect(Math.round((plan.durationMs / 1000) * 30) + 1).toBeLessThanOrEqual(900);
    expect(plan).toMatchObject({ shown: 3, total: 4, partial: false });
  });

  it('keeps more at a lower rate, and refuses when not even the first stop fits', () => {
    expect(planTourClip(four, { fps: 15, maxFrames: 900 }).stops).toHaveLength(4);
    expect(() => planTourClip(four, { fps: 30, maxFrames: 100 }))
      .toThrow('Not even the first stop fits a clip of 100 frames at 30 fps: the opening and one stop take 11.9 s. Ask for a lower fps.');
  });

  it('counts a footage frame for each moment from 0 to its end, as the recorder renders them', () => {
    // 29.7 s at 30 fps is frames 0 to 891: 892 of them.
    expect(planTourClip(four, { fps: 30, maxFrames: 892 }).stops).toHaveLength(3);
    expect(planTourClip(four, { fps: 30, maxFrames: 891 }).stops).toHaveLength(2);
  });
});

describe('the camera', () => {
  it('opens on the whole planet and holds it, then flies to each stop and holds it for its reading time', () => {
    const plan = planTourClip(four, CAP);
    const track = buildCameraTrack(plan.keyframes);
    expect(track.durationMs).toBe(plan.durationMs);
    const close = (t: number, pose: { lat: number; lng: number; altitude: number }) => {
      const at = track.at(t);
      expect(at.lat).toBeCloseTo(pose.lat, 6);
      expect(at.lng).toBeCloseTo(pose.lng, 6);
      expect(at.altitude).toBeCloseTo(pose.altitude, 6);
    };
    close(0, four.opening);
    close(OPENING_HOLD_MS, four.opening);
    const firstLands = OPENING_HOLD_MS + FLIGHT_MS;
    close(firstLands, four.stops[0].pose);
    close(firstLands + HOLD, four.stops[0].pose);
    close(plan.durationMs, four.stops[2].pose);
    // Every keyframe after the one before it.
    plan.keyframes.slice(1).forEach((k, i) => expect(k.atMs).toBeGreaterThan(plan.keyframes[i].atMs));
  });
});

describe('the captions', () => {
  it('says the playlist at the opening, then each stop through its flight and its hold, as the screen does', () => {
    const plan = planTourClip(four, CAP);
    const shown = { ...four, stops: four.stops.slice(0, 3) };
    expect(captionAt(plan, 0)).toEqual(tourCaption(shown, -1));
    expect(captionAt(plan, 0).why).toBe('The worst 3 of 4, worst first, by region');
    expect(captionAt(plan, OPENING_HOLD_MS - 1)).toEqual(tourCaption(shown, -1));
    expect(captionAt(plan, OPENING_HOLD_MS)).toEqual(tourCaption(shown, 0));
    expect(captionAt(plan, OPENING_HOLD_MS).progress).toBe('1 of 3 · 4 in all');
    expect(captionAt(plan, plan.durationMs)).toEqual(tourCaption(shown, 2));
    // From one stop to the next as the next flight starts.
    expect(captionAt(plan, plan.stops[1].fromMs)).toEqual(tourCaption(shown, 1));
    expect(captionAt(plan, plan.stops[1].fromMs - 1)).toEqual(tourCaption(shown, 0));
  });

  it('records each stop\'s item with when its caption shows', () => {
    const plan = planTourClip(four, CAP);
    expect(plan.opening).toEqual({ fromMs: 0, toMs: OPENING_HOLD_MS, caption: tourCaption({ ...four, stops: four.stops.slice(0, 3) }, -1) });
    expect(plan.stops[0]).toMatchObject({ id: 'a', title: 'Item a', fromMs: OPENING_HOLD_MS, toMs: OPENING_HOLD_MS + FLIGHT_MS + HOLD });
    expect(plan.stops[1].fromMs).toBe(plan.stops[0].toMs);
    expect(plan.stops[2].toMs).toBe(plan.durationMs);
  });
});

describe('the item a clip\'s stop holds (critique C34)', () => {
  it('is pinged from its own moment of the footage, and nothing is in a flight or at the opening', () => {
    const plan = planTourClip(four, CAP);
    const first = plan.stops[0];
    expect(markerAt(plan, OPENING_HOLD_MS / 2)).toBeNull();
    expect(markerAt(plan, first.fromMs + FLIGHT_MS / 2)).toBeNull();
    const held = markerAt(plan, first.fromMs + FLIGHT_MS + 250)!;
    expect(held).toEqual({ ...plan.playlist.stops[0].candidate.position, heldForMs: 250 });
    // The same moment of the same clip pings alike.
    expect(markerAt(plan, first.fromMs + FLIGHT_MS + 250)).toEqual(held);
    expect(markerAt(plan, plan.durationMs + 1)).toBeNull();
  });
});
