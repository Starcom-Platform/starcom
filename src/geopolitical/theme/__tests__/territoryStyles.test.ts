/**
 * The territories' two styles and what each keeps (decision K5:
 * docs/missions/01-architecture-decisions/territories.md).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BORDER_CLASS_COLORS, PROVISIONAL_CLASSIFICATIONS, TERRITORY_FILL_COLOR, type BorderClassification } from '../materialTheme';
import { TERRITORY_COLOUR_SLOT } from '../territoryColours';
import {
  CARD_TERRITORY_STYLE,
  CLASSIC_FILL_COLOURS,
  CLASSIC_INTERNATIONAL_BORDER,
  DEFAULT_TERRITORY_STYLE,
  BORDER_KINDS,
  BORDER_SWATCHES,
  TERRITORY_STYLES,
  TERRITORY_STYLE_DEFAULTS,
  borderColourOf,
  borderSwatchesFor,
  crossFadeMsOf,
  fillColourOf,
  isTerritoryStyle,
  quietChangesFromLegacy,
  territoryLookOf,
  withLookChange,
  type TerritoryLook,
} from '../territoryStyles';

const hueOf = (hex: number) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.h * 360;
};
const hueApart = (a: number, b: number) => {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return Math.min(d, 360 - d);
};
const KINDS = Object.keys(BORDER_CLASS_COLORS) as BorderClassification[];

describe('the two styles', () => {
  it('show Classic on screen and Quiet on cards until someone chooses', () => {
    expect(DEFAULT_TERRITORY_STYLE).toBe('classic');
    expect(CARD_TERRITORY_STYLE).toBe('quiet');
    expect(TERRITORY_STYLES).toEqual(['classic', 'quiet']);
    expect(isTerritoryStyle('classic')).toBe(true);
    expect(isTerritoryStyle('neon')).toBe(false);
    expect(isTerritoryStyle(undefined)).toBe(false);
  });

  it('give Classic four different fills, none near the red or amber of a border that is not settled', () => {
    expect(new Set(CLASSIC_FILL_COLOURS).size).toBe(4);
    for (const fill of CLASSIC_FILL_COLOURS) {
      for (const kind of PROVISIONAL_CLASSIFICATIONS) {
        expect(hueApart(fill, BORDER_CLASS_COLORS[kind])).toBeGreaterThan(30);
      }
    }
  });

  it('fill a territory with its own slot\'s colour in Classic, and every territory alike in Quiet', () => {
    expect(fillColourOf('classic', 'USA')).toBe(CLASSIC_FILL_COLOURS[TERRITORY_COLOUR_SLOT.USA]);
    expect(fillColourOf('classic', 'CAN')).toBe(CLASSIC_FILL_COLOURS[TERRITORY_COLOUR_SLOT.CAN]);
    expect(fillColourOf('classic', 'USA')).not.toBe(fillColourOf('classic', 'CAN'));
    expect(fillColourOf('quiet', 'USA')).toBe(TERRITORY_FILL_COLOR);
    expect(fillColourOf('quiet', 'CAN')).toBe(TERRITORY_FILL_COLOR);
  });

  it('fill a code the table lacks with the first colour rather than none', () => {
    expect(fillColourOf('classic', 'ZZZ')).toBe(CLASSIC_FILL_COLOURS[0]);
    expect(fillColourOf('classic', undefined)).toBe(CLASSIC_FILL_COLOURS[0]);
  });

  it('draw a settled border green in Classic and pale in Quiet, and every other kind alike in both', () => {
    expect(borderColourOf('classic', 'international')).toBe(CLASSIC_INTERNATIONAL_BORDER);
    expect(borderColourOf('quiet', 'international')).toBe(BORDER_CLASS_COLORS.international);
    for (const kind of KINDS.filter((k) => k !== 'international')) {
      expect(borderColourOf('classic', kind)).toBe(BORDER_CLASS_COLORS[kind]);
    }
  });

  it('never give two kinds of border one colour in any style, which recolouring a batch in place relies on', () => {
    for (const style of TERRITORY_STYLES) {
      expect(new Set(KINDS.map((kind) => borderColourOf(style, kind))).size).toBe(KINDS.length);
    }
  });
});

describe('a style\'s look', () => {
  it('is its defaults until a person changes it', () => {
    for (const style of TERRITORY_STYLES) expect(territoryLookOf(style, undefined)).toEqual(TERRITORY_STYLE_DEFAULTS[style]);
  });

  it('keeps each style\'s changes apart: one style\'s change leaves the other as it was', () => {
    const settings = withLookChange(undefined, 'classic', { fillOpacity: 30 });
    expect(territoryLookOf('classic', settings).fillOpacity).toBe(30);
    expect(territoryLookOf('quiet', settings).fillOpacity).toBe(TERRITORY_STYLE_DEFAULTS.quiet.fillOpacity);
  });

  it('stores only what was changed, and forgets a value set back to the default', () => {
    const changed = withLookChange(undefined, 'classic', { fillOpacity: 30, borderThickness: TERRITORY_STYLE_DEFAULTS.classic.borderThickness });
    expect(changed).toEqual({ classic: { fillOpacity: 30 } });
    expect(withLookChange(changed, 'classic', { fillOpacity: TERRITORY_STYLE_DEFAULTS.classic.fillOpacity })).toEqual({});
  });

  it('brings a value outside its range inside, whether it is set or was stored', () => {
    expect(withLookChange(undefined, 'quiet', { borderThickness: 99 })).toEqual({ quiet: { borderThickness: 5 } });
    expect(territoryLookOf('quiet', { quiet: { height: -3, fillOpacity: 400 } })).toMatchObject({ height: 0, fillOpacity: 100 });
  });

  it('ignores a stored value that is not a number', () => {
    const stored = { quiet: { fillOpacity: Number.NaN, borderVisibility: '20' as unknown as number } } as Partial<Record<'quiet', Partial<TerritoryLook>>>;
    expect(territoryLookOf('quiet', stored)).toEqual(TERRITORY_STYLE_DEFAULTS.quiet);
  });
});

describe('the rest of the fine settings (step 5)', () => {
  it('start at today\'s look: dashes, shading and every border\'s colour as they were', () => {
    for (const style of TERRITORY_STYLES) {
      const look = TERRITORY_STYLE_DEFAULTS[style];
      expect(look.dashLength).toBe(100);
      expect(look.shading).toBe(100);
      for (const kind of BORDER_KINDS) expect(borderColourOf(style, kind, look)).toBe(borderColourOf(style, kind));
    }
  });

  it('offer every kind of border the same calm swatches, red only to a disputed one and amber only to a line of control', () => {
    const calm = ['pale', 'grey', 'green', 'cyan', 'blue', 'violet'];
    expect(borderSwatchesFor('international')).toEqual(calm);
    expect(borderSwatchesFor('indefinite')).toEqual(calm);
    expect(borderSwatchesFor('disputed')).toEqual(['red', ...calm]);
    expect(borderSwatchesFor('line_of_control')).toEqual(['amber', ...calm]);
    expect(BORDER_SWATCHES.red.hex).toBe(BORDER_CLASS_COLORS.disputed);
    expect(BORDER_SWATCHES.amber.hex).toBe(BORDER_CLASS_COLORS.line_of_control);
  });

  it('draw a border in the swatch its kind was given in that style, and leave the other style\'s as it was', () => {
    const settings = withLookChange(undefined, 'quiet', { borderColours: { international: 'cyan' } });
    expect(settings).toEqual({ quiet: { borderColours: { international: 'cyan' } } });
    expect(borderColourOf('quiet', 'international', territoryLookOf('quiet', settings))).toBe(BORDER_SWATCHES.cyan.hex);
    expect(borderColourOf('quiet', 'disputed', territoryLookOf('quiet', settings))).toBe(BORDER_CLASS_COLORS.disputed);
    expect(territoryLookOf('classic', settings)).toEqual(TERRITORY_STYLE_DEFAULTS.classic);
    // A maritime line keeps its own colour.
    expect(borderColourOf('quiet', 'maritime_eez', territoryLookOf('quiet', settings))).toBe(BORDER_CLASS_COLORS.maritime_eez);
  });

  it('forget a colour set back to the style\'s own, and keep the other kinds\' changes', () => {
    const two = withLookChange(undefined, 'classic', { borderColours: { international: 'blue', indefinite: 'violet' } });
    const one = withLookChange(two, 'classic', { borderColours: { international: 'green' } });
    expect(one).toEqual({ classic: { borderColours: { indefinite: 'violet' } } });
    expect(withLookChange(one, 'classic', { borderColours: { indefinite: 'grey' } })).toEqual({});
  });

  it('refuse a swatch its kind is not offered, or one that does not exist, whether set or stored', () => {
    expect(withLookChange(undefined, 'quiet', { borderColours: { international: 'red', indefinite: 'amber' } })).toEqual({});
    const stored = { quiet: { borderColours: { international: 'amber', disputed: 'plaid' } } } as never;
    expect(territoryLookOf('quiet', stored)).toEqual(TERRITORY_STYLE_DEFAULTS.quiet);
  });

  it('take a cross-fade inside 0–2000 ms, and 500 where none was stored', () => {
    expect(crossFadeMsOf({})).toBe(500);
    expect(crossFadeMsOf({ crossFadeMs: Number.NaN })).toBe(500);
    expect(crossFadeMsOf({ crossFadeMs: 5000 })).toBe(2000);
    expect(crossFadeMsOf({ crossFadeMs: -1 })).toBe(0);
    expect(crossFadeMsOf({ crossFadeMs: 800 })).toBe(800);
  });

  it('keep dash length and shading in range', () => {
    expect(withLookChange(undefined, 'quiet', { dashLength: 1000, shading: -5 })).toEqual({ quiet: { dashLength: 300, shading: 0 } });
    expect(territoryLookOf('classic', { classic: { dashLength: 10 } }).dashLength).toBe(50);
  });
});

describe('settings a browser stored before K5', () => {
  it('become changes to Quiet, the one look there was, leaving out the values that were the defaults', () => {
    expect(quietChangesFromLegacy({ opacity: 30, borderVisibility: 70, borderThickness: 2, fillElevationEpsilon: 0.2 }))
      .toEqual({ quiet: { fillOpacity: 30, borderThickness: 2 } });
  });

  it('come to nothing when every value was a default, so the browser takes Quiet\'s defaults as they are now', () => {
    expect(quietChangesFromLegacy({ opacity: 50, borderVisibility: 70, borderThickness: 1, fillElevationEpsilon: 0.2 })).toEqual({});
    expect(quietChangesFromLegacy({})).toEqual({});
  });
});
