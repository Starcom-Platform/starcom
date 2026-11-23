/**
 * Planet lines as paths (decision D-PW, PW20–PW22): meridians pole to pole, the horizon curves through the kit's own
 * vectors, broken where a body never rises or sets and where a curve wraps.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LABEL_SEPARATION_DEG, labelPlaces, linesMoment, planetLinesAt, type PlanetLine } from '../lineGeometry';
import { arc, type AstroBody } from '../sky';

const VECTORS = JSON.parse(readFileSync(resolve(__dirname, '../../kit-v0/vectors_psi.json'), 'utf8'));
const lineOf = (lines: PlanetLine[], body: string, angle: string) => lines.find((l) => l.body === body && l.angle === angle)!;

describe('planetLinesAt', () => {
  const instant = VECTORS.horizon_curves.instants[0];
  const at = new Date(instant.t_unix * 1000);
  const lines = planetLinesAt(at, ['Sun', 'Moon']);

  it('gives each body its four lines', () => {
    expect(lines.map((l) => `${l.body} ${l.angle}`)).toEqual(['Sun MC', 'Sun IC', 'Sun ASC', 'Sun DSC', 'Moon MC', 'Moon IC', 'Moon ASC', 'Moon DSC']);
  });

  it('runs the meridians from pole to pole at one longitude, the IC opposite the MC', () => {
    const mc = lineOf(lines, 'Sun', 'MC').paths;
    const ic = lineOf(lines, 'Sun', 'IC').paths;
    expect(mc).toHaveLength(1);
    expect(mc[0][0].lat).toBe(-90);
    expect(mc[0][mc[0].length - 1].lat).toBe(90);
    expect(new Set(mc[0].map((p) => p.lng)).size).toBe(1);
    expect(Math.abs(arc(mc[0][0].lng, ic[0][0].lng))).toBeCloseTo(180, 9);
  });

  it("passes through the kit's horizon curves at every latitude it lists", () => {
    for (const body of ['Sun', 'Moon'] as AstroBody[]) {
      const asc = lineOf(lines, body, 'ASC').paths.flat();
      const dsc = lineOf(lines, body, 'DSC').paths.flat();
      for (const row of instant.bodies[body] as { lat: number; asc: number; dsc: number }[]) {
        expect(Math.abs(arc(asc.find((p) => p.lat === row.lat)!.lng, row.asc)), `${body} ASC ${row.lat}`).toBeLessThan(VECTORS.tolerances.horizon_lon_deg);
        expect(Math.abs(arc(dsc.find((p) => p.lat === row.lat)!.lng, row.dsc)), `${body} DSC ${row.lat}`).toBeLessThan(VECTORS.tolerances.horizon_lon_deg);
      }
    }
  });

  it('breaks a curve where the body never sets or never rises, as at the Sun\'s polar edge cases', () => {
    const asc = lineOf(lines, 'Sun', 'ASC').paths.flat();
    expect(asc.some((p) => p.lat === -80)).toBe(false);
    expect(asc.some((p) => p.lat === 80)).toBe(false);
    expect(asc.some((p) => p.lat === -72)).toBe(true);
  });

  it('never joins two points across the antimeridian', () => {
    for (const line of planetLinesAt(at, ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'])) {
      for (const path of line.paths) {
        for (let i = 1; i < path.length; i++) expect(Math.abs(path[i].lng - path[i - 1].lng), `${line.body} ${line.angle}`).toBeLessThan(180);
      }
    }
  });
});

describe('linesMoment', () => {
  const window = { from: 1000, until: 2000, exact: 1500 };
  it('draws at exact while the cursor is outside the window, and at the cursor inside it (PW21)', () => {
    expect(linesMoment(window, 500).getTime()).toBe(1_500_000);
    expect(linesMoment(window, 2500).getTime()).toBe(1_500_000);
    expect(linesMoment(window, 1200).getTime()).toBe(1_200_000);
  });
});

describe('labelPlaces', () => {
  it('keeps every label clear of the others, as the Moon–Mars square needed (its Moon DSC and Mars MC 12° apart at 40°N)', () => {
    const lines = planetLinesAt(new Date(1793067486485), ['Moon', 'Mars']);
    const places = labelPlaces(lines).filter((p): p is NonNullable<typeof p> => p !== null);
    expect(places).toHaveLength(8);
    const RAD = Math.PI / 180;
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const [a, b] = [places[i], places[j]];
        const apart = Math.acos(Math.min(1, Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lng - b.lng) * RAD))) / RAD;
        expect(apart, `${i} and ${j}`).toBeGreaterThanOrEqual(LABEL_SEPARATION_DEG);
      }
    }
  });

  it('puts each label on its own line', () => {
    const lines = planetLinesAt(new Date(1793067486485), ['Moon', 'Mars']);
    labelPlaces(lines).forEach((place, i) => {
      expect(lines[i].paths.flat()).toContainEqual(place);
    });
  });
});
