/**
 * How a country's name looks on the globe (decision K5, step 4: TS4, TS10–TS14,
 * docs/missions/01-architecture-decisions/territories.md).
 *
 * Upper case in the text face, in three tiers by Natural Earth's label rank, each
 * on a halo of the globe's own dark so it reads over Classic's bright fills, Quiet's
 * dark one, the ocean and the clouds alike. The selected country is cyan, which
 * already means "selected" everywhere in the app.
 */
import { CYAN, FONTS, MIN_TEXT_PX, ROLES } from '../../styles/tokens';

export interface NameTier {
  /** The ranks it covers, inclusive. */
  ranks: readonly [number, number];
  /** CSS px. Never under MIN_TEXT_PX. */
  sizePx: number;
  weight: 500 | 600;
  /** Letter spacing, in em. */
  trackingEm: number;
  colour: string;
}

export const NAME_TIERS: readonly NameTier[] = [
  { ranks: [0, 2], sizePx: 13, weight: 600, trackingEm: 0.08, colour: ROLES.text.heading },
  { ranks: [3, 4], sizePx: 12, weight: 600, trackingEm: 0.06, colour: ROLES.text.body },
  { ranks: [5, 99], sizePx: MIN_TEXT_PX, weight: 500, trackingEm: 0.04, colour: ROLES.text.secondary },
];

export function tierOf(rank: number): NameTier {
  return NAME_TIERS.find((t) => rank >= t.ranks[0] && rank <= t.ranks[1]) ?? NAME_TIERS[NAME_TIERS.length - 1];
}

/** The selected country's name, in the colour that means selected. */
export const SELECTED_NAME_COLOUR = CYAN[300];

/** What a name stands on: a soft glow under a tight stroke, both in the globe's own dark. */
export const NAME_HALO = {
  colour: ROLES.surface.globe,
  glow: { widthPx: 5, alpha: 0.35 },
  stroke: { widthPx: 2.5, alpha: 0.9 },
} as const;

/** Line height, as a multiple of the size. */
export const NAME_LINE_HEIGHT = 1.2;

/** The canvas font for a tier: always the text face's own stack (guard-font-families). */
export function nameFont(tier: NameTier, ratio = 1): string {
  return `${tier.weight} ${tier.sizePx * ratio}px ${FONTS.text}`;
}
