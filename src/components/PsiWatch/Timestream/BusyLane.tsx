/**
 * The Busy lane (decision D-PW, PW52, PW67): every open window's curve summed, each counting 1 at its exact moment,
 * drawn as one aqua area over the view, as tall as the view's busiest moment or a floor, with that moment ticked and
 * named "busiest". No number is given (PW36): a hover names what is open there, nearest its peak first, each with how
 * often its kind comes round; a click puts the shared cursor there.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { busiestColumn, type BusyPart } from '../../../services/psiWatch/timestream/busy';
import { recurrenceIn } from '../../../services/psiWatch/timestream/recurrence';
import { columnMs } from '../../../services/psiWatch/timestream/skyColumns';
import { fractionAt, msAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

export const BUSY_LANE_PX = 30;
/** The lane's top never stands lower than this, so a quiet view reads as quiet. */
export const BUSY_FLOOR = 2;
/** The open windows a hover names. */
const HOVER_PARTS = 4;
const LABEL_PX = 11;

export interface BusyLaneProps {
  /** Busy at each column of the drawn view. */
  values: Float32Array | null;
  drawnView: TimeView | null;
  view: TimeView;
  width: number;
  /** What is open at a column of the drawn view, nearest its peak first. */
  partsAt: (col: number) => BusyPart[];
  onSeek?: (ms: number) => void;
}

const BusyLane: React.FC<BusyLaneProps> = ({ values, drawnView, view, width, partsAt, onSeek }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; col: number } | null>(null);

  // The busiest moment among the columns the view shows.
  const busiest = useMemo(() => {
    if (!values || !drawnView) return -1;
    const shown = values.map((v, col) => {
      const f = fractionAt(view, columnMs(drawnView, values.length, col));
      return f >= 0 && f <= 1 ? v : 0;
    });
    return busiestColumn(shown);
  }, [values, drawnView, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(BUSY_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, BUSY_LANE_PX);
    if (!values || !drawnView || !values.length) return;
    const top = Math.max(BUSY_FLOOR, busiest >= 0 ? values[busiest] : 0);
    const inner = BUSY_LANE_PX - 3;
    const xOf = (col: number) => fractionAt(view, columnMs(drawnView, values.length, col)) * width;
    const yOf = (v: number) => BUSY_LANE_PX - 1 - Math.min(1, v / top) * inner;
    ctx.beginPath();
    ctx.moveTo(xOf(0), BUSY_LANE_PX - 1);
    for (let col = 0; col < values.length; col++) ctx.lineTo(xOf(col), yOf(values[col]));
    ctx.lineTo(xOf(values.length - 1), BUSY_LANE_PX - 1);
    ctx.closePath();
    ctx.fillStyle = DATA_SCALES.psiWatch;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = DATA_SCALES.psiWatch;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 0; col < values.length; col++) (col ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(col), yOf(values[col]));
    ctx.stroke();
    if (busiest >= 0) {
      const x = xOf(busiest);
      ctx.fillStyle = GUNMETAL[100];
      ctx.fillRect(x - 0.5, 0, 1, BUSY_LANE_PX);
      ctx.font = `${LABEL_PX}px ${getComputedStyle(canvas).fontFamily || 'monospace'}`;
      ctx.textBaseline = 'top';
      const label = w.busiest;
      const labelWidth = ctx.measureText(label).width;
      ctx.fillText(label, x + 4 + labelWidth > width ? x - 4 - labelWidth : x + 4, 1);
    }
  }, [values, drawnView, view, width, busiest, w.busiest]);

  const colAt = (x: number): number => {
    if (!values || !drawnView) return -1;
    const f = (msAt(view, x / Math.max(1, width)) - drawnView.startMs) / drawnView.spanMs;
    return f >= 0 && f < 1 ? Math.floor(f * values.length) : -1;
  };
  const named = (part: BusyPart): string => {
    if (part.kind === 'window') return part.title;
    const bodies = m.psiWatch.lines.bodies as Record<string, string>;
    return fill(w.aspectLabel, { a: bodies[part.a] ?? part.a, kind: (w.aspects as Record<string, string>)[part.aspect] ?? part.aspect, b: bodies[part.b] ?? part.b });
  };
  // How often the part's kind comes round, where that is known (PW67).
  const line = (part: BusyPart): string => {
    const every = part.recurrenceDays !== undefined ? recurrenceIn(part.recurrenceDays) : null;
    return every ? fill(w.busyPart, { name: named(part), every: counted(w.every[every.unit], every.n) }) : named(part);
  };
  const parts = hover && hover.col >= 0 ? partsAt(hover.col).slice(0, HOVER_PARTS) : [];
  const xOfEvent = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  return (
    <div className={styles.aspectLane} data-testid="psi-timestream-busy"
      onPointerMove={(e) => { const x = xOfEvent(e); setHover({ x, col: colAt(x) }); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSeek?.(msAt(view, xOfEvent(e) / Math.max(1, width)))}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: BUSY_LANE_PX }} />
      {hover && drawnView && hover.col >= 0 ? (
        <div className={styles.readout} aria-hidden="true" data-testid="psi-timestream-busy-readout"
          style={{ ...(hover.x > width - 240 ? { right: width - hover.x + 12 } : { left: hover.x + 12 }), top: BUSY_LANE_PX + 4 }}>
          {parts.length ? <span>{w.busyOpen}</span> : <span>{w.busyNone}</span>}
          {parts.map((part, i) => <span key={i}>{line(part)}</span>)}
          <span className={styles.readoutTime}>{formatUtcDateTime(columnMs(drawnView, values!.length, hover.col), { year: true })}</span>
        </div>
      ) : null}
    </div>
  );
};

export default BusyLane;
