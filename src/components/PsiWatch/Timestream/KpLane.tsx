/**
 * The field lane (decision D-PW, PW42, PW51): Kp under the cursor's sky, as bars by its level, quiet grey through
 * NOAA's G scale. Measured solid, NOAA's estimates lighter, its forecast and outlook outlined, so what is known never
 * reads as what is expected. Its form follows the zoom: 3-hourly values, each day's largest, storm days alone, then
 * storms a year. A faint line marks Kp 5, where a storm begins. A hover reads the bar; a click puts the cursor there.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { kpBars, kpLod, kpName, STORM_KP, stormLevel, type KpBar, type KpBasis, type KpRecord } from '../../../services/psiWatch/timestream/kp';
import { fractionAt, msAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import { touchesWithheld, WITHHELD } from '../../../services/psiWatch/timestream/withheld';
import { HeldBand, heldAt } from './HeldBand';
import styles from './TimestreamDrawer.module.css';

export const KP_LANE_PX = 32;
/** Storms a year: the lane's top never lower than this many. */
const STORMS_FLOOR = 10;
const MEASURED: ReadonlySet<KpBasis> = new Set(['definitive', 'preliminary', 'observed']);
const EXPECTED: ReadonlySet<KpBasis> = new Set(['predicted', 'outlook']);

/** A Kp's colour: quiet, unsettled, then G1–G5. */
export const kpColour = (kp: number): string => DATA_SCALES.kpLevels[kp >= STORM_KP ? 1 + stormLevel(kp) : kp >= 4 ? 1 : 0];

export interface KpLaneProps {
  record: KpRecord | null;
  view: TimeView;
  width: number;
  onSeek?: (ms: number) => void;
}

const KpLane: React.FC<KpLaneProps> = ({ record, view, width, onSeek }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; bar: KpBar } | null>(null);
  const [heldHover, setHeldHover] = useState<{ x: number; years: string } | null>(null);
  const lod = kpLod(view.spanMs);
  // Kp's 1966–2025 held back for Mecha Jono's sealed tests (PW75); the live days are not.
  const bars = useMemo(() => (record ? kpBars(record, view, lod).filter((b) => !touchesWithheld('storms', b.fromMs, b.untilMs)) : []), [record, view, lod]);
  const stormsTop = useMemo(() => Math.max(STORMS_FLOOR, ...bars.map((b) => b.storms ?? 0)), [bars]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(KP_LANE_PX * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, KP_LANE_PX);
    const inner = KP_LANE_PX - 3;
    const floor = KP_LANE_PX - 1;
    if (lod !== 'years') {
      // Where a storm begins.
      ctx.fillStyle = GUNMETAL[600];
      ctx.fillRect(0, Math.round(floor - (STORM_KP / 9) * inner), width, 1);
    }
    for (const bar of bars) {
      const x0 = fractionAt(view, bar.fromMs) * width;
      const x1 = fractionAt(view, bar.untilMs) * width;
      // A bar too narrow to see stands a pixel and a half wide.
      const barWidth = Math.max(1.5, x1 - x0 - (x1 - x0 > 3 ? 1 : 0));
      const share = bar.storms !== undefined ? bar.storms / stormsTop : (bar.kp ?? 0) / 9;
      const h = Math.max(1, share * inner);
      const colour = bar.storms !== undefined ? DATA_SCALES.kpLevels[2] : kpColour(bar.kp ?? 0);
      if (EXPECTED.has(bar.basis)) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = colour;
        ctx.fillRect(x0, floor - h, barWidth, h);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, floor - h + 0.5, Math.max(0.5, barWidth - 1), Math.max(0.5, h - 1));
      } else {
        ctx.globalAlpha = MEASURED.has(bar.basis) ? 0.9 : 0.6;
        ctx.fillStyle = colour;
        ctx.fillRect(x0, floor - h, barWidth, h);
      }
    }
    ctx.globalAlpha = 1;
  }, [bars, view, width, lod, stormsTop]);

  const barAt = (x: number): KpBar | null => {
    const ms = msAt(view, x / Math.max(1, width));
    // The bar the point is in, or the nearest within two pixels, for the narrow.
    const slack = (2 / Math.max(1, width)) * view.spanMs;
    let best: KpBar | null = null;
    let bestDistance = Infinity;
    for (const bar of bars) {
      const distance = ms < bar.fromMs ? bar.fromMs - ms : ms > bar.untilMs ? ms - bar.untilMs : 0;
      if (distance <= slack && distance < bestDistance) { best = bar; bestDistance = distance; }
    }
    return best;
  };
  const words = (bar: KpBar): string => {
    const basis = (w.kpBases as Record<string, string>)[bar.basis] ?? bar.basis;
    if (bar.storms !== undefined) return counted(w.kpYear, bar.storms, { year: new Date(bar.fromMs).getUTCFullYear() });
    const kp = kpName(bar.kp ?? 0);
    const level = stormLevel(bar.kp ?? 0);
    const daily = lod !== 'slots' || bar.basis === 'outlook';
    if (level) return fill(daily ? w.kpDayStorm : w.kpReadoutStorm, { kp, level: `G${level}`, basis });
    return fill(daily ? w.kpDay : w.kpReadout, { kp, basis });
  };
  const xOfEvent = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => e.clientX - e.currentTarget.getBoundingClientRect().left;

  return (
    <div className={styles.aspectLane} data-testid="psi-timestream-kp"
      onPointerMove={(e) => {
        const x = xOfEvent(e);
        const years = heldAt(WITHHELD.storms, msAt(view, x / Math.max(1, width)));
        const bar = years ? null : barAt(x);
        setHeldHover(years ? { x, years } : null);
        setHover(bar ? { x, bar } : null);
      }}
      onPointerLeave={() => { setHover(null); setHeldHover(null); }}
      onClick={(e) => onSeek?.(msAt(view, xOfEvent(e) / Math.max(1, width)))}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ height: KP_LANE_PX }} />
      <HeldBand held={WITHHELD.storms} view={view} width={width} height={KP_LANE_PX} words={(years) => fill(w.echoesWithheld, { years })} />
      {heldHover ? (
        <div className={styles.readout} aria-hidden="true" data-testid="psi-timestream-kp-readout"
          style={{ ...(heldHover.x > width - 240 ? { right: width - heldHover.x + 12 } : { left: heldHover.x + 12 }), top: KP_LANE_PX + 4 }}>
          <span>{fill(w.echoesWithheld, { years: heldHover.years })}</span>
        </div>
      ) : null}
      {hover ? (
        <div className={styles.readout} aria-hidden="true" data-testid="psi-timestream-kp-readout"
          style={{ ...(hover.x > width - 240 ? { right: width - hover.x + 12 } : { left: hover.x + 12 }), top: KP_LANE_PX + 4 }}>
          <span>{words(hover.bar)}</span>
          <span className={styles.readoutTime}>{fill(w.kpSpan, {
            from: formatUtcDateTime(hover.bar.fromMs, { year: true }), until: formatUtcDateTime(hover.bar.untilMs, { year: true }),
          })}</span>
        </div>
      ) : null}
    </div>
  );
};

export default KpLane;
