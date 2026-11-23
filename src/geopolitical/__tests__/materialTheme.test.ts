import { describe, it, expect } from 'vitest';
import {
  resolveBorderMaterialConfig, borderLineLook,
  BORDER_CLASS_COLORS, PROVISIONAL_CLASSIFICATIONS, TERRITORY_FILL_COLOR, isProvisional,
  type BorderClassification,
} from '../theme/materialTheme';

const cfg: any = {
  borderVisibility: 70,
  borderThickness: 2,
  territoryColors: { opacity: 30, useCustomColors: false },
  showDisputedTerritories: true
};

const CLASSES = Object.keys(BORDER_CLASS_COLORS) as BorderClassification[];

/**
 * A border's colour means its classification, and nothing else (decision D-F,
 * 2026-09-19).
 *
 * ─── WHAT THIS REPLACED ────────────────────────────────────────────────────
 *
 * This file used to open with "uses scheme hashing for international borders",
 * asserting that two borders with different ids came out in different colours.
 * They did: an international border was schemeColor(scheme, featureId), a hash
 * of its id into a four-colour palette, so its colour said nothing. And two of
 * the four palettes contained a provisional colour. Measured off the live scene,
 * 104 of 331 international borders were drawn in the line-of-control amber on
 * the default scheme, and 89 of 331 in the disputed red on the political one —
 * settled borders drawn in the colours the map uses for contested ones.
 *
 * The test was right about the code and the code was wrong about the map. So it
 * is not kept alongside the new behaviour; it asserted the defect.
 */
describe('a border is coloured by what kind of boundary it is', () => {
  it('draws every international border in one colour, whatever its id', () => {
    const colours = new Set(['AAA', 'BBB', 'IND-PAK', '42', 'x'].map((id) =>
      resolveBorderMaterialConfig(cfg, id, 'international').color));

    expect(colours.size).toBe(1);
  });

  it('gives each classification a colour no other classification uses', () => {
    const colours = CLASSES.map((c) => resolveBorderMaterialConfig(cfg, 'X', c).color);

    expect(new Set(colours).size).toBe(CLASSES.length);
  });

  /*
   * The invariant the measurement found broken. A provisional colour is a
   * claim that a boundary is contested, so it may appear on a provisional
   * border and nowhere else on the base map — not on a settled border and not
   * in the country fills underneath them.
   */
  it('reserves the provisional colours for provisional borders alone', () => {
    const provisional = new Set([...PROVISIONAL_CLASSIFICATIONS].map((c) => BORDER_CLASS_COLORS[c]));
    const settled = CLASSES.filter((c) => !isProvisional(c));

    for (const c of settled) expect(provisional.has(BORDER_CLASS_COLORS[c])).toBe(false);
    expect(provisional.has(TERRITORY_FILL_COLOR)).toBe(false);
  });

  it('draws the classes the dataset holds in the colour the palette names', () => {
    for (const c of CLASSES) {
      expect(resolveBorderMaterialConfig(cfg, 'X', c).color).toBe(BORDER_CLASS_COLORS[c]);
    }
  });
});

describe('a provisional border can be told apart at the default altitude', () => {
  it('marks disputed and line_of_control borders as dashed, everything else solid', () => {
    expect(resolveBorderMaterialConfig(cfg, 'X', 'disputed').dashed).toBe(true);
    expect(resolveBorderMaterialConfig(cfg, 'X', 'line_of_control').dashed).toBe(true);
    expect(resolveBorderMaterialConfig(cfg, 'X', 'international').dashed).toBe(false);
    expect(resolveBorderMaterialConfig(cfg, 'X', 'indefinite').dashed).toBe(false);
  });

  it('agrees with isProvisional about which borders are dashed', () => {
    for (const c of CLASSES) expect(resolveBorderMaterialConfig(cfg, 'X', c).dashed).toBe(isProvisional(c));
  });

  /*
   * A dash on a line about a pixel wide is not legible under the country fills
   * — that was measured, and it left the dash as the only thing separating a
   * settled border from a contested one. So a provisional border is drawn
   * heavier than a settled one at the same setting.
   */
  it('draws a provisional border heavier than a settled one', () => {
    const settled = resolveBorderMaterialConfig(cfg, 'X', 'international').thickness;
    for (const c of PROVISIONAL_CLASSIFICATIONS) {
      expect(resolveBorderMaterialConfig(cfg, 'X', c).thickness).toBeGreaterThan(settled);
    }
  });

  it('still follows the thickness setting, rather than fixing a weight', () => {
    const thin = resolveBorderMaterialConfig({ ...cfg, borderThickness: 1 }, 'X', 'disputed').thickness;
    const thick = resolveBorderMaterialConfig({ ...cfg, borderThickness: 3 }, 'X', 'disputed').thickness;

    expect(thick).toBeGreaterThan(thin);
  });

  it('boosts provisional opacity and caps it at 1', () => {
    expect(resolveBorderMaterialConfig(cfg, 'X', 'disputed').opacity).toBeGreaterThan(cfg.borderVisibility / 100);
    expect(resolveBorderMaterialConfig({ ...cfg, borderVisibility: 95 }, 'X', 'disputed').opacity).toBeLessThanOrEqual(1);
  });
});

describe('borderLineLook', () => {
  it('carries opacity, width and dash params through, and leaves the draw order to the caller', () => {
    const params = resolveBorderMaterialConfig(cfg, 'X', 'disputed');
    expect(borderLineLook(params)).toEqual({
      opacity: params.opacity,
      linewidth: Math.max(1, params.thickness),
      dashed: true,
      dashSize: params.dashSize,
      gapSize: params.gapSize,
      dashScale: params.dashScale
    });
  });

  it('gives international borders a solid look', () => {
    expect(borderLineLook(resolveBorderMaterialConfig(cfg, 'X', 'international')).dashed).toBe(false);
  });

  it('gives two international borders the same look, so they share a batch', () => {
    const a = resolveBorderMaterialConfig(cfg, 'AAA', 'international');
    const b = resolveBorderMaterialConfig(cfg, 'BBB', 'international');
    expect(borderLineLook(a)).toEqual(borderLineLook(b));
  });

  it('floors linewidth at 1 even if thickness config is 0 or negative', () => {
    const params = resolveBorderMaterialConfig({ ...cfg, borderThickness: 0 }, 'X', 'international');
    expect(borderLineLook(params).linewidth).toBe(1);
  });
});
