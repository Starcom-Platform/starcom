import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CYAN } from '../../../styles/tokens';
import { sectorColor, sectorLineLook, swatchCss, zoneColor, zoneColorMeaning, ZONE_EDGE_LOOK } from '../zoneTheme';

const hue = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).h * 360;
const FRAMES = ['geological', 'hydrological', 'ecological', 'climatic', 'cultural', 'operational'];

describe('zoneColor', () => {
  it('an Anchor Zone takes its frame\'s colour, and no two frames share one', () => {
    const colors = FRAMES.map((frame) => zoneColor({ zoneClass: 'anchor', frame, condition: 'frame' }));
    expect(new Set(colors).size).toBe(FRAMES.length);
  });

  it('an Event Zone takes its condition\'s, conflict in red', () => {
    expect(zoneColor({ zoneClass: 'event', condition: 'conflict' })).not.toBe(zoneColor({ zoneClass: 'event', condition: 'hazard' }));
    const h = hue(zoneColor({ zoneClass: 'event', condition: 'conflict' }));
    expect(Math.min(h, 360 - h)).toBeLessThan(10); // red, either side of 0°
  });

  it('none is the app\'s own cyan, which means selected', () => {
    const cyan = hue(parseInt(CYAN[400].slice(1), 16));
    for (const frame of FRAMES) expect(Math.abs(hue(zoneColor({ zoneClass: 'anchor', frame })) - cyan)).toBeGreaterThan(20);
  });

  it('says in words what its colour stands for', () => {
    expect(zoneColorMeaning({ zoneClass: 'anchor', frame: 'geological' })).toBe('geological frame');
    expect(zoneColorMeaning({ zoneClass: 'event', condition: 'hazard' })).toBe('hazard zone');
  });
});

describe('sectorColor', () => {
  it('neighbours along a Zone differ, in the Zone\'s own hue', () => {
    const base = zoneColor({ zoneClass: 'anchor', frame: 'geological' });
    const shades = Array.from({ length: 8 }, (_v, i) => sectorColor(base, i));
    for (let i = 1; i < shades.length; i += 1) expect(shades[i]).not.toBe(shades[i - 1]);
    for (const shade of shades) expect(Math.abs(hue(shade) - hue(base))).toBeLessThan(2);
  });
});

describe('lines', () => {
  it('an approximate line between Sectors is dashed, a defined one solid', () => {
    expect(sectorLineLook('approximate').dashed).toBe(true);
    expect(sectorLineLook('defined').dashed).toBe(false);
    expect(sectorLineLook('disputed').dashSize).toBeGreaterThan(sectorLineLook('approximate').dashSize);
  });

  it('the Zone edge draws over the lines between its Sectors', () => {
    expect(ZONE_EDGE_LOOK.renderOrder).toBeGreaterThan(sectorLineLook('approximate').renderOrder);
    expect(ZONE_EDGE_LOOK.dashed).toBe(false);
  });
});

it('a swatch is the colour as CSS', () => {
  expect(swatchCss(0x0a0b0c)).toBe('#0a0b0c');
});
