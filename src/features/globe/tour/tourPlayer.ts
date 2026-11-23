/**
 * The briefing tour's player (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP3, BP4, BP8–BP10).
 *
 * A schedule of flights and holds on a clock, and nothing else: each tick says
 * where the camera should be, if anywhere, and what the caption says. The caller
 * moves the camera (useBriefingTour), so this is tested on a fake clock.
 *
 * - It opens on the whole planet, held a moment, then flies to each stop and
 *   holds it for its reading time (briefingPlaylist.ts).
 * - A flight's pose is given every tick; a hold's only on its first, to land
 *   exactly, and then the camera is left alone.
 * - Paused, it gives no pose and keeps the caption. Resumed, it flies from
 *   wherever the person left the camera back to the stop it was on, holds it
 *   afresh, and goes on: a person who looked away does not miss what they paused on.
 * - With reduced motion every flight is a cut, and holds are as long.
 * - Looping (critique C34), it goes from its last stop back to the opening and round again, until ended.
 * - Holding a stop, it says which and for how long, so the stop's item can be pinged (C34).
 */
import { buildCameraTrack, type CameraTrack } from '../capture/cameraTrack';
import { FLIGHT_MS, PLAYLIST_ORDER, flightKeyframes, type Playlist, type Pose } from './briefingPlaylist';

/** How long the whole planet is held before the first stop (IM9). */
export const OPENING_HOLD_MS = 3000;

export type TourPhase = 'idle' | 'flying' | 'holding' | 'paused' | 'ended';

/** What the caption says at a moment of the tour. */
export interface TourCaption {
  /** The playlist's name. */
  playlist: string;
  /** "3 of 12", and how many there were in all when the tour shows fewer. Empty at the opening. */
  progress: string;
  title: string;
  /** Why it is shown. */
  why: string;
  lines: readonly string[];
  /** Its lines, by index, a caption burned into a clip never cuts: a field mission's safety limits (HW13). */
  neverCut?: readonly number[];
}

export interface TourFrame {
  phase: TourPhase;
  /** Where to put the camera now, or null to leave it. */
  pose: Pose | null;
  caption: TourCaption | null;
  /** While a stop (not the opening) is held: which, and for how long so far, in ms. */
  held?: { stop: number; forMs: number };
}

/** The opening is stop -1. */
const OPENING = -1;

interface Segment {
  kind: 'fly' | 'hold';
  stop: number;
  startMs: number;
  durMs: number;
  pose: Pose;
  track?: CameraTrack;
}

export class TourPlayer {
  private segments: Segment[] = [];
  private startedAt = 0;
  private state: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private current: Segment | null = null;
  private readonly landed = new Set<Segment>();

  private loop: boolean;

  constructor(private readonly playlist: Playlist, private readonly options: { reducedMotion: boolean; loop?: boolean }) {
    this.loop = options.loop ?? false;
  }

  /** Round again after the last stop, or end there: a person may change it while the tour runs (C34). */
  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /** From where the camera is now. */
  start(nowMs: number, from: Pose): void {
    if (this.state !== 'idle') return;
    this.plan(OPENING, from, nowMs);
    this.state = 'running';
  }

  pause(_nowMs: number): void {
    if (this.state === 'running') this.state = 'paused';
  }

  /** From wherever the camera is now: back to the stop it was on, held afresh. */
  resume(nowMs: number, from: Pose): void {
    if (this.state !== 'paused') return;
    this.plan(this.current?.stop ?? OPENING, from, nowMs);
    this.state = 'running';
  }

  end(): void {
    this.state = 'ended';
  }

  get ended(): boolean {
    return this.state === 'ended';
  }

  tick(nowMs: number): TourFrame {
    if (this.state === 'ended') return { phase: 'ended', pose: null, caption: null };
    if (this.state === 'idle') return { phase: 'idle', pose: null, caption: null };
    if (this.state === 'paused') return { phase: 'paused', pose: null, caption: this.captionOf(this.current?.stop ?? OPENING) };
    const elapsed = nowMs - this.startedAt;
    const segment = this.segments.find((s) => elapsed >= s.startMs && elapsed < s.startMs + s.durMs);
    if (!segment) {
      const last = this.segments[this.segments.length - 1];
      if (this.loop && last && this.playlist.stops.length > 0) {
        // Back to the whole planet and round again, from where the last stop held.
        this.plan(OPENING, last.pose, nowMs);
        return this.tick(nowMs);
      }
      this.state = 'ended';
      return { phase: 'ended', pose: null, caption: null };
    }
    this.current = segment;
    const caption = this.captionOf(segment.stop);
    if (segment.kind === 'fly') {
      const at = segment.track!.at(elapsed - segment.startMs);
      return { phase: 'flying', pose: { lat: at.lat, lng: at.lng, altitude: at.altitude }, caption };
    }
    const held = segment.stop === OPENING ? {} : { held: { stop: segment.stop, forMs: elapsed - segment.startMs } };
    if (this.landed.has(segment)) return { phase: 'holding', pose: null, caption, ...held };
    this.landed.add(segment);
    return { phase: 'holding', pose: segment.pose, caption, ...held };
  }

  /** Every flight and hold from `stop` on, starting from `from` at `nowMs`. */
  private plan(stop: number, from: Pose, nowMs: number): void {
    const flightMs = this.options.reducedMotion ? 0 : FLIGHT_MS;
    const segments: Segment[] = [];
    let t = 0;
    let previous = from;
    for (let s = stop; s < this.playlist.stops.length; s++) {
      const pose = s === OPENING ? this.playlist.opening : this.playlist.stops[s].pose;
      if (flightMs > 0) {
        segments.push({ kind: 'fly', stop: s, startMs: t, durMs: flightMs, pose, track: buildCameraTrack(flightKeyframes(previous, pose, flightMs)) });
        t += flightMs;
      }
      const holdMs = s === OPENING ? OPENING_HOLD_MS : this.playlist.stops[s].holdMs;
      segments.push({ kind: 'hold', stop: s, startMs: t, durMs: holdMs, pose });
      t += holdMs;
      previous = pose;
    }
    this.segments = segments;
    this.startedAt = nowMs;
    this.landed.clear();
  }

  private captionOf(stop: number): TourCaption {
    return tourCaption(this.playlist, stop);
  }
}

/**
 * What the caption says at a stop of a playlist, -1 for the opening: the screen's,
 * and a clip's burned into its frames (BP4, BP15).
 */
export function tourCaption(playlist: Playlist, stop: number): TourCaption {
  const shown = playlist.stops.length;
  if (stop === OPENING) {
    const { order, worstFirst } = PLAYLIST_ORDER[playlist.id];
    const stops = `${shown} ${shown === 1 ? 'stop' : 'stops'}`;
    return {
      playlist: playlist.title,
      progress: '',
      title: playlist.title,
      why: (worstFirst
        ? (playlist.total > shown ? `The worst ${shown} of ${playlist.total}, ${order}` : `${stops}, ${order}`)
        : `${playlist.total > shown ? `${shown} of ${playlist.total}` : stops}: ${order}`)
        + (playlist.partial ? '. Still reading The Record: this tours what had arrived' : ''),
      lines: [],
    };
  }
  const { candidate } = playlist.stops[stop];
  return {
    playlist: playlist.title,
    progress: `${stop + 1} of ${shown}${playlist.total > shown ? ` · ${playlist.total} in all` : ''}`,
    title: candidate.title,
    why: candidate.why,
    lines: candidate.lines,
    ...(candidate.neverCut ? { neverCut: candidate.neverCut } : {}),
  };
}
