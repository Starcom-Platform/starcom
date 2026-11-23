/**
 * What Earth Weather draws (decision D-W, WX9): the ground's colour
 * (temperature, rain, air quality at the stations, or none), wind, and
 * clouds.
 *
 * People choose in Earth Weather's settings. The share handle sets them for
 * its own page only, never saved, as it sets the report look (BA7, BA15): an
 * agent never changes a person's settings. A part the handle does not set
 * stays the person's, and the look in force says which part came from where.
 */
import { sourceAllowed } from '../../legal/buildProfile';

export const WEATHER_COLOURS = ['temperature', 'rain', 'airQuality', 'none'] as const;
export type WeatherColour = (typeof WEATHER_COLOURS)[number];

export interface WeatherLook {
  /** What colours the ground. */
  colour: WeatherColour;
  /** Whether the wind's streaks flow. */
  wind: boolean;
  /** Whether the satellites' clouds are drawn. */
  clouds: boolean;
}

/** The person's settings, as a look. Temperature chosen as the colour but switched off colours nothing. */
export function weatherFromSettings(settings: {
  colorMode: 'temperature' | 'rain' | 'airQuality';
  weatherLayers: { temperature: boolean; windPatterns: boolean; clouds: boolean };
}): WeatherLook {
  // Air quality is Open-Meteo's: a commercial build has none, and a choice of it kept from before shows temperature.
  const mode = settings.colorMode === 'airQuality' && !sourceAllowed('openMeteo') ? 'temperature' : settings.colorMode;
  const colour: WeatherColour = mode === 'temperature' && !settings.weatherLayers.temperature ? 'none' : mode;
  return { colour, wind: settings.weatherLayers.windPatterns, clouds: settings.weatherLayers.clouds };
}

/**
 * What a look draws while Earth Weather is shown, and nothing while it is not:
 * the heat map or the rain for the ground's colour, the stations' dots for air
 * quality (read at the stations), the wind's streaks, the satellites' clouds.
 */
export function weatherDrawn(look: WeatherLook, shown: boolean): { heatMap: boolean; rain: boolean; stations: boolean; wind: boolean; clouds: boolean } {
  return {
    heatMap: shown && look.colour === 'temperature',
    rain: shown && look.colour === 'rain',
    stations: shown && look.colour === 'airQuality',
    wind: shown && look.wind,
    clouds: shown && look.clouds,
  };
}

const KEYS = ['colour', 'wind', 'clouds'] as const;

/** A look as asked for through the handle (any of its parts), or why it is refused. */
export function readWeatherLook(value: unknown): Partial<WeatherLook> | { refused: string } {
  const refused = {
    refused: `A weather look is any of { colour: ${WEATHER_COLOURS.map((c) => `'${c}'`).join(' | ')}, wind: true | false, clouds: true | false }; got ${JSON.stringify(value) ?? String(value)}.`,
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refused;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([k]) => !(KEYS as readonly string[]).includes(k))) return refused;
  const look = value as Record<string, unknown>;
  if ('colour' in look && !(WEATHER_COLOURS as readonly unknown[]).includes(look.colour)) return refused;
  if ('wind' in look && typeof look.wind !== 'boolean') return refused;
  if ('clouds' in look && typeof look.clouds !== 'boolean') return refused;
  return Object.fromEntries(entries) as Partial<WeatherLook>;
}

let override: Partial<WeatherLook> | undefined;
const listeners = new Set<() => void>();

/** The page's look, set by the handle; undefined clears it. Never saved. */
export function setWeatherLookOverride(look: Partial<WeatherLook> | undefined): void {
  override = look ? { ...look } : undefined;
  listeners.forEach((listener) => listener());
}

export function getWeatherLookOverride(): Partial<WeatherLook> | undefined {
  return override;
}

export function subscribeWeatherLook(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export type WeatherLookInForce = WeatherLook & { from: Record<keyof WeatherLook, 'handle' | 'setting'> };

/** The look in force: each part the handle's for this page where it set it, else the person's. */
export function effectiveWeatherLook(person: WeatherLook, page: Partial<WeatherLook> | undefined = override): WeatherLookInForce {
  const pick = <K extends keyof WeatherLook>(k: K): [WeatherLook[K], 'handle' | 'setting'] =>
    page && page[k] !== undefined ? [page[k] as WeatherLook[K], 'handle'] : [person[k], 'setting'];
  const [colour, fc] = pick('colour'), [wind, fw] = pick('wind'), [clouds, fl] = pick('clouds');
  return { colour, wind, clouds, from: { colour: fc, wind: fw, clouds: fl } };
}
