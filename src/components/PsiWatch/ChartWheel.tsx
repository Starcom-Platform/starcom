/**
 * An event chart's wheel on screen (decision D-PW, PW60, PW86): the shapes of chartWheelGeometry.ts, the same a card's
 * wheel draws (PW87), in SVG, its colours from the tokens.
 */
import React from 'react';
import type { BiWheel } from '../../services/psiWatch/astro/biWheel';
import { spreadLabels, WHEEL_MARGIN, WHEEL_SIZE, WHEEL_TEXT_SIZE, wheelShapes, type WheelTone } from '../../features/psi/chartWheelGeometry';
import { DATA_SCALES } from '../../styles/tokens';

export { spreadLabels };

const TONE: Record<WheelTone, string> = {
  rule: 'var(--sc-divider)',
  ruleSoft: 'var(--sc-divider)',
  quiet: 'var(--sc-text-secondary)',
  heading: 'var(--sc-text-heading)',
  now: DATA_SCALES.psiWatch,
};

export const ChartWheel: React.FC<{ wheel: BiWheel; label: string }> = ({ wheel, label }) => {
  const shapes = wheelShapes(wheel);
  const box = WHEEL_SIZE + 2 * WHEEL_MARGIN;
  return (
    <svg viewBox={`${-WHEEL_MARGIN} ${-WHEEL_MARGIN} ${box} ${box}`} role="img" aria-label={label} data-testid="chart-wheel"
      style={{ width: '100%', maxWidth: box, display: 'block', margin: '0 auto' }}>
      <title>{label}</title>
      {shapes.circles.map((c) => (
        <circle key={c.r} cx={shapes.centre} cy={shapes.centre} r={c.r} fill="none" stroke={TONE[c.tone]} strokeOpacity={c.tone === 'ruleSoft' ? 0.6 : 1} />
      ))}
      {shapes.lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={TONE[l.tone]} strokeWidth={l.width}
          strokeOpacity={l.opacity} strokeDasharray={l.dashed ? '4 3' : undefined} />
      ))}
      {shapes.texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} fill={TONE[t.tone]} fontSize={WHEEL_TEXT_SIZE} textAnchor="middle" dominantBaseline="central"
          {...(t.id ? { 'data-testid': `chart-${t.id}` } : {})}>
          {t.text}
        </text>
      ))}
    </svg>
  );
};

export default ChartWheel;
