/**
 * A briefing playlist's stops (block G, item 6.1; record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP1–BP13).
 */
import { describe, expect, it } from 'vitest';
import {
  FLIGHT_MS,
  HOLD,
  MAX_STOPS,
  PLANET_ALTITUDE,
  STOP_ALTITUDE,
  arcDegrees,
  flightKeyframes,
  framedPose,
  ITEM_ABOVE_CENTRE,
  holdMsFor,
  orderStops,
  planPlaylist,
  type TourCandidate,
} from '../briefingPlaylist';
import * as THREE from 'three';

const item = (id: string, over: Partial<TourCandidate> = {}): TourCandidate => ({
  id,
  title: `Item ${id}`,
  position: { lat: 0, lng: 0 },
  lines: ['one line'],
  why: 'Why it is here',
  rank: 2,
  at: 0,
  group: 'g',
  ...over,
});
const ids = (stops: readonly { id: string }[]) => stops.map((s) => s.id);

describe('which stops, and in what order (BP2, BP7)', () => {
  it('visits the worst first, whatever the group', () => {
    const order = orderStops([
      item('report', { rank: 2, group: 'a' }),
      item('critical', { rank: 0, group: 'b' }),
      item('deadly', { rank: 1, group: 'c' }),
    ]);
    expect(ids(order)).toEqual(['critical', 'deadly', 'report']);
  });

  it('keeps a group together, in the place its worst item earns it, so the camera does not zigzag', () => {
    const order = orderStops([
      item('ua-critical', { rank: 0, group: 'ukraine', position: { lat: 49, lng: 32 } }),
      item('sd-deadly', { rank: 1, group: 'sudan', position: { lat: 15, lng: 30 } }),
      item('ua-report', { rank: 2, group: 'ukraine', position: { lat: 48, lng: 37 } }),
      item('sd-report', { rank: 2, group: 'sudan', position: { lat: 13, lng: 25 } }),
    ]);
    expect(ids(order)).toEqual(['ua-critical', 'ua-report', 'sd-deadly', 'sd-report']);
  });

  it('inside a group, the worse rank first, and among equals the nearest next', () => {
    // The nearer of the equals sorts last by id, so only nearness puts it first.
    const order = orderStops([
      item('start', { rank: 0, position: { lat: 0, lng: 0 } }),
      item('a-far', { rank: 2, position: { lat: 0, lng: 2 } }),
      item('b-near', { rank: 2, position: { lat: 0, lng: 28 } }),
      item('worse-but-far', { rank: 1, position: { lat: 0, lng: 30 } }),
    ]);
    expect(ids(order)).toEqual(['start', 'worse-but-far', 'b-near', 'a-far']);
  });

  it('breaks a tie of rank by the newer, then by id, so the same items make the same tour', () => {
    const order = orderStops([
      item('old', { rank: 1, at: 100, group: 'x' }),
      item('new', { rank: 1, at: 200, group: 'y' }),
      item('b', { rank: 1, at: 50, group: 'z' }),
      item('a', { rank: 1, at: 50, group: 'w' }),
    ]);
    expect(ids(order)).toEqual(['new', 'old', 'a', 'b']);
  });

  it('takes the worst twelve of more, from every group, not the first groups\' twelve', () => {
    const many = [
      ...Array.from({ length: 20 }, (_, i) => item(`report-${i}`, { rank: 2, group: 'busy', at: i })),
      item('critical-elsewhere', { rank: 0, group: 'quiet' }),
    ];
    const order = orderStops(many);
    expect(order).toHaveLength(MAX_STOPS);
    expect(ids(order)[0]).toBe('critical-elsewhere');
  });
});

describe('a playlist (BP4, BP7, BP8)', () => {
  it('opens on the whole planet over its first stop, and frames each stop at Show on globe\'s altitude', () => {
    const playlist = planPlaylist('war', [item('a', { rank: 0, position: { lat: 49, lng: 32 } }), item('b', { position: { lat: 15, lng: 30 } })])!;
    expect(playlist.opening).toEqual({ lat: 49, lng: 32, altitude: PLANET_ALTITUDE });
    // Each stop framed south of its item, so the caption at the foot of the frame never covers it (C34).
    expect(playlist.stops.map((s) => s.pose)).toEqual([
      framedPose({ lat: 49, lng: 32 }, STOP_ALTITUDE),
      framedPose({ lat: 15, lng: 30 }, STOP_ALTITUDE),
    ]);
    expect(playlist.stops.map((s) => s.candidate.position)).toEqual([{ lat: 49, lng: 32 }, { lat: 15, lng: 30 }]);
    expect(playlist.title).toBe('War & Conflict today');
  });

  it('draws a stop\'s item a third of the way down the frame, above any caption, as the camera projects it (C34)', () => {
    const pose = framedPose({ lat: 10, lng: 20 }, STOP_ALTITUDE);
    expect(pose.lng).toBe(20);
    expect(pose.altitude).toBe(STOP_ALTITUDE);
    // Where three.js draws the item from that pose: globe.gl's camera, 50° high, looking at the planet's centre.
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
    const at = (lat: number, lng: number, r: number) => {
      const φ = (lat * Math.PI) / 180, λ = (lng * Math.PI) / 180;
      return new THREE.Vector3(r * Math.cos(φ) * Math.sin(λ), r * Math.sin(φ), r * Math.cos(φ) * Math.cos(λ));
    };
    camera.position.copy(at(pose.lat, pose.lng, 1 + STOP_ALTITUDE));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const drawn = at(10, 20, 1).project(camera);
    expect(drawn.y).toBeCloseTo(ITEM_ABOVE_CENTRE, 3);
    expect(Math.abs(drawn.x)).toBeLessThan(1e-6);
    // An item by the pole is never aimed past it.
    expect(framedPose({ lat: -80, lng: 0 }, STOP_ALTITUDE).lat).toBe(-89);
  });

  it('says how many it found, when it shows fewer', () => {
    const playlist = planPlaylist('raves', Array.from({ length: 15 }, (_, i) => item(`r${i}`)))!;
    expect(playlist.stops).toHaveLength(MAX_STOPS);
    expect(playlist.total).toBe(15);
  });

  it('is nothing when there is nothing to tour', () => {
    expect(planPlaylist('heat', [])).toBeNull();
  });

  it('holds each stop for reading time: 4 s and 1.2 s a line, the why among them, at most 9 s', () => {
    expect(holdMsFor(item('a', { lines: [] }))).toBe(HOLD.baseMs + HOLD.perLineMs);
    expect(holdMsFor(item('a', { lines: ['x', 'y'] }))).toBe(HOLD.baseMs + 3 * HOLD.perLineMs);
    expect(holdMsFor(item('a', { lines: ['x', 'y', 'z', 'w', 'v'] }))).toBe(HOLD.maxMs);
    expect(HOLD).toEqual({ baseMs: 4000, perLineMs: 1200, maxMs: 9000 });
  });
});

describe('a flight between stops (BP8)', () => {
  it('goes straight between near stops, in about 2.5 s', () => {
    const keys = flightKeyframes({ lat: 49, lng: 32, altitude: 1.8 }, { lat: 48, lng: 37, altitude: 1.8 });
    expect(FLIGHT_MS).toBe(2500);
    expect(keys).toEqual([
      { lat: 49, lng: 32, altitude: 1.8, atMs: 0 },
      { lat: 48, lng: 37, altitude: 1.8, atMs: FLIGHT_MS },
    ]);
  });

  it('rises to the whole planet on the way across more than 30° of arc, midway, the short way round', () => {
    const keys = flightKeyframes({ lat: 10, lng: 170, altitude: 1.8 }, { lat: 30, lng: -150, altitude: 1.8 });
    expect(keys).toHaveLength(3);
    expect(keys[1]).toEqual({ lat: 20, lng: -170, altitude: PLANET_ALTITUDE, atMs: FLIGHT_MS / 2 });
  });

  it('measures arc along the sphere', () => {
    expect(arcDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(90, 9);
    expect(arcDegrees({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(2, 9);
    expect(arcDegrees({ lat: 90, lng: 0 }, { lat: 90, lng: 120 })).toBeCloseTo(0, 6);
  });
});
