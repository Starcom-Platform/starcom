/**
 * The briefing tour on the globe (block G, item 6.1; record
 * docs/missions/01-architecture-decisions/briefing-playlists.md).
 *
 * Starting a playlist shows its layers and its moment, waits for its items to be
 * read, plans the tour (briefingPlaylist.ts) and plays it (tourPlayer.ts), a
 * frame at a time, moving the camera as the player says.
 *
 * - A person's hand on the globe pauses it (BP3): OrbitControls fire `start` for
 *   a person and never for code. Resume flies back to the stop it was on.
 * - A card or clip being made pauses it too, and it goes on after (BP11): the
 *   camera never moves under a capture.
 * - Esc, its last stop, or the globe going away ends it, and everything it
 *   changed goes back: the layers, the moment, and the camera to where the
 *   person had it (BP9).
 *
 * Its dependencies are passed in, so it is tested without a globe: Globe.tsx says
 * how a playlist's layers are shown and where its items come from.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { captureUnderWay } from '../../../globe-engine/captureClock';
import { setGlobePointOfView } from '../../../utils/globeCameraMath';
import { PLAYLIST_TITLES, planPlaylist, type Playlist, type PlaylistId, type Pose, type TourOffer } from './briefingPlaylist';
import { TourPlayer, type TourCaption } from './tourPlayer';
import { setTourMarker } from './tourMarker';

/**
 * How long the tour waits for a playlist's layer to finish reading The Record.
 * After it, the tour plays what has arrived, and says so; with nothing arrived it
 * gives up. Raver Watch reads every page of every kind, which can take longer
 * than a person waits, while its items draw as they come.
 */
export const LOAD_WAIT_MS = 20_000;
/** How often the items are looked for while they load. */
const POLL_MS = 250;
/** How long the camera takes to go back to where the person had it. */
const RETURN_MS = 1000;

interface TourControls {
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

/** What the tour needs of the globe: its camera, and its controls to hear a person. */
export interface TourGlobe {
  pointOfView(pov?: Partial<Pose>, ms?: number): Pose;
  controls(): TourControls | undefined;
}

export interface BriefingTourDeps {
  globeRef: RefObject<TourGlobe | null>;
  /** What a playlist's layers offer now, or null while they are off. */
  candidatesFor(id: PlaylistId, nowMs: number): TourOffer | null;
  /** Shows a playlist's layers and moment; returns how to put back what it changed. */
  show(id: PlaylistId): () => void;
  reducedMotion: boolean;
  /** The view is the person's choice now: the first-visit turn stands down. */
  onViewChosen?: () => void;
  /** For tests: the clock, and the frames. */
  now?: () => number;
  requestFrame?: (callback: (t: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export type BriefingTourState = 'off' | 'loading' | 'playing' | 'paused';

export interface BriefingTour {
  state: BriefingTourState;
  playlist: PlaylistId | null;
  caption: TourCaption | null;
  /** Why the last tour did not play, or stopped short; null when it did. */
  notice: string | null;
  start(id: PlaylistId): void;
  pause(): void;
  resume(): void;
  end(): void;
  /** Clears the notice once read. */
  dismissNotice(): void;
  /** Whether it goes round again after its last stop (critique C34), and the switch. */
  loop: boolean;
  setLoop(loop: boolean): void;
}

interface Run {
  id: PlaylistId;
  restore: () => void;
  /** Where the person had the camera. */
  from: Pose;
  player: TourPlayer | null;
  /** What it tours, once its items are read: whose stop a held frame names. */
  plan: Playlist | null;
  frame: number | null;
  poll: ReturnType<typeof setTimeout> | null;
  waitedFrom: number;
  /** Paused by a person, or by a capture under way. */
  personPaused: boolean;
  capturePaused: boolean;
  captionKey: string;
  detach: () => void;
}

const poseOf = (p: Pose): Pose => ({ lat: p.lat, lng: p.lng, altitude: p.altitude });

export function useBriefingTour(deps: BriefingTourDeps): BriefingTour {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [state, setState] = useState<BriefingTourState>('off');
  const [playlist, setPlaylist] = useState<PlaylistId | null>(null);
  const [caption, setCaption] = useState<TourCaption | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loop, setLoopState] = useState(false);
  const loopRef = useRef(loop);
  const run = useRef<Run | null>(null);

  const clock = () => (depsRef.current.now ?? (() => performance.now()))();
  const requestFrame = (cb: (t: number) => void) => (depsRef.current.requestFrame ?? requestAnimationFrame)(cb);
  const cancelFrame = (handle: number) => (depsRef.current.cancelFrame ?? cancelAnimationFrame)(handle);
  const camera = (): Pose | null => {
    const pov = depsRef.current.globeRef.current?.pointOfView();
    return pov ? poseOf(pov) : null;
  };
  const moveCamera = (pose: Pose, ms: number) => {
    const globe = depsRef.current.globeRef.current;
    if (globe) setGlobePointOfView(globe as never, pose, ms);
  };

  const finish = useCallback((why: string | null) => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    if (r.frame !== null) cancelFrame(r.frame);
    if (r.poll !== null) clearTimeout(r.poll);
    r.detach();
    r.restore();
    setTourMarker(null);
    // The camera goes back only when the tour moved it.
    if (r.player) {
      r.player.end();
      moveCamera(r.from, RETURN_MS);
    }
    setState('off');
    setPlaylist(null);
    setCaption(null);
    setNotice(why);
  }, []);

  /** A frame of the tour: the capture rule, the player's pose, its caption. */
  const step = useCallback(() => {
    const r = run.current;
    if (!r?.player) return;
    r.frame = null;
    const now = clock();
    if (captureUnderWay()) {
      if (!r.personPaused && !r.capturePaused) {
        r.player.pause(now);
        r.capturePaused = true;
      }
    } else if (r.capturePaused) {
      r.capturePaused = false;
      const at = camera();
      if (at) r.player.resume(now, at);
    }
    const frame = r.player.tick(now);
    if (frame.phase === 'ended') {
      finish(null);
      return;
    }
    if (frame.pose) moveCamera(frame.pose, 0);
    // The item a stop holds, for the globe to draw the eye to (C34).
    const held = frame.held ? r.plan?.stops[frame.held.stop] : undefined;
    setTourMarker(held && frame.held ? { ...held.candidate.position, heldForMs: frame.held.forMs } : null);
    const key = frame.caption ? `${frame.caption.progress}|${frame.caption.title}` : '';
    if (key !== r.captionKey) {
      r.captionKey = key;
      setCaption(frame.caption);
    }
    r.frame = requestFrame(step);
  }, [finish]);

  /** Until the playlist's items are read: then the tour, or why there is none. */
  const waitForItems = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.poll = null;
    const title = PLAYLIST_TITLES[r.id];
    const offer = depsRef.current.candidatesFor(r.id, Date.now());
    const waited = clock() - r.waitedFrom > LOAD_WAIT_MS;
    if (!offer?.complete && !waited) {
      r.poll = setTimeout(waitForItems, POLL_MS);
      return;
    }
    // Past the wait, what has arrived is toured; nothing arrived is a layer that did not load.
    if (!offer || (!offer.complete && offer.candidates.length === 0)) {
      finish(`${title} did not load in time: its layer is still reading The Record. Try again in a moment.`);
      return;
    }
    const plan = planPlaylist(r.id, offer.candidates, { partial: !offer.complete });
    if (!plan) {
      finish(`${title} has nothing to tour right now.`);
      return;
    }
    r.plan = plan;
    r.player = new TourPlayer(plan, { reducedMotion: depsRef.current.reducedMotion, loop: loopRef.current });
    r.player.start(clock(), camera() ?? r.from);
    setState('playing');
    r.frame = requestFrame(step);
  }, [finish, step]);

  const pause = useCallback(() => {
    const r = run.current;
    if (!r?.player || r.personPaused) return;
    r.personPaused = true;
    r.player.pause(clock());
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    const r = run.current;
    if (!r?.player || !r.personPaused) return;
    r.personPaused = false;
    if (!r.capturePaused) r.player.resume(clock(), camera() ?? r.from);
    setState('playing');
  }, []);

  const end = useCallback(() => finish(null), [finish]);

  const start = useCallback((id: PlaylistId) => {
    finish(null);
    const from = camera();
    if (!from) {
      setNotice('The globe has not finished starting: try again in a moment.');
      return;
    }
    depsRef.current.onViewChosen?.();
    const restore = depsRef.current.show(id);
    const controls = depsRef.current.globeRef.current?.controls();
    const onTouch = () => pause();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(null); };
    controls?.addEventListener('start', onTouch);
    window.addEventListener('keydown', onKey);
    run.current = {
      id, restore, from, player: null, plan: null, frame: null, poll: null, waitedFrom: clock(),
      personPaused: false, capturePaused: false, captionKey: '',
      detach: () => {
        controls?.removeEventListener('start', onTouch);
        window.removeEventListener('keydown', onKey);
      },
    };
    setPlaylist(id);
    setNotice(null);
    setState('loading');
    waitForItems();
  }, [finish, pause, waitForItems]);

  // The globe going away mid-tour puts everything back.
  useEffect(() => () => finish(null), [finish]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const setLoop = useCallback((next: boolean) => {
    loopRef.current = next;
    setLoopState(next);
    run.current?.player?.setLoop(next);
  }, []);

  return { state, playlist, caption, notice, start, pause, resume, end, dismissNotice, loop, setLoop };
}
