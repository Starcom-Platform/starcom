import React from 'react';
import { useTemporalStateOptional, useClockNow } from '../../context/TemporalContext';
import { formatUtcDateTime } from '../../utils/utcTime';

const HOUR = 3_600_000;

/** Earth Weather's hours, as WX12 names them: now, and how far ahead. */
const STEPS = [
  { label: 'Now', hours: 0 },
  { label: '+6 h', hours: 6 },
  { label: '+12 h', hours: 12 },
  { label: '+1 d', hours: 24 },
  { label: '+3 d', hours: 72 },
  { label: '+7 d', hours: 168 },
] as const;

/** How near the cursor must stay to a step's hour for the step to read as chosen: time moves on after a click. */
const CHOSEN_WITHIN_MS = 45 * 60_000;

const stripStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' };
/*
 * The border in longhands only. With the shorthand here and borderColor in the
 * chosen style, a step losing its choice had its colour removed and kept the
 * stylesheet's default border: found in the running app.
 */
const stepStyle: React.CSSProperties = {
  font: 'inherit', fontSize: '11px', lineHeight: 1.4, padding: '1px 6px', borderRadius: '3px', cursor: 'pointer',
  background: 'transparent', color: 'var(--sc-text-body)',
  borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--sc-divider)',
};
const chosenStyle: React.CSSProperties = { ...stepStyle, color: 'var(--sc-accent)', borderColor: 'var(--sc-accent)' };

/**
 * ForecastStrip — Earth Weather's forecast hours, a click away (decision D-W,
 * WX12). Each moves the one shared time cursor (decision D-E), so every layer
 * agrees on the moment: Now returns to live, and every other step pauses the
 * cursor that many hours from now, the hour a weather model forecasts. On
 * hover, each says the UTC moment it chooses.
 */
export const ForecastStrip: React.FC = () => {
  const temporal = useTemporalStateOptional();
  const now = useClockNow();
  if (!temporal) return null;
  const ahead = temporal.currentTime - now;
  const chosen = temporal.isLive
    ? 0
    : STEPS.find((step) => step.hours > 0 && Math.abs(ahead - step.hours * HOUR) <= CHOSEN_WITHIN_MS)?.hours;
  return (
    <div role="group" aria-label="Forecast hours" data-testid="forecast-strip" style={stripStyle}>
      {STEPS.map((step) => {
        const pressed = chosen === step.hours;
        return (
          <button
            key={step.label}
            type="button"
            aria-pressed={pressed}
            style={pressed ? chosenStyle : stepStyle}
            title={step.hours === 0 ? 'Live: now, as it moves' : `${formatUtcDateTime(now + step.hours * HOUR, { year: true })}, as forecast`}
            onClick={() => (step.hours === 0 ? temporal.setIsLive(true) : temporal.setCurrentTime(now + step.hours * HOUR))}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
};
