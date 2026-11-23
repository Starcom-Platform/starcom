/**
 * The alignment lane (decision D-PW, PW39, PW55, PW71): an Echo's returns stacked on their exact moments, its own axis
 * in days from exact, 30 either side, a bar a day of the events lane's set, the window's own span shaded behind them
 * and a faint dotted usual line across. Drawn as data, a hover reading a bar.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GUNMETAL } from '../../../styles/tokens';
import type { Alignment } from '../../../services/psiWatch/timestream/alignment';
import styles from './TimestreamDrawer.module.css';

export const ALIGN_LANE_PX = 44;
const AXIS_PX = 11;
const DAY_MS = 86_400_000;

export interface AlignLaneProps {
  alignment: Alignment;
  colour: string;
  /** How long the window opens before exact and stays open after, ms. */
  beforeMs: number;
  afterMs: number;
  width: number;
  /** The hover's line for a day from exact. */
  read: (day: number, count: number) => string;
  label: string;
}

const AlignLane: React.FC<AlignLaneProps> = ({ alignment, colour, beforeMs, afterMs, width, read, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);
  const { counts, usual } = alignment;
  const days = (counts.length - 1) / 2;
  const step = width / Math.max(1, counts.length);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(ALIGN_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, ALIGN_LANE_PX);
    const floor = ALIGN_LANE_PX - AXIS_PX;
    const top = Math.max(1, usual * 1.3, ...counts);
    const yOf = (v: number) => floor - (v / top) * (floor - 2);
    const xOfDay = (d: number) => (d + days + 0.5) * step;
    // The window's own span, behind the bars.
    ctx.fillStyle = GUNMETAL[800];
    const x0 = xOfDay(Math.max(-days - 0.5, -beforeMs / DAY_MS));
    const x1 = xOfDay(Math.min(days + 0.5, afterMs / DAY_MS));
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), floor);
    counts.forEach((v, i) => {
      ctx.fillStyle = colour;
      ctx.globalAlpha = hover?.i === i ? 1 : 0.8;
      ctx.fillRect(i * step + 0.5, yOf(v), Math.max(1, step - 1), floor - yOf(v));
    });
    ctx.globalAlpha = 1;
    // The usual, faint and dotted (PW55).
    ctx.fillStyle = GUNMETAL[300];
    for (let x = 0; x < width; x += 4) ctx.fillRect(x, Math.round(yOf(usual)), 2, 1);
    // Exact, and the days either side.
    ctx.fillStyle = GUNMETAL[100];
    ctx.fillRect(Math.round(xOfDay(0)), 0, 1, floor);
    ctx.fillStyle = GUNMETAL[400];
    ctx.font = `${AXIS_PX - 1}px ${getComputedStyle(canvas).fontFamily || 'monospace'}`;
    ctx.textBaseline = 'bottom';
    for (const d of [-days, -days / 2, 0, days / 2, days]) {
      const text = d > 0 ? `+${d}` : `${d}`;
      const w = ctx.measureText(text).width;
      ctx.fillText(text, Math.min(width - w, Math.max(0, xOfDay(d) - w / 2)), ALIGN_LANE_PX);
    }
  }, [counts, usual, days, step, width, colour, beforeMs, afterMs, hover]);

  const xOfEvent = (e: React.PointerEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  return (
    <div className={styles.aspectLane} data-testid="psi-timestream-align" role="img" aria-label={label}
      onPointerMove={(e) => { const x = xOfEvent(e); const i = Math.floor(x / step); setHover(i >= 0 && i < counts.length ? { x, i } : null); }}
      onPointerLeave={() => setHover(null)}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: ALIGN_LANE_PX }} />
      {hover ? (
        <div className={styles.readout} aria-hidden="true" data-testid="psi-timestream-align-readout"
          style={{ ...(hover.x > width - 240 ? { right: width - hover.x + 12 } : { left: hover.x + 12 }), top: ALIGN_LANE_PX + 4 }}>
          <span>{read(hover.i - days, counts[hover.i])}</span>
        </div>
      ) : null}
    </div>
  );
};

export default AlignLane;
