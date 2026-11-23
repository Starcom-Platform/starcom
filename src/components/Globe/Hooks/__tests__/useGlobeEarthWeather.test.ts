import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { formatTemperature, formatWindSpeed, buildWeatherTooltip, aqiCategory, buildIcebergTooltip, buildIcebergTrailGeometryData, windFlowDirectionWorld, scaleForWindSpeed, buildRainSpecs, stationLegendSwatches } from '../useGlobeEarthWeather';
import type { EarthWeatherPoint, SeaIceEvent } from '../../../../services/EarthWeatherService';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';

describe('formatTemperature', () => {
  it('converts Celsius to Fahrenheit and Kelvin correctly', () => {
    expect(formatTemperature(0, 'celsius')).toBe('0.0°C');
    expect(formatTemperature(0, 'fahrenheit')).toBe('32.0°F');
    expect(formatTemperature(0, 'kelvin')).toBe('273.1K'); // 273.15 floors under toFixed(1)'s float representation
    expect(formatTemperature(100, 'celsius')).toBe('100.0°C');
    expect(formatTemperature(100, 'fahrenheit')).toBe('212.0°F');
  });
});

describe('formatWindSpeed', () => {
  it('converts km/h to mph, m/s, and knots correctly', () => {
    expect(formatWindSpeed(100, 'kmh')).toBe('100.0 km/h');
    expect(formatWindSpeed(100, 'mph')).toBe('62.1 mph');
    expect(formatWindSpeed(100, 'ms')).toBe('27.8 m/s');
    expect(formatWindSpeed(100, 'knots')).toBe('54.0 kn');
  });
});

describe('buildWeatherTooltip', () => {
  const point: EarthWeatherPoint = {
    lat: 40,
    lng: -74,
    temperatureC: 22.5,
    precipitationMm: 1.2,
    cloudCoverPct: 60,
    windSpeedKmh: 15,
    windDirectionDeg: 180,
    humidityPct: 70,
    pressureHpa: 1012,
    timestamp: '2026-08-14T12:00'
  };

  it('includes only the fields enabled by weatherLayers', () => {
    const tooltip = buildWeatherTooltip(
      point,
      { temperature: true, precipitation: false, windPatterns: false, pressure: false, humidity: false, clouds: false, airQuality: false, seaIce: false },
      'celsius',
      'kmh'
    );
    expect(tooltip).toBe('Temp: 22.5°C');
  });

  it('includes all fields when every layer is enabled, honoring unit preferences', () => {
    const tooltip = buildWeatherTooltip(
      { ...point, usAqi: 42 },
      { temperature: true, precipitation: true, windPatterns: true, pressure: true, humidity: true, clouds: true, airQuality: true, seaIce: true },
      'fahrenheit',
      'mph'
    );
    expect(tooltip).toContain('Temp: 72.5°F');
    expect(tooltip).toContain('Precip: 1.2mm');
    expect(tooltip).toContain('mph @ 180°');
    expect(tooltip).toContain('Humidity: 70%');
    expect(tooltip).toContain('Pressure: 1012hPa');
    expect(tooltip).toContain('Clouds: 60%');
  });

  it('falls back to a bare temperature reading when every layer is disabled', () => {
    const tooltip = buildWeatherTooltip(
      point,
      { temperature: false, precipitation: false, windPatterns: false, pressure: false, humidity: false, clouds: false, airQuality: false, seaIce: false },
      'celsius',
      'kmh'
    );
    expect(tooltip).toBe('Temp: 22.5°C');
  });

  it('omits the AQI line when airQuality is enabled but the point has no usAqi value (fetch failed for that point)', () => {
    const tooltip = buildWeatherTooltip(
      point,
      { temperature: true, precipitation: false, windPatterns: false, pressure: false, humidity: false, clouds: false, airQuality: true, seaIce: false },
      'celsius',
      'kmh'
    );
    expect(tooltip).not.toContain('AQI');
  });
});

describe('aqiCategory', () => {
  it('maps real EPA/AirNow US AQI bands to the correct category', () => {
    expect(aqiCategory(25).label).toBe('Good');
    expect(aqiCategory(50).label).toBe('Good');
    expect(aqiCategory(51).label).toBe('Moderate');
    expect(aqiCategory(100).label).toBe('Moderate');
    expect(aqiCategory(101).label).toBe('Unhealthy (Sensitive Groups)');
    expect(aqiCategory(175).label).toBe('Unhealthy');
    expect(aqiCategory(250).label).toBe('Very Unhealthy');
    expect(aqiCategory(400).label).toBe('Hazardous');
  });

  it('gives every band a distinct color', () => {
    const colors = [10, 75, 125, 175, 250, 400].map((aqi) => aqiCategory(aqi).color);
    expect(new Set(colors).size).toBe(6);
  });
});

describe('buildIcebergTooltip', () => {
  it('formats name, size, and last-tracked date from a real EONET-shaped event', () => {
    const event: SeaIceEvent = {
      id: 'EONET_20822',
      name: 'Iceberg D33D',
      lat: -63.78,
      lng: -55.47,
      sizeNm2: 90.0,
      lastUpdated: '2026-07-23T00:00:00Z',
      track: [{ lat: -63.78, lng: -55.47, date: '2026-07-23T00:00:00Z' }]
    };
    expect(buildIcebergTooltip(event)).toBe('Iceberg D33D • 90.0 NM² • Last tracked: 2026-07-23');
  });

  it('omits size and date gracefully when absent', () => {
    const event: SeaIceEvent = { id: 'x', name: 'Iceberg X', lat: 0, lng: 0, lastUpdated: '', track: [] };
    expect(buildIcebergTooltip(event)).toBe('Iceberg X');
  });
});

describe('buildIcebergTrailGeometryData', () => {
  const makeEvent = (id: string, track: Array<{ lat: number; lng: number }>): SeaIceEvent => ({
    id,
    name: `Iceberg ${id}`,
    lat: track[0]?.lat ?? 0,
    lng: track[0]?.lng ?? 0,
    lastUpdated: '2026-07-23T00:00:00Z',
    track: track.map((p) => ({ ...p, date: '2026-07-23T00:00:00Z' }))
  });

  it('produces zero segments for an iceberg with fewer than 2 track points', () => {
    const events = [makeEvent('a', [{ lat: 0, lng: 0 }])];
    const result = buildIcebergTrailGeometryData(events);
    expect(result.segmentCount).toBe(0);
    expect(result.positions).toHaveLength(0);
    expect(result.colors).toHaveLength(0);
  });

  it('produces one segment (2 vertices, 6 position numbers) per consecutive track pair', () => {
    const events = [makeEvent('a', [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }])];
    const result = buildIcebergTrailGeometryData(events);
    expect(result.segmentCount).toBe(2); // 3 points -> 2 segments
    expect(result.positions).toHaveLength(2 * 6); // 6 numbers per segment
    expect(result.colors).toHaveLength(2 * 6);
  });

  it('sums segments across multiple real icebergs, not just the first', () => {
    const events = [
      makeEvent('a', [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]),
      makeEvent('b', [{ lat: 10, lng: 10 }, { lat: 11, lng: 11 }, { lat: 12, lng: 12 }])
    ];
    const result = buildIcebergTrailGeometryData(events);
    expect(result.segmentCount).toBe(1 + 2);
  });

  it('fades the newest segment brighter than the oldest, baked into vertex color', () => {
    const events = [makeEvent('a', [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }])];
    const result = buildIcebergTrailGeometryData(events);
    // 3 segments -> colors has 3*6 = 18 numbers; take each segment's first vertex's R channel (index 0, 6, 12).
    const oldestR = result.colors[0];
    const middleR = result.colors[6];
    const newestR = result.colors[12];
    expect(newestR).toBeGreaterThan(middleR);
    expect(middleR).toBeGreaterThan(oldestR);
  });

  it('gives both endpoints of a segment the same color, so each segment reads as one flat fade step', () => {
    const events = [makeEvent('a', [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])];
    const result = buildIcebergTrailGeometryData(events);
    expect(result.colors.slice(0, 3)).toEqual(result.colors.slice(3, 6));
  });
});

describe('windFlowDirectionWorld', () => {
  // World coordinates here are the scene's, latLngToGlobeWorld's: x = R·cos(lat)·sin(lng),
  // y = R·sin(lat), z = R·cos(lat)·cos(lng) — where react-globe.gl draws a point. At
  // (lat=0, lng=0), the equator on the prime meridian, +Z points away from Earth's
  // centre (up), +Y toward true north, and +X east.

  it('points toward true north (+Y) at the equator/prime-meridian when wind blows FROM the south (windDirectionDeg=180)', () => {
    const out = windFlowDirectionWorld(0, 0, 180, new THREE.Vector3());
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('points toward true south (-Y) at the equator/prime-meridian when wind blows FROM the north (windDirectionDeg=0)', () => {
    const out = windFlowDirectionWorld(0, 0, 0, new THREE.Vector3());
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(-1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('points toward true east (+X at lng=0: moving to lng=90°E moves a point toward +X) when wind blows FROM the west (windDirectionDeg=270)', () => {
    const out = windFlowDirectionWorld(0, 0, 270, new THREE.Vector3());
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('points where a point actually moves when it goes north or east, anywhere — measured on latLngToGlobeWorld, not restated', () => {
    const cases: Array<[number, number]> = [[51, -0.1], [-33, 151], [10, 100], [60, -120], [-5, 179]];
    const step = 1e-4;
    for (const [lat, lng] of cases) {
      const here = latLngToGlobeWorld(lat, lng, 1);
      const north = latLngToGlobeWorld(lat + step, lng, 1).sub(here).normalize();
      const east = latLngToGlobeWorld(lat, lng + step, 1).sub(here).normalize();
      // Wind FROM the south flows north; FROM the west flows east.
      expect(windFlowDirectionWorld(lat, lng, 180, new THREE.Vector3()).dot(north)).toBeCloseTo(1, 4);
      expect(windFlowDirectionWorld(lat, lng, 270, new THREE.Vector3()).dot(east)).toBeCloseTo(1, 4);
    }
  });

  it('is always a unit vector and always tangent to the surface (perpendicular to the real Up/radial direction) for arbitrary inputs', () => {
    const cases: Array<[number, number, number]> = [
      [51, -0.1, 45], [-33, 151, 200], [0, 179, 10], [89, 0, 300], [-60, -120, 5]
    ];
    for (const [lat, lng, dir] of cases) {
      const flow = windFlowDirectionWorld(lat, lng, dir, new THREE.Vector3());
      expect(flow.length()).toBeCloseTo(1, 5);

      const up = latLngToGlobeWorld(lat, lng, 1);
      expect(flow.dot(up)).toBeCloseTo(0, 5);
    }
  });

  it('reverses when wind direction flips by 180 degrees', () => {
    const a = windFlowDirectionWorld(20, 30, 40, new THREE.Vector3());
    const b = windFlowDirectionWorld(20, 30, 220, new THREE.Vector3());
    expect(a.x).toBeCloseTo(-b.x, 5);
    expect(a.y).toBeCloseTo(-b.y, 5);
    expect(a.z).toBeCloseTo(-b.z, 5);
  });
});

describe('scaleForWindSpeed', () => {
  it('clamps calm/zero/negative/non-finite wind to the minimum scale', () => {
    expect(scaleForWindSpeed(0)).toBe(0.4);
    expect(scaleForWindSpeed(-5)).toBe(0.4);
    expect(scaleForWindSpeed(NaN)).toBe(0.4);
  });

  it('clamps storm-force wind to the maximum scale', () => {
    expect(scaleForWindSpeed(200)).toBe(1.4);
  });

  it('scales monotonically between the bounds for real-world wind speeds', () => {
    const low = scaleForWindSpeed(10);
    const mid = scaleForWindSpeed(40);
    const high = scaleForWindSpeed(70);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(0.4);
    expect(high).toBeLessThanOrEqual(1.4);
  });
});

const makeWeatherPoint = (overrides: Partial<EarthWeatherPoint> = {}): EarthWeatherPoint => ({
  lat: 0,
  lng: 0,
  temperatureC: 20,
  precipitationMm: 0,
  cloudCoverPct: 0,
  windSpeedKmh: 0,
  windDirectionDeg: 0,
  humidityPct: 50,
  pressureHpa: 1013,
  timestamp: '2026-08-14T12:00',
  ...overrides
});

describe('buildRainSpecs', () => {
  it('spawns a real emitter only for grid points with real precipitation above the threshold', () => {
    const points = [makeWeatherPoint({ lat: 10, lng: 20, precipitationMm: 2.5 }), makeWeatherPoint({ lat: 30, lng: 40, precipitationMm: 0.1 })];
    const specs = buildRainSpecs(points);
    expect(specs).toHaveLength(1);
    expect(specs[0].id).toBe('rain-10-20');
  });

  it('produces no real emitters when nothing is actually raining', () => {
    expect(buildRainSpecs([makeWeatherPoint({ precipitationMm: 0 })])).toEqual([]);
  });

  it('falls inward toward the globe center, opposite the wind arrows/plume particles which rise outward', () => {
    // Rain should drift against the real outward surface normal, wherever it is.
    const [spec] = buildRainSpecs([makeWeatherPoint({ lat: 0, lng: 0, precipitationMm: 5 })]);
    expect(spec.drift.clone().normalize().dot(latLngToGlobeWorld(0, 0, 1))).toBeCloseTo(-1, 6);
  });

  it('gives real light rain (below the moderate threshold) a sparser, smaller tier instead of nothing', () => {
    const [spec] = buildRainSpecs([makeWeatherPoint({ lat: 1, lng: 1, precipitationMm: 0.3 })]);
    expect(spec).toBeDefined();
    expect(spec.count).toBe(1);
    expect(spec.size).toBeLessThan(0.22);
  });

  it('gives real moderate-or-heavier rain the full particle tier, not the light one', () => {
    const [spec] = buildRainSpecs([makeWeatherPoint({ lat: 1, lng: 1, precipitationMm: 0.5 })]);
    expect(spec.count).toBe(4);
    expect(spec.size).toBe(0.22);
  });

  it('still produces nothing for real trace precipitation at/below the trace threshold', () => {
    expect(buildRainSpecs([makeWeatherPoint({ precipitationMm: 0.1 })])).toEqual([]);
    expect(buildRainSpecs([makeWeatherPoint({ precipitationMm: 0.05 })])).toEqual([]);
  });
});

describe('what the card is told the station marks mean', () => {
  const station = (over: Partial<EarthWeatherPoint> = {}): EarthWeatherPoint => ({
    lat: 40, lng: -74, temperatureC: 22.5, precipitationMm: 0, cloudCoverPct: 0,
    windSpeedKmh: 0, windDirectionDeg: 0, humidityPct: 0, pressureHpa: 1012,
    timestamp: '2026-08-14T12:00', ...over,
  });

  it('names the AQI bands actually drawn, in the index\'s own words', () => {
    const swatches = stationLegendSwatches(
      [station({ usAqi: 30 }), station({ usAqi: 120 }), station({ usAqi: 45 })],
      'airQuality',
    );

    // Two bands drawn, two swatches — never the six the scale defines.
    expect(swatches.map((s) => s.label)).toEqual(['Good', 'Unhealthy (Sensitive Groups)']);
    expect(swatches[0].color).toBe('#00e400');
  });

  it('says a missing reading is missing rather than letting grey read as Good', () => {
    const swatches = stationLegendSwatches([station({ usAqi: undefined })], 'airQuality');
    expect(swatches.map((s) => s.label)).toEqual(['no AQI reported']);
  });

  it('stands for the temperature ramp with the two ends on THIS globe', () => {
    const swatches = stationLegendSwatches(
      [station({ temperatureC: 18 }), station({ temperatureC: -4 }), station({ temperatureC: 31 })],
      'temperature',
    );

    // Not the ramp's own -30..+45: no mark here is at either end of it.
    expect(swatches.map((s) => s.label)).toEqual(['-4°C (coldest here)', '31°C (hottest here)']);
    expect(swatches[0].color).not.toBe(swatches[1].color);
  });

  it('offers one end when there is only one reading, not two identical ones', () => {
    const swatches = stationLegendSwatches([station({ temperatureC: 12 })], 'temperature');
    expect(swatches).toHaveLength(1);
    expect(swatches[0].label).toBe('12°C (the only reading)');
  });

  it('has nothing to say when no station reported a temperature', () => {
    expect(stationLegendSwatches([station({ temperatureC: Number.NaN })], 'temperature')).toEqual([]);
  });
});
