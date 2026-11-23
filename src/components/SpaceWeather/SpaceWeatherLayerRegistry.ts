// SpaceWeatherLayerRegistry.ts
// Central registry for tertiary space weather visualization layers
// Each layer defines id, label, emoji icon, tooltip, and associated settings component name

export type SpaceWeatherLayerCapability = 'overlay' | 'hud' | 'planned';

export interface SpaceWeatherLayerDefinition {
  id: string;
  label: string;
  emoji: string; // single-character (emoji) used for square button
  tooltip: string;
  settingsComponent?: string; // dynamic import key (component file exports default React.FC)
  experimental?: boolean;
  capability: SpaceWeatherLayerCapability;
  statusHint?: string;
}

// Canonical ordered list of all potential layers (even if unimplemented) so UI stays stable
export const SPACE_WEATHER_LAYERS: SpaceWeatherLayerDefinition[] = [
  {
    id: 'electricFields',
    label: 'Electric Fields',
    emoji: '⚡',
    tooltip: 'Electric field vectors (InterMag & US/Canada)',
    settingsComponent: 'SpaceWeatherSettingsElectricFields',
    capability: 'overlay',
    statusHint: 'Overlay + HUD controls live'
  },
  {
    id: 'geomagneticIndex',
    label: 'Geomagnetic Index',
    emoji: '🧭',
    tooltip: 'Geomagnetic indices (Kp / Dst)',
    settingsComponent: 'SpaceWeatherSettingsGeomagnetic',
    experimental: true,
    capability: 'hud',
    statusHint: 'HUD + control surface only (overlay pending)'
  },
  {
    id: 'solarWind',
    label: 'Solar Wind',
    emoji: '💨',
    tooltip: 'The stream from the Sun, the flow past the Earth, and NOAA\'s ENLIL model',
    settingsComponent: 'SpaceWeatherSettingsSolarWind',
    capability: 'overlay',
    statusHint: 'Drawn on the globe (D-SW, SW6)'
  },
  {
    id: 'magnetosphere',
    label: 'Magnetosphere',
    emoji: '🛡️',
    tooltip: 'T96 field lines, the cusps and the tail\'s current sheet',
    capability: 'overlay',
    statusHint: 'Drawn on the globe (D-SW, SW4, SW5)'
  },
  {
    id: 'ionosphere',
    label: 'Ionosphere',
    emoji: '🌐',
    tooltip: 'Ionospheric density & TEC layers',
    experimental: true,
    capability: 'planned',
    statusHint: 'Planned layer; awaiting TEC ingestion'
  },
  {
    id: 'radiation',
    label: 'Radiation Belts',
    emoji: '☢️',
    tooltip: 'The Van Allen belts, brightened by the electrons GOES measures',
    capability: 'overlay',
    statusHint: 'Drawn on the globe (D-SW, SW5)'
  },
  {
    id: 'aurora',
    label: 'Aurora',
    emoji: '🌌',
    tooltip: 'OVATION\'s forecast band, and the night curtain',
    capability: 'overlay',
    statusHint: 'Drawn on the globe (D-SW, SW3)'
  },
  {
    id: 'solarActivity',
    label: 'Solar Activity',
    emoji: '🌞',
    tooltip: 'Solar flares & sunspot regions',
    experimental: true,
    capability: 'planned',
    statusHint: 'Planned: flare map + sunspot feeds'
  },
  {
    id: 'cosmicRays',
    label: 'Cosmic Rays',
    emoji: '🛰️',
    tooltip: 'Cosmic ray flux & anomalies',
    experimental: true,
    capability: 'planned',
    statusHint: 'Research-only for now; UI placeholder'
  }
];

export const getSpaceWeatherLayer = (id: string) => SPACE_WEATHER_LAYERS.find(l => l.id === id);
