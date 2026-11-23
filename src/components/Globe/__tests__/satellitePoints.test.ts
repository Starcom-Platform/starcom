/**
 * How each kind of satellite is drawn. The drawing itself is tested in
 * screenPoints.test.ts. Before satellites were points, the layer audit counted 11 of
 * 91 Satellites marks on a card as large as 4×4 px.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSatellitePoints, SATELLITE_MARK_PX, colorForType } from '../satellitePoints';

const sats = [
  { position: new THREE.Vector3(106, 0, 0), type: 'space_station' },
  { position: new THREE.Vector3(0, 110, 0), type: 'starlink' },
  { position: new THREE.Vector3(0, 0, 417), type: 'gps_satellite' },
];

describe('buildSatellitePoints', () => {
  const points = buildSatellitePoints(sats);
  const attr = (name: string) => points.geometry.getAttribute(name) as THREE.BufferAttribute;

  it('draws every satellite, in order', () => {
    expect(attr('position').count).toBe(3);
    expect(attr('position').getZ(2)).toBe(417);
  });

  /*
   * This asserted "sizes each by its type, stations largest". Colour already
   * carried the type, so size was the same fact spent twice — and on a channel
   * that reads as MORE. See SATELLITE_MARK_PX. What survives from it is the
   * floor: every mark large enough to survive a share card.
   */
  it('sizes every satellite the same, whatever its type, large enough to survive a card', () => {
    expect(new Set(Array.from(attr('pointSize').array))).toEqual(new Set([SATELLITE_MARK_PX]));
    // A 1400-wide canvas is drawn about 0.87x on a 1200-wide card; 4 px is the audit's floor.
    expect(SATELLITE_MARK_PX * 0.87).toBeGreaterThanOrEqual(4);
  });

  it('colours each by its type', () => {
    const c = new THREE.Color(colorForType('gps_satellite'));
    expect([attr('pointColor').getX(2), attr('pointColor').getY(2), attr('pointColor').getZ(2)])
      .toEqual(Array.from(new Float32Array([c.r, c.g, c.b])));
  });

  it('rims them dark: the fills are bright, and it is bright cloud they get lost against', () => {
    const rim = (points.material as THREE.ShaderMaterial).uniforms.rimColor.value as THREE.Color;
    expect(rim.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.1);
  });
});

/*
 * Satellites honour the style chosen for them (decision D-F, step 6.3).
 *
 * "A style nothing reads is a setting, not a feature" — so a layer declared
 * `honoured` in markerStyles.ts has to actually draw what was picked, and the
 * switcher only appears on layers that do.
 */
describe('the style chosen for the layer', () => {
  const defines = (points: THREE.Points) =>
    (points.material as THREE.ShaderMaterial).defines ?? {};

  it('draws a disc when nothing was chosen, exactly as before', () => {
    const d = defines(buildSatellitePoints(sats));

    expect(d).not.toHaveProperty('STYLE_RING');
    expect(d).not.toHaveProperty('STYLE_GLOW');
  });

  it('draws rings when rings were chosen', () => {
    expect(defines(buildSatellitePoints(sats, {}, { style: 'ring' })))
      .toHaveProperty('STYLE_RING');
  });

  /*
   * A glow here used to be the bloom ALONE, and was withheld for it.
   *
   * The bloom-behind-the-mark pairing lived in useScreenMarkLayer, which builds
   * two objects; this builder makes one, so a glow drawn through here was a faint
   * halo with no mark inside it. A per-layer options list existed to keep the
   * switcher from offering it. GLOW_QUAD_SCALE moved the pairing into the shader,
   * which deleted both the defect and the list — so what this now pins is that a
   * glow through this builder is a real glowing mark.
   */
  it('draws a glowing mark when a glow was chosen, not a bare bloom', () => {
    const glowing = buildSatellitePoints(sats, {}, { style: 'glow' });

    expect(defines(glowing)).toHaveProperty('STYLE_GLOW');
    expect((glowing.material as THREE.ShaderMaterial).blending).toBe(THREE.NormalBlending);
  });
});

describe('what a click opens', () => {
  it('carries each satellite\'s note in point order, beside its hover (C5)', () => {
    const opens = { heading: 'Satellites', notes: [{ id: '25544', kind: 'Satellite, Space station', title: 'ISS (ZARYA)', text: '', timeMs: null, sources: [] }] };
    const points = buildSatellitePoints([{ ...sats[0], tooltip: 'ISS', opens }, { ...sats[1], tooltip: 'STARLINK-1' }]);
    expect(points.userData.opens).toEqual([opens, null]);
  });
});
