/**
 * useGlobeBoundaryMoment: the magnetopause and bow shock for the moment shown (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW30; the owner's pick, 2026-10-25: they
 * follow the moment, as every layer does, D-E).
 *
 * While the timeline is paused and they are on, NOAA's 7 days of propagated wind are read (again after half an hour)
 * and the wind at the bow shock for the moment found (services/spaceWeather/boundaryWind.ts); past the
 * measurements, DONKI's CMEs for the moment too, for one CCMC has reaching the Earth by then, whose sheath pushes
 * the magnetopause in, modelled. The engine draws them for it; back to live, for the latest it reads itself.
 *
 * It says what it draws: whenReady waits for the moment's wind; the moment drawn, for a clip sweeping the timeline;
 * and the notes a card's sources carry (boundaryNotes).
 */
import { useEffect, useRef, useState } from 'react';
import type { GlobeEngine } from '../../../globe-engine/GlobeEngine';
import { fetchWindHistory, type WindMinute } from '../../../services/spaceWeather/heliosphere';
import { donkiCmeUrl, fetchCmes, type Cme } from '../../../services/spaceWeather/donki';
import { boundaryWindAt, type BoundaryWind } from '../../../services/spaceWeather/boundaryWind';
import { computeDynamicPressureNPa } from '../../../services/SpaceWeatherModeling';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { forgetDrawn, noteDrawn } from '../weather/weatherDrawn';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'Globe:BoundaryMoment' });

/** NOAA's 7 days are read again after this: a minute a row, added as they come. */
const HISTORY_FRESH_MS = 30 * 60_000;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the boundaries: false while the moment's wind is being read. */
export function boundaryMomentReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the wind the magnetopause and bow shock stand off from at the moment shown. */
export function boundaryNotes(wind: BoundaryWind): { note: string; noteShort: string } {
  const measured = formatUtcDateTime(wind.measuredAt);
  const pressure = computeDynamicPressureNPa(wind.snapshot.densityPerCm3, wind.snapshot.speedKmPerSec).toFixed(1);
  const from = 'NOAA SWPC\'s propagated solar wind (measured at L1 and carried to the bow shock)';
  const push = wind.pushedBy;
  if (push) {
    return {
      note: `The magnetopause and bow shock are drawn for the last wind in ${from}, at ${measured}, pushed in by the CME CCMC's ENLIL has reaching the Earth at ${formatUtcDateTime(push.arrivedAt)}${push.glancing ? ' (a glancing blow)' : ''}: its sheath modelled, the wind at the CME's drag-based speed at the Earth (${Math.round(push.speed)} km/s) and ${push.compression} times as dense, easing back over the day after; ${pressure} nPa.`,
      noteShort: `Magnetopause pushed in by a CME arriving ${formatUtcDateTime(push.arrivedAt)}: modelled.`,
    };
  }
  if (wind.kind === 'last-measured') {
    return {
      note: `The magnetopause and bow shock are drawn for the last wind in ${from}, at ${measured}, the moment shown being past its measurements; ${pressure} nPa.`,
      noteShort: `Magnetopause: the last wind measured, ${measured}.`,
    };
  }
  if (wind.kind === 'earliest-measured') {
    return {
      note: `The magnetopause and bow shock are drawn for the earliest wind ${from} keeps, at ${measured}: it keeps 7 days, and none for the moment shown; ${pressure} nPa.`,
      noteShort: `Magnetopause: the earliest wind kept, ${measured}; none for the moment.`,
    };
  }
  return {
    note: `The magnetopause and bow shock are drawn for the wind that reached the bow shock at ${measured}, from ${from}; ${pressure} nPa.`,
    noteShort: `Magnetopause: the wind measured at ${measured}.`,
  };
}

export interface BoundaryMomentState {
  /** The wind drawn for the moment; null while live, or until it is read. */
  wind: BoundaryWind | null;
  loading: boolean;
  error: string | null;
}

const NOTHING: BoundaryMomentState = { wind: null, loading: false, error: null };

interface UseGlobeBoundaryMomentOptions {
  engine: GlobeEngine | null;
  /** Whether the magnetopause and bow shock are drawn. */
  active: boolean;
  /** The shared cursor's moment while paused; null while live. */
  moment: number | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function useGlobeBoundaryMoment({ engine, active, moment, fetchImpl, now = Date.now }: UseGlobeBoundaryMomentOptions): BoundaryMomentState {
  const [state, setState] = useState<BoundaryMomentState>(NOTHING);
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const nowRef = useRef(now);
  nowRef.current = now;
  // The reads, shared while on their way: a clip sweeping the timeline moves the moment every frame.
  const history = useRef<{ minutes: Promise<WindMinute[]>; readAt: number } | null>(null);
  const cmesRead = useRef(new Map<string, Promise<Cme[]>>());

  useEffect(() => {
    if (!engine) return undefined;
    if (!active || moment === null) {
      engine.setBoundaryWind(null);
      forgetDrawn('boundaries');
      readiness = { ready: true };
      setState(NOTHING);
      return undefined;
    }
    let cancelled = false;
    readiness = { ready: false, why: 'NOAA\'s solar wind for the moment shown was still being read' };
    setState((s) => ({ ...s, loading: true, error: null }));
    const read = async () => {
      const doFetch = fetchRef.current ?? fetch;
      const at = nowRef.current();
      if (!history.current || at - history.current.readAt > HISTORY_FRESH_MS) {
        const reading = fetchWindHistory(doFetch);
        history.current = { minutes: reading, readAt: at };
        // A read that failed is not kept: the next moment reads again.
        reading.catch(() => { if (history.current?.minutes === reading) history.current = null; });
      }
      const minutes = await history.current.minutes;
      // Past the measurements, the CMEs CCMC has reaching the Earth by then: a model of their sheaths.
      let cmes: Cme[] = [];
      if (minutes.length && moment > minutes[minutes.length - 1].arrive) {
        const url = donkiCmeUrl(moment, at);
        let reading = cmesRead.current.get(url);
        if (!reading) {
          reading = fetchCmes(moment, doFetch, at);
          cmesRead.current.set(url, reading);
        }
        try {
          cmes = await reading;
        } catch (error) {
          cmesRead.current.delete(url);
          log.warn(`DONKI's CMEs could not be read for the magnetopause: ${(error as Error).message}`);
        }
      }
      return boundaryWindAt(minutes, moment, cmes);
    };
    read().then((wind) => {
      if (cancelled) return;
      engine.setBoundaryWind(wind);
      noteDrawn('boundaries', moment);
      readiness = { ready: true };
      setState({ wind, loading: false, error: null });
    }).catch((error: Error) => {
      if (cancelled) return;
      // Drawn for the latest the engine reads, and the card's sources say why.
      log.warn(`NOAA's 7 days of wind could not be read: ${error.message}`);
      engine.setBoundaryWind(null);
      noteDrawn('boundaries', moment);
      readiness = { ready: true };
      setState({ wind: null, loading: false, error: error.message });
    });
    return () => { cancelled = true; };
  }, [engine, active, moment]);

  // Back to the latest when it unmounts.
  useEffect(() => () => {
    engine?.setBoundaryWind(null);
    forgetDrawn('boundaries');
    readiness = { ready: true };
  }, [engine]);

  return state;
}
