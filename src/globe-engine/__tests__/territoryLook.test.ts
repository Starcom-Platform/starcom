/**
 * The territories' style as drawn: the screen's, or the card's while a capture
 * renders (decision K5, TS3).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { holdForCapture, releaseMotion, stillMotion } from '../captureClock';
import {
  cardShellLift,
  cardTerritoryStyle,
  drawnTerritoryStyle,
  legendsForCard,
  noteTerritoryStyleDrawn,
  resetTerritoryLookForTest,
  setCardTerritoryStyle,
  setScreenTerritories,
  setTerritoriesDrawn,
  territoriesDrawnIn,
  territoriesMissedCardStyle,
  territoryLook,
} from '../territoryLook';
import { BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID, territoryLegends } from '../../geopolitical/theme/borderLegend';
import { BORDER_SWATCHES, TERRITORY_STYLE_DEFAULTS } from '../../geopolitical/theme/territoryStyles';
import { liftForHeight } from '../shellLift';
import { cssColorOf, type LayerLegend } from '../../services/globe/globeLegendStore';
import { BORDER_CLASS_COLORS } from '../../geopolitical/theme/materialTheme';

afterEach(() => {
  releaseMotion();
  resetTerritoryLookForTest();
});

const other = (layerId: string): LayerLegend => ({ layerId, layer: layerId, swatches: [] });

describe('the style drawn', () => {
  it('is the screen\'s between captures, Classic until a person chooses', () => {
    expect(drawnTerritoryStyle()).toBe('classic');
    setScreenTerritories('quiet', TERRITORY_STYLE_DEFAULTS);
    expect(drawnTerritoryStyle()).toBe('quiet');
  });

  it('is the card\'s while a frame is held still for a capture, and the screen\'s again after', () => {
    stillMotion(1_000);
    expect(drawnTerritoryStyle()).toBe('quiet');
    releaseMotion();
    expect(drawnTerritoryStyle()).toBe('classic');
  });

  it('is the card\'s for the whole of a clip, between its frames too', () => {
    const release = holdForCapture();
    expect(drawnTerritoryStyle()).toBe('quiet');
    release();
    expect(drawnTerritoryStyle()).toBe('classic');
  });

  it('is a shot\'s style when it names one, and Quiet again when it is cleared', () => {
    setCardTerritoryStyle('classic');
    expect(cardTerritoryStyle()).toBe('classic');
    stillMotion(1_000);
    expect(drawnTerritoryStyle()).toBe('classic');
    releaseMotion();
    setCardTerritoryStyle(null);
    expect(cardTerritoryStyle()).toBe('quiet');
  });

  it('reads each style\'s look as this browser set it', () => {
    const looks = { ...TERRITORY_STYLE_DEFAULTS, quiet: { ...TERRITORY_STYLE_DEFAULTS.quiet, fillOpacity: 20 } };
    setScreenTerritories('classic', looks);
    expect(territoryLook('quiet').fillOpacity).toBe(20);
    expect(territoryLook('classic')).toEqual(TERRITORY_STYLE_DEFAULTS.classic);
  });
});

describe('a card\'s key', () => {
  const drawn = { borderKinds: ['international', 'disputed'] as const, fills: true };

  it('prints the territories in the card\'s style after every other entry, the rest as published', () => {
    setTerritoriesDrawn({ borderKinds: [...drawn.borderKinds], fills: true });
    const screen = [other('A'), ...territoryLegends('classic', territoriesDrawnIn('classic')).map((e) => e.legend!), other('B')];
    expect(screen.map((l) => l.layerId)).toEqual(['A', BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID, 'B']);

    const card = legendsForCard(screen);
    expect(card.map((l) => l.layerId)).toEqual(['A', 'B', BORDERS_LEGEND_ID]);
    const settled = card[2].swatches.find((s) => s.label === 'international boundary');
    expect(settled?.color).toBe(cssColorOf(BORDER_CLASS_COLORS.international));
  });

  it('keys a card\'s borders in the colours its style was given, not the screen style\'s', () => {
    setTerritoriesDrawn({ borderKinds: [...drawn.borderKinds], fills: true });
    setScreenTerritories('classic', {
      ...TERRITORY_STYLE_DEFAULTS,
      quiet: { ...TERRITORY_STYLE_DEFAULTS.quiet, borderColours: { ...TERRITORY_STYLE_DEFAULTS.quiet.borderColours, international: 'cyan' } },
    });
    const card = legendsForCard([other('A')]);
    const settled = card.find((l) => l.layerId === BORDERS_LEGEND_ID)!.swatches.find((s) => s.label === 'international boundary');
    expect(settled?.color).toBe(cssColorOf(BORDER_SWATCHES.cyan.hex));
  });

  it('prints Classic\'s countries line when the shot asks for Classic', () => {
    setTerritoriesDrawn({ borderKinds: [...drawn.borderKinds], fills: true });
    setCardTerritoryStyle('classic');
    const card = legendsForCard([other('A')]);
    expect(card.map((l) => l.layerId)).toEqual(['A', BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID]);
  });

  it('names nothing the card\'s style hides: no borders where they are hidden, no countries where the fills are', () => {
    setTerritoriesDrawn({ borderKinds: [...drawn.borderKinds], fills: true });
    setScreenTerritories('classic', {
      ...TERRITORY_STYLE_DEFAULTS,
      classic: { ...TERRITORY_STYLE_DEFAULTS.classic, fillOpacity: 0, borderVisibility: 0 },
    });
    setCardTerritoryStyle('classic');
    expect(territoriesDrawnIn('classic')).toEqual({ borderKinds: [], fills: false });
    expect(legendsForCard([other('A')]).map((l) => l.layerId)).toEqual(['A']);
  });

  it('drops the territories\' entries when the overlay is off', () => {
    setTerritoriesDrawn(null);
    const stale = territoryLegends('classic', { borderKinds: ['international'], fills: true }).map((e) => e.legend!);
    expect(legendsForCard([other('A'), ...stale]).map((l) => l.layerId)).toEqual(['A']);
  });
});

describe('a card that did not draw its own style', () => {
  const drawnBorders = () => setTerritoriesDrawn({ borderKinds: ['international'], fills: true });

  it('is refused when the capture\'s render never drew the territories, with why', () => {
    drawnBorders();
    stillMotion(1_000);
    releaseMotion();
    expect(territoriesMissedCardStyle()).toMatch(/not redrawn for this card/);
  });

  it('is refused when the capture drew another style than the card\'s', () => {
    drawnBorders();
    stillMotion(1_000);
    noteTerritoryStyleDrawn('classic');
    releaseMotion();
    expect(territoriesMissedCardStyle()).toMatch(/drawn classic, not the card's quiet/);
  });

  it('passes when the capture drew the card\'s style, and when there are no territories to draw', () => {
    drawnBorders();
    stillMotion(1_000);
    noteTerritoryStyleDrawn('quiet');
    releaseMotion();
    expect(territoriesMissedCardStyle()).toBeNull();
    noteTerritoryStyleDrawn('classic');
    expect(territoriesMissedCardStyle()).toBeNull();
    setTerritoriesDrawn(null);
    stillMotion(2_000);
    releaseMotion();
    expect(territoriesMissedCardStyle()).toBeNull();
  });
});

describe('the lift a card draws at', () => {
  const raised = { ...TERRITORY_STYLE_DEFAULTS, classic: { ...TERRITORY_STYLE_DEFAULTS.classic, height: 3.5 } };

  it('is the card style\'s, not the screen\'s: 1 for a Quiet card while the screen stands Classic raised', () => {
    setTerritoriesDrawn({ borderKinds: ['international'], fills: true });
    setScreenTerritories('classic', raised);
    expect(cardShellLift()).toBe(1);
    setCardTerritoryStyle('classic');
    expect(cardShellLift()).toBeCloseTo(liftForHeight(3.5), 9);
  });

  it('is 1 where no fills are drawn, whatever the style', () => {
    setTerritoriesDrawn({ borderKinds: ['international'], fills: false });
    setScreenTerritories('classic', raised);
    setCardTerritoryStyle('classic');
    expect(cardShellLift()).toBe(1);
  });
});

describe('a card after another', () => {
  it('is refused when its capture drew nothing, though the card before it drew its style', () => {
    setTerritoriesDrawn({ borderKinds: ['international'], fills: true });
    stillMotion(1_000);
    noteTerritoryStyleDrawn('quiet');
    releaseMotion();
    expect(territoriesMissedCardStyle()).toBeNull();
    stillMotion(2_000);
    releaseMotion();
    expect(territoriesMissedCardStyle()).toMatch(/not redrawn/);
  });
});
