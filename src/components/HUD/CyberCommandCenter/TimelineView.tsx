import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState } from 'react';
import { useGlobalCommand } from '../../../hooks/useUnifiedGlobalCommand';
import { useTimelineData } from '../../../core/intel/hooks/useTimelineData';
import { useClockNow, useTemporalStateOptional } from '../../../context/TemporalContext';
import { couldNotRead, namedForRoom, nothingDated, notStated } from '../../../services/epistemic/epistemicLanguage';
import { placeLabels } from './timelineLabels';
import { formatUtcDate, formatUtcTime, localTimeTitle, utcTimeTicks } from '../../../utils/utcTime';
import { timelineSpan } from '../../../core/intel/utils/timelineSummary';
import { describeRecordTime, intelItemTime, type RecordTime } from '../../../services/intel/recordTime';
import { eventMark, PIN_RADIUS } from './timelineMarks';
import styles from './TimelineView.module.css';
import { createLogger } from '@utils/logger';
import { FONTS } from '../../../styles/tokens';
const log = createLogger({ prefix: 'TimelineView' });

interface TimelineViewProps {
  className?: string;
  fullscreen?: boolean;
  /**
   * Inside a floating panel, whose header already names it: no title of its
   * own, above the canvas or on it, and no second border. The panel read
   * "Timeline — Intel Events", then "Intelligence Timeline", then the same again
   * drawn on the canvas across the CURRENT marker.
   */
  framed?: boolean;
}

/**
 * A pin with no colour of its own. Each item carries its type's colour from the
 * timeline adapter. This view kept a second table, keyed by types no timeline item
 * has, so every pin was drawn white.
 */
const UNCOLOURED_PIN = '#ffffff';

const LABEL_FONT = `9px ${FONTS.data}`;
/** Rows of event names above the pins, nearest first. */
const LABEL_ROWS = 3;
const LABEL_ROW_HEIGHT = 12;
/** Clear space between two names on one row, in canvas pixels. */
const LABEL_GAP = 6;
/** About how many ticks the time axis aims for; see utcTimeTicks. */
const AXIS_TICKS = 8;
/** How the selected window is drawn behind the pins. */
export const WINDOW_BAND_FILL = 'rgba(255, 51, 51, 0.12)';
/** How far, in canvas pixels, the pointer moves before a press is a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** The canvas is drawn at this size and shown scaled to its panel. */
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
/** The time axis runs between side margins this wide. */
const AXIS_MARGIN = 50;
/** Where the pins sit: forty pixels above the axis, which is at the canvas's middle. */
const PIN_Y = CANVAS_HEIGHT / 2 - 40;
/** How near a pin, in canvas pixels, the pointer counts as on it. */
const PIN_HIT_PX = PIN_RADIUS + 3;
/** How tall the bar to an event's end is, and how faintly a rough time's window is drawn. */
const SPAN_BAR_HEIGHT = 4;
const ROUGH_WINDOW_ALPHA = 0.3;
/** Inside a hollow pin: the canvas's own ground, so a bar or a window does not show through. */
const PIN_HOLE_FILL = 'rgb(0, 18, 36)';
const FOCUS_RING = '#ffffff';
/** Where the card sits, in canvas pixels: below the axis labels, clear of the pins and their names. */
const CARD_Y = 245;
/**
 * How close to either side of the canvas the card's middle may come, in canvas
 * pixels: half the card at its widest, 440px, where the panel shows the canvas
 * at about nine tenths of its drawn size.
 */
const CARD_EDGE_X = 240;

/** When a time falls in the viewer's own time zone: its start, and its end when it has one. */
const localWhen = (time: RecordTime): string =>
  time.statedEnd === undefined
    ? localTimeTitle(time.start)
    : `${localTimeTitle(time.start)} – ${localTimeTitle(time.statedEnd).replace(/^Local: /, '')}`;

const TimelineView: React.FC<TimelineViewProps> = ({ className, fullscreen, framed = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useGlobalCommand();
  const temporalState = useTemporalStateOptional();
  const now = useClockNow();
  // Where a click put the cursor, when there is no shared cursor to hold it.
  const [localCursor, setLocalCursor] = useState<number | null>(null);
  // A range being dragged across the canvas, in ms, while the pointer is down
  // (decision D-E), and whether the click that ends a drag should be ignored.
  const [dragBand, setDragBand] = useState<[number, number] | null>(null);
  const dragRef = useRef<{ from: number; fromX: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  // The event the arrow keys are on, the event under the pointer, and whether the
  // timeline has keyboard focus (decision D-E, step 7).
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardPlace, setCardPlace] = useState<{ left: number; top: number } | null>(null);

  // --- Fetch real timeline data from Intel Data Core ---
  const { timelineData, stats, loading, error, refreshData } = useTimelineData();

  // When the last read finished. The shared read follows every change to the
  // workspace, but a read can still fail or lag behind a write, so the view says
  // when it read instead of calling itself live.
  const [readAt, setReadAt] = useState<number | null>(null);
  useEffect(() => {
    if (loading) return;
    setReadAt(error ? null : Date.now());
  }, [loading, error, timelineData]);

  // Each item with the time that places it, from its start to its end (decision D-E).
  // An item whose start cannot be read is not drawn; one with no start was drawn at now.
  const timelineEvents = useMemo(() => {
    if (!timelineData?.items || timelineData.items.length === 0) return [];

    return timelineData.items.flatMap((item) => {
      const time = intelItemTime({ eventDate: item.startTime, eventEndDate: item.endTime });
      return time
        ? [{
            id: item.id,
            time,
            label: item.title || item.id,
            importance: item.importance,
            isEstimated: Boolean(item.isEstimated),
            color: item.color || UNCOLOURED_PIN,
          }]
        : [];
    });
  }, [timelineData]);

  // The span every view of the timeline shows for these events (decision D-E), so
  // the timeline covers the same dates as the scrubber.
  const timeBounds = useMemo(() => {
    const span = timelineSpan(timelineData?.items ?? []);
    if (!span) {
      const now = Date.now();
      return { min: now - 12 * 60 * 60 * 1000, max: now + 12 * 60 * 60 * 1000 };
    }
    return { min: span.start, max: span.end };
  }, [timelineData]);

  /**
   * Where CURRENT sits: the shared cursor, which is now while live (decision D-E).
   * In live mode it sat at a fixed 50% of the axis, wherever now was.
   */
  const cursorTime = temporalState
    ? (temporalState.isLive ? now : temporalState.currentTime)
    : (localCursor ?? now);
  const currentTimeOffset = useMemo(() => {
    const range = timeBounds.max - timeBounds.min;
    if (range <= 0) return 0.5;
    return Math.max(0, Math.min(1, (cursorTime - timeBounds.min) / range));
  }, [cursorTime, timeBounds]);

  // How each event is drawn on the axis (timelineMarks.ts), in time order, which is
  // the order the arrow keys move in.
  const marks = useMemo(() => {
    const axis = { left: AXIS_MARGIN, width: CANVAS_WIDTH - 2 * AXIS_MARGIN, min: timeBounds.min, max: timeBounds.max };
    return timelineEvents
      .flatMap((event) => {
        const mark = eventMark(event.time, event.isEstimated, axis);
        return mark ? [{ event, mark }] : [];
      })
      .sort((a, b) => a.event.time.start - b.event.time.start || a.event.id.localeCompare(b.event.id));
  }, [timelineEvents, timeBounds]);

  // The event the card describes and the ring marks: the one under the pointer, else
  // the one the arrow keys are on while the timeline has focus.
  const shownId = hoverId ?? (hasFocus ? focusId : null);
  const shown = marks.find((m) => m.event.id === shownId) ?? null;

  // The selected window while paused, kept apart from the rest of the context so the
  // canvas redraws when the window changes, not whenever the context does.
  const selectedWindow = temporalState && !temporalState.isLive ? temporalState.timeWindow : null;

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(0, 20, 40, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const timelineY = canvas.height / 2;
    const leftMargin = 50;
    const rightMargin = canvas.width - 50;
    const timelineWidth = rightMargin - leftMargin;

    // Main timeline axis
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftMargin, timelineY);
    ctx.lineTo(rightMargin, timelineY);
    ctx.stroke();

    // Time markers on UTC calendar boundaries, dated across days. Ten evenly
    // spaced markers used to print the local time of day at each, so a two-month
    // axis read "17:56, 13:51, 09:45"; see utcTime.ts.
    const { min: tMin, max: tMax } = timeBounds;

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#66ccff';
    ctx.font = `10px ${FONTS.data}`;
    ctx.textAlign = 'center';

    for (const tick of utcTimeTicks(tMin, tMax, AXIS_TICKS)) {
      const x = leftMargin + ((tick.at - tMin) / (tMax - tMin)) * timelineWidth;
      ctx.beginPath();
      ctx.moveTo(x, timelineY - 10);
      ctx.lineTo(x, timelineY + 10);
      ctx.stroke();
      ctx.fillText(tick.label, x, timelineY + 25);
    }

    // Empty-state
    if (timelineEvents.length === 0) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.font = `14px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        loading ? 'LOADING TIMELINE DATA...' : (error ? couldNotRead('intel items') : nothingDated()).text.toUpperCase(),
        canvas.width / 2,
        timelineY - 50
      );
    }

    // The selected window, or the range being dragged, as a band behind the pins
    // (decision D-E).
    const band = dragBand ?? (selectedWindow ? [selectedWindow.start.getTime(), selectedWindow.end.getTime()] : null);
    if (band) {
      const toX = (t: number) => leftMargin + Math.max(0, Math.min(1, (t - tMin) / (tMax - tMin))) * timelineWidth;
      const x0 = toX(Math.min(band[0], band[1]));
      const x1 = toX(Math.max(band[0], band[1]));
      ctx.fillStyle = WINDOW_BAND_FILL;
      ctx.fillRect(x0, 20, Math.max(1, x1 - x0), canvas.height - 40);
    }

    // Plot events (decision D-E, step 7): the faint windows of times rough at this
    // zoom, then bars to each event's end, then stems and pins, hollow where rough or
    // estimated. Then only the names that have room. Every event was a white pin at
    // its start, whatever its end or how closely it was known.
    const eventY = PIN_Y;
    for (const { event, mark } of marks) {
      if (mark.roughEndX === null) continue;
      ctx.globalAlpha = ROUGH_WINDOW_ALPHA;
      ctx.fillStyle = event.color;
      ctx.fillRect(mark.x, eventY - PIN_RADIUS, Math.max(1, mark.roughEndX - mark.x), 2 * PIN_RADIUS);
      ctx.globalAlpha = 1;
    }
    for (const { event, mark } of marks) {
      if (mark.barEndX === null) continue;
      ctx.fillStyle = event.color;
      ctx.fillRect(mark.x, eventY - SPAN_BAR_HEIGHT / 2, Math.max(1, mark.barEndX - mark.x), SPAN_BAR_HEIGHT);
    }
    const pinned: Array<{ x: number; label: string; importance: number }> = [];
    for (const { event, mark } of marks) {
      ctx.strokeStyle = event.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mark.x, eventY + PIN_RADIUS);
      ctx.lineTo(mark.x, timelineY - 10);
      ctx.stroke();

      ctx.beginPath();
      if (mark.hollow) {
        ctx.arc(mark.x, eventY, PIN_RADIUS - 1, 0, 2 * Math.PI);
        ctx.fillStyle = PIN_HOLE_FILL;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.arc(mark.x, eventY, PIN_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = event.color;
        ctx.fill();
      }

      pinned.push({
        x: mark.x,
        label: event.label.length > 18 ? event.label.slice(0, 15) + '...' : event.label,
        importance: event.importance,
      });
    }

    // The event the card describes, ringed.
    if (shown) {
      ctx.strokeStyle = FOCUS_RING;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(shown.mark.x, eventY, PIN_RADIUS + 4, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Names, only where they fit. One row of every name ran them together into an
    // unreadable band; see timelineLabels.ts.
    ctx.fillStyle = '#ffffff';
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    const placements = placeLabels(
      pinned.map((p, i) => ({ id: String(i), x: p.x, width: ctx.measureText(p.label).width, importance: p.importance })),
      { rows: LABEL_ROWS, gap: LABEL_GAP, minX: 0, maxX: canvas.width },
    );
    placements.forEach(({ id, row }) => {
      const p = pinned[Number(id)];
      ctx.fillText(p.label, p.x, eventY - 15 - row * LABEL_ROW_HEIGHT);
    });

    // Say how many names were left off, so a few names are not read as a few events.
    if (placements.length < pinned.length) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.font = `10px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText(namedForRoom(placements.length, pinned.length).text, canvas.width / 2, canvas.height - 10);
    }

    // Current position indicator
    const currentX = leftMargin + currentTimeOffset * timelineWidth;
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(currentX, 20);
    ctx.lineTo(currentX, canvas.height - 20);
    ctx.stroke();

    ctx.fillStyle = '#ff3333';
    ctx.font = `bold 12px ${FONTS.data}`;
    ctx.textAlign = 'center';
    ctx.fillText('CURRENT', currentX, 15);

    // Title, unless a panel's header already carries it.
    if (!framed) {
      ctx.fillStyle = '#00ffff';
      ctx.font = `bold 14px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText('INTELLIGENCE TIMELINE', canvas.width / 2, 30);
    }

    // Date range indicator
    ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.font = `10px ${FONTS.data}`;
    ctx.textAlign = 'left';
    ctx.fillText(formatUtcDate(tMin, { year: true }), leftMargin, canvas.height - 10);
    ctx.textAlign = 'right';
    ctx.fillText(formatUtcDate(tMax, { year: true }), rightMargin, canvas.height - 10);
  }, [timelineEvents, marks, shown, timeBounds, loading, error, currentTimeOffset, framed, selectedWindow, dragBand]);

  useEffect(() => {
    drawTimeline();
  }, [drawTimeline]);

  // The card sits beneath the event it describes, measured from where the canvas is
  // shown, since it is drawn 800 wide and scaled to its panel.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!shown || !canvas || !container) return;
    const shownAt = canvas.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const x = Math.max(CARD_EDGE_X, Math.min(CANVAS_WIDTH - CARD_EDGE_X, shown.mark.x));
    setCardPlace({
      left: shownAt.left - box.left + x * (shownAt.width / CANVAS_WIDTH || 1),
      top: shownAt.top - box.top + CARD_Y * (shownAt.height / CANVAS_HEIGHT || 1),
    });
  }, [shown]);

  /** Where a pointer is on the canvas, in canvas pixels, and the time under it. */
  const pointerAt = (clientX: number, clientY = 0): { x: number; y: number; time: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // The canvas is drawn 800 wide and shown scaled, so convert to canvas pixels.
    const x = rect.width ? (clientX - rect.left) * (canvas.width / rect.width) : clientX - rect.left;
    const y = rect.height ? (clientY - rect.top) * (canvas.height / rect.height) : clientY - rect.top;
    const offset = Math.max(0, Math.min(1, (x - 50) / (canvas.width - 100)));
    return { x, y, time: timeBounds.min + offset * (timeBounds.max - timeBounds.min) };
  };

  /** The event whose pin is under the pointer: the nearest, where pins crowd together. */
  const markAt = (clientX: number, clientY: number) => {
    const at = pointerAt(clientX, clientY);
    if (!at || Math.abs(at.y - PIN_Y) > PIN_HIT_PX) return null;
    let nearest: (typeof marks)[number] | null = null;
    for (const entry of marks) {
      const distance = Math.abs(entry.mark.x - at.x);
      if (distance <= PIN_HIT_PX && (!nearest || distance < Math.abs(nearest.mark.x - at.x))) nearest = entry;
    }
    return nearest;
  };

  /** Choosing an event selects the axis step containing its start, as a click on the axis does. */
  const chooseEvent = (entry: (typeof marks)[number]) => {
    setFocusId(entry.event.id);
    if (temporalState) temporalState.setCurrentTime(entry.event.time.start);
    else setLocalCursor(entry.event.time.start);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // A drag just selected a window; the click that ends it is not a second choice.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // The event the card names, when the pointer is on a pin. A pointer's position
    // falls between pixels and a click's is rounded, so where pins crowd within a
    // pixel the click alone chose the neighbour of the event the card named.
    const hovered = hoverId ? marks.find((m) => m.event.id === hoverId) : undefined;
    const hit = hovered ?? markAt(event.clientX, event.clientY);
    if (hit) {
      chooseEvent(hit);
      return;
    }
    const at = pointerAt(event.clientX);
    if (!at) return;
    // Setting the shared cursor leaves live mode and selects the axis step containing
    // the moment. It is not followed by setIsLive(false), which pauses at now.
    if (temporalState) temporalState.setCurrentTime(at.time);
    else setLocalCursor(at.time);
    log.debug('Timeline clicked at:', new Date(at.time).toISOString());
  };

  /** Dragging across the canvas selects a window by its two ends (decision D-E). */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    suppressClickRef.current = false;
    const at = pointerAt(event.clientX);
    if (!at) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { from: at.time, fromX: at.x, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      // Hovering a pin shows its card.
      setHoverId(markAt(event.clientX, event.clientY)?.event.id ?? null);
      return;
    }
    const at = pointerAt(event.clientX);
    if (!at) return;
    if (!drag.moved && Math.abs(at.x - drag.fromX) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    setDragBand([drag.from, at.time]);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragBand(null);
    const at = drag ? pointerAt(event.clientX) : null;
    if (!drag || !drag.moved || !at) return;
    suppressClickRef.current = true;
    if (temporalState) temporalState.setTimeWindow(drag.from, at.time);
  };

  const handlePointerLeave = () => setHoverId(null);

  /** ← and → move between events in time order; Enter chooses the one the keys are on. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (marks.length === 0 || !['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    const index = marks.findIndex((m) => m.event.id === focusId);
    if (event.key === 'Enter') {
      if (index >= 0) chooseEvent(marks[index]);
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = index < 0
      ? (step > 0 ? 0 : marks.length - 1)
      : Math.max(0, Math.min(marks.length - 1, index + step));
    setHoverId(null);
    setFocusId(marks[next].event.id);
  };

  const shownTime = shown ? describeRecordTime(shown.event.time) : null;

  // Shared setter for the transport-control buttons below. Like handleCanvasClick it sets
  // the shared cursor, or the local one when there is no provider, so button scrubbing
  // stays in sync with click-to-scrub and with other TemporalContext consumers (Globe, etc.).
  const applyTimeOffset = (updater: (offset: number) => number) => {
    const clamped = Math.max(0, Math.min(1, updater(currentTimeOffset)));
    const clampedTimestamp = timeBounds.min + clamped * (timeBounds.max - timeBounds.min);
    if (temporalState) temporalState.setCurrentTime(clampedTimestamp);
    else setLocalCursor(clampedTimestamp);
  };

  /** ⏸ pauses where the cursor is. It used to move the cursor to the middle of the axis. */
  const pauseHere = () => {
    if (temporalState) temporalState.setCurrentTime(cursorTime);
    else setLocalCursor(cursorTime);
  };

  return (
    <div className={`${styles.timelineView} ${fullscreen ? styles.fullscreen : ''} ${framed ? styles.framed : ''} ${className || ''}`}>
      <div className={styles.header}>
        {!framed && (
          <h2 className={styles.title}>
            <span className={styles.icon}>📊</span>
            Intelligence Timeline
          </h2>
        )}
        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={() => refreshData()} title="Refresh">SYNC</button>
          <button className={styles.controlBtn} onClick={() => applyTimeOffset(o => Math.max(0, o - 0.1))}>◀◀</button>
          <button className={styles.controlBtn} onClick={() => applyTimeOffset(o => Math.max(0, o - 0.05))}>◀</button>
          <button className={styles.controlBtn} onClick={pauseHere} title="Pause here">⏸</button>
          <button className={styles.controlBtn} onClick={() => applyTimeOffset(o => Math.min(1, o + 0.05))}>▶</button>
          <button className={styles.controlBtn} onClick={() => applyTimeOffset(o => Math.min(1, o + 0.1))}>▶▶</button>
        </div>
      </div>

      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          tabIndex={0}
          role="group"
          aria-roledescription="timeline"
          aria-label={`Timeline of ${marks.length} event${marks.length === 1 ? '' : 's'}. Left and right arrow keys move between them. Enter selects the time step holding the one you are on.`}
          onClick={handleCanvasClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          onFocus={() => setHasFocus(true)}
          onBlur={() => setHasFocus(false)}
        />

        {/* What the ringed event is and when it happened, for the pointer, the keyboard and screen readers. */}
        <div
          className={styles.eventCard}
          role="status"
          aria-live="polite"
          data-testid="timeline-event-card"
          style={shown && cardPlace ? cardPlace : undefined}
        >
          {shown && shownTime && (
            <>
              <div className={styles.eventCardTitle}>{shown.event.label}</div>
              <div>{shownTime.label}: {shownTime.text}</div>
              <div>{localWhen(shown.event.time)}</div>
              {shown.event.time.precisionMs === undefined && <div>Known to: a day ({notStated('precision')})</div>}
              {shown.event.isEstimated && <div>Estimated</div>}
            </>
          )}
        </div>

        <div className={styles.overlay}>
          <div className={styles.contextInfo}>
            Context: {state.enhanced?.primaryContextId || 'GLOBAL'}
          </div>
          <div className={styles.stats}>
            {!error && <div>Events: {stats.totalEvents}</div>}
            {!error && Object.keys(stats.eventsByType).length > 0 && (
              <div>Types: {Object.keys(stats.eventsByType).length}</div>
            )}
            {loading && <div style={{ color: '#ffff00' }}>SYNCING...</div>}
            {error && <div style={{ color: '#ff3333' }} title={error}>READ FAILED</div>}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.timeRange}>
          {error
            ? 'EVENTS: NOT READ'
            : <>EVENTS: {stats.totalEvents} | IMPORTANCE: H{stats.eventsImportance?.high ?? 0} M{stats.eventsImportance?.medium ?? 0} L{stats.eventsImportance?.low ?? 0}</>}
        </div>
        {/* In UTC like every other readout (decision D-E); it printed local time. */}
        <div className={styles.status} title={!loading && !error && readAt !== null ? localTimeTitle(readAt) : undefined}>
          {loading
            ? 'LOADING...'
            : error
              ? 'READ FAILED'
              : readAt !== null
                ? `AS OF ${formatUtcTime(readAt)}`
                : ''}
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
