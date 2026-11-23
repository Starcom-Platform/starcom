/**
 * The briefing tour's player, on a clock (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP3, BP4, BP8–BP10).
 */
import { describe, expect, it } from 'vitest';
import { FLIGHT_MS, planPlaylist, type TourCandidate } from '../briefingPlaylist';
import { OPENING_HOLD_MS, TourPlayer } from '../tourPlayer';

const item = (id: string, lat: number, lng: number, over: Partial<TourCandidate> = {}): TourCandidate => ({
  id, title: `Item ${id}`, position: { lat, lng }, lines: ['a line'], why: `Why ${id}`, rank: 0, at: 0, group: id, ...over,
});
const playlist = planPlaylist('war', [item('a', 49, 32), item('b', 48, 37, { rank: 1 })])!;
const HOLD = playlist.stops[0].holdMs;
const HERE = { lat: 0, lng: 0, altitude: 2.5 };

/** The player's frames at each time, from 0. */
function run(player: TourPlayer, times: number[]) {
  return times.map((t) => player.tick(t));
}

describe('a tour from start to end', () => {
  it('flies to the whole planet, holds it, then flies to each stop and holds it for its reading time, then ends', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    const openingEnd = FLIGHT_MS + OPENING_HOLD_MS;
    const [mid, opening, toA, atA, toB, atB, end] = run(player, [
      FLIGHT_MS / 2,
      FLIGHT_MS + 10,
      openingEnd + 10,
      openingEnd + FLIGHT_MS + 10,
      openingEnd + FLIGHT_MS + HOLD + 10,
      openingEnd + 2 * FLIGHT_MS + HOLD + 10,
      openingEnd + 2 * FLIGHT_MS + HOLD + playlist.stops[1].holdMs + 10,
    ]);
    expect(mid.phase).toBe('flying');
    expect(mid.pose!.altitude).toBeGreaterThan(2.4);
    expect(opening.phase).toBe('holding');
    expect(opening.caption!.title).toBe('War & Conflict today');
    expect(toA.phase).toBe('flying');
    expect(atA.phase).toBe('holding');
    expect(atA.caption).toMatchObject({ title: 'Item a', why: 'Why a', progress: '1 of 2', lines: ['a line'] });
    expect(toB.phase).toBe('flying');
    expect(atB.caption!.title).toBe('Item b');
    expect(end.phase).toBe('ended');
  });

  it('lands each flight exactly on its stop, and leaves the camera alone while it holds', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    const atStop = FLIGHT_MS + OPENING_HOLD_MS + FLIGHT_MS;
    const landing = player.tick(atStop + 1);
    expect(landing.pose).toEqual(playlist.stops[0].pose);
    expect(player.tick(atStop + 500).pose).toBeNull();
    // The next flight leaves from this stop, not from where the tour began.
    const leaving = player.tick(atStop + HOLD + 1).pose!;
    expect(leaving.lat).toBeCloseTo(playlist.stops[0].pose.lat, 1);
    expect(leaving.lng).toBeCloseTo(playlist.stops[0].pose.lng, 1);
  });

  it('says how many it shows, and how many there were, when it shows fewer (BP7)', () => {
    const many = planPlaylist('raves', Array.from({ length: 15 }, (_, i) => item(`r${i}`, i, i)))!;
    const player = new TourPlayer(many, { reducedMotion: false });
    player.start(0, HERE);
    expect(player.tick(FLIGHT_MS + 10).caption!.why).toBe('The worst 12 of 15, worst first, by region');
    const atFirst = player.tick(2 * FLIGHT_MS + OPENING_HOLD_MS + 10);
    expect(atFirst.caption!.progress).toBe('1 of 12 · 15 in all');
  });
});

// Hero Watch ranks no harm: its relief by size, its missions by when they close (HW13).
describe('a playlist that is not worst first', () => {
  it('says its own order at its opening', () => {
    const many = planPlaylist('heroes', Array.from({ length: 13 }, (_, i) => item(`h${i}`, i, i)))!;
    const player = new TourPlayer(many, { reducedMotion: false });
    player.start(0, HERE);
    expect(player.tick(FLIGHT_MS + 10).caption!.why).toBe('12 of 13: relief, the largest first, then field missions, the soonest to close first');
    const all = new TourPlayer(planPlaylist('heroes', [item('a', 9, 39), item('b', 34, -106)])!, { reducedMotion: false });
    all.start(0, HERE);
    expect(all.tick(FLIGHT_MS + 10).caption!.why).toBe('2 stops: relief, the largest first, then field missions, the soonest to close first');
  });

  it('carries the lines a clip never cuts to each stop\'s caption', () => {
    const held = planPlaylist('heroes', [item('m', 34, -106, { lines: ['New Mexico', 'Safety limits: Work in pairs.'], neverCut: [1] })])!;
    const player = new TourPlayer(held, { reducedMotion: false });
    player.start(0, HERE);
    expect(player.tick(2 * FLIGHT_MS + OPENING_HOLD_MS + 10).caption!.neverCut).toEqual([1]);
  });
});

describe('a tour of what had arrived', () => {
  it('says so at its opening', () => {
    const partial = planPlaylist('raves', [item('a', 49, 32)], { partial: true })!;
    const player = new TourPlayer(partial, { reducedMotion: false });
    player.start(0, HERE);
    expect(player.tick(FLIGHT_MS + 10).caption!.why).toBe('1 stop, worst first, by region. Still reading The Record: this tours what had arrived');
    expect(planPlaylist('raves', [item('a', 49, 32)])!.partial).toBe(false);
  });
});

describe('a person taking over (BP3)', () => {
  it('stops moving the camera while paused, and keeps the caption', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    const atA = FLIGHT_MS + OPENING_HOLD_MS + FLIGHT_MS + 100;
    player.tick(atA);
    player.pause(atA + 10);
    const paused = player.tick(atA + 60_000);
    expect(paused.phase).toBe('paused');
    expect(paused.pose).toBeNull();
    expect(paused.caption!.title).toBe('Item a');
  });

  it('resumes from wherever the person left the camera: back to the stop it was on, held afresh, then on', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    const atA = FLIGHT_MS + OPENING_HOLD_MS + FLIGHT_MS + 100;
    player.tick(atA);
    player.pause(atA);
    const moved = { lat: -30, lng: 100, altitude: 3 };
    player.resume(100_000, moved);
    const first = player.tick(100_001);
    expect(first.phase).toBe('flying');
    expect(first.pose!.lat).toBeCloseTo(-30, 0);
    const back = player.tick(100_000 + FLIGHT_MS + 1);
    expect(back.phase).toBe('holding');
    expect(back.pose).toEqual(playlist.stops[0].pose);
    expect(player.tick(100_000 + FLIGHT_MS + HOLD + 10).phase).toBe('flying');
  });

  it('ends when told, and stays ended', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    player.end();
    expect(player.tick(10).phase).toBe('ended');
    player.resume(20, HERE);
    expect(player.tick(30).phase).toBe('ended');
  });
});

describe('reduced motion (BP10)', () => {
  it('cuts to each stop instead of flying, and holds as long', () => {
    const player = new TourPlayer(playlist, { reducedMotion: true });
    player.start(0, HERE);
    const opening = player.tick(1);
    expect(opening.phase).toBe('holding');
    expect(opening.pose).toEqual(playlist.opening);
    const atA = player.tick(OPENING_HOLD_MS + 1);
    expect(atA.phase).toBe('holding');
    expect(atA.pose).toEqual(playlist.stops[0].pose);
    expect(player.tick(OPENING_HOLD_MS + HOLD + 1).pose).toEqual(playlist.stops[1].pose);
  });
});

describe('drawing the eye, and going round (critique C34)', () => {
  const openingEnd = FLIGHT_MS + OPENING_HOLD_MS;
  const lastEnd = openingEnd + 2 * FLIGHT_MS + HOLD + playlist.stops[1].holdMs;

  it('says which stop it holds and for how long, and nothing of the opening or a flight', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false });
    player.start(0, HERE);
    const [opening, flying, holding, later] = run(player, [FLIGHT_MS + 10, openingEnd + 10, openingEnd + FLIGHT_MS + 10, openingEnd + FLIGHT_MS + 900]);
    expect(opening.held).toBeUndefined();
    expect(flying.held).toBeUndefined();
    expect(holding.held).toEqual({ stop: 0, forMs: 10 });
    expect(later.held).toEqual({ stop: 0, forMs: 900 });
  });

  it('goes back to the whole planet after its last stop and round again while looping, and ends when told not to', () => {
    const player = new TourPlayer(playlist, { reducedMotion: false, loop: true });
    player.start(0, HERE);
    const [round] = run(player, [lastEnd + 10]);
    expect(round.phase).toBe('flying');
    expect(player.ended).toBe(false);
    // The second round's first stop, held again.
    const [again] = run(player, [lastEnd + 10 + openingEnd + FLIGHT_MS + 5]);
    expect(again.held?.stop).toBe(0);

    player.setLoop(false);
    const [end] = run(player, [lastEnd + 10 + lastEnd + 100]);
    expect(end.phase).toBe('ended');
  });
});
