import React from 'react';
import { useEcoNaturalSettings } from '../../../hooks/useEcoNaturalSettings';
import { DEFAULT_DATASETS, E_FIELD_LOOKS, E_FIELD_MODELS, REFRESH_MINUTES, refreshMinutesOf, refreshSettingsFor } from './eFieldChoices';

// The e-field's settings (space-weather-visualization.md, SW1, SW2): the Space Weather panel's, which act on the field drawn.
const section: React.CSSProperties = { fontSize: 10, letterSpacing: 0.5, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', marginTop: 2 };
const column: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };

const SpaceWeatherSettingsElectricFields: React.FC = () => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const sw = config.spaceWeather;
  const datasets = { ...DEFAULT_DATASETS, ...(sw.enabledDatasets || {}) };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={section}>Look</div>
      <div role="radiogroup" aria-label="How the e-field shows its direction" style={column}>
        {E_FIELD_LOOKS.map(({ look, label, title }) => (
          <label key={look} style={row} title={title}>
            <input type="radio" name="e-field-look" checked={(sw.eFieldLook ?? 'streaks') === look} onChange={() => updateSpaceWeather({ eFieldLook: look })} />
            {label}
          </label>
        ))}
      </div>
      <div style={section}>Colours</div>
      <div role="radiogroup" aria-label="The e-field's colour scale" style={column}>
        {(['absolute', 'relative'] as const).map((scale) => (
          <label key={scale} style={row} title={scale === 'absolute' ? 'A colour means the same strength every day' : 'The colours stretched over the field drawn now'}>
            <input type="radio" name="e-field-scale" checked={(sw.eFieldScale ?? 'absolute') === scale} onChange={() => updateSpaceWeather({ eFieldScale: scale })} />
            {scale === 'absolute' ? 'Absolute' : 'Relative'}
          </label>
        ))}
      </div>
      <div style={section}>Streaks</div>
      <div style={column}>
        <label style={row}>
          <span>Speed</span>
          <input type="range" min={0.25} max={2} step={0.25} value={sw.eFieldFlowSpeed ?? 1} onChange={(e) => updateSpaceWeather({ eFieldFlowSpeed: Number(e.target.value) })} aria-label="How fast the e-field's streaks move" />
        </label>
        <label style={row}>
          <span>Number</span>
          <input type="range" min={0.25} max={1} step={0.25} value={sw.eFieldFlowDensity ?? 1} onChange={(e) => updateSpaceWeather({ eFieldFlowDensity: Number(e.target.value) })} aria-label="How many streaks the e-field draws" />
        </label>
      </div>
      <div style={section}>NOAA&apos;s models</div>
      <div style={column}>
        {E_FIELD_MODELS.map(({ key, label }) => (
          <label key={key} style={row}>
            <input type="checkbox" checked={datasets[key]} onChange={(e) => updateSpaceWeather({ enabledDatasets: { ...datasets, [key]: e.target.checked } })} />
            {label}
          </label>
        ))}
      </div>
      <label style={row}>
        <span>Fetch</span>
        <select value={refreshMinutesOf(sw)} onChange={(e) => updateSpaceWeather(refreshSettingsFor(Number(e.target.value)))} aria-label="How often NOAA's e-field files and aurora forecast are fetched">
          {REFRESH_MINUTES.map((m) => <option key={m} value={m}>{m === 0 ? 'once' : `${m} min`}</option>)}
        </select>
      </label>
      <div style={{ fontSize: 11, opacity: 0.65 }}>NOAA SWPC&apos;s geoelectric field models, every sample drawn; nothing where neither reaches.</div>
    </div>
  );
};

export default SpaceWeatherSettingsElectricFields;
