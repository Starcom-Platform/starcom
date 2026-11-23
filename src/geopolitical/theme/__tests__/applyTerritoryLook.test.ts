/**
 * A style's look put on what is already built (decision K5), in place: what the
 * screen and a card drawn in another style switch between at each render.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { nationalTerritoriesService, territoryFillScale } from '../../services/NationalTerritoriesService';
import { lineBatchData } from '../../geometry/lineBatches';
import { applyTerritoryLook, TERRITORY_FILLS_ORDER } from '../applyTerritoryLook';
import { RAISED_SHELL_ORDER } from '../../../globe-engine/shellLift';
import { BORDER_CLASS_COLORS, TERRITORY_FILL_COLOR } from '../materialTheme';
import { BORDER_SWATCHES, CLASSIC_INTERNATIONAL_BORDER, TERRITORY_STYLE_DEFAULTS, type TerritoryLook } from '../territoryStyles';

const config = {
  borderVisibility: 70,
  borderThickness: 1,
  territoryColors: { opacity: 50, useCustomColors: false },
  showDisputedTerritories: true,
  showMaritimeBorders: false,
  labelVisibility: 60,
  highlightOnHover: true,
  style: 'classic' as const,
};

const parts = () => [
  { id: 'USA', countryCode: 'USA', positions: [0, 0, 100, 1, 0, 100, 0, 1, 100], indices: [0, 1, 2] },
  { id: 'CAN', countryCode: 'CAN', positions: [0, 0, 100, -1, 0, 100, 0, -1, 100], indices: [0, 1, 2] },
];
const borders = () => [
  { id: 'settled', coordinates: [[0, 0], [1, 1]] as [number, number][], classification: 'international' as const },
  { id: 'contested', coordinates: [[2, 0], [3, 1]] as [number, number][], classification: 'disputed' as const },
  { id: 'vague', coordinates: [[4, 0], [5, 1]] as [number, number][], classification: 'indefinite' as const },
];

function built() {
  const fills = nationalTerritoriesService.buildTerritoriesFromBaked(parts() as never, config as never);
  const lines = nationalTerritoriesService.buildBorders(borders() as never, config as never);
  const halo = new THREE.Group();
  return { fills, borders: lines, maritime: null, halo };
}

const fillMaterial = (fills: THREE.Group) => (fills.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
const colourOfLine = (group: THREE.Group, id: string) => {
  for (const child of group.children) {
    const line = lineBatchData(child)?.lines.find((l) => l.id === id);
    if (line) return line.color;
  }
  return null;
};
/** The colour each line is drawn in: its batch's vertex colours, or the material's where the batch shares one. */
const drawnColourOf = (group: THREE.Group, id: string) => {
  for (const child of group.children) {
    const data = lineBatchData(child);
    const line = data?.lines.find((l) => l.id === id);
    if (!data || !line) continue;
    const start = (child as THREE.Mesh).geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute | undefined;
    const colour = new THREE.Color();
    if (!start) return ((child as THREE.Mesh).material as LineMaterial).color.getHex();
    const a = start.data.array as Float32Array;
    colour.setRGB(a[line.start * 6], a[line.start * 6 + 1], a[line.start * 6 + 2]);
    return colour.getHex();
  }
  return null;
};

describe('applyTerritoryLook', () => {
  const classic: TerritoryLook = { ...TERRITORY_STYLE_DEFAULTS.classic };
  const quiet: TerritoryLook = { ...TERRITORY_STYLE_DEFAULTS.quiet, fillOpacity: 30, height: 1, borderVisibility: 40, borderThickness: 2 };

  it('draws Quiet in one tone and Classic in each territory\'s own, by the uniform alone', () => {
    const groups = built();
    applyTerritoryLook(groups, 'quiet', quiet, config as never);
    expect(fillMaterial(groups.fills).uniforms.uOneColour.value).toBe(1);
    expect((fillMaterial(groups.fills).uniforms.uBaseColor.value as THREE.Color).getHex()).toBe(TERRITORY_FILL_COLOR);
    applyTerritoryLook(groups, 'classic', classic, config as never);
    expect(fillMaterial(groups.fills).uniforms.uOneColour.value).toBe(0);
  });

  it('sets each style\'s opacity and height, and the selection halo\'s height with the fills', () => {
    const groups = built();
    applyTerritoryLook(groups, 'quiet', quiet, config as never);
    expect(fillMaterial(groups.fills).uniforms.uOpacity.value).toBeCloseTo(0.3);
    // To six places: a height of 1 moves the scale by only half a percent.
    expect(groups.fills.scale.x).toBeCloseTo(territoryFillScale(1), 6);
    expect(groups.halo.scale.x).toBeCloseTo(territoryFillScale(1), 6);
    expect(groups.halo.scale.x).not.toBe(1);
    applyTerritoryLook(groups, 'classic', classic, config as never);
    expect(fillMaterial(groups.fills).uniforms.uOpacity.value).toBeCloseTo(classic.fillOpacity / 100);
    expect(groups.fills.scale.x).toBeCloseTo(territoryFillScale(classic.height), 6);
  });

  it('recolours a settled border green for Classic and pale for Quiet, as drawn and as stated, and leaves the others', () => {
    const groups = built();
    applyTerritoryLook(groups, 'quiet', quiet, config as never);
    expect(drawnColourOf(groups.borders, 'settled')).toBe(BORDER_CLASS_COLORS.international);
    expect(colourOfLine(groups.borders, 'settled')).toBe(BORDER_CLASS_COLORS.international);
    applyTerritoryLook(groups, 'classic', classic, config as never);
    expect(drawnColourOf(groups.borders, 'settled')).toBe(CLASSIC_INTERNATIONAL_BORDER);
    expect(colourOfLine(groups.borders, 'settled')).toBe(CLASSIC_INTERNATIONAL_BORDER);
    expect(drawnColourOf(groups.borders, 'contested')).toBe(BORDER_CLASS_COLORS.disputed);
    expect(drawnColourOf(groups.borders, 'vague')).toBe(BORDER_CLASS_COLORS.indefinite);
  });

  it('sets the borders\' opacity and width from the style\'s look, a provisional border heavier', () => {
    const groups = built();
    applyTerritoryLook(groups, 'quiet', quiet, config as never);
    const widths = groups.borders.children.map((child) => {
      const material = (child as THREE.Mesh).material as LineMaterial;
      return [lineBatchData(child)!.lines[0].classification, material.opacity, material.linewidth];
    });
    expect(widths).toContainEqual(['international', 0.4, 2]);
    expect(widths).toContainEqual(['disputed', expect.closeTo(0.5), 4]);
  });

  it('draws a raised shell before the marks it carries, and a shell on the ground where it always drew', () => {
    const groups = built();
    applyTerritoryLook(groups, 'classic', { ...classic, height: 3.5 }, config as never);
    expect(groups.fills.renderOrder).toBe(RAISED_SHELL_ORDER);
    applyTerritoryLook(groups, 'quiet', { ...quiet, height: 0.2 }, config as never);
    expect(groups.fills.renderOrder).toBe(TERRITORY_FILLS_ORDER);
  });

  it('shades the fills as strongly as the look says: 0 is flat, 100 today\'s', () => {
    const groups = built();
    expect(fillMaterial(groups.fills).uniforms.uShading.value).toBe(1);
    // The sun's light, eased toward flat by the uniform.
    expect(fillMaterial(groups.fills).fragmentShader).toMatch(/lightFactor = mix\(1\.0, mix\(0\.7, 1\.15, [^;]*\), uShading\);/);
    applyTerritoryLook(groups, 'quiet', { ...quiet, shading: 40 }, config as never);
    expect(fillMaterial(groups.fills).uniforms.uShading.value).toBeCloseTo(0.4);
    applyTerritoryLook(groups, 'classic', classic, config as never);
    expect(fillMaterial(groups.fills).uniforms.uShading.value).toBe(1);
  });

  it('draws a provisional border\'s dashes at the look\'s length, and leaves a solid one solid', () => {
    const groups = built();
    applyTerritoryLook(groups, 'quiet', { ...quiet, dashLength: 200 }, config as never);
    const scales = groups.borders.children.map((child) => {
      const material = (child as THREE.Mesh).material as LineMaterial;
      return [lineBatchData(child)!.lines[0].classification, material.dashed, material.dashScale];
    });
    expect(scales).toContainEqual(['disputed', true, 0.5]);
    expect(scales).toContainEqual(['international', false, 1]);
    applyTerritoryLook(groups, 'classic', classic, config as never);
    expect(groups.borders.children.map((child) => ((child as THREE.Mesh).material as LineMaterial).dashScale)).toEqual(groups.borders.children.map(() => 1));
  });

  it('draws each kind of border in the swatch its look gives it, and two kinds made alike apart again in the other style', () => {
    const groups = built();
    const alike: TerritoryLook = { ...classic, borderColours: { ...classic.borderColours, international: 'grey', disputed: 'violet' } };
    applyTerritoryLook(groups, 'classic', alike, config as never);
    expect(drawnColourOf(groups.borders, 'settled')).toBe(BORDER_SWATCHES.grey.hex);
    expect(drawnColourOf(groups.borders, 'vague')).toBe(BORDER_SWATCHES.grey.hex);
    expect(drawnColourOf(groups.borders, 'contested')).toBe(BORDER_SWATCHES.violet.hex);
    applyTerritoryLook(groups, 'quiet', TERRITORY_STYLE_DEFAULTS.quiet, config as never);
    expect(drawnColourOf(groups.borders, 'settled')).toBe(BORDER_CLASS_COLORS.international);
    expect(drawnColourOf(groups.borders, 'vague')).toBe(BORDER_CLASS_COLORS.indefinite);
    expect(drawnColourOf(groups.borders, 'contested')).toBe(BORDER_CLASS_COLORS.disputed);
  });

  it('builds a border batch in the style the config names, before any look is applied', () => {
    const quietBuilt = nationalTerritoriesService.buildBorders(borders() as never, { ...config, style: 'quiet' } as never);
    expect(drawnColourOf(quietBuilt, 'settled')).toBe(BORDER_CLASS_COLORS.international);
    const classicBuilt = nationalTerritoriesService.buildBorders(borders() as never, config as never);
    expect(drawnColourOf(classicBuilt, 'settled')).toBe(CLASSIC_INTERNATIONAL_BORDER);
  });
});
