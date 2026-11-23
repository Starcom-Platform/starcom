/**
 * A lane of spans through time (decision D-PW, PW42, PW65; Cosmic Cypher's `AspectEventLane`), the aspect lane's and
 * the psi lanes' alike: each span a bar across its window in rows that never touch and grow with the spans, to a cap;
 * a window with a curve drawn as its curve, rising to its peak. A bar wide enough for it carries its name; a hover
 * names it; a click opens it and puts the shared cursor on its exact or busiest moment, or its start.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GUNMETAL } from '../../../styles/tokens';
import { fractionAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import { useMessages } from '../../../i18n/app/i18n';
import styles from './TimestreamDrawer.module.css';

export const SPAN_ROW_PX = 14;
/** The lane's height for its rows: as many as its spans need, at least one. */
export const spanLaneHeight = (rows: number): number => Math.max(1, rows) * SPAN_ROW_PX + 2;
const LABEL_PX = 11;
/** A pointer this near a bar's end is on it. */
const SLACK_PX = 3;

export interface SpanItem {
  key: string;
  fromMs: number;
  untilMs: number;
  /** Its exact or busiest moment: the tick, and where a click puts the cursor. */
  peakMs?: number;
  colour: string;
  /** Its weight through time, 0–1, drawn as the bar's height; null inside a band. None: a flat bar. */
  weightAt?: (ms: number) => number | null;
  /** On the bar where it fits; the opened card's name. */
  label: string;
  /** The hover's words and the card's first line. */
  title: string;
  /** The card's second line. */
  detail?: string | null;
  /** Lines under it: a call's events, once its window has closed (PW40). */
  lines?: readonly string[];
}

export interface PlacedSpan { item: SpanItem; row: number }

export interface SpanAction { label: string; offers: (key: string) => boolean; run: (key: string) => void }

export interface SpanLaneProps {
  placed: readonly PlacedSpan[];
  /** How many spans did not fit the rows. */
  hidden: number;
  rows: number;
  view: TimeView;
  width: number;
  /** Puts the shared cursor on an opened span's moment. */
  onSeek?: (ms: number) => void;
  testId: string;
  cardTestId: string;
  /** The count of spans left out, as the lane says it. */
  moreLabel?: (n: number) => string;
  /** The hover and the opened card under the span, for a lane at the top, where above is the ruler. */
  opensBelow?: boolean;
  /** Buttons on an opened span's card, each for the spans it offers itself to. */
  actions?: readonly SpanAction[];
}

const SpanLane: React.FC<SpanLaneProps> = ({ placed, hidden, rows, view, width, onSeek, testId, cardTestId, moreLabel, opensBelow = false, actions = [] }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; item: SpanItem } | null>(null);
  const [open, setOpen] = useState<PlacedSpan | null>(null);
  const height = spanLaneHeight(rows);
  const xOf = (ms: number) => fractionAt(view, ms) * width;
  const inView = (ms: number) => ms >= view.startMs && ms <= view.startMs + view.spanMs;

  // An opened span stays open while it is still drawn.
  useEffect(() => {
    setOpen((was) => (was ? placed.find((p) => p.item.key === was.item.key) ?? null : null));
  }, [placed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${LABEL_PX}px ${getComputedStyle(canvas).fontFamily || 'monospace'}`;
    ctx.textBaseline = 'middle';
    for (const { item, row } of placed) {
      const x0 = Math.max(0, xOf(item.fromMs));
      const x1 = Math.min(width, xOf(item.untilMs));
      const y = 1 + row * SPAN_ROW_PX;
      const inner = SPAN_ROW_PX - 2;
      ctx.fillStyle = item.colour;
      if (item.weightAt && x1 - x0 >= 2) {
        // The curve: a pixel a step, its height the weight there; a band, with no curve, its full height.
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(x0, y + 1 + inner);
        for (let x = x0; x <= x1; x += 1) {
          const weight = item.weightAt(view.startMs + (x / width) * view.spanMs);
          ctx.lineTo(x, y + 1 + inner - (weight === null ? 1 : Math.min(1, weight)) * inner);
        }
        ctx.lineTo(x1, y + 1 + inner);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x0, y + 1, Math.max(1, x1 - x0), inner);
      }
      ctx.globalAlpha = 1;
      if (item.peakMs !== undefined && inView(item.peakMs)) ctx.fillRect(xOf(item.peakMs) - 1, y, 2, SPAN_ROW_PX);
      if (ctx.measureText(item.label).width + 8 < x1 - x0) {
        ctx.fillStyle = GUNMETAL[100];
        ctx.fillText(item.label, x0 + 4, y + SPAN_ROW_PX / 2);
      }
      if (open?.item.key === item.key) {
        ctx.strokeStyle = GUNMETAL[100];
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, x1 - x0) - 1, SPAN_ROW_PX - 1);
      }
    }
    ctx.globalAlpha = 1;
    // The labels follow the language, which the items carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, view, width, height, open]);

  /** The span under a point: in its row, the bar the point is on, the one whose moment is nearest. */
  const spanAt = (x: number, y: number): PlacedSpan | null => {
    const row = Math.floor((y - 1) / SPAN_ROW_PX);
    let best: PlacedSpan | null = null;
    let bestDx = Infinity;
    for (const p of placed) {
      if (p.row !== row || x < xOf(p.item.fromMs) - SLACK_PX || x > xOf(p.item.untilMs) + SLACK_PX) continue;
      const dx = Math.abs(xOf(p.item.peakMs ?? (p.item.fromMs + p.item.untilMs) / 2) - x);
      if (dx < bestDx) { best = p; bestDx = dx; }
    }
    return best;
  };
  const pointOf = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const cardSide = (x: number) => (x > width - 240 ? { right: Math.max(0, width - x) } : { left: Math.max(0, x) });

  return (
    <div className={styles.aspectLane} data-testid={testId}
      onPointerMove={(e) => { const { x, y } = pointOf(e); const p = spanAt(x, y); setHover(p ? { x, y, item: p.item } : null); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const { x, y } = pointOf(e);
        const p = spanAt(x, y);
        setOpen(p && open?.item.key !== p.item.key ? p : null);
        if (p) onSeek?.(p.item.peakMs ?? p.item.fromMs);
      }}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpen(null); e.stopPropagation(); } }}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height }} />
      {hidden > 0 && moreLabel ? <span className={styles.aspectMore}>{moreLabel(hidden)}</span> : null}
      {hover && open?.item.key !== hover.item.key ? (
        <div className={styles.readout} aria-hidden="true" style={{ ...cardSide(hover.x + 12), ...(opensBelow ? { top: hover.y + 12 } : { bottom: height - hover.y + 8 }) }}>
          <span>{hover.item.title}</span>
        </div>
      ) : null}
      {open ? (
        <div className={styles.aspectCard} role="dialog" aria-label={open.item.label} data-testid={cardTestId}
          style={{ ...cardSide(xOf(open.item.peakMs ?? open.item.fromMs)), ...(opensBelow ? { top: (open.row + 1) * SPAN_ROW_PX + 4 } : { bottom: height - open.row * SPAN_ROW_PX + 4 }) }}>
          <span className={styles.aspectCardName} style={{ borderColor: open.item.colour }}>{open.item.title}</span>
          {open.item.detail ? <span className={styles.readoutTime}>{open.item.detail}</span> : null}
          {open.item.lines?.map((line, i) => <span key={i} className={styles.readoutTime}>{line}</span>)}
          <span className={styles.group}>
            {actions.filter((a) => a.offers(open.item.key)).map((a) => (
              <button key={a.label} type="button" className={styles.chip} onClick={(e) => { e.stopPropagation(); a.run(open.item.key); setOpen(null); }}>{a.label}</button>
            ))}
            <button type="button" className={styles.chip} onClick={(e) => { e.stopPropagation(); setOpen(null); }}>{w.aspectClose}</button>
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default SpanLane;
