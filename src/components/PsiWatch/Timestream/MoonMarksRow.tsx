/**
 * The Moon's lane past a few months (decision D-PW, PW51), drawn over its row in the lanes: new moons dim, full moons
 * bright; past three years the eclipses alone, solar gold and lunar copper, a total, annular or hybrid one the row's
 * full height and a partial or penumbral one half of it.
 */
import React, { useEffect, useRef } from 'react';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import type { MoonMark } from '../../../services/psiWatch/timestream/moonMarks';
import { fractionAt, type TimeView } from '../../../services/psiWatch/timestream/timeView';
import styles from './TimestreamDrawer.module.css';

export const markColour = (mark: MoonMark): string =>
  mark.kind === 'full' ? GUNMETAL[100] : mark.kind === 'new' ? GUNMETAL[500] : DATA_SCALES.eclipses[mark.kind];
/** A total, annular or hybrid eclipse stands the row's full height; a partial or penumbral one half. */
const isGreat = (mark: MoonMark) => mark.sub === 'total' || mark.sub === 'annular' || mark.sub === 'hybrid';

export interface MoonMarksRowProps {
  marks: readonly MoonMark[];
  view: TimeView;
  width: number;
  top: number;
  height: number;
}

const MoonMarksRow: React.FC<MoonMarksRowProps> = ({ marks, view, width, top, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width <= 0) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const mark of marks) {
      const x = fractionAt(view, mark.ms) * width;
      if (x < -2 || x > width + 2) continue;
      const h = mark.kind === 'solar' || mark.kind === 'lunar' ? (isGreat(mark) ? height : height / 2) : height;
      ctx.fillStyle = markColour(mark);
      ctx.fillRect(x - 1, height - h, 2, h);
    }
  }, [marks, view, width, height]);
  return <canvas ref={canvasRef} className={styles.markRow} style={{ top, height }} aria-hidden="true" data-testid="psi-timestream-moon-marks" />;
};

export default MoonMarksRow;
