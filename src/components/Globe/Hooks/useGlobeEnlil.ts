/**
 * useGlobeEnlil: NOAA's ENLIL model of the solar wind on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW9, SW18).
 *
 * While Space Weather shows it, SWPC's list of ENLIL frames is read (hourly), and the two frames round
 * the moment shown are read off (services/spaceWeather/enlil.ts) and drawn blended, as a glowing disc
 * round the drawn Sun (spaceWeather/enlilDisc.ts), in the quantity chosen. Frames are read one at a
 * time, each once, both its discs, a day of them kept; a frame the moment has already left is not read.
 * The moment is the shared cursor's while paused, now while live, kept moving with the clock each
 * minute; the timeline reaches the run's last frame, days ahead, while it is shown (SW19). Outside the
 * model's run nothing is drawn, and the key says what the run covers.
 *
 * It says what it draws: the key, with the moment, a forecast when ahead; whenReady, which waits for
 * the moment's frames; the moment drawn, for a clip sweeping the timeline (weatherDrawn.ts); and the
 * notes a card's sources carry (enlilNotes): the model's values, read off NOAA's frames.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { fetchEnlilList, framePair, framePixels, readFrame, type EnlilFrame, type EnlilGrids } from '../../../services/spaceWeather/enlil';
import { createEnlilDisc, enlilColour, enlilTexels, type EnlilDisc, type EnlilQuantity } from '../spaceWeather/enlilDisc';
import { eclipticPoleAt, sunEarthBasis } from '../spaceWeather/heliosphereParticles';
import { skyFrame } from '../../../solar-system/bodyPlacement';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { publishForecastReach } from '../../../services/globe/forecastReach';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { registerLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:ENLIL' });

const LEGEND_KEY = 'SpaceWeather:enlil';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** The frame list is read again this often: SWPC runs the model a few times a day. */
const LIST_REFRESH_MS = 60 * 60_000;
/** Frames kept read, the most recently used: a day of them, both discs each, about 5 MB. */
const KEPT_FRAMES = 24;
/** The values the key shows. */
const KEY_STOPS: Record<EnlilQuantity, number[]> = { density: [5, 15, 30, 45, 60], velocity: [300, 450, 600, 800, 1000] };
const WORD: Record<EnlilQuantity, string> = { density: 'density', velocity: 'speed' };

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of ENLIL: false while it is on and the frames for the moment shown have not been read. */
export function enlilReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of ENLIL, for the moment drawn: the model's values, read off NOAA's frames. */
export function enlilNotes(at: number, quantity: EnlilQuantity, forecast: boolean): { note: string; noteShort: string } {
  const what = quantity === 'density' ? 'density (per cm³, scaled by r²)' : 'radial speed (km/s)';
  return {
    note: `The solar wind's ${what} in NOAA's WSA-ENLIL model, ${forecast ? 'its forecast ' : ''}for ${formatUtcDateTime(at)}: read off the frames NOAA SWPC publishes, through their own colour bars, and redrawn. The model's values, not measurements. Drawn at the solar system's compressed distances.`,
    noteShort: `ENLIL: the model's ${forecast ? 'forecast ' : ''}${WORD[quantity]} for ${formatUtcDateTime(at)}, not a measurement.`,
  };
}

const SHAPE_MEANS = 'a disc in the ecliptic round the Sun, out to 1.7 AU, the Earth at its place on it; seen as the camera draws back above the ecliptic';
const hex = (rgb: number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function publishEnlilLegend(at: number, quantity: EnlilQuantity, forecast: boolean): void {
  publishLegend(LEGEND_KEY, {
    layerId: 'SpaceWeather',
    layer: 'ENLIL',
    when: `${forecast ? 'forecast' : 'modelled'} for ${formatUtcDateTime(at)}`,
    shapeMeans: SHAPE_MEANS,
    colorMeans: quantity === 'density'
      ? 'the solar wind\'s density in NOAA\'s WSA-ENLIL model, per cm³ scaled by r²; dim where it is thin'
      : 'the solar wind\'s radial speed in NOAA\'s WSA-ENLIL model; dim where it is slow',
    swatches: KEY_STOPS[quantity].map((v) => ({ color: hex(enlilColour(v, quantity).rgb), label: quantity === 'density' ? `${v} /cm³` : `${v} km/s`, shape: 'glow' as const })),
  });
}

export interface EnlilState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  /** The model run's first and last frames, ms. */
  run: { from: number; until: number } | null;
  /** The moment drawn, and whether it is ahead of now. */
  at: number | null;
  forecast: boolean;
}

const NOTHING: EnlilState = { drawn: false, loading: false, error: null, run: null, at: null, forecast: false };

interface UseGlobeEnlilOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The shared cursor's moment while paused; null while live. */
  moment: number | null;
  /** Toward the Sun as drawn, in the scene's frame. */
  sunDirection: THREE.Vector3;
  quantity: EnlilQuantity;
  fetchImpl?: typeof fetch;
  /** A frame's grids from its address: fetched, decoded and read off, unless given. */
  loadFrame?: (url: string) => Promise<EnlilGrids>;
  now?: () => number;
}

export function useGlobeEnlil({ globeRef, active, moment, sunDirection, quantity, fetchImpl, loadFrame, now = Date.now }: UseGlobeEnlilOptions): EnlilState {
  const [state, setState] = useState<EnlilState>(NOTHING);
  const discRef = useRef<EnlilDisc | null>(null);
  const momentRef = useRef(moment);
  momentRef.current = moment;
  const quantityRef = useRef(quantity);
  quantityRef.current = quantity;
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const loadRef = useRef(loadFrame);
  loadRef.current = loadFrame;
  const nowRef = useRef(now);
  nowRef.current = now;
  const sunRef = useRef(sunDirection);
  sunRef.current = sunDirection;
  /** Set by the effect below while it runs: what to do when the moment or the quantity moves. */
  const moveRef = useRef<(() => void) | null>(null);

  // The moment moved: with the cursor, or, while live, with the clock each minute.
  useEffect(() => { moveRef.current?.(); }, [moment, quantity]);
  useEffect(() => {
    if (!active || moment !== null) return undefined;
    const clock = setInterval(() => moveRef.current?.(), WEATHER_CLOCK_MS);
    return () => clearInterval(clock);
  }, [active, moment]);

  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      forgetDrawn('enlil');
      publishLegend(LEGEND_KEY, null);
      setState(NOTHING);
      return undefined;
    }
    const group = new THREE.Group();
    // Space Weather's, side by side (D-CM), while it stands.
    const untag = registerLayerRoot('SpaceWeather', group);
    group.name = 'enlil';
    const at = () => momentRef.current ?? nowRef.current();
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let listTimer: ReturnType<typeof setInterval> | null = null;
    let frames: EnlilFrame[] | null = null;
    const kept = new Map<string, EnlilGrids>();
    const reading = new Map<string, Promise<EnlilGrids>>();
    /** One frame read at a time, and only while the moment still wants it. */
    let queue: Promise<unknown> = Promise.resolve();
    let wanted = new Set<string>();
    let drawnKey = '';
    let turn = 0;
    readiness = { ready: false, why: 'ENLIL\'s frames were still being listed' };
    setState((s) => ({ ...s, loading: true, error: null }));

    const grids = (frame: EnlilFrame): Promise<EnlilGrids> => {
      const hit = kept.get(frame.url);
      if (hit) {
        kept.delete(frame.url);
        kept.set(frame.url, hit);
        return Promise.resolve(hit);
      }
      const pending = reading.get(frame.url);
      if (pending) return pending;
      const load = loadRef.current ?? (async (url: string) => readFrame(await framePixels(url, fetchRef.current ?? fetch)));
      const next = queue.then(async () => {
        if (!wanted.has(frame.url)) throw new Error('no longer wanted');
        const read = await load(frame.url);
        kept.set(frame.url, read);
        while (kept.size > KEPT_FRAMES) kept.delete(kept.keys().next().value as string);
        return read;
      }).finally(() => reading.delete(frame.url));
      queue = next.catch(() => undefined);
      reading.set(frame.url, next);
      return next;
    };

    const align = () => {
      discRef.current?.setBasis(sunEarthBasis(sunRef.current, eclipticPoleAt(skyFrame(new Date(at())))));
    };

    const show = async () => {
      if (!frames) return;
      const mine = ++turn;
      const moment = at();
      const run = { from: frames[0].at, until: frames[frames.length - 1].at };
      const pair = framePair(frames, moment);
      if (!pair) {
        wanted = new Set();
        if (discRef.current) discRef.current.object.visible = false;
        publishLegend(LEGEND_KEY, {
          layerId: 'SpaceWeather',
          layer: 'ENLIL',
          when: `none for ${formatUtcDateTime(moment)}: the run covers ${formatUtcDateTime(run.from)} to ${formatUtcDateTime(run.until)}`,
          shapeMeans: SHAPE_MEANS,
          colorMeans: 'nothing drawn: the moment shown is outside the model\'s run',
          swatches: [],
        });
        noteDrawn('enlil', moment);
        readiness = { ready: true };
        setState({ drawn: false, loading: false, error: null, run, at: null, forecast: false });
        return;
      }
      wanted = new Set([pair.before.url, pair.after.url]);
      if (!kept.has(pair.before.url) || !kept.has(pair.after.url)) {
        readiness = { ready: false, why: 'ENLIL\'s frames for the moment shown were still being read' };
        setState((s) => ({ ...s, loading: true }));
      }
      try {
        const a = await grids(pair.before);
        const b = await grids(pair.after);
        if (disposed || mine !== turn) return;
        const q = quantityRef.current;
        if (!discRef.current) {
          discRef.current = createEnlilDisc(a.size, q);
          group.add(discRef.current.object);
        }
        const key = `${pair.before.url}|${pair.after.url}|${q}`;
        if (key !== drawnKey) {
          discRef.current.setQuantity(q);
          discRef.current.setFrames(enlilTexels(a[q], q), enlilTexels(b[q], q), pair.mix);
          drawnKey = key;
        } else {
          discRef.current.setMix(pair.mix);
        }
        discRef.current.object.visible = true;
        align();
        const forecast = moment > nowRef.current() + WEATHER_CLOCK_MS;
        publishEnlilLegend(moment, q, forecast);
        // What a clip sweeping the timeline waits on, frame by frame (D-W, step 5c).
        noteDrawn('enlil', moment);
        readiness = { ready: true };
        setState({ drawn: true, loading: false, error: null, run, at: moment, forecast });
      } catch (error) {
        if (disposed || mine !== turn) return;
        const message = (error as Error).message;
        log.warn(`ENLIL's frames could not be read: ${message}`);
        // A card may be cut without them once they have failed: the card's sources say why.
        readiness = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    };

    const list = async () => {
      try {
        const next = await fetchEnlilList(fetchRef.current ?? fetch);
        if (disposed) return;
        frames = next;
        // The timeline reaches the run's last frame while ENLIL is shown (SW19).
        publishForecastReach('enlil', { until: next[next.length - 1].at, by: 'ENLIL' });
        await show();
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn(`ENLIL's frame list could not be read: ${message}`);
        readiness = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    };

    moveRef.current = () => { void show(); };

    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) {
        scene.add(group);
        void list();
        listTimer = setInterval(() => { void list(); }, LIST_REFRESH_MS);
        return;
      }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; ENLIL not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      moveRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (listTimer) clearInterval(listTimer);
      if (discRef.current) { group.remove(discRef.current.object); discRef.current.dispose(); discRef.current = null; }
      untag();
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      publishForecastReach('enlil', null);
      forgetDrawn('enlil');
      readiness = { ready: true };
    };
  }, [active, globeRef]);

  // The frame follows the Sun as drawn, and the sky's turn for the hour shown.
  const hour = Math.floor((moment ?? now()) / 3_600_000);
  useEffect(() => {
    discRef.current?.setBasis(sunEarthBasis(sunDirection, eclipticPoleAt(skyFrame(new Date(hour * 3_600_000)))));
  }, [sunDirection, hour]);

  return state;
}
