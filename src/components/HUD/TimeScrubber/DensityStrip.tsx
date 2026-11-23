/**
 * The time bar's density strip (critique-2026-11-01, OR17, OR25): over the bar's axis, how many items the layers
 * drawn now hold at each moment, a bin a pixel column, each bin stacked by its layers' kind colours, the commonest
 * at the foot. Read from the marks on the globe (drawnMarks.ts) every two seconds, so it follows what is drawn as
 * layers are turned on and off; marks that keep no time are counted in the label, not drawn.
 */
import React, { useEffect, useRef, useState } from 'react';
import { getRegisteredTooltipGroups } from '../../Globe/pointTooltipRegistry';
import { eachDrawnMark, type DrawnMark } from '../../../features/globe/marks/drawnMarks';
import { densityStrip, layerIdOfName, LAYER_KIND } from '../../../features/globe/timebar/density';
import { KIND_COLOURS } from '../../../styles/tokens';
import { formatCount } from '@utils/formatCount';
import styles from './DensityStrip.module.css';

const REFRESH_MS = 2000;
/** A colour for a mark whose layer the catalogue does not name. */
const UNKNOWN = KIND_COLOURS.infra;

export interface DensityStripProps {
  range: { start: number; end: number };
  /** The layer catalogue, for each mark's layer and so its kind; without it every mark is one colour. */
  catalogue: ReadonlyArray<{ id: string; label: string }> | null;
  /** Told how many timed items the strip counted in the range, for the bar's header. */
  onCounted?: (counted: number) => void;
}

/** The drawn marks' times and layers, read now. */
function readMarks(): Array<Pick<DrawnMark, 'timeMs' | 'layer'>> {
  const marks: Array<Pick<DrawnMark, 'timeMs' | 'layer'>> = [];
  eachDrawnMark(getRegisteredTooltipGroups().filter((g) => g.parent !== null), (m) => { marks.push({ timeMs: m.timeMs, layer: m.layer }); });
  return marks;
}

export const DensityStrip: React.FC<DensityStripProps> = ({ range, catalogue, onCounted }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [marks, setMarks] = useState(readMarks);
  const [summary, setSummary] = useState({ counted: 0, untimed: 0 });

  useEffect(() => {
    const timer = setInterval(() => setMarks(readMarks()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const colourOf = (layer: string | null) => {
      const id = catalogue ? layerIdOfName(layer, catalogue) : null;
      return id && LAYER_KIND[id] ? KIND_COLOURS[LAYER_KIND[id]] : UNKNOWN;
    };
    const strip = densityStrip(marks, range, width, colourOf);
    setSummary({ counted: strip.counted, untimed: strip.untimed });
    onCounted?.(strip.counted);
    // A context only to draw with: an empty strip is cleared by the size set above.
    if (!strip.max) return;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Square-root heights: one item still shows beside a bin of hundreds.
    const scale = height / Math.sqrt(strip.max);
    strip.bins.forEach((bin, x) => {
      if (!bin.total) return;
      const full = Math.max(1, Math.sqrt(bin.total) * scale);
      let y = height;
      for (const part of bin.parts) {
        const h = (part.count / bin.total) * full;
        ctx.fillStyle = part.colour;
        ctx.fillRect(x, y - h, 1, h);
        y -= h;
      }
    });
  }, [marks, range.start, range.end, catalogue, onCounted]);

  const label = summary.counted || summary.untimed
    ? `${formatCount(summary.counted)} items drawn in this range${summary.untimed ? `; ${formatCount(summary.untimed)} keep no time` : ''}`
    : 'No timed items drawn in this range';
  return (
    <canvas ref={canvasRef} className={styles.strip} role="img" aria-label={label} title={label} data-testid="timebar-density"
      data-counted={summary.counted} data-untimed={summary.untimed} />
  );
};
