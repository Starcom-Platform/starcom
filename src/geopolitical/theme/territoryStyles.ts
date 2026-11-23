/**
 * How the country fills and borders look: a style, and each style's fine settings
 * (decision K5: docs/missions/01-architecture-decisions/territories.md).
 *
 * ─── TWO STYLES ────────────────────────────────────────────────────────────
 *
 * Quiet is the look since 2026-09-19 (materialTheme.ts says why): one dark tone
 * for every country, pale borders, the fills on the ground.
 *
 * Classic is the look before it, with what was wrong with it fixed (TS1, TS2).
 * The fills take four colours, and two countries that share a border never share
 * one: the colour says "a different country from its neighbour" and nothing else,
 * where the old id hash put neighbours alike as often as not. Red and amber stay
 * out of the fills, kept for the borders that are not settled. The international
 * border is green again.
 *
 * A first visit sees Classic on screen. A card or clip draws Quiet unless its
 * shot asks for Classic (TS3), so the cards' look holds still across this change.
 *
 * ─── ONLY CHANGES ARE STORED ───────────────────────────────────────────────
 *
 * Each style keeps its own fine settings (TS6), and what is stored is what a
 * person changed in it, nothing else: the defaults are derived on every read, as
 * markerStyles.ts does for the same reason. A stored copy of every default would
 * freeze today's defaults into every returning browser, so a better default could
 * never reach them.
 */
import { BORDER_CLASS_COLORS, TERRITORY_FILL_COLOR, type BorderClassification } from './materialTheme';
import { TERRITORY_COLOUR_SLOT } from './territoryColours';
import { CYAN } from '../../styles/tokens';

export type TerritoryStyle = 'classic' | 'quiet';

export const TERRITORY_STYLES: readonly TerritoryStyle[] = ['classic', 'quiet'];

export const TERRITORY_STYLE_LABELS: Readonly<Record<TerritoryStyle, string>> = {
  classic: 'Classic',
  quiet: 'Quiet',
};

/** What the globe on screen draws until a person picks (TS3). */
export const DEFAULT_TERRITORY_STYLE: TerritoryStyle = 'classic';

/** What a card or clip draws unless its shot names a style (TS3). */
export const CARD_TERRITORY_STYLE: TerritoryStyle = 'quiet';

export function isTerritoryStyle(value: unknown): value is TerritoryStyle {
  return typeof value === 'string' && (TERRITORY_STYLES as readonly string[]).includes(value);
}

/** The kinds of land border a person can colour (step 5). Maritime lines keep their own colours. */
export type BorderKind = 'international' | 'disputed' | 'line_of_control' | 'indefinite';
export const BORDER_KINDS: readonly BorderKind[] = ['international', 'disputed', 'line_of_control', 'indefinite'];

export function isBorderKind(value: unknown): value is BorderKind {
  return typeof value === 'string' && (BORDER_KINDS as readonly string[]).includes(value);
}

/** A border colour from the palette (owner, 2026-10-08), stored by name so the palette can be retuned. */
export type BorderSwatch = 'pale' | 'grey' | 'green' | 'cyan' | 'blue' | 'violet' | 'red' | 'amber';

/** The fine settings a style keeps. */
export interface TerritoryLook {
  /** How opaque the fills are, 0–100; 0 draws none. */
  fillOpacity: number;
  /** How far the fills stand off the surface, in scene units (100 = one Earth radius). */
  height: number;
  /** How opaque the borders are, 0–100. */
  borderVisibility: number;
  /** Border width in screen pixels; a provisional border is drawn heavier (materialTheme.ts). */
  borderThickness: number;
  /** A provisional border's dashes, as a share of today's (3 on, 2 off), 50–300. */
  dashLength: number;
  /** How strongly the sun shades the fills, as a share of today's, 0–100: 0 is flat. */
  shading: number;
  /** Each kind of land border's colour. */
  borderColours: Readonly<Record<BorderKind, BorderSwatch>>;
}

/** The look's settings that are numbers. */
export type TerritoryLookNumber = Exclude<keyof TerritoryLook, 'borderColours'>;

/** A change to a look, or what is stored of one: any of its settings, and any kinds' colours. */
export type TerritoryLookChange = Partial<Pick<TerritoryLook, TerritoryLookNumber>> & {
  borderColours?: Partial<Record<BorderKind, BorderSwatch>>;
};

/** How a kind of border is named where its colour is chosen: short, to fit beside its swatches. */
export const BORDER_KIND_LABELS: Readonly<Record<BorderKind, string>> = {
  international: 'International',
  disputed: 'Disputed',
  line_of_control: 'Line of control',
  indefinite: 'Indefinite',
};

/** How long a change of detail cross-fades, in ms: one setting for the layer, not a style's (step 5). */
export const TERRITORY_CROSS_FADE_MS = { default: 500, min: 0, max: 2000 } as const;

/** The cross-fade a config asks for, inside its range; 500 where none is stored. */
export function crossFadeMsOf(config: { crossFadeMs?: number }): number {
  const ms = config.crossFadeMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return TERRITORY_CROSS_FADE_MS.default;
  return Math.min(TERRITORY_CROSS_FADE_MS.max, Math.max(TERRITORY_CROSS_FADE_MS.min, ms));
}

/** What each setting may be. A stored value outside is brought inside, never dropped. */
export const TERRITORY_LOOK_RANGES: Readonly<Record<TerritoryLookNumber, { min: number; max: number }>> = {
  fillOpacity: { min: 0, max: 100 },
  height: { min: 0, max: 3.5 },
  borderVisibility: { min: 0, max: 100 },
  borderThickness: { min: 0.5, max: 5 },
  dashLength: { min: 50, max: 300 },
  shading: { min: 0, max: 100 },
};

/**
 * Each style's look before anyone changes it.
 *
 * Classic stands at 3.5, the old shell's height, 223 km up and over the clouds
 * (TS1). Every layer's marks and lines ride over it (globe-engine/shellLift.ts):
 * the shell alone covered them, which is why the fills came down in d166d5bb.
 * Quiet stays on the ground.
 */
export const TERRITORY_STYLE_DEFAULTS: Readonly<Record<TerritoryStyle, Readonly<TerritoryLook>>> = {
  // 35%, not the old look's 50 (TS9): the four colours read apart, and the marks and the Earth show through.
  classic: {
    fillOpacity: 35, height: 3.5, borderVisibility: 70, borderThickness: 1, dashLength: 100, shading: 100,
    borderColours: { international: 'green', disputed: 'red', line_of_control: 'amber', indefinite: 'grey' },
  },
  quiet: {
    fillOpacity: 50, height: 0.2, borderVisibility: 70, borderThickness: 1, dashLength: 100, shading: 100,
    borderColours: { international: 'pale', disputed: 'red', line_of_control: 'amber', indefinite: 'grey' },
  },
};

/**
 * Classic's four fill colours (TS2): the old default palette, with violet where
 * its amber was. Amber and red are the provisional borders' colours, and a fill in
 * either put a settled country in the colour of a contested line.
 */
export const CLASSIC_FILL_COLOURS: readonly [number, number, number, number] = [0x00ff41, 0x00b37a, 0x0094ff, 0x8a6cff];

/** Classic's international border: the old vivid green (TS2). */
export const CLASSIC_INTERNATIONAL_BORDER = 0x00ff41;

/**
 * The border palette (step 5): today's border colours, the app's cyan, and Classic's
 * blue and violet. Red and amber mean "not settled" (TS8), so red is offered only to
 * a disputed border and amber only to a line of control.
 */
export const BORDER_SWATCHES: Readonly<Record<BorderSwatch, { label: string; hex: number }>> = {
  pale: { label: 'Pale', hex: BORDER_CLASS_COLORS.international },
  grey: { label: 'Grey', hex: BORDER_CLASS_COLORS.indefinite },
  green: { label: 'Green', hex: CLASSIC_INTERNATIONAL_BORDER },
  cyan: { label: 'Cyan', hex: parseInt(CYAN[300].slice(1), 16) },
  blue: { label: 'Blue', hex: CLASSIC_FILL_COLOURS[2] },
  violet: { label: 'Violet', hex: CLASSIC_FILL_COLOURS[3] },
  red: { label: 'Red', hex: BORDER_CLASS_COLORS.disputed },
  amber: { label: 'Amber', hex: BORDER_CLASS_COLORS.line_of_control },
};

const CALM_SWATCHES: readonly BorderSwatch[] = ['pale', 'grey', 'green', 'cyan', 'blue', 'violet'];

/** The swatches a kind of border may take. */
export function borderSwatchesFor(kind: BorderKind): readonly BorderSwatch[] {
  if (kind === 'disputed') return ['red', ...CALM_SWATCHES];
  if (kind === 'line_of_control') return ['amber', ...CALM_SWATCHES];
  return CALM_SWATCHES;
}

const isSwatchFor = (kind: BorderKind, value: unknown): value is BorderSwatch =>
  typeof value === 'string' && (borderSwatchesFor(kind) as readonly string[]).includes(value);

/** A territory's fill in a style. A code the table lacks takes the first colour. */
export function fillColourOf(style: TerritoryStyle, countryCode: string | undefined): number {
  if (style === 'quiet') return TERRITORY_FILL_COLOR;
  return CLASSIC_FILL_COLOURS[(countryCode && TERRITORY_COLOUR_SLOT[countryCode]) || 0];
}

/**
 * A border's colour in a style: a land border's from the look's palette swatch (the
 * style's own when no look is given: green for a settled one in Classic, pale in
 * Quiet, red, amber and grey for the rest), a maritime line's as materialTheme.ts
 * sets out. Borders are built in the style's own colours, which differ by kind, so a
 * batch of mixed kinds keeps a colour per line and a person's colours can be put on
 * at render (lineBatches.ts recolourLineBatch).
 */
export function borderColourOf(style: TerritoryStyle, classification: BorderClassification, look?: Pick<TerritoryLook, 'borderColours'>): number {
  if (isBorderKind(classification)) return BORDER_SWATCHES[(look ?? TERRITORY_STYLE_DEFAULTS[style]).borderColours[classification]].hex;
  return BORDER_CLASS_COLORS[classification];
}

/** What a person changed, per style; nothing else is stored. */
export type TerritoryStyleSettings = Partial<Record<TerritoryStyle, TerritoryLookChange>>;

const LOOK_KEYS = Object.keys(TERRITORY_LOOK_RANGES) as TerritoryLookNumber[];

const inRange = (key: TerritoryLookNumber, value: number) =>
  Math.min(TERRITORY_LOOK_RANGES[key].max, Math.max(TERRITORY_LOOK_RANGES[key].min, value));

/** A style's look: its defaults, with what a person changed in it. */
export function territoryLookOf(style: TerritoryStyle, settings: TerritoryStyleSettings | undefined): TerritoryLook {
  const defaults = TERRITORY_STYLE_DEFAULTS[style];
  const look: TerritoryLook = { ...defaults };
  const changed = settings?.[style] ?? {};
  for (const key of LOOK_KEYS) {
    const value = changed[key];
    if (typeof value === 'number' && Number.isFinite(value)) look[key] = inRange(key, value);
  }
  const colours = changed.borderColours;
  if (colours && typeof colours === 'object') {
    const chosen = { ...defaults.borderColours };
    for (const kind of BORDER_KINDS) {
      const swatch = colours[kind];
      if (isSwatchFor(kind, swatch)) chosen[kind] = swatch;
    }
    look.borderColours = chosen;
  }
  return look;
}

/**
 * The settings with `change` made to one style. A value set back to the style's
 * default is forgotten rather than stored, so a later, better default reaches it.
 */
export function withLookChange(
  settings: TerritoryStyleSettings | undefined,
  style: TerritoryStyle,
  change: TerritoryLookChange,
): TerritoryStyleSettings {
  const next: TerritoryLookChange = { ...(settings?.[style] ?? {}) };
  for (const key of LOOK_KEYS) {
    const value = change[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const kept = inRange(key, value);
    if (kept === TERRITORY_STYLE_DEFAULTS[style][key]) delete next[key];
    else next[key] = kept;
  }
  if (change.borderColours) {
    const colours = { ...(next.borderColours ?? {}) };
    for (const kind of BORDER_KINDS) {
      const swatch = change.borderColours[kind];
      if (!isSwatchFor(kind, swatch)) continue;
      if (swatch === TERRITORY_STYLE_DEFAULTS[style].borderColours[kind]) delete colours[kind];
      else colours[kind] = swatch;
    }
    if (Object.keys(colours).length) next.borderColours = colours;
    else delete next.borderColours;
  }
  const out: TerritoryStyleSettings = { ...(settings ?? {}) };
  if (Object.keys(next).length) out[style] = next;
  else delete out[style];
  return out;
}

/** Settings stored before K5, which held Quiet's look in four fields. */
export interface LegacyTerritoryLook {
  opacity?: unknown;
  borderVisibility?: unknown;
  borderThickness?: unknown;
  fillElevationEpsilon?: unknown;
}

/**
 * What a browser had changed before K5, as changes to Quiet, the only look there
 * was. Values equal to the defaults then were never chosen by anyone (the whole
 * config was stored), so they are left out and the browser takes Quiet's defaults.
 */
export function quietChangesFromLegacy(legacy: LegacyTerritoryLook): TerritoryStyleSettings {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return withLookChange(undefined, 'quiet', {
    fillOpacity: num(legacy.opacity),
    borderVisibility: num(legacy.borderVisibility),
    borderThickness: num(legacy.borderThickness),
    height: num(legacy.fillElevationEpsilon),
  });
}
