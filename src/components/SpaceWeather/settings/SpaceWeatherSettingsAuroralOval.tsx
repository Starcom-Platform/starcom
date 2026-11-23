import React from 'react';
import { useEcoNaturalSettings } from '../../../hooks/useEcoNaturalSettings';
import { AURORA_DRAWN, auroraDrawnOf } from './auroraDrawn';

// The aurora's settings (space-weather-visualization.md, SW3): the Space Weather panel's three choices.
const section: React.CSSProperties = { fontSize: 10, letterSpacing: 0.5, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', marginTop: 2 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };

const SpaceWeatherSettingsAuroralOval: React.FC = () => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const drawn = auroraDrawnOf(config.spaceWeather);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={section}>Aurora</div>
      <div role="radiogroup" aria-label="The aurora drawn" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {AURORA_DRAWN.map(({ drawn: choice, label, title, settings }) => (
          <label key={choice} style={row} title={title}>
            <input type="radio" name="aurora-drawn" checked={drawn === choice} onChange={() => updateSpaceWeather(settings)} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>NOAA SWPC&apos;s OVATION forecast, both hemispheres, fetched as often as the Space Weather panel says.</div>
    </div>
  );
};
export default SpaceWeatherSettingsAuroralOval;
