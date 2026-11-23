import { describe, it, expect } from 'vitest';
import {
  formatEcoDisasterTooltip,
  formatEcoDisasterLabel,
  formatUtcIsoShort,
  colorForSeverity,
  colorForHazardType,
  sizeForSeverity,
  sizeForWildfireAcreage,
  ringRadiusForSeverity,
  alertRingVisualsFor,
  ALERT_FLASH_COLOR,
  TSUNAMI_ALERT_COLOR,
  altitudeForEcoEvent,
  BASE_ALTITUDE,
  MAX_DEPTH_ALTITUDE_BONUS
} from '../formatters';

const baseEvent = {
  id: '1',
  lat: 0,
  lng: 0,
  type: 'earthquake',
  severityBucket: 'major' as const
};

describe('EcoNatural formatters', () => {
  it('formats tooltip with UTC time, magnitude, severity, and source', () => {
    const tooltip = formatEcoDisasterTooltip({
      ...baseEvent,
      magnitude: 5.234,
      timestamp: '2025-01-02T03:04:05Z',
      source: 'usgs'
    });

    expect(tooltip).toBe('M5.2 • earthquake • Severity: major • UTC 2025-01-02T03:04:05.000Z • Source: usgs');
  });

  it("names each agency that reported a quake, where USGS's and EMSC's were folded into one (D-EQ, EQ2)", () => {
    const tooltip = formatEcoDisasterTooltip({
      ...baseEvent,
      magnitude: 5.4,
      timestamp: '2026-11-03T21:00:00Z',
      source: 'USGS',
      reportedBy: ['USGS (us)', 'EMSC (GFZ)'],
    });
    expect(tooltip).toBe('M5.4 • earthquake • Severity: major • UTC 2026-11-03T21:00:00.000Z • Reported by USGS (us) and EMSC (GFZ)');
  });

  it('includes mock disclaimer for volcano mock data', () => {
    const tooltip = formatEcoDisasterTooltip({
      ...baseEvent,
      type: 'volcano',
      severityBucket: 'minor',
      isMock: true,
      timestamp: '2025-01-02T03:04:05Z'
    });

    expect(tooltip).toContain('Mock volcano data');
  });

  it('formats label with magnitude and mock suffix', () => {
    const label = formatEcoDisasterLabel({
      ...baseEvent,
      type: 'volcano',
      magnitude: 4.0,
      severityBucket: 'major',
      isMock: true
    });

    expect(label).toBe('M4.0 volcano (mock)');
  });

  it('formats short UTC safely', () => {
    expect(formatUtcIsoShort('2025-01-02T03:04:05Z')).toBe('2025-01-02 03:04:05 UTC');
    expect(formatUtcIsoShort(null)).toBe('—');
  });

  it('colorForSeverity assigns a distinct color per severity bucket', () => {
    const catastrophic = colorForSeverity('catastrophic');
    const major = colorForSeverity('major');
    const minor = colorForSeverity('minor');
    expect(new Set([catastrophic, major, minor]).size).toBe(3);
    expect(colorForSeverity(undefined)).toBe(minor); // unknown bucket falls back to the minor/default color
  });

  it('colorForHazardType assigns a distinct color per real hazard type', () => {
    const types = ['earthquake', 'wildfire', 'volcano', 'flood', 'drought', 'hurricane'];
    const colors = types.map((t) => colorForHazardType(t));
    expect(new Set(colors).size).toBe(types.length); // all 6 are visually distinguishable
    expect(colorForHazardType('unknown-type')).toBe('#ffffff');
    expect(colorForHazardType(undefined)).toBe('#ffffff');
  });

  it('sizeForSeverity and ringRadiusForSeverity both scale up with severity', () => {
    expect(sizeForSeverity('catastrophic')).toBeGreaterThan(sizeForSeverity('major'));
    expect(sizeForSeverity('major')).toBeGreaterThan(sizeForSeverity('minor'));
    expect(ringRadiusForSeverity('catastrophic')).toBeGreaterThan(ringRadiusForSeverity('major'));
    expect(ringRadiusForSeverity('major')).toBeGreaterThan(ringRadiusForSeverity('minor'));
  });

  it('gives tsunami and shockwave alert rings distinct kind, color, and radius — not color alone', () => {
    const tsunami = alertRingVisualsFor(true);
    const shockwave = alertRingVisualsFor(false);

    expect(tsunami.kind).toBe('tsunami');
    expect(shockwave.kind).toBe('shockwave');
    expect(tsunami.kind).not.toBe(shockwave.kind);

    expect(tsunami.color).toBe(TSUNAMI_ALERT_COLOR);
    expect(shockwave.color).toBe(ALERT_FLASH_COLOR);
    expect(tsunami.color).not.toBe(shockwave.color);

    // Tsunami reads as a broader warning than a single quake's shockwave.
    expect(tsunami.maxR).toBeGreaterThan(shockwave.maxR);
  });

  it('keeps every real marker altitude a small fraction of the globe radius, never a radius-scale value', () => {
    // Regression guard for a real, previously-shipped bug: pointAltitude is a
    // fraction of the FULL globe radius (three-globe: scale.z = altitude *
    // GLOBE_RADIUS, GLOBE_RADIUS=100) — a value anywhere near sizeForSeverity's
    // 0.25-1.2 range would render as a 25-120-world-unit spike, not a small
    // surface marker. Every real altitude this function can return must stay
    // far below that range.
    expect(altitudeForEcoEvent('wildfire')).toBeLessThan(0.1);
    expect(altitudeForEcoEvent('volcano')).toBeLessThan(0.1);
    expect(altitudeForEcoEvent('earthquake', 700)).toBeLessThan(0.1);
  });

  it('returns the base altitude for non-earthquake real hazard types, ignoring depth', () => {
    expect(altitudeForEcoEvent('wildfire', 500)).toBe(BASE_ALTITUDE);
    expect(altitudeForEcoEvent('flood')).toBe(BASE_ALTITUDE);
  });

  it('returns the base altitude for an earthquake with no real depth data', () => {
    expect(altitudeForEcoEvent('earthquake')).toBe(BASE_ALTITUDE);
    expect(altitudeForEcoEvent('earthquake', NaN)).toBe(BASE_ALTITUDE);
  });

  it('adds a small real-depth-driven bonus for earthquakes, capped at deep real depths', () => {
    const shallow = altitudeForEcoEvent('earthquake', 10);
    const deep = altitudeForEcoEvent('earthquake', 150);
    const veryDeep = altitudeForEcoEvent('earthquake', 700); // real max real-world quake depth

    expect(shallow).toBeGreaterThan(BASE_ALTITUDE);
    expect(shallow).toBeLessThan(deep);
    expect(deep).toBe(BASE_ALTITUDE + MAX_DEPTH_ALTITUDE_BONUS); // cap reached at 150km
    expect(veryDeep).toBe(deep); // capped, not proportionally higher
  });

  it('includes real depth and tsunami warning in the tooltip when present', () => {
    const withDepth = formatEcoDisasterTooltip({
      ...baseEvent,
      magnitude: 6.1,
      depthKm: 35.2,
      timestamp: '2025-01-02T03:04:05Z'
    });
    expect(withDepth).toContain('Depth: 35.2km');

    const withTsunami = formatEcoDisasterTooltip({
      ...baseEvent,
      magnitude: 7.8,
      tsunami: true,
      timestamp: '2025-01-02T03:04:05Z'
    });
    // The flag, not a warning: USGS is not a tsunami warning centre.
    expect(withTsunami).toContain('USGS tsunami flag set');
    expect(withTsunami).not.toMatch(/warning/i);
  });

  it('omits depth/tsunami from the tooltip when absent (no fabricated values)', () => {
    const tooltip = formatEcoDisasterTooltip({ ...baseEvent, magnitude: 5.0, timestamp: '2025-01-02T03:04:05Z' });
    expect(tooltip).not.toContain('Depth');
    expect(tooltip).not.toContain('Tsunami');
  });

  it('sizeForWildfireAcreage scales up with real fire size and stays within sane bounds', () => {
    const small = sizeForWildfireAcreage(50);
    const medium = sizeForWildfireAcreage(5_000);
    const large = sizeForWildfireAcreage(500_000);

    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
    expect(small).toBeGreaterThanOrEqual(0.3); // never below the floor
    expect(large).toBeLessThanOrEqual(1.2); // a single megafire can't dominate the whole globe

    // No real acreage data (undefined, zero, negative, NaN) falls back to a sane default
    // rather than a zero/negative/NaN-sized (invisible or broken) marker.
    expect(sizeForWildfireAcreage(undefined)).toBe(sizeForSeverity(undefined));
    expect(sizeForWildfireAcreage(0)).toBe(sizeForSeverity(undefined));
    expect(sizeForWildfireAcreage(-10)).toBe(sizeForSeverity(undefined));
    expect(sizeForWildfireAcreage(NaN)).toBe(sizeForSeverity(undefined));
  });
});