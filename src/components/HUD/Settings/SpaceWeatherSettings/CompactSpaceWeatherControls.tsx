// CompactSpaceWeatherControls.tsx - Redesigned compact controls for EcoNatural SpaceWeather mode

import React, { useState } from 'react';
import { useEcoNaturalSettings } from '../../../../hooks/useEcoNaturalSettings';
import { useSpaceWeatherContext } from '../../../../context/SpaceWeatherContext';
import SpaceWeatherPresets from './SpaceWeatherPresets';
import SpaceWeatherIntensity from './SpaceWeatherIntensity';
import NOAADataToggle from './NOAADataToggle';
import AdvancedNOAATabbed from './AdvancedNOAATabbed';
import styles from './CompactSpaceWeatherControls.module.css';
import UtcTime from '../../../Shared/UtcTime';
import { AURORA_DRAWN, auroraDrawnOf } from '../../../SpaceWeather/settings/auroraDrawn';
import { FIELD_LINES_DRAWN, fieldLinesDrawnOf } from '../../../SpaceWeather/settings/fieldLineChoices';
import { DEFAULT_DATASETS, E_FIELD_LOOKS, REFRESH_MINUTES, refreshMinutesOf, refreshSettingsFor, type DatasetKey } from '../../../SpaceWeather/settings/eFieldChoices';

interface CompactSpaceWeatherControlsProps {
  subMode: 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather';
}

/**
 * Compact, modular space weather controls designed for 100px width
 * Simplifies 30+ NOAA datasets into manageable presets and categories
 */
const defaultDatasetState: Record<DatasetKey, boolean> = DEFAULT_DATASETS;

const CompactSpaceWeatherControls: React.FC<CompactSpaceWeatherControlsProps> = ({ subMode }) => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const { 
    isLoading, 
    error, 
    lastUpdated,
    telemetry
  } = useSpaceWeatherContext();
  // Every sample read, both models: the field draws them all (SW1).
  const samplesRead = (telemetry?.rawInterMag ?? 0) + (telemetry?.rawUSCanada ?? 0);
  const sw = config.spaceWeather;
  const refreshMinutes = refreshMinutesOf(sw);
  const auroraDrawn = auroraDrawnOf(sw);
  const fieldLinesDrawn = fieldLinesDrawnOf(sw);
  
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handler for preset changes with proper typing
  const handlePresetChange = (preset: 'quiet' | 'moderate' | 'storm' | 'extreme') => {
    updateSpaceWeather({ preset });
    
    // Apply preset-specific settings to visualization
    switch (preset) {
      case 'quiet':
        updateSpaceWeather({
          vectorIntensity: 20,
          vectorOpacity: 40,
          showElectricFields: true,
          showGeomagneticIndex: false,
          showSolarWind: false
        });
        break;
      case 'moderate':
        updateSpaceWeather({
          vectorIntensity: 50,
          vectorOpacity: 60,
          showElectricFields: true,
          showGeomagneticIndex: true,
          showSolarWind: true
        });
        break;
      case 'storm':
        updateSpaceWeather({
          vectorIntensity: 75,
          vectorOpacity: 80,
          showElectricFields: true,
          showGeomagneticIndex: true,
          showSolarWind: true,
          showMagneticField: true,
          showAuroralOval: true
        });
        break;
      case 'extreme':
        updateSpaceWeather({
          vectorIntensity: 100,
          vectorOpacity: 100,
          showElectricFields: true,
          showGeomagneticIndex: true,
          showSolarWind: true,
          showMagneticField: true,
          showAuroralOval: true,
          showKpIndex: true
        });
        break;
    }
  };

  const enabledDatasets = config.spaceWeather.enabledDatasets || defaultDatasetState;

  // Handler for category toggles
  const handleCategoryToggle = (category: 'solar' | 'geomagnetic' | 'radiation', enabled: boolean) => {
    switch (category) {
      case 'solar':
        updateSpaceWeather({
          showSolarWind: enabled,
          showMagnetopause: enabled
        });
        break;
      case 'geomagnetic':
        updateSpaceWeather({
          showElectricFields: enabled,
          showGeomagneticIndex: enabled,
          showMagneticField: enabled,
          showAuroralOval: enabled
        });
        break;
      case 'radiation':
        updateSpaceWeather({
          showKpIndex: enabled,
          showAlerts: enabled
        });
        break;
    }
  };

  const handleDatasetToggle = (dataset: DatasetKey) => {
    const nextState: Record<DatasetKey, boolean> = {
      ...defaultDatasetState,
      ...enabledDatasets,
      [dataset]: !enabledDatasets[dataset]
    };
    updateSpaceWeather({ enabledDatasets: nextState });
  };

  const datasetOptions: Array<{ key: DatasetKey; label: string; accent: string; count: number }> = [
    { key: 'intermag', label: 'InterMag', accent: 'cyan', count: telemetry?.rawInterMag ?? 0 },
    { key: 'usCanada', label: 'US/Canada', accent: 'orange', count: telemetry?.rawUSCanada ?? 0 },
    { key: 'pipeline', label: 'Pipeline', accent: 'purple', count: telemetry?.rawPipeline ?? 0 }
  ];

  if (subMode !== 'SpaceWeather') {
    return null; // Only show for SpaceWeather submode
  }

  return (
    <div className={styles.compactControls}>
      {/* Status indicator */}
      <div className={styles.statusBar}>
        {isLoading && <span className={styles.statusDot}>●</span>}
        {error && <span className={styles.errorDot}>●</span>}
        {samplesRead > 0 && (
          <span className={styles.vectorCount} title="NOAA samples read; the field draws them all">{samplesRead}</span>
        )}
      </div>

      {/* Space Weather Activity Presets - Primary Control */}
      <SpaceWeatherPresets 
        currentPreset={config.spaceWeather.preset || 'moderate'}
        onPresetChange={handlePresetChange}
      />

      {/* Overall Intensity Control */}
      <SpaceWeatherIntensity
        intensity={config.spaceWeather.vectorIntensity || 50}
        opacity={config.spaceWeather.vectorOpacity || 50}
        onIntensityChange={(intensity) => updateSpaceWeather({ vectorIntensity: intensity })}
        onOpacityChange={(opacity) => updateSpaceWeather({ vectorOpacity: opacity })}
      />

      {/* Dataset toggles */}
      <div className={styles.datasetGroup}>
        <div className={styles.datasetHeader}>Datasets</div>
        <div className={styles.datasetButtons}>
          {datasetOptions.map(option => {
            const active = enabledDatasets?.[option.key];
            return (
              <button
                key={option.key}
                type="button"
                className={`${styles.datasetButton} ${active ? styles.datasetButtonActive : ''}`}
                onClick={() => handleDatasetToggle(option.key)}
                aria-pressed={active}
                title={`${option.label} • ${option.count} vectors`}
                style={{ borderColor: active ? option.accent : undefined }}
              >
                <span>{option.label}</span>
                <span className={styles.datasetCount}>{option.count}</span>
              </button>
            );
          })}
        </div>
      </div>

        {/* The e-field: how it shows its direction, its colours, its streaks, how often it is fetched (SW1, SW2) */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>E-field</div>
          <div className={styles.samplingModes} role="group" aria-label="How the e-field shows its direction">
            {E_FIELD_LOOKS.map(({ look, label, title }) => (
              <button
                key={look}
                type="button"
                className={`${styles.samplingModeButton} ${(sw.eFieldLook ?? 'streaks') === look ? styles.samplingModeActive : ''}`}
                aria-pressed={(sw.eFieldLook ?? 'streaks') === look}
                onClick={() => updateSpaceWeather({ eFieldLook: look })}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.samplingModes} role="group" aria-label="The e-field's colour scale">
            {(['absolute', 'relative'] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                className={`${styles.samplingModeButton} ${(sw.eFieldScale ?? 'absolute') === scale ? styles.samplingModeActive : ''}`}
                aria-pressed={(sw.eFieldScale ?? 'absolute') === scale}
                onClick={() => updateSpaceWeather({ eFieldScale: scale })}
                title={scale === 'absolute' ? 'A colour means the same strength every day' : 'The colours stretched over the field drawn now'}
              >
                {scale === 'absolute' ? 'Absolute' : 'Relative'}
              </button>
            ))}
          </div>
          <div className={styles.samplingInputs}>
            <label className={styles.samplingInput}>
              <span>Speed</span>
              <input
                type="range"
                min={0.25}
                max={2}
                step={0.25}
                value={sw.eFieldFlowSpeed ?? 1}
                onChange={(e) => updateSpaceWeather({ eFieldFlowSpeed: Number(e.target.value) })}
                aria-label="How fast the e-field's streaks move"
              />
            </label>
            <label className={styles.samplingInput}>
              <span>Streaks</span>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.25}
                value={sw.eFieldFlowDensity ?? 1}
                onChange={(e) => updateSpaceWeather({ eFieldFlowDensity: Number(e.target.value) })}
                aria-label="How many streaks the e-field draws"
              />
            </label>
          </div>
        </div>

        {/* The aurora: OVATION's band with its night curtain, the band alone, or none (SW3) */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>Aurora</div>
          <div className={styles.samplingModes} role="group" aria-label="The aurora drawn">
            {AURORA_DRAWN.map(({ drawn, label, title, settings }) => (
              <button
                key={drawn}
                type="button"
                className={`${styles.samplingModeButton} ${auroraDrawn === drawn ? styles.samplingModeActive : ''}`}
                aria-pressed={auroraDrawn === drawn}
                onClick={() => updateSpaceWeather(settings)}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* The magnetosphere's field lines, T96 driven by the measured wind (SW4): many, few, or none */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>Field lines</div>
          <div className={styles.samplingModes} role="group" aria-label="The field lines drawn">
            {FIELD_LINES_DRAWN.map(({ drawn, label, title, settings }) => (
              <button
                key={drawn}
                type="button"
                className={`${styles.samplingModeButton} ${fieldLinesDrawn === drawn ? styles.samplingModeActive : ''}`}
                aria-pressed={fieldLinesDrawn === drawn}
                onClick={() => updateSpaceWeather(settings)}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* The magnetosphere's other parts, each on or off (SW5) */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>Magnetosphere</div>
          <div className={styles.samplingModes} role="group" aria-label="The magnetosphere's parts drawn">
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showVanAllen !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showVanAllen !== false}
              onClick={() => updateSpaceWeather({ showVanAllen: sw.showVanAllen === false })}
              title="The Van Allen belts, seen as the camera draws back: the outer brightened by the electrons GOES measures"
            >
              Belts
            </button>
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showCusps !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showCusps !== false}
              onClick={() => updateSpaceWeather({ showCusps: sw.showCusps === false })}
              title="The polar cusps, where the solar wind reaches the atmosphere, and bursts at the magnetopause while the IMF points south"
            >
              Cusps
            </button>
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showTailSheet !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showTailSheet !== false}
              onClick={() => updateSpaceWeather({ showTailSheet: sw.showTailSheet === false })}
              title="The magnetotail's current sheet, where the field turns from earthward to tailward down the night side"
            >
              Tail sheet
            </button>
          </div>
        </div>

        {/* The solar wind's particles (SW6, SW17): the stream from the Sun, a hindcast */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>Solar wind</div>
          <div className={styles.samplingModes} role="group" aria-label="The solar wind drawn">
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showHeliosphere !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showHeliosphere !== false}
              onClick={() => updateSpaceWeather({ showHeliosphere: sw.showHeliosphere === false })}
              title="The stream from the Sun to the Earth a few days ago, from wind measured at L1. Seen when the camera draws back to the Sun."
            >
              Sun–Earth
            </button>
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showNearEarthFlow !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showNearEarthFlow !== false}
              onClick={() => updateSpaceWeather({ showNearEarthFlow: sw.showNearEarthFlow === false })}
              title="The wind measured now, streaming past the magnetosphere. The way it parts round it is a model."
            >
              Near Earth
            </button>
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showEnlil !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showEnlil !== false}
              onClick={() => updateSpaceWeather({ showEnlil: sw.showEnlil === false })}
              title="NOAA's ENLIL model of the solar wind, from days ago to days ahead. Seen when the camera draws back to the Sun."
            >
              ENLIL
            </button>
            <button
              type="button"
              className={`${styles.samplingModeButton} ${sw.showCmes !== false ? styles.samplingModeActive : ''}`}
              aria-pressed={sw.showCmes !== false}
              onClick={() => updateSpaceWeather({ showCmes: sw.showCmes === false })}
              title="Coronal mass ejections NASA's DONKI saw leave the Sun, at their modelled fronts. Seen when the camera draws back to the Sun."
            >
              CMEs
            </button>
          </div>
          {sw.showEnlil !== false && (
            <div className={styles.samplingModes} role="group" aria-label="What ENLIL shows">
              {(['density', 'velocity'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`${styles.samplingModeButton} ${(sw.enlilQuantity ?? 'density') === q ? styles.samplingModeActive : ''}`}
                  aria-pressed={(sw.enlilQuantity ?? 'density') === q}
                  onClick={() => updateSpaceWeather({ enlilQuantity: q })}
                  title={q === 'density' ? 'How dense the wind is, scaled by distance from the Sun' : 'How fast the wind streams out from the Sun'}
                >
                  {q === 'density' ? 'Density' : 'Speed'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* How often both are fetched: one cadence for NOAA's e-field files and OVATION (SW2) */}
        <div className={styles.samplingGroup}>
          <div className={styles.samplingHeader}>E-field &amp; aurora</div>
          <div className={styles.samplingInputs}>
            <label className={styles.samplingInput}>
              <span>Fetch</span>
              <select
                value={refreshMinutes}
                onChange={(e) => updateSpaceWeather(refreshSettingsFor(Number(e.target.value)))}
                aria-label="How often NOAA's e-field files and aurora forecast are fetched"
              >
                {REFRESH_MINUTES.map((m) => <option key={m} value={m}>{m === 0 ? 'once' : `${m} min`}</option>)}
              </select>
            </label>
          </div>
        </div>

      {/* Quick Data Category Toggles */}
      <NOAADataToggle
        solarEnabled={config.spaceWeather.showSolarWind}
        geomagneticEnabled={config.spaceWeather.showElectricFields}
        radiationEnabled={config.spaceWeather.showKpIndex}
        onSolarToggle={(enabled) => handleCategoryToggle('solar', enabled)}
        onGeomagneticToggle={(enabled) => handleCategoryToggle('geomagnetic', enabled)}
        onRadiationToggle={(enabled) => handleCategoryToggle('radiation', enabled)}
      />

      {/* Advanced Settings - Compact Button */}
      <div className={styles.advancedSection}>
        <button
          className={styles.advancedButton}
          onClick={() => setShowAdvanced(!showAdvanced)}
          title="Advanced NOAA Dataset Controls"
          disabled={isLoading}
        >
          <span className={styles.advancedIcon}>⚙️</span>
          <span className={styles.advancedLabel}>NOAA</span>
        </button>
        {lastUpdated && (
          <div className={styles.lastUpdated}>
            <UtcTime at={lastUpdated} />
          </div>
        )}
      </div>

      {/* Advanced Settings Tabbed Popup */}
      {showAdvanced && (
        <AdvancedNOAATabbed
          onClose={() => setShowAdvanced(false)}
        />
      )}
    </div>
  );
};

export default CompactSpaceWeatherControls;
