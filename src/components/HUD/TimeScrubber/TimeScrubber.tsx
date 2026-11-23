import React, { useState, useCallback, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import { useTimelineData } from '../../../core/intel';
import { timelineSpan } from '../../../core/intel/utils/timelineSummary';
import { lastDayTo, useClockNow, useTemporalStateOptional } from '../../../context/TemporalContext';
import styles from './TimeScrubber.module.css';
import { formatUtcDate, formatUtcDateTime, localTimeTitle } from '../../../utils/utcTime';
import { getBriefCalendar, subscribeBriefCalendar } from '../../../services/warConflict/briefCalendar';
import { getForecastReach, subscribeForecastReach } from '../../../services/globe/forecastReach';
import { useGlobeLayerControlOptional } from '../../Globe/Hooks/useGlobeLayerControl';
import { DensityStrip } from './DensityStrip';
import { DATA_SCALES, KIND_COLOURS } from '../../../styles/tokens';
import { useMissionWindowMark } from '../../../features/psi/missionWindowMark';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatCount } from '@utils/formatCount';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getEcoHistory, subscribeEcoHistory } from '../../../features/globe/timebar/ecoHistoryOnBar';
import {
  DECAY_CHOICES_S, onPlayRequest, setReplayDecayS, stepPlayClock, stopPlayClock, useReplayDecayS,
} from '../../../features/globe/timebar/playClock';
import {
  HISTORY_UNITS, historyStart, historyWindowContaining, historyWindowWords, RANGE_PRESETS, setTimebarHistory, setTimebarRange,
  useTimebarHistory, useTimebarRange, yearWords, type RangePresetId,
} from '../../../features/globe/timebar/timebarRange';

/*
 * The one time bar's range and playback (critique-2026-11-01, OR4, OR17; plan C1). The axis spans the data, as it
 * did (decision D-E), or a preset ending now; playing moves the paused window forward at a rate, and reaching now
 * returns to live.
 */
// The range is shared (timebarRange.ts): a layer that reads by the window shown follows it (D-EQ, EQ14).
export { RANGE_PRESETS, type RangePresetId } from '../../../features/globe/timebar/timebarRange';

/** How fast playing moves the window: the time shown per second. */
export const PLAY_RATES = [
  { id: '1h', label: '1 h/s', msPerSecond: 3_600_000 },
  { id: '6h', label: '6 h/s', msPerSecond: 6 * 3_600_000 },
  { id: '1d', label: '1 d/s', msPerSecond: 86_400_000 },
  // History's own (D-EQ, EQ15), shown only while it is the range: a month, a year a second.
  { id: '1mo', label: '1 mo/s', msPerSecond: 30 * 86_400_000 },
  { id: '1yr', label: '1 y/s', msPerSecond: 365 * 86_400_000 },
] as const;
const HISTORY_RATES = new Set<string>(['1mo', '1yr']);
const PLAY_TICK_MS = 500;
/** The most wall time one step of play counts: two steps' worth. */
export const PLAY_STEP_MAX_MS = 2 * PLAY_TICK_MS;

const DAY_MS = 86_400_000;

/** Shared empties, so an absent timeline keeps a stable identity across renders. */
const NO_EVENTS: Array<{ startTime: Date | string }> = [];

interface TimeScrubberProps {
  currentTime?: number;
  isLive?: boolean;
  onTimeChange?: (time: number) => void;
  onToggleLive?: (isLive: boolean) => void;
}

/**
 * TimeScrubber — Temporal navigation control for the CyberCommand HUD.
 * 
 * Displays a timeline slider spanning the date range of loaded intel events.
 * Scrubbing updates the shared TemporalContext so every time-aware service
 * (CyberCommandDataService, IntelReportVisualizationService, timelineAdapter)
 * can filter by the operator's current temporal position.
 *
 * When LIVE, currentTime tracks Date.now() and services show all data.
 * When PAUSED/scrubbing, the temporal context provides a time window
 * that downstream services use to filter their output.
 */
const TimeScrubber: React.FC<TimeScrubberProps> = ({
  currentTime: externalTime,
  isLive: externalIsLive,
  onTimeChange: externalOnTimeChange,
  onToggleLive: externalOnToggleLive,
}) => {
  const { timelineData } = useTimelineData();
  const items = timelineData?.items;
  /**
   * A stable reference when there is nothing to show. `items ?? []` allocated a
   * new array on every render, so the memo below recomputed on every render —
   * and its empty branch reads the clock, so it produced a DIFFERENT range each
   * time, which the effect published, which re-rendered, without end.
   */
  const events = useMemo(() => items ?? NO_EVENTS, [items]);
  const temporalCtx = useTemporalStateOptional();
  const layerControl = useGlobeLayerControlOptional();
  const catalogueLayers = layerControl?.layers;
  const catalogue = useMemo(() => catalogueLayers?.map((l) => ({ id: l.id, label: l.label })) ?? null, [catalogueLayers]);
  const preset = useTimebarRange();
  const choosePreset = (id: RangePresetId) => setTimebarRange(id);
  // History (D-EQ, EQ15): its axis from 1900 or 2150 BC, a moment on it choosing the decade, year or month round it.
  const historyChoice = useTimebarHistory();
  const inHistory = preset === 'history';
  // Quakes drawn: play's decay is theirs (D-EQ, EQ17), offered beside the rates while they are.
  const quakesDrawn = catalogueLayers?.some((l) => l.id === 'EcologicalDisasters' && l.isActive) ?? false;
  const decayS = useReplayDecayS();

  /**
   * Fixed at mount, so the placeholder axis does not slide while the component
   * is on screen and cannot drive a render loop.
   */
  const mountedAt = useRef(Date.now()).current;

  // Derive date range from loaded events
  const { rangeStart: dataStart, rangeEnd: dataEnd, hasEvents } = useMemo(() => {
    const placeholder = {
      rangeStart: mountedAt - 60 * 86400000,
      rangeEnd: mountedAt,
      hasEvents: false,
    };
    if (!events || events.length === 0) return placeholder;
    // The span every view of the timeline shows for these events, so the scrubber
    // covers the same dates as the timeline. It padded by at least a day, the
    // timeline by at least an hour (decision D-E).
    const span = timelineSpan(events);
    if (!span) return placeholder;
    return {
      rangeStart: span.start,
      rangeEnd: span.end,
      hasEvents: true,
    };
  }, [events, mountedAt]);

  /**
   * Publish the bounds only when events actually define them.
   *
   * With no events the range above is a placeholder for drawing an empty axis;
   * announcing it as the data range told every time-aware service that the
   * intel spans the last sixty days when it spans nothing at all.
   */
  useEffect(() => {
    if (temporalCtx && hasEvents) {
      temporalCtx.setDataRange(dataStart, dataEnd);
    }
  }, [temporalCtx, hasEvents, dataStart, dataEnd]);

  /**
   * Live mode and position come from the shared cursor (decision D-E).
   *
   * The scrubber kept its own isLive and time and ticked its own clock, so a pause
   * from the timeline, or a paused cursor restored on reload, left it saying LIVE
   * while the rest of the app was paused. Its own state is now only the fallback
   * for rendering without a TemporalProvider.
   */
  const now = useClockNow();
  const [fallbackIsLive, setFallbackIsLive] = useState(true);
  const [fallbackTime, setFallbackTime] = useState<number | null>(null);

  const isLive = externalIsLive ?? temporalCtx?.isLive ?? fallbackIsLive;
  const currentTime = externalTime ?? (isLive ? now : temporalCtx?.currentTime ?? fallbackTime ?? now);

  /*
   * Ahead of now, while a layer that forecasts is shown (space-weather-visualization.md, SW19): the
   * axis runs on to its last moment, the part past now marked as forecast. The intel's range, published
   * above, stays the intel's: the timeline's steps are taken from it (D-E).
   */
  const reach = useSyncExternalStore(subscribeForecastReach, getForecastReach, getForecastReach);
  const ahead = reach && reach.until > now ? reach : null;
  const presetMs = RANGE_PRESETS.find((p) => p.id === preset)?.ms ?? null;
  // A preset spans the time up to now (and on to a forecast's end); All spans the data, as it did.
  // A psi mission's window while it is open (decision D-PW, PW92): the axis reaches it, either way, outside history.
  const missionMark = useMissionWindowMark();
  const mark = missionMark && !inHistory ? missionMark : null;
  const { m: words } = useMessages();
  const rangeEnd = Math.max(
    inHistory ? now : presetMs !== null ? Math.max(now, ahead?.until ?? now) : ahead ? Math.max(dataEnd, ahead.until) : dataEnd,
    mark?.untilMs ?? -Infinity,
  );
  const rangeStart = Math.min(
    inHistory ? historyStart(historyChoice.span) : presetMs !== null ? now - presetMs : dataStart,
    mark?.fromMs ?? Infinity,
  );
  const forecastLeft = ahead ? ((Math.max(now, rangeStart) - rangeStart) / (rangeEnd - rangeStart)) * 100 : null;

  // Slider position (0-1000 for smooth scrubbing)
  const sliderValue = useMemo(() => {
    const range = rangeEnd - rangeStart;
    if (range <= 0) return 1000;
    return Math.round(((currentTime - rangeStart) / range) * 1000);
  }, [currentTime, rangeStart, rangeEnd]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    const range = rangeEnd - rangeStart;
    const newTime = rangeStart + (value / 1000) * range;

    // Scrubbing leaves live mode; setting the shared cursor does both. From live, the bar opens the last day up to
    // the moment dragged to (OR27), as pausing does.
    if (isLive) externalOnToggleLive?.(false);
    externalOnTimeChange?.(newTime);
    if (temporalCtx && inHistory) {
      const stretch = historyWindowContaining(newTime, historyChoice.unit);
      temporalCtx.setTimeWindow(stretch.start, Math.min(stretch.end, Date.now()), newTime);
    } else if (temporalCtx) {
      if (isLive) {
        const day = lastDayTo(newTime);
        temporalCtx.setTimeWindow(day.start, day.end, newTime);
      } else temporalCtx.setCurrentTime(newTime);
    } else {
      setFallbackIsLive(false);
      setFallbackTime(newTime);
    }
  }, [rangeStart, rangeEnd, isLive, externalOnTimeChange, externalOnToggleLive, temporalCtx, inHistory, historyChoice.unit]);

  /**
   * While paused, the selected window's two ends as slider values (decision D-E).
   * Pulling either handle selects a new window; the band between them is what the
   * globe and the badge show.
   */
  const selection = !isLive && temporalCtx?.timeWindow
    ? { start: temporalCtx.timeWindow.start.getTime(), end: temporalCtx.timeWindow.end.getTime() }
    : null;
  const toSlider = (t: number) => {
    const range = rangeEnd - rangeStart;
    return range <= 0 ? 1000 : Math.min(1000, Math.max(0, Math.round(((t - rangeStart) / range) * 1000)));
  };
  const fromSlider = (value: number) => rangeStart + (value / 1000) * (rangeEnd - rangeStart);
  const handleWindowEdge = (edge: 'start' | 'end') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!temporalCtx || !selection) return;
    // Keep the ends at least one slider step apart, so a window never collapses into a moment.
    const unit = Math.max(1, (rangeEnd - rangeStart) / 1000);
    const t = fromSlider(Number(e.target.value));
    if (edge === 'start') temporalCtx.setTimeWindow(Math.min(t, selection.end - unit), selection.end);
    else temporalCtx.setTimeWindow(selection.start, Math.max(t, selection.start + unit));
  };

  const handleToggleLive = useCallback(() => {
    const newLive = !isLive;
    externalOnToggleLive?.(newLive);
    if (temporalCtx) {
      // Pausing stops at this moment; resuming returns to now. Resuming used to
      // call setCurrentTime after setIsLive(true), which left live mode again at once.
      temporalCtx.setIsLive(newLive);
    } else {
      setFallbackIsLive(newLive);
      setFallbackTime(newLive ? null : Date.now());
    }
  }, [isLive, externalOnToggleLive, temporalCtx]);

  /*
   * Playing (OR17): the paused window moves forward at the rate chosen, two steps a second; from live, it starts at the
   * axis's start with the last day's length. Reaching now returns to live, and stops.
   */
  const [playing, setPlaying] = useState(false);
  // Play and Stop from the command palette (D-CP), as this bar's own button.
  useEffect(() => onPlayRequest(setPlaying), []);
  const [rateId, setRateId] = useState<(typeof PLAY_RATES)[number]['id']>('1h');
  // History plays at a year a second, the other ranges at an hour, unless one of the range's own rates is chosen.
  useEffect(() => {
    if (HISTORY_RATES.has(rateId) !== inHistory) setRateId(inHistory ? '1yr' : '1h');
  }, [inHistory, rateId]);
  const playRef = useRef({ temporalCtx, rangeStart, rateId });
  playRef.current = { temporalCtx, rangeStart, rateId };
  useEffect(() => {
    if (!playing) return undefined;
    const { temporalCtx: t0, rangeStart: from } = playRef.current;
    // The window as play starts, moved on by the play itself, not read back each step: the shared cursor renders
    // after the step that set it, and a step that read it again would move from where it was.
    const w0 = t0 && !t0.isLive && t0.timeWindow ? { start: t0.timeWindow.start.getTime(), end: t0.timeWindow.end.getTime() } : null;
    const length = w0 ? w0.end - w0.start : 86_400_000;
    let end = w0 ? w0.end : from + length;
    let last = Date.now();
    const rateOf = (id: string) => PLAY_RATES.find((r) => r.id === id)?.msPerSecond ?? 3_600_000;
    // The play clock the quakes draw from, carried on between steps (D-EQ, EQ7): stepped with the window.
    stepPlayClock(end, rateOf(playRef.current.rateId), last);
    const timer = setInterval(() => {
      const { temporalCtx: t, rateId: id } = playRef.current;
      if (!t) { setPlaying(false); return; }
      const nowMs = Date.now();
      // At most two steps' time a step: a page held up (loading, a hidden tab) pauses play rather than jumping it on,
      // which would skip every quake in between unseen (D-EQ, EQ7).
      end += (Math.min(nowMs - last, PLAY_STEP_MAX_MS) / 1000) * rateOf(id);
      last = nowMs;
      if (end >= nowMs) { t.setIsLive(true); setPlaying(false); return; }
      stepPlayClock(end, rateOf(id), nowMs);
      t.setTimeWindow(end - length, end, end);
    }, PLAY_TICK_MS);
    return () => { clearInterval(timer); stopPlayClock(); };
  }, [playing]);

  /*
   * On a phone the bar is slim (OR28): the Live pill, the clock, the strip and the handles; "More" shows the presets
   * and play. How far its top stands above the screen's foot is published (--timebar-clearance), so the inspector's
   * sheet sits just above it: on a phone the bar itself stands above the bottom navigation, so its height alone was
   * not enough, and the sheet covered it.
   */
  const [expanded, setExpanded] = useState(false);
  // How many timed items the drawn layers hold in the range: the strip counts them (OR25).
  const [drawnCount, setDrawnCount] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--timebar-clearance', `${Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top))}px`);
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    window.addEventListener('resize', publish);
    return () => { observer.disconnect(); window.removeEventListener('resize', publish); root.style.removeProperty('--timebar-clearance'); };
  }, []);

  // Eco Disasters' captured snapshots, while it is drawn (plan C2): a tick each, and a step to the one before and after.
  const ecoHistory = useSyncExternalStore(subscribeEcoHistory, getEcoHistory, getEcoHistory);
  const ecoTicks = useMemo(() => {
    const range = rangeEnd - rangeStart;
    if (!ecoHistory || range <= 0) return [];
    return ecoHistory.times.filter((t) => t >= rangeStart && t <= rangeEnd).map((t) => ((t - rangeStart) / range) * 100);
  }, [ecoHistory, rangeStart, rangeEnd]);

  const eventCount = events.length;

  /*
   * The War & Conflict Brief's days (theatre-lens.md, TL8), while the globe publishes
   * them: a block a day at its place on the axis, in its worst war's colour; a click
   * picks the day, and so shows it (TL4).
   */
  const briefCalendar = useSyncExternalStore(subscribeBriefCalendar, getBriefCalendar, getBriefCalendar);
  const briefDays = useMemo(() => {
    const range = rangeEnd - rangeStart;
    if (!briefCalendar || range <= 0) return [];
    // Oldest first, as the axis runs, so a keyboard steps through them left to right.
    return [...briefCalendar.days].sort((a, b) => (a.day < b.day ? -1 : 1)).flatMap((d) => {
      const start = Date.parse(`${d.day}T00:00:00Z`);
      if (start + DAY_MS <= rangeStart || start >= rangeEnd) return [];
      // Cut at the axis's ends: today's runs past now, where the axis stops.
      const from = Math.max(start, rangeStart);
      const to = Math.min(start + DAY_MS, rangeEnd);
      return [{ ...d, left: ((from - rangeStart) / range) * 100, width: ((to - from) / range) * 100 }];
    });
  }, [briefCalendar, rangeStart, rangeEnd]);

  return (
    <div className={styles.timeScrubber} ref={rootRef} data-expanded={expanded ? 'true' : 'false'} data-testid="timebar">
      <div className={styles.header}>
        <span className={styles.label}>TEMPORAL NAV</span>
        <span className={styles.eventCount} data-testid="timebar-drawn">{drawnCount === null ? `${eventCount} events` : `${formatCount(drawnCount)} drawn`}</span>
        <span className={styles.currentDate} title={localTimeTitle(currentTime)} data-testid="timebar-clock">
          {inHistory && selection
            ? historyWindowWords(selection, historyChoice.unit)
            : formatUtcDateTime(currentTime, { year: new Date(currentTime).getUTCFullYear() !== new Date(now).getUTCFullYear() })}
        </span>
        <button type="button" className={`${styles.preset} ${styles.more}`} aria-expanded={expanded} onClick={() => setExpanded((on) => !on)}
          data-testid="timebar-more">{expanded ? 'Less' : 'More'}</button>
        <span className={styles.presets} role="group" aria-label="Range shown">
          {RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button" className={styles.preset} aria-pressed={preset === p.id} onClick={() => choosePreset(p.id)}
              data-testid={`timebar-range-${p.id}`}>{p.label}</button>
          ))}
        </span>
        {inHistory && (
          <span className={styles.presets} role="group" aria-label="History" data-testid="timebar-history">
            <button type="button" className={styles.preset} aria-pressed={historyChoice.span === '1900'} onClick={() => setTimebarHistory({ span: '1900' })}
              title="From 1900: USGS's catalogue, magnitude 5 and over" data-testid="timebar-history-1900">Since 1900</button>
            <button type="button" className={styles.preset} aria-pressed={historyChoice.span === 'atlas'} onClick={() => setTimebarHistory({ span: 'atlas' })}
              title="From 2150 BC: NOAA's atlas of significant quakes" data-testid="timebar-history-atlas">Since 2150 BC</button>
            {HISTORY_UNITS.map((unit) => (
              <button key={unit} type="button" className={styles.preset} aria-pressed={historyChoice.unit === unit} onClick={() => setTimebarHistory({ unit })}
                title={`A moment chosen selects its ${unit}`} data-testid={`timebar-history-${unit}`}>{unit[0].toUpperCase() + unit.slice(1)}</button>
            ))}
          </span>
        )}
        {ecoHistory && (
          <span className={styles.play} role="group" aria-label="Eco Disasters' captured history" data-testid="timebar-eco">
            <button type="button" className={styles.preset} onClick={() => ecoHistory.stepToPrevious()} title="The snapshot before" aria-label="Eco snapshot before"><ChevronLeft size={12} aria-hidden="true" /></button>
            <span className={styles.ecoSpan}>{ecoHistory.spanLabel ?? 'Eco history'}</span>
            <button type="button" className={styles.preset} onClick={() => ecoHistory.stepToNext()} title="The snapshot after" aria-label="Eco snapshot after"><ChevronRight size={12} aria-hidden="true" /></button>
          </span>
        )}
        <span className={styles.play} role="group" aria-label="Play">
          <button type="button" className={styles.preset} aria-pressed={playing} onClick={() => setPlaying((on) => !on)} data-testid="timebar-play"
            title={playing ? 'Stop' : 'Play the window forward'}>{playing ? 'Stop' : 'Play'}</button>
          {PLAY_RATES.filter((r) => HISTORY_RATES.has(r.id) === inHistory).map((r) => (
            <button key={r.id} type="button" className={styles.preset} aria-pressed={rateId === r.id} onClick={() => setRateId(r.id)}
              data-testid={`timebar-rate-${r.id}`}>{r.label}</button>
          ))}
        </span>
        {quakesDrawn && (
          <span className={styles.play} role="group" aria-label="Decay" data-testid="timebar-decay">
            <span className={styles.ecoSpan}>Decay</span>
            {DECAY_CHOICES_S.map((d) => (
              <button key={d} type="button" className={styles.preset} aria-pressed={decayS === d} onClick={() => setReplayDecayS(d)}
                title={`On play, each quake fades over ${d} s`} data-testid={`timebar-decay-${d}`}>{`${d} s`}</button>
            ))}
          </span>
        )}
      </div>
      <div className={styles.scrubberTrack}>
        <span className={styles.rangeLabel} title={localTimeTitle(rangeStart)}>
          {inHistory ? yearWords(new Date(rangeStart).getUTCFullYear()) : formatUtcDate(rangeStart)}
        </span>
        <div className={styles.sliderContainer}>
          {ahead && forecastLeft !== null && (
            <div
              className={styles.forecastZone}
              data-testid="scrubber-forecast"
              style={{ left: `${forecastLeft}%` }}
              title={`Forecast ahead: ${ahead.by}, to ${formatUtcDateTime(ahead.until)}`}
            />
          )}
          {/* The open psi mission's window, its peak marked (PW92). */}
          {mark && rangeEnd > rangeStart ? (() => {
            const pct = (t: number) => ((t - rangeStart) / (rangeEnd - rangeStart)) * 100;
            return (
              <div
                className={styles.missionBand}
                data-testid="scrubber-mission-window"
                style={{ left: `${pct(mark.fromMs)}%`, width: `${Math.max(0.4, pct(mark.untilMs) - pct(mark.fromMs))}%` }}
                role="img"
                aria-label={fill(words.psiWatch.missions.band, {
                  title: mark.title, from: formatUtcDateTime(mark.fromMs), until: formatUtcDateTime(mark.untilMs), peak: formatUtcDateTime(mark.peakMs),
                })}
              >
                <span className={styles.missionFill} style={{ background: DATA_SCALES.psiWatch }} />
                <span
                  className={styles.missionPeak}
                  style={{ left: `${((mark.peakMs - mark.fromMs) / Math.max(1, mark.untilMs - mark.fromMs)) * 100}%`, background: DATA_SCALES.psiWatch }}
                />
              </div>
            );
          })() : null}
          {/* What the drawn layers hold at each moment, in their kind colours (OR17, OR25). */}
          <DensityStrip range={{ start: rangeStart, end: rangeEnd }} catalogue={catalogue} onCounted={setDrawnCount} />
          {ecoTicks.length > 0 && (
            <div className={styles.ecoTicks} aria-hidden="true">
              {ecoTicks.map((left, i) => <span key={i} className={styles.ecoTick} style={{ left: `${left}%`, background: KIND_COLOURS.hazards }} />)}
            </div>
          )}
          {briefCalendar && briefDays.length > 0 && (
            <div className={styles.briefDays} role="group" aria-label="War & Conflict Brief days">
              {briefDays.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  className={styles.briefDay}
                  aria-label={d.title}
                  aria-pressed={briefCalendar.chosen === d.day}
                  title={d.title}
                  // A pixel short of the day, so days side by side read as days, not one bar.
                  style={{ left: `${d.left}%`, width: `calc(${d.width}% - 1px)`, ...(d.color ? { background: d.color } : {}) }}
                  onClick={() => briefCalendar.pick(d.day)}
                />
              ))}
            </div>
          )}
          {selection ? (
            <>
              <div className={styles.windowTrack} />
              <div
                className={styles.windowBand}
                data-testid="scrubber-window-band"
                style={{
                  left: `${toSlider(selection.start) / 10}%`,
                  width: `${Math.max(0.3, (toSlider(selection.end) - toSlider(selection.start)) / 10)}%`,
                }}
              />
              <input
                type="range"
                aria-label="Window start"
                className={`${styles.slider} ${styles.windowSlider}`}
                min={0}
                max={1000}
                value={toSlider(selection.start)}
                onChange={handleWindowEdge('start')}
              />
              <input
                type="range"
                aria-label="Window end"
                className={`${styles.slider} ${styles.windowSlider}`}
                min={0}
                max={1000}
                value={toSlider(selection.end)}
                onChange={handleWindowEdge('end')}
              />
            </>
          ) : (
            <input
              type="range"
              aria-label="Position"
              className={styles.slider}
              min={0}
              max={1000}
              value={Math.min(1000, Math.max(0, sliderValue))}
              onChange={handleSliderChange}
            />
          )}
        </div>
        <span
          className={`${styles.rangeLabel} ${ahead ? styles.rangeLabelForecast : ''}`}
          title={ahead ? `${localTimeTitle(rangeEnd)}: the end of ${ahead.by}'s forecast` : localTimeTitle(rangeEnd)}
        >
          {formatUtcDate(rangeEnd)}
        </span>
        <button
          className={`${styles.liveButton} ${isLive ? styles.liveActive : ''}`}
          onClick={handleToggleLive}
          title={isLive ? 'Pause live feed' : 'Resume live feed'}
        >
          <span className={styles.liveDot} />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      </div>
    </div>
  );
};

export default TimeScrubber;