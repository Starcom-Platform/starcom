/**
 * The territories' look as it is drawn: the screen's style, or the card's while a
 * capture renders (decision K5, TS3: docs/missions/01-architecture-decisions/territories.md).
 *
 * A first visit sees Classic on screen; a card or clip draws Quiet unless its shot
 * names a style. So the same globe is drawn in two styles, the screen's between
 * captures and the card's during one, and the switch is made at the start of each
 * render (useNationalTerritories3D, through sceneRenderHooks.ts), in place: a fill
 * uniform, a scale, the borders' colours. Nothing is rebuilt, so a capture costs
 * nothing extra and the screen is back in its own style for the next live frame.
 *
 * Read as the capture clock is read (captureClock.ts): one value, set before the
 * render, read by what draws. While a capture is under way (a frame held still, or
 * a clip between its frames) the card's style is drawn.
 */
import { captureUnderWay, onStill } from './captureClock';
import { liftForHeight } from './shellLift';
import { legendsInStyle, type TerritoriesDrawn } from '../geopolitical/theme/borderLegend';
import type { LayerLegend } from '../services/globe/globeLegendStore';
import {
  CARD_TERRITORY_STYLE,
  DEFAULT_TERRITORY_STYLE,
  TERRITORY_STYLE_DEFAULTS,
  type TerritoryLook,
  type TerritoryStyle,
} from '../geopolitical/theme/territoryStyles';

let screenStyle: TerritoryStyle = DEFAULT_TERRITORY_STYLE;
let looks: Readonly<Record<TerritoryStyle, TerritoryLook>> = TERRITORY_STYLE_DEFAULTS;
let cardStyle: TerritoryStyle = CARD_TERRITORY_STYLE;
const NOTHING_DRAWN: TerritoriesDrawn = { borderKinds: [], fills: false };
let drawn: TerritoriesDrawn = NOTHING_DRAWN;

/*
 * The style a capture's render actually drew, cleared as each capture begins and
 * noted by the territories layer as it draws (useNationalTerritories3D). Compose
 * reads it once the frame is taken: a card whose render never applied its style
 * would show the screen's Classic under a record that says Quiet, and look fine.
 * Seen once in a golden run and not again; the check makes it a refusal with a
 * reason rather than a wrong card.
 */
let capturedStyle: TerritoryStyle | null = null;
onStill({ still: () => { capturedStyle = null; }, release: () => {} });

/** The territories layer, at every render: the style it drew. */
export function noteTerritoryStyleDrawn(style: TerritoryStyle): void {
  if (captureUnderWay()) capturedStyle = style;
}

/**
 * Why the frame just captured does not show the territories in the card's style,
 * or null when it does, or when no territories are drawn.
 */
export function territoriesMissedCardStyle(): string | null {
  if (drawn.borderKinds.length === 0 && !drawn.fills) return null;
  if (capturedStyle === cardStyle) return null;
  return capturedStyle === null
    ? `The country fills and borders were not redrawn for this card, so it would show the screen's ${screenStyle} under a record that says ${cardStyle}. Make it again.`
    : `The country fills and borders were drawn ${capturedStyle}, not the card's ${cardStyle}. Make it again.`;
}

/** The style the screen draws, and every style's look as this browser has set it. */
export function setScreenTerritories(style: TerritoryStyle, looksByStyle: Readonly<Record<TerritoryStyle, TerritoryLook>>): void {
  screenStyle = style;
  looks = looksByStyle;
}

/** The style the next cards draw: a shot's, or null for the default (Quiet). */
export function setCardTerritoryStyle(style: TerritoryStyle | null): void {
  cardStyle = style ?? CARD_TERRITORY_STYLE;
}

/** The style a card drawn now would take. */
export function cardTerritoryStyle(): TerritoryStyle {
  return cardStyle;
}

/** The style the render under way draws. */
export function drawnTerritoryStyle(): TerritoryStyle {
  return captureUnderWay() ? cardStyle : screenStyle;
}

/** A style's look as this browser has set it. */
export function territoryLook(style: TerritoryStyle): TerritoryLook {
  return looks[style];
}

/**
 * What the territories drew, whatever the style: the kinds of border and whether
 * the fills, so a card's key can be written in the card's style (borderLegend.ts).
 * Null when the overlay is off.
 */
export function setTerritoriesDrawn(now: TerritoriesDrawn | null): void {
  drawn = now ?? NOTHING_DRAWN;
}

export function territoriesDrawn(): TerritoriesDrawn {
  return drawn;
}

/**
 * What a style shows of what was drawn: no borders where its borders are hidden,
 * no fills where its fills are, so its key names nothing the picture lacks.
 */
export function territoriesDrawnIn(style: TerritoryStyle): TerritoriesDrawn {
  const look = looks[style];
  return {
    borderKinds: look.borderVisibility > 0 ? drawn.borderKinds : [],
    fills: drawn.fills && look.fillOpacity > 0,
  };
}

/**
 * How far a card drawn now lifts its marks: a raised shell's lift where the card's
 * style draws its fills, else 1 (shellLift.ts). For what a card places from
 * coordinates rather than from what was drawn (its featured glyph).
 */
export function cardShellLift(): number {
  const look = looks[cardStyle];
  return drawn.fills && look.fillOpacity > 0 ? liftForHeight(look.height) : 1;
}

/** The key as a card drawn now prints it: the territories' entries in the card's style (TS3). */
export function legendsForCard(legends: readonly LayerLegend[]): LayerLegend[] {
  return legendsInStyle(legends, cardStyle, territoriesDrawnIn(cardStyle), looks[cardStyle]);
}

/** Back to a first visit's state. */
export function resetTerritoryLookForTest(): void {
  screenStyle = DEFAULT_TERRITORY_STYLE;
  looks = TERRITORY_STYLE_DEFAULTS;
  cardStyle = CARD_TERRITORY_STYLE;
  drawn = NOTHING_DRAWN;
  capturedStyle = null;
}
