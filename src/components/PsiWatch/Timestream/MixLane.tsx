/**
 * A share lane (decision D-PW, PW45): the sky's bodies split among the parts of a set, column by column, as bands
 * stacked to the lane's height: the four elements in the drawer's own palette, or the three modalities. A hover reads
 * the column's shares; a click puts the shared cursor there.
 */
import React, { useEffect, useRef, useState } from 'react';
import { fractionAt, msAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

export const MIX_LANE_PX = 22;

export interface MixLaneProps {
  /** Each part's share at each column: `columns × parts`, column by column. */
  shares: Float32Array | null;
  parts: number;
  colours: readonly string[];
  drawnView: TimeView | null;
  view: TimeView;
  width: number;
  readout: (col: number) => string[];
  onSeek?: (ms: number) => void;
  testId: string;
}

const MixLane: React.FC<MixLaneProps> = ({ shares, parts, colours, drawnView, view, width, readout, onSeek, testId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; col: number } | null>(null);
  const columns = shares ? shares.length / parts : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(MIX_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, MIX_LANE_PX);
    if (!shares || !drawnView || !columns) return;
    const inner = MIX_LANE_PX - 2;
    for (let col = 0; col < columns; col++) {
      const x0 = fractionAt(view, drawnView.startMs + (col / columns) * drawnView.spanMs) * width;
      const x1 = fractionAt(view, drawnView.startMs + ((col + 1) / columns) * drawnView.spanMs) * width;
      if (x1 < 0 || x0 > width) continue;
      let y = MIX_LANE_PX - 1;
      for (let p = 0; p < parts; p++) {
        const h = shares[col * parts + p] * inner;
        ctx.fillStyle = colours[p];
        ctx.fillRect(x0, y - h, Math.max(1, x1 - x0 + 0.5), h);
        y -= h;
      }
    }
  }, [shares, parts, colours, drawnView, view, width, columns]);

  const colAt = (x: number): number => {
    if (!columns || !drawnView) return -1;
    const f = (msAt(view, x / Math.max(1, width)) - drawnView.startMs) / drawnView.spanMs;
    return f >= 0 && f < 1 ? Math.floor(f * columns) : -1;
  };
  const xOfEvent = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;
  const lines = hover && hover.col >= 0 && drawnView ? readout(hover.col) : [];

  return (
    <div className={styles.aspectLane} data-testid={testId}
      onPointerMove={(e) => { const x = xOfEvent(e); setHover({ x, col: colAt(x) }); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => onSeek?.(msAt(view, xOfEvent(e) / Math.max(1, width)))}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: MIX_LANE_PX }} />
      {lines.length ? (
        <div className={styles.readout} aria-hidden="true" data-testid={`${testId}-readout`}
          style={{ ...(hover!.x > width - 240 ? { right: width - hover!.x + 12 } : { left: hover!.x + 12 }), top: MIX_LANE_PX + 4 }}>
          {lines.map((line, i) => <span key={i} className={i === lines.length - 1 ? styles.readoutTime : undefined}>{line}</span>)}
        </div>
      ) : null}
    </div>
  );
};

export default MixLane;
