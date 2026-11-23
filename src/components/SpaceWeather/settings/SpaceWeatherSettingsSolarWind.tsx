import React from 'react';
import { useEcoNaturalSettings } from '../../../hooks/useEcoNaturalSettings';

// The solar wind's settings (space-weather-visualization.md, SW6, SW16–SW18, SW22): the stream from the Sun, NOAA's ENLIL model, DONKI's CMEs, and the bow shock.
const section: React.CSSProperties = { fontSize: 10, letterSpacing: 0.5, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', marginTop: 2 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 };
const inset: React.CSSProperties = { ...row, paddingLeft: 18 };

const SpaceWeatherSettingsSolarWind: React.FC = () => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const sw = config.spaceWeather;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={section}>Solar wind</div>
      <label style={row} title="The stream from the Sun to the Earth a few days ago, from wind measured at L1. Seen when the camera draws back to the Sun.">
        <input type="checkbox" checked={sw.showHeliosphere !== false} onChange={e => updateSpaceWeather({ showHeliosphere: e.target.checked })} />
        Sun to Earth (a hindcast)
      </label>
      <label style={row} title="The wind measured now, streaming past the magnetosphere. The way it parts round it is a model.">
        <input type="checkbox" checked={sw.showNearEarthFlow !== false} onChange={e => updateSpaceWeather({ showNearEarthFlow: e.target.checked })} />
        Near the Earth (now)
      </label>
      <label style={row} title="NOAA's ENLIL model of the solar wind, from days ago to days ahead. Seen when the camera draws back to the Sun.">
        <input type="checkbox" checked={sw.showEnlil !== false} onChange={e => updateSpaceWeather({ showEnlil: e.target.checked })} />
        ENLIL model (days ago to days ahead)
      </label>
      {(['density', 'velocity'] as const).map((q) => (
        <label key={q} style={inset} title={q === 'density' ? 'How dense the wind is, scaled by distance from the Sun' : 'How fast the wind streams out from the Sun'}>
          <input type="radio" name="enlil-quantity" checked={(sw.enlilQuantity ?? 'density') === q} onChange={() => updateSpaceWeather({ enlilQuantity: q })} />
          {q === 'density' ? 'Density' : 'Speed'}
        </label>
      ))}
      <label style={row} title="Coronal mass ejections NASA's DONKI saw leave the Sun, at their modelled fronts. Seen when the camera draws back to the Sun.">
        <input type="checkbox" checked={sw.showCmes !== false} onChange={e => updateSpaceWeather({ showCmes: e.target.checked })} />
        CMEs (NASA DONKI)
      </label>
      <label style={row} title="Where the solar wind meets the magnetosphere's field and slows">
        <input type="checkbox" checked={sw.showSolarWind === true} onChange={e => updateSpaceWeather({ showSolarWind: e.target.checked })} />
        Bow shock
      </label>
      <div style={{ fontSize: 11, opacity: 0.65 }}>NOAA SWPC&apos;s wind measured at L1, traced back; ENLIL read off SWPC&apos;s frames; CMEs from NASA&apos;s DONKI.</div>
    </div>
  );
};
export default SpaceWeatherSettingsSolarWind;
