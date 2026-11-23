import React from 'react';
import { useEcoNaturalSettings } from '../../../hooks/useEcoNaturalSettings';
import { FIELD_LINES_DRAWN, fieldLinesDrawnOf } from './fieldLineChoices';

// The magnetosphere's settings (space-weather-visualization.md, SW4): its boundary, and its field lines as the Space Weather panel offers them.
const section: React.CSSProperties = { fontSize: 10, letterSpacing: 0.5, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', marginTop: 2 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };

const SpaceWeatherSettingsMagnetopause: React.FC = () => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const sw = config.spaceWeather;
  const drawn = fieldLinesDrawnOf(sw);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={section}>Magnetopause</div>
      <label style={row} title="The magnetopause's stand-off, from the solar wind's pressure">
        <input type="checkbox" checked={sw.showMagnetopause} onChange={e => updateSpaceWeather({ showMagnetopause: e.target.checked })} />
        Magnetopause
      </label>
      <label style={row} title="Seen as the camera draws back: the outer belt brightened by the electrons GOES measures">
        <input type="checkbox" checked={sw.showVanAllen !== false} onChange={e => updateSpaceWeather({ showVanAllen: e.target.checked })} />
        Van Allen belts
      </label>
      <label style={row} title="Where the solar wind reaches the atmosphere, and bursts at the magnetopause while the IMF points south">
        <input type="checkbox" checked={sw.showCusps !== false} onChange={e => updateSpaceWeather({ showCusps: e.target.checked })} />
        Cusps
      </label>
      <label style={row} title="Where the field turns from earthward to tailward down the night side">
        <input type="checkbox" checked={sw.showTailSheet !== false} onChange={e => updateSpaceWeather({ showTailSheet: e.target.checked })} />
        Tail current sheet
      </label>
      <div style={section}>Field lines</div>
      <div role="radiogroup" aria-label="The field lines drawn" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {FIELD_LINES_DRAWN.map(({ drawn: choice, label, title, settings }) => (
          <label key={choice} style={row} title={title}>
            <input type="radio" name="field-lines-drawn" checked={drawn === choice} onChange={() => updateSpaceWeather(settings)} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>N. A. Tsyganenko&apos;s T96 model and IGRF-14, driven by the solar wind NOAA measures: model output, not a measurement.</div>
    </div>
  );
};
export default SpaceWeatherSettingsMagnetopause;
