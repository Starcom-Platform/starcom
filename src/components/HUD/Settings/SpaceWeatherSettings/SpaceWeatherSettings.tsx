import React from 'react';
import { useEcoNaturalSettings } from '../../../../hooks/useEcoNaturalSettings';
import { useSettingsValidation } from '../../../../utils/uiSettingsReflection';
import CompactSpaceWeatherControls from './CompactSpaceWeatherControls';
import styles from './SpaceWeatherSettings.module.css';

// AI-NOTE: EcoNatural visualization settings panel for all natural/environmental data
// Redesigned with compact, modular controls optimized for 100px width sidebar

interface SpaceWeatherSettingsProps {
  subMode: 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather';
}

// 'windPatterns' -> 'Wind Patterns', 'airQuality' -> 'Air Quality' — the previous
// capitalize-first-letter-only version rendered these as 'WindPatterns'/'AirQuality'.
const formatWeatherLayerLabel = (key: string): string =>
  key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const SpaceWeatherSettings: React.FC<SpaceWeatherSettingsProps> = ({ subMode }) => {
  const {
    config,
    updateEcologicalDisasters,
    updateEarthWeather
  } = useEcoNaturalSettings();

  // Validate that UI state reflects persistent settings
  // Note: Simplified validation to avoid type mismatches
  useSettingsValidation('SpaceWeatherSettings', {
    vectorIntensity: config.spaceWeather?.vectorIntensity,
    timeRange: config.ecologicalDisasters?.timeRange, 
    forecastRange: config.earthWeather?.forecastRange
  }, {
    vectorIntensity: config.spaceWeather?.vectorIntensity,
    timeRange: config.ecologicalDisasters?.timeRange,
    forecastRange: config.earthWeather?.forecastRange
  });

  // SpaceWeather uses the real, already-shipped compact controls (verified
  // live and working). EarthWeather/EcologicalDisasters have no compact-
  // controls equivalent — CompactSpaceWeatherControls explicitly returns null
  // for any subMode other than 'SpaceWeather' — so they use the older, complete
  // per-submode panels below instead. Both paths were previously unreachable:
  // this whole component had no real mount point anywhere in the app (see
  // EcoNaturalSettingsPopup's header comment), and a since-removed unconditional
  // early return here meant even the render*Settings functions below were dead
  // code within this file on top of that. The old renderSpaceWeatherSettings
  // (300+ lines, fully superseded by CompactSpaceWeatherControls per this
  // file's own "Redesigned with compact, modular controls" AI-NOTE) has been
  // removed rather than kept as a second, confusing dead implementation.
  if (subMode === 'SpaceWeather') {
    return (
      <div className={styles.compactContainer}>
        <div className={styles.subModeTitle}>{subMode}</div>
        <CompactSpaceWeatherControls subMode={subMode} />
      </div>
    );
  }

  const renderEcologicalDisastersSettings = () => (
    <div className={styles.ecoNaturalSettings}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🌋 Disaster Types</div>
        {Object.entries(config.ecologicalDisasters.disasterTypes).map(([key, enabled]) => (
          <label key={key} className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => updateEcologicalDisasters({
                disasterTypes: {
                  ...config.ecologicalDisasters.disasterTypes,
                  [key]: e.target.checked
                }
              })}
              className={styles.checkbox}
            />
            <span className={styles.toggleLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
          </label>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>⚠️ Severity</div>
        {Object.entries(config.ecologicalDisasters.severity).map(([key, enabled]) => (
          <label key={key} className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => updateEcologicalDisasters({
                severity: {
                  ...config.ecologicalDisasters.severity,
                  [key]: e.target.checked
                }
              })}
              className={styles.checkbox}
            />
            <span className={styles.toggleLabel}>{key.replace('show', '')}</span>
          </label>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>🎯 Display</div>

        <div className={styles.sliderRow}>
          <label className={styles.sliderLabel}>Color By</label>
          <select
            value={config.ecologicalDisasters.colorMode}
            onChange={(e) => updateEcologicalDisasters({ colorMode: e.target.value as 'severity' | 'hazardType' })}
            className={styles.select}
          >
            <option value="severity">Severity (minor / major / catastrophic)</option>
            <option value="hazardType">Hazard type (earthquake / wildfire / flood...)</option>
          </select>
        </div>

        <div className={styles.sliderRow}>
          <label className={styles.sliderLabel}>
            📅 Time Range: {config.ecologicalDisasters.timeRange} days
          </label>
          <input
            type="range"
            min="1"
            max="30"
            value={config.ecologicalDisasters.timeRange}
            onChange={(e) => updateEcologicalDisasters({ timeRange: parseInt(e.target.value) })}
            className={styles.slider}
          />
        </div>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.ecologicalDisasters.showImpactRadius}
            onChange={(e) => updateEcologicalDisasters({ showImpactRadius: e.target.checked })}
            className={styles.checkbox}
          />
          <span className={styles.toggleLabel}>Show Impact Radius</span>
        </label>

        {config.ecologicalDisasters.showImpactRadius && (
          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel}>
              🎨 Radius Opacity: {config.ecologicalDisasters.radiusOpacity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.ecologicalDisasters.radiusOpacity}
              onChange={(e) => updateEcologicalDisasters({ radiusOpacity: parseInt(e.target.value) })}
              className={styles.slider}
            />
          </div>
        )}

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.ecologicalDisasters.showEvacuationZones}
            onChange={(e) => updateEcologicalDisasters({ showEvacuationZones: e.target.checked })}
            className={styles.checkbox}
          />
          <span className={styles.toggleLabel}>Show Evacuation Zones</span>
        </label>
      </div>
    </div>
  );

  const renderEarthWeatherSettings = () => (
    <div className={styles.ecoNaturalSettings}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>🌤️ Weather Layers</div>
        {Object.entries(config.earthWeather.weatherLayers).map(([key, enabled]) => (
          <React.Fragment key={key}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => updateEarthWeather({
                  weatherLayers: {
                    ...config.earthWeather.weatherLayers,
                    [key]: e.target.checked
                  }
                })}
                className={styles.checkbox}
              />
              <span className={styles.toggleLabel}>{formatWeatherLayerLabel(key)}</span>
            </label>
            {/* Marker color meaning for this layer was previously undocumented
                anywhere in the UI — tide (blue) vs. streamflow (green) real
                gauge readings otherwise look like an arbitrary color choice. */}
            {key === 'waterGauges' && (
              <div style={{ fontSize: '9px', color: '#7a8a99', marginLeft: '16px', marginBottom: '4px' }}>
                <span style={{ color: '#33aaff' }}>●</span> Tide gauges &nbsp;
                <span style={{ color: '#33dd88' }}>●</span> Streamflow gauges
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>🎨 Color By</div>
        <select
          value={config.earthWeather.colorMode}
          onChange={(e) => updateEarthWeather({ colorMode: e.target.value as 'temperature' | 'rain' | 'airQuality' })}
          className={styles.select}
        >
          <option value="temperature">Temperature</option>
          <option value="rain">Rain (radar where it reaches, the model elsewhere)</option>
          <option value="airQuality">Air Quality (US AQI)</option>
        </select>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>⚙️ Display Mode</div>
        
        <select
          value={config.earthWeather.displayMode}
          onChange={(e) => updateEarthWeather({ displayMode: e.target.value as 'realtime' | 'forecast' | 'historical' })}
          className={styles.select}
        >
          <option value="realtime">Real-time</option>
          <option value="forecast">Forecast</option>
          <option value="historical">Historical</option>
        </select>

        {config.earthWeather.displayMode === 'forecast' && (
          <div className={styles.sliderRow}>
            <label className={styles.sliderLabel}>
              📅 Forecast: {config.earthWeather.forecastRange}h
            </label>
            <input
              type="range"
              min="1"
              max="240"
              value={config.earthWeather.forecastRange}
              onChange={(e) => updateEarthWeather({ forecastRange: parseInt(e.target.value) })}
              className={styles.slider}
            />
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>📊 Units</div>
        
        <div className={styles.unitRow}>
          <label className={styles.unitLabel}>Temperature:</label>
          <select
            value={config.earthWeather.temperatureUnit}
            onChange={(e) => updateEarthWeather({ temperatureUnit: e.target.value as 'celsius' | 'fahrenheit' | 'kelvin' })}
            className={styles.unitSelect}
          >
            <option value="celsius">°C</option>
            <option value="fahrenheit">°F</option>
            <option value="kelvin">K</option>
          </select>
        </div>

        <div className={styles.unitRow}>
          <label className={styles.unitLabel}>Wind:</label>
          <select
            value={config.earthWeather.windUnit}
            onChange={(e) => updateEarthWeather({ windUnit: e.target.value as 'kmh' | 'mph' | 'ms' | 'knots' })}
            className={styles.unitSelect}
          >
            <option value="kmh">km/h</option>
            <option value="mph">mph</option>
            <option value="ms">m/s</option>
            <option value="knots">knots</option>
          </select>
        </div>
      </div>
    </div>
  );

  // Only 'EcologicalDisasters' | 'EarthWeather' reach here — 'SpaceWeather'
  // already returned above.
  return (
    <div className={styles.ecoNaturalContainer}>
      <div className={styles.subModeTitle}>{subMode}</div>
      {subMode === 'EcologicalDisasters' ? renderEcologicalDisastersSettings() : renderEarthWeatherSettings()}
    </div>
  );
};

export default SpaceWeatherSettings;
