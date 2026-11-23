/**
 * useGlobeCmes: coronal mass ejections from NASA DONKI on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW8, SW20–SW23).
 *
 * While Space Weather shows them, DONKI's CMEs that could be in flight at the moment shown are read
 * (the twelve days before it, hourly while live; services/spaceWeather/donki.ts), and those in flight
 * drawn as clouds of plasma at their drag-based fronts (spaceWeather/cmeShells.ts, SW27), each with its flux rope's
 * field lines (spaceWeather/cmeFluxRope.ts, SW28) and, as its front crosses it, the arc of the Earth's orbit inside its
 * cone lit (spaceWeather/cmeOrbitSweep.ts, SW30), round the drawn Sun at the solar system's one scale. The moment is the shared cursor's while paused, now while live,
 * moved each minute; at a moment ahead, the fronts are the model's forecast.
 *
 * It says what it draws: the key, each CME in flight with the speed measured and CCMC's ENLIL arrival
 * at the Earth (SW21), counted down from the moment shown (SW30); whenReady, which waits for the moment's CMEs; the moment drawn, for a clip
 * sweeping the timeline; and the notes a card's sources carry (cmeNotes).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { cmesInFlight, donkiCmeUrl, fetchCmes, type Cme } from '../../../services/spaceWeather/donki';
import { createCmePlasma, cmeColour } from '../spaceWeather/cmeShells';
import { createCmeFluxRope } from '../spaceWeather/cmeFluxRope';
import { createCmeOrbitSweep } from '../spaceWeather/cmeOrbitSweep';
import type { SunEarthBasis } from '../spaceWeather/heliosphereParticles';
import { eclipticPoleAt, sunEarthBasis } from '../spaceWeather/heliosphereParticles';
import { skyFrame } from '../../../solar-system/bodyPlacement';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { registerLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:CMEs' });

const LEGEND_KEY = 'SpaceWeather:cmes';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** DONKI is read again this often while live: analyses and ENLIL runs are added through the day. */
const REFRESH_MS = 60 * 60_000;
/** The key names this many arrivals at the Earth at most, soonest first: a card has room for few. */
const KEYED = 2;
/** The speeds the key shows, the scale's ends as CMEs usually run. */
const SPEED_KEY = [300, 2000];

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the CMEs: false while they are on and the moment's have not been read. */
export function cmesReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** How long until a time still to come, in a countdown's few words. */
function untilWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** Its arrival in the key's few words, counted down from the moment shown; whose it is, the key's colour line says. */
const arrivalWords = (cme: Cme, moment: number): string => {
  const e = cme.earth;
  if (e.kind === 'arrives') return `${e.glancing ? 'glancing, ' : ''}Earth ${formatUtcDateTime(e.at)}, in ${untilWords(e.at - moment)}`;
  if (e.kind === 'misses') return 'misses the Earth';
  return 'not modelled';
};

/** Earth arrivals first, soonest first; then the newest. */
const keyOrder = (a: Cme, b: Cme) => {
  const ta = a.earth.kind === 'arrives' ? a.earth.at : Infinity;
  const tb = b.earth.kind === 'arrives' ? b.earth.at : Infinity;
  return ta !== tb ? ta - tb : b.leftAt - a.leftAt;
};

/** What a card's sources say of the CMEs drawn: how their fronts move, and whose the arrivals are. */
/** Those CCMC's ENLIL has reaching the Earth at or after the moment, soonest first. */
export function arrivalsAhead(inFlight: readonly Cme[], at: number): Cme[] {
  return inFlight.filter((c) => c.earth.kind === 'arrives' && c.earth.at >= at).sort(keyOrder);
}

/** What a card's sources say of the CMEs drawn at a moment: how their fronts move, and whose the arrivals are. */
export function cmeNotes(inFlight: readonly Cme[], at: number): { note: string; noteShort: string } {
  const arriving = arrivalsAhead(inFlight, at);
  const when = (c: Cme) => {
    const e = c.earth as Extract<Cme['earth'], { kind: 'arrives' }>;
    return `${formatUtcDateTime(e.at)} (in ${untilWords(e.at - at)}${e.glancing ? ', a glancing blow' : ''})`;
  };
  // One ENLIL run can carry several CMEs to one arrival: each time once.
  const times = [...new Set(arriving.map(when))];
  const list = arriving.map((c) => `the CME measured at ${formatUtcDateTime(c.leftAt)}, ${when(c)}`).join('; ');
  return {
    note: 'Coronal mass ejections from NASA CCMC\'s DONKI, each the cone model its analysts fit, its front moved out from the speed measured at 21.5 solar radii by the drag-based model (Vršnak et al. 2013, γ 0.2 × 10⁻⁷ per km, the surrounding wind 400 km/s). '
      + `Arrivals at the Earth are CCMC's WSA-ENLIL estimates, and a CME with one is paced to reach the Earth then, its surrounding wind fitted to it${arriving.length ? `: ${list}.` : '; none of those drawn is still to reach the Earth.'} Drawn at the solar system's one scale.`,
    noteShort: arriving.length
      ? `CMEs: drag-based fronts; CCMC's ENLIL: Earth ${times.join(', ')}.`
      : 'CMEs: drag-based fronts; CCMC\'s ENLIL has none still to reach the Earth.',
  };
}

const hex = (rgb: number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const SHAPE_MEANS = 'a cloud of plasma for each CME, its shape modelled (a bright ragged front, a darker cavity, a bright core, a faint shock ahead), moved out by the drag-based model; through it, the lines of its flux rope\'s field, wound from one leg at the Sun to the other, its tilt modelled (laid in the ecliptic); the arc of the Earth\'s orbit inside its cone lit as its front crosses it; brighter when the Earth lies in its cone; seen as the camera draws back to the Sun';

/** A CME as drawn: its plasma, its flux rope, and the arc of the Earth's orbit it sweeps across. */
interface CmeDrawing {
  object: THREE.Group;
  setFront(au: number): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

function createCmeDrawing(cme: Cme): CmeDrawing {
  const sweep = createCmeOrbitSweep(cme);
  const parts = [createCmePlasma(cme), createCmeFluxRope(cme), ...(sweep ? [sweep] : [])];
  const object = new THREE.Group();
  object.name = `cme:${cme.id}`;
  for (const part of parts) object.add(part.object);
  return {
    object,
    setFront(au) { for (const part of parts) part.setFront(au); },
    setBasis(basis) { for (const part of parts) part.setBasis(basis); },
    dispose() { for (const part of parts) part.dispose(); },
  };
}

export interface CmesState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  /** The moment drawn, and the CMEs in flight then. */
  at: number | null;
  inFlight: Cme[];
}

const NOTHING: CmesState = { drawn: false, loading: false, error: null, at: null, inFlight: [] };

interface UseGlobeCmesOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The shared cursor's moment while paused; null while live. */
  moment: number | null;
  /** Toward the Sun as drawn, in the scene's frame. */
  sunDirection: THREE.Vector3;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function useGlobeCmes({ globeRef, active, moment, sunDirection, fetchImpl, now = Date.now }: UseGlobeCmesOptions): CmesState {
  const [state, setState] = useState<CmesState>(NOTHING);
  const momentRef = useRef(moment);
  momentRef.current = moment;
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const nowRef = useRef(now);
  nowRef.current = now;
  const sunRef = useRef(sunDirection);
  sunRef.current = sunDirection;
  const shellsRef = useRef(new Map<string, CmeDrawing>());
  /** Set by the effect below while it runs: what to do when the moment moves. */
  const moveRef = useRef<(() => void) | null>(null);

  useEffect(() => { moveRef.current?.(); }, [moment]);
  useEffect(() => {
    if (!active || moment !== null) return undefined;
    const clock = setInterval(() => moveRef.current?.(), WEATHER_CLOCK_MS);
    return () => clearInterval(clock);
  }, [active, moment]);

  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      forgetDrawn('cmes');
      publishLegend(LEGEND_KEY, null);
      setState(NOTHING);
      return undefined;
    }
    const group = new THREE.Group();
    // Space Weather's, side by side (D-CM), while it stands.
    const untag = registerLayerRoot('SpaceWeather', group);
    group.name = 'cmes';
    const shells = shellsRef.current;
    const at = () => momentRef.current ?? nowRef.current();
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let refresh: ReturnType<typeof setInterval> | null = null;
    /** The CMEs read for each span of days asked, so a moment moving within one is not read again. */
    const read = new Map<string, Cme[]>();
    let turn = 0;

    const basis = () => sunEarthBasis(sunRef.current, eclipticPoleAt(skyFrame(new Date(at()))));

    const draw = (cmes: readonly Cme[], moment: number) => {
      const inFlight = cmesInFlight(cmes, moment);
      const ids = new Set(inFlight.map((f) => f.cme.id));
      for (const [id, shell] of shells) {
        if (ids.has(id)) continue;
        group.remove(shell.object);
        shell.dispose();
        shells.delete(id);
      }
      const b = basis();
      for (const { cme, frontAu } of inFlight) {
        let shell = shells.get(cme.id);
        if (!shell) {
          shell = createCmeDrawing(cme);
          shells.set(cme.id, shell);
          group.add(shell.object);
        }
        shell.setFront(frontAu);
        shell.setBasis(b);
      }
      const ahead = moment > nowRef.current() + WEATHER_CLOCK_MS;
      const flying = inFlight.map((f) => f.cme);
      // One line on a card: the speed scale's ends, and a ring for each arrival still to come by CCMC's ENLIL, each once.
      const arriving = [...new Map(arrivalsAhead(flying, moment).map((c) => [arrivalWords(c, moment), c])).values()].slice(0, KEYED);
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'CMEs',
        when: flying.length ? `${ahead ? 'forecast for' : 'for'} ${formatUtcDateTime(moment)}` : `none in flight at ${formatUtcDateTime(moment)}`,
        shapeMeans: SHAPE_MEANS,
        colorMeans: 'speed near the Sun, pale slow to hot fast; a ring, an arrival at the Earth by CCMC\'s ENLIL',
        swatches: flying.length ? [
          ...SPEED_KEY.map((v) => ({ color: hex(cmeColour(v)), label: `${v} km/s`, shape: 'glow' })),
          ...arriving.map((c) => ({ color: hex(cmeColour(c.speed)), label: arrivalWords(c, moment), shape: 'ring' })),
        ] : [],
      });
      // What a clip sweeping the timeline waits on, frame by frame (D-W, step 5c).
      noteDrawn('cmes', moment);
      readiness = { ready: true };
      setState({ drawn: flying.length > 0, loading: false, error: null, at: moment, inFlight: flying });
    };

    const show = async (again = false) => {
      const mine = ++turn;
      const moment = at();
      const url = donkiCmeUrl(moment, nowRef.current());
      const known = again ? undefined : read.get(url);
      if (known) { draw(known, moment); return; }
      readiness = { ready: false, why: 'DONKI\'s CMEs were still being read' };
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const cmes = await fetchCmes(moment, fetchRef.current ?? fetch, nowRef.current());
        if (disposed) return;
        read.set(url, cmes);
        if (mine !== turn) return;
        draw(cmes, moment);
      } catch (error) {
        if (disposed || mine !== turn) return;
        const message = (error as Error).message;
        log.warn(`DONKI's CMEs could not be read: ${message}`);
        // A card may be cut without them once they have failed: the card's sources say why.
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
        void show();
        refresh = setInterval(() => { if (momentRef.current === null) void show(true); }, REFRESH_MS);
        return;
      }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; CMEs not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    readiness = { ready: false, why: 'DONKI\'s CMEs were still being read' };
    poll();

    return () => {
      disposed = true;
      moveRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (refresh) clearInterval(refresh);
      for (const shell of shells.values()) { group.remove(shell.object); shell.dispose(); }
      shells.clear();
      untag();
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      forgetDrawn('cmes');
      readiness = { ready: true };
    };
  }, [active, globeRef]);

  // The frame follows the Sun as drawn, and the sky's turn for the hour shown.
  const hour = Math.floor((moment ?? now()) / 3_600_000);
  useEffect(() => {
    const b = sunEarthBasis(sunDirection, eclipticPoleAt(skyFrame(new Date(hour * 3_600_000))));
    for (const shell of shellsRef.current.values()) shell.setBasis(b);
  }, [sunDirection, hour]);

  return state;
}
