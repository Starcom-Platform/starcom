/**
 * The e-field's settings (space-weather-visualization.md, SW1, SW2), one list for every place that
 * offers them: how it shows its direction, how often NOAA's files are fetched, and which models.
 */
import type { EFieldLook } from '../../../hooks/useEcoNaturalSettings';

/** How the e-field can show its direction. */
export const E_FIELD_LOOKS: ReadonlyArray<{ look: EFieldLook; label: string; title: string }> = [
  { look: 'streaks', label: 'Streaks', title: 'Streaks drift along the field, faster where it is stronger' },
  { look: 'arrows', label: 'Arrows', title: 'Arrows point the way the field points, longer where it is stronger: clearest on a still card' },
  { look: 'ripples', label: 'Ripples', title: 'Ripples run across the field the way it points' },
  { look: 'relief', label: 'Relief', title: 'The field raised by its strength and coloured by the way it points' },
];

/** How often NOAA's two e-field files (1.8 MB together) and OVATION's forecast (0.9 MB) are fetched again, in minutes; 0 is never. */
export const REFRESH_MINUTES = [5, 15, 30, 0];

/** The cadence these settings ask for, minutes; 0 for once. */
export function refreshMinutesOf(settings: { autoRefresh?: boolean; refreshInterval?: number }): number {
  return settings.autoRefresh === false ? 0 : settings.refreshInterval ?? 5;
}

/** The settings for a cadence, minutes; 0 for once. */
export function refreshSettingsFor(minutes: number): { autoRefresh: false } | { autoRefresh: true; refreshInterval: number } {
  return minutes === 0 ? { autoRefresh: false } : { autoRefresh: true, refreshInterval: minutes };
}

/** NOAA's two models, each fetched only while chosen. */
export const E_FIELD_MODELS = [
  { key: 'intermag', label: 'InterMag EarthScope' },
  { key: 'usCanada', label: 'US-Canada 1D' },
] as const;

export type DatasetKey = 'intermag' | 'usCanada' | 'pipeline';
export const DEFAULT_DATASETS: Record<DatasetKey, boolean> = { intermag: true, usCanada: true, pipeline: false };
