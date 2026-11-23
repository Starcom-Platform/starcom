/**
 * The events lane (decision D-PW, PW42, PW46, PW51): how many of a chosen set's events fall in each day, week or year
 * of the view, as bars scaled to the view's most; outside the set's record nothing is drawn but a faint line at its
 * end, and its end's date where the whole view lies past it. Conflict and earthquakes
 * stand on the ground, in Psi Watch's violet (PW66); storms, the field's, in Kp's storm colour. An Echo's returns
 * (PW47) stand as ticks along its top, the newest brightest, the one isolated full height. A hover gives the count and
 * its bucket; a click puts the shared cursor there, or on a tick, isolates its return.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { bucketFor, eventBars, type EventBar, type EventBucket, type EventSet, type EventSetId } from '../../../services/psiWatch/timestream/eventSets';
import { touchesWithheld, WITHHELD } from '../../../services/psiWatch/timestream/withheld';
import { HeldBand, heldAt } from './HeldBand';
import { fractionAt, msAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

export const EVENTS_LANE_PX = 28;
const LABEL_PX = 11;
const TICK_REACH_PX = 4;
const DAY_MS = 86_400_000;

export const eventColour = (id: EventSetId): string => (id === 'storms' ? DATA_SCALES.kpLevels[3] : DATA_SCALES.psiGround);

export interface EventsLaneProps {
  set: EventSet | null;
  view: TimeView;
  width: number;
  /** The hover's lines for a bar, the last its time. */
  readout: (bar: EventBar, bucket: EventBucket) => string[];
  /** Where the record ends, written where the whole view lies past it. */
  endLabel?: string;
  /** The words for years held back for sealed tests (PW75): "2015–2025 held back". */
  heldWords?: (years: string) => string;
  /** An Echo's returns, ms, oldest first, and the one isolated. */
  ticks?: readonly number[];
  isolated?: number | null;
  onTick?: (ms: number) => void;
  onSeek?: (ms: number) => void;
}

const EventsLane: React.FC<EventsLaneProps> = ({ set, view, width, readout, endLabel, heldWords, ticks = [], isolated = null, onTick, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; bar?: EventBar; held?: string } | null>(null);
  const held = set ? WITHHELD[set.id] : [];
  const bucket = bucketFor(view.spanMs);
  // Nothing drawn in the years held back for Mecha Jono's sealed tests (PW75), a bucket touching them included.
  const bars = useMemo(() => (set ? eventBars(set, view, bucket).filter((b) => !touchesWithheld(set.id, b.fromMs, b.untilMs)) : []), [set, view, bucket]);
  const most = useMemo(() => bars.reduce((m, b) => Math.max(m, b.count), 0), [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(EVENTS_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, EVENTS_LANE_PX);
    // An Echo's returns along the top, older ones fainter.
    ticks.forEach((ms, i) => {
      const x = fractionAt(view, ms) * width;
      if (x < -1 || x > width + 1) return;
      ctx.fillStyle = GUNMETAL[100];
      ctx.globalAlpha = ms === isolated ? 1 : 0.35 + 0.65 * ((i + 1) / ticks.length);
      ctx.fillRect(Math.round(x), 0, 1, ms === isolated ? EVENTS_LANE_PX : 6);
    });
    ctx.globalAlpha = 1;
    if (!set) return;
    // The record's end: a faint line where the view holds it, its date where the view lies wholly past it.
    const endX = fractionAt(view, set.untilMs + DAY_MS) * width;
    ctx.fillStyle = GUNMETAL[600];
    if (endX >= 0 && endX <= width) ctx.fillRect(Math.round(endX), 0, 1, EVENTS_LANE_PX);
    if (endX < 0 && endLabel) {
      ctx.fillStyle = GUNMETAL[400];
      ctx.font = `${LABEL_PX}px ${getComputedStyle(canvas).fontFamily || 'monospace'}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(endLabel, 6, EVENTS_LANE_PX / 2);
    }
    if (!most) return;
    const inner = EVENTS_LANE_PX - 3;
    ctx.fillStyle = eventColour(set.id);
    for (const bar of bars) {
      if (!bar.count) continue;
      const x0 = fractionAt(view, bar.fromMs) * width;
      const x1 = fractionAt(view, bar.untilMs) * width;
      // A bar too narrow to see stands a pixel and a half wide.
      const w = Math.max(1.5, x1 - x0 - (x1 - x0 > 3 ? 1 : 0));
      const h = Math.max(1, (bar.count / most) * inner);
      ctx.fillRect(x0, EVENTS_LANE_PX - 1 - h, w, h);
    }
  }, [set, bars, most, view, width, endLabel, ticks, isolated]);

  const xOfEvent = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const barAt = (x: number): EventBar | null => {
    const ms = msAt(view, x / Math.max(1, width));
    return bars.find((b) => ms >= b.fromMs && ms < b.untilMs) ?? null;
  };
  const lines = hover?.held && heldWords ? [heldWords(hover.held)] : hover?.bar ? readout(hover.bar, bucket) : [];

  return (
    <div className={styles.aspectLane} data-testid="psi-timestream-events"
      onPointerMove={(e) => {
        const x = xOfEvent(e);
        const years = heldAt(held, msAt(view, x / Math.max(1, width)));
        const bar = years ? null : barAt(x);
        setHover(years ? { x, held: years } : bar ? { x, bar } : null);
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const x = xOfEvent(e);
        // A tick within a few pixels takes the click.
        const tick = onTick ? ticks.find((ms) => Math.abs(fractionAt(view, ms) * width - x) <= TICK_REACH_PX) : undefined;
        if (tick !== undefined) onTick!(tick); else onSeek?.(msAt(view, x / Math.max(1, width)));
      }}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: EVENTS_LANE_PX }} />
      {heldWords ? <HeldBand held={held} view={view} width={width} height={EVENTS_LANE_PX} words={heldWords} /> : null}
      {lines.length ? (
        <div className={styles.readout} aria-hidden="true" data-testid="psi-timestream-events-readout"
          style={{ ...(hover!.x > width - 240 ? { right: width - hover!.x + 12 } : { left: hover!.x + 12 }), top: EVENTS_LANE_PX + 4 }}>
          {lines.map((line, i) => <span key={i} className={i === lines.length - 1 ? styles.readoutTime : undefined}>{line}</span>)}
        </div>
      ) : null}
    </div>
  );
};

export default EventsLane;
