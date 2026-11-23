/**
 * A graph lane (decision D-PW, PW45, PW51): one series over the drawn view as a line, its range shaded where a
 * column took several samples (a wide view's mean with its range), faint lines at the values that mark it (the
 * Resonance Score's 40, 50 and 60, the tide's mean). The lane spans what the view shows, never less than a least
 * span, so a quiet week is not drawn as a storm. A hover reads the column; a click puts the shared cursor there.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GUNMETAL } from '../../../styles/tokens';
import type { GraphSeries } from '../../../services/psiWatch/timestream/graphColumns';
import { columnMs } from '../../../services/psiWatch/timestream/skyColumns';
import { fractionAt, msAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

export const GRAPH_LANE_PX = 30;

/** The lane's foot and top: the least and most the view shows, a little room either side, at least the least span. */
export function laneBounds(series: GraphSeries | null, drawnView: TimeView | null, view: TimeView, floor: number, ceiling: number, leastSpan: number): [number, number] {
  const columns = series?.mean.length ?? 0;
  let least = Infinity;
  let most = -Infinity;
  if (series && drawnView) {
    for (let col = 0; col < columns; col++) {
      const f = fractionAt(view, columnMs(drawnView, columns, col));
      if (f < 0 || f > 1) continue;
      least = Math.min(least, series.min[col]);
      most = Math.max(most, series.max[col]);
    }
  }
  if (!Number.isFinite(least)) return [floor, ceiling];
  const middle = (least + most) / 2;
  const half = Math.min((ceiling - floor) / 2, Math.max(leastSpan, (most - least) * 1.15) / 2);
  const low = Math.max(floor, Math.min(middle - half, ceiling - 2 * half));
  return [low, low + 2 * half];
}

export interface GraphLaneProps {
  series: GraphSeries | null;
  /** The samples each column took: more than one shades the range. */
  samples: number;
  drawnView: TimeView | null;
  view: TimeView;
  width: number;
  /** The values the lane may span, and the least span it draws. */
  floor: number;
  ceiling: number;
  leastSpan: number;
  /** Faint lines across the lane, the first the brightest. */
  marks: readonly number[];
  colour: string;
  /** The hover's lines at a column of the drawn view, the last its time. */
  readout: (col: number) => string[];
  onSeek?: (ms: number) => void;
  testId: string;
}

const GraphLane: React.FC<GraphLaneProps> = ({ series, samples, drawnView, view, width, floor, ceiling, leastSpan, marks, colour, readout, onSeek, testId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; col: number } | null>(null);
  const columns = series?.mean.length ?? 0;
  const [lo, hi] = useMemo(() => laneBounds(series, drawnView, view, floor, ceiling, leastSpan), [series, drawnView, view, floor, ceiling, leastSpan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(GRAPH_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, GRAPH_LANE_PX);
    const inner = GRAPH_LANE_PX - 4;
    const yOf = (v: number) => GRAPH_LANE_PX - 2 - Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * inner;
    marks.forEach((m, i) => {
      if (m < lo || m > hi) return;
      ctx.fillStyle = i === 0 ? GUNMETAL[500] : GUNMETAL[700];
      ctx.fillRect(0, Math.round(yOf(m)), width, 1);
    });
    if (!series || !drawnView || !columns) return;
    const xOf = (col: number) => fractionAt(view, columnMs(drawnView, columns, col)) * width;
    if (samples > 1) {
      ctx.beginPath();
      for (let col = 0; col < columns; col++) (col ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(col), yOf(series.max[col]));
      for (let col = columns - 1; col >= 0; col--) ctx.lineTo(xOf(col), yOf(series.min[col]));
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let col = 0; col < columns; col++) (col ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(col), yOf(series.mean[col]));
    ctx.stroke();
  }, [series, samples, drawnView, view, width, lo, hi, marks, colour, columns]);

  const colAt = (x: number): number => {
    if (!columns || !drawnView) return -1;
    const f = (msAt(view, x / Math.max(1, width)) - drawnView.startMs) / drawnView.spanMs;
    return f >= 0 && f < 1 ? Math.floor(f * columns) : -1;
  };
  const xOfEvent = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const lines = hover && hover.col >= 0 ? readout(hover.col) : [];

  return (
    <div className={styles.aspectLane} data-testid={testId}
      onPointerMove={(e) => { const x = xOfEvent(e); setHover({ x, col: colAt(x) }); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSeek?.(msAt(view, xOfEvent(e) / Math.max(1, width)))}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: GRAPH_LANE_PX }} />
      {lines.length ? (
        <div className={styles.readout} aria-hidden="true" data-testid={`${testId}-readout`}
          style={{ ...(hover!.x > width - 240 ? { right: width - hover!.x + 12 } : { left: hover!.x + 12 }), top: GRAPH_LANE_PX + 4 }}>
          {lines.map((line, i) => <span key={i} className={i === lines.length - 1 ? styles.readoutTime : undefined}>{line}</span>)}
        </div>
      ) : null}
    </div>
  );
};

export default GraphLane;
