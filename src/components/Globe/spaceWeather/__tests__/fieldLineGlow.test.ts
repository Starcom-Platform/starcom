/**
 * The field lines glowing, with pulses running along them (space-weather-visualization.md, SW5):
 * each line's segments carry their distance from its footpoint, at its own phase, and the pulses
 * run at a pace set by the solar wind.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { brightnessAt, createFieldLineGlow, fieldLineSegments, phaseOf, pulseUnitsPerSecond, PULSE_SPACING_RE } from '../fieldLineGlow';
import { RE_UNITS, type TracedFieldLine } from '../fieldLines';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';

const frame = recalc(Date.UTC(2026, 9, 10, 12) / 1000);
const LINES: TracedFieldLine[] = [
  { kind: 'closed', hemisphere: 'north', lat: 62, mlt: 12, points: [0, 0, 1, 0, 0, 2, 0, 0, 4] },
  { kind: 'closed', hemisphere: 'north', lat: 65, mlt: 0, points: [0, 0, 1, 1, 0, 1] },
  { kind: 'open', hemisphere: 'south', lat: 80, mlt: 0, points: [0, 0, -1, -9, 0, -2] },
];

describe('the segments', () => {
  it('pair each line\'s points, one kind at a time', () => {
    const { positions, distances } = fieldLineSegments(LINES, 'closed', frame);
    expect(positions.length).toBe(3 * 6);
    expect(distances.length).toBe(3 * 2);
  });

  it('carry their distance along their own line from its footpoint, from the line\'s own phase', () => {
    const { distances } = fieldLineSegments(LINES, 'closed', frame);
    const start = phaseOf(LINES[0]) * PULSE_SPACING_RE * RE_UNITS;
    expect(distances[0]).toBeCloseTo(start, 3);
    expect(distances[1] - distances[0]).toBeCloseTo(1 * RE_UNITS, 3);
    expect(distances[2]).toBeCloseTo(distances[1], 3);
    expect(distances[3] - distances[2]).toBeCloseTo(2 * RE_UNITS, 3);
    // The next line starts again, from its own phase.
    expect(distances[4]).toBeCloseTo(phaseOf(LINES[1]) * PULSE_SPACING_RE * RE_UNITS, 3);
  });

  it('dim near the ground, where a hemisphere\'s lines crowd together, to full brightness 2.5 Re out', () => {
    expect(brightnessAt(1)).toBeCloseTo(0.2, 9);
    expect(brightnessAt(1.75)).toBeGreaterThan(0.2);
    expect(brightnessAt(1.75)).toBeLessThan(1);
    expect(brightnessAt(2.5)).toBe(1);
    expect(brightnessAt(40)).toBe(1);
    const { brightness, positions } = fieldLineSegments(LINES, 'closed', frame);
    // Each segment's ends, as grey: the first line's starts at the ground (1 Re) and its second ends 4 Re out.
    expect(brightness.length).toBe(positions.length);
    expect(brightness[0]).toBeCloseTo(brightnessAt(1), 5);
    expect(brightness[11]).toBeCloseTo(1, 5);
  });

  it('give each line its own phase, the same each time it is traced', () => {
    expect(phaseOf(LINES[0])).not.toBeCloseTo(phaseOf(LINES[1]), 3);
    expect(phaseOf(LINES[0])).toBe(phaseOf({ ...LINES[0] }));
    for (const line of LINES) expect(phaseOf(line)).toBeGreaterThanOrEqual(0);
  });
});

describe('the pulses', () => {
  it('run 3 Earth radii a second at a 400 km/s wind, in proportion to its speed', () => {
    expect(pulseUnitsPerSecond(400)).toBe(3 * RE_UNITS);
    expect(pulseUnitsPerSecond(800)).toBe(6 * RE_UNITS);
  });
});

describe('a glowing batch', () => {
  it('is screen-space lines, added light, in its colour, with every segment and its distances', () => {
    const glow = createFieldLineGlow(fieldLineSegments(LINES, 'closed', frame), '#8FA8FF', 'field-lines-closed');
    const material = glow.object.material as THREE.ShaderMaterial & { color: THREE.Color; linewidth: number };
    expect(glow.object.name).toBe('field-lines-closed');
    expect(`#${material.color.getHexString().toUpperCase()}`).toBe('#8FA8FF');
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.linewidth).toBeGreaterThan(1);
    expect(glow.object.geometry.getAttribute('instanceDistanceStart').count).toBe(3);
    glow.dispose();
  });
});
