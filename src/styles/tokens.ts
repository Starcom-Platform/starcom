/**
 * The one token set (plan item 8.1, decision D6).
 *
 * The palette is the one docs/missions/04-plan/interface-upgrade.md sets out:
 * built in OKLCH, gunmetal at hue 225 and cyan at 210, converted to sRGB. The
 * app had 746 distinct colours and two token files nobody read; this is the
 * place a colour comes from now. The CSS custom properties (tokenVariables) and
 * the MUI theme (starcomTheme.ts) are both made from it, so the two cannot
 * disagree.
 *
 * One rule: a hue means one kind of thing, everywhere.
 *   cyan    ours, interactive, selected, focus     never status
 *   green   permitted, healthy, done               never decoration
 *   amber   caution, restricted                    never "medium" or loading
 *   red     danger, hostile, failed                never brand
 *   violet  encrypted, protected                   never "critical"
 *   grey    unknown, stale, not judged             never "bad"
 * Colour is never the only signal: every state also has a glyph and a word.
 */

export const GUNMETAL = {
  950: '#0A1113', 900: '#131B1E', 800: '#1C262A', 700: '#283439', 600: '#3A474D',
  500: '#5D6C72', 400: '#818F94', 300: '#A1ADB2', 200: '#C7CFD3', 100: '#E9EEF0',
} as const;

export const CYAN = {
  900: '#002F36', 800: '#004952', 700: '#006774', 600: '#008797', 500: '#00A5B9',
  400: '#00C3DB', 300: '#3ADAF2', 200: '#7CEBFE', 100: '#B8F4FF', 50: '#E2FAFF',
} as const;

/** What a colour means, not what it looks like. */
export const SEMANTIC = {
  ok: '#6CE98D',
  caution: '#FFB848',
  danger: '#FF7266',
  /** Unknown provenance: MIL-STD-2525's yellow, always with a "?". */
  unknown: '#F3E749',
  protected: '#C9ACFF',
  /** Severity 1 to 4: a warm ramp with no green, because low harm is not "good". */
  severity: ['#EACF83', '#FAAB3F', '#FD8537', '#FB594D'],
} as const;

/**
 * Who may receive a record, in the Traffic Light Protocol's own colours (TLP
 * 2.0, BD15): coloured text on a black chip, which TLP specifies so its red
 * reads on any surface. Public is TLP:CLEAR, Limited TLP:GREEN ("within their
 * community": the internal relays) and Private TLP:RED (it never leaves the
 * workspace). Used for distribution and for nothing else.
 */
/**
 * A glyph's fill where its sprite takes its colour from a tint (intelReportSprites, GlyphSpriteMark.tint): white,
 * which a tint multiplies to itself. Never a colour on screen of its own.
 */
export const TINT_NEUTRAL = '#FFFFFF' as const;

export const TLP = { black: '#000000', clear: '#FFFFFF', green: '#33FF00', red: '#FF2B2B' } as const;

/**
 * Scales for readings drawn on the globe, by what is measured (decision D-W).
 * A reading's colour, never a status's, so kept apart from SEMANTIC. Air
 * temperature runs as weather reports colour it: violets and blues below
 * freezing, a pale ice at 0 °C, greens and yellows through the mild range,
 * oranges and reds into heat. No cyan: that is the app's own colour.
 */
export const DATA_SCALES = {
  temperatureC: [
    [-50, '#2B0B4F'], [-40, '#4A1F8F'], [-30, '#3D3FBD'], [-20, '#2F6BD6'], [-10, '#5B9BE0'],
    [0, '#DBE7F3'], [5, '#A6D8A4'], [10, '#63BD67'], [15, '#B3D64A'], [20, '#F1D33D'],
    [25, '#F5A524'], [30, '#E8612B'], [35, '#C8262C'], [40, '#8F1441'], [50, '#55092D'],
  ],
  /**
   * Rain rate, mm an hour (WX4, WX8): a weather report's scale, pale green for
   * a light shower through yellow and red to magenta for a downpour. It shares
   * hues with temperature, which is why Earth Weather shows one at a time.
   */
  /**
   * The National Weather Service's HeatRisk, 0 (Green) to 4 (Magenta), in its own
   * order of colours (raver-nights.md, RN2): an event in a town at Orange or worse
   * carries a halo of its level's colour.
   */
  heatRisk: ['#63BD67', '#F1D33D', '#F5A524', '#D93B2E', '#C2379F'],
  /**
   * The geoelectric field at the ground, mV/km, on a log scale (space-weather-visualization.md,
   * SW1): matplotlib's inferno, a tenth of its length every half decade, from 0.1 mV/km to 3 V/km:
   * a quiet day's few mV/km in violet and magenta, a storm's hundreds in orange, its volts in pale
   * yellow. Perceptually even, readable by those who do not see red and green apart, and clear of
   * the interactive cyan. Seen on a card of a quiet day (2026-10-10): a scale starting at 0.3 drew
   * the whole continent near black.
   */
  eFieldMvKm: [
    [0.1, '#160B39'], [0.3, '#420A68'], [1, '#6A176E'], [3, '#932667'], [10, '#BC3754'],
    [30, '#DD513A'], [100, '#F37819'], [300, '#FCA50A'], [1000, '#F6D746'], [3000, '#FCFFA4'],
  ],
  /**
   * The way the geoelectric field points, for its relief look (space-weather-visualization.md, SW1):
   * a wheel of four hues, toward north magenta, east amber, south green, west indigo, blended round
   * between them. No hue repeats and none is the interactive cyan.
   */
  eFieldDirection: [[0, '#C2379F'], [90, '#F5A524'], [180, '#63BD67'], [270, '#3D3FBD']],
  /**
   * The chance of aurora overhead, percent (space-weather-visualization.md, SW3): the oxygen green
   * an aurora is mostly seen in, brightening with the chance, and the pink of a strong storm's upper
   * curtain at the top. No cyan.
   */
  auroraPercent: [[2, '#0E3B26'], [10, '#1F8A4C'], [25, '#3DDC84'], [50, '#B4FF9A'], [90, '#FF7AA8']],
  /**
   * The magnetosphere's field lines (space-weather-visualization.md, SW4): closed, both ends on the
   * Earth, a cool periwinkle; open, one end in the solar wind, a warm coral. Not cyan.
   */
  fieldLines: { closed: '#8FA8FF', open: '#FF9A62' },
  /**
   * The Van Allen belts (SW5): the outer, of electrons, a soft violet; the inner, of protons, a warm
   * gold. Apart from the field lines' periwinkle and coral, and not cyan.
   */
  vanAllen: { outer: '#B98CFF', inner: '#FFC46B' },
  /**
   * The cusps (SW5): the solar wind's particles streaming down, a rose; and the day side's bursts of
   * reconnection, a warm white. Not cyan.
   */
  cusps: { line: '#FF6B9A', flash: '#FFF0B8' },
  /** The tail's current sheet (SW5): a pale lilac shimmer, quieter than everything round it. */
  tailSheet: '#D9D2FF',
  /**
   * The solar wind's particles (SW7), by the IMF's polarity: away from the Sun a warm gold, toward it a
   * cool periwinkle. Not cyan.
   */
  solarWind: { away: '#FFC98A', toward: '#9DB4FF' },
  /**
   * Hero Watch's rescue orange (decision D-HW, HW9): the colour of lifejackets and lifeboats, for its
   * marks, its regions and its badge. Apart from Raver Watch's violet, the intel cyan and the war reds.
   */
  heroWatch: '#FF7A1F',
  /**
   * AI Watch's magenta (decision D-AW, AW5, the owner's 2026-10-12): its marks, its
   * countries and its badge. Apart from Raver Watch's violet, Hero Watch's orange, the intel cyan and the
   * war reds. A note's stance is a shape and a word, never this colour's shade (AW4).
   */
  aiWatch: '#F040C8',
  /**
   * Missions' colour (decision D-MF, step 5): Hero Watch's rescue orange, since a mission is the same
   * mission, the same colour, whichever mode shows it (HW8). Its marks, its places and its badge.
   */
  missions: '#FF7A1F',
  /**
   * Campaigns and Operations (decision D-RS, RS25): indigo, a hue nothing else on the globe carries, so a
   * bounded push reads apart from the missions under it. Their places and their pills.
   */
  operations: '#7B6CFF',
  /**
   * Civil Unrest's chartreuse (decision D-CU, CU1, the owner's 2026-10-26): a yellow-green nothing else on the globe
   * carries, apart from the war reds and caution amber, which unrest must not borrow. Its marks, its countries'
   * tint, and the rings of its protest surges.
   */
  civilUnrest: '#C2E83A',
  /**
   * Psi Watch's aqua glow (decision D-PW, PW17, the owner's 2026-10-26): its lines, its window curves and its badge.
   * Chosen knowing its nearest neighbours, OK green and cyan 300, at 0.094 and 0.095 in OKLab.
   */
  psiWatch: '#5CF5DA',
  /**
   * Psi Watch's violet (decision D-PW, PW66, the owner's 2026-10-27): what stands on the ground, Psi Alerts, tested
   * places, calls and echoes, beside the aqua of the sky. The violet farthest from every point colour on the globe,
   * 0.136 in OKLab from Operations' blue-violet and 0.137 from AI Watch's magenta; 4.6 to 1 on gunmetal 950.
   */
  psiGround: '#BC34FC',
  /**
   * The Timestream's aspect lane (decision D-PW, PW42): each major aspect by its kind, as astrology has long coloured
   * them, the hard ones warm, the soft ones cool, the conjunction neutral; softer than the lanes' pure element colours
   * (PW41) so the two never read as one scale.
   */
  aspects: { conjunction: '#E8ECEF', opposition: '#FF5C7C', square: '#FF9D45', trine: '#58A8FF', sextile: '#7FE08F' },
  /**
   * The Timestream's Kp (decision D-PW, PW42), by level: quiet, below 4, gunmetal's grey; unsettled, 4, a yellow; then
   * NOAA's G scale, G1 amber through orange and red to G4 magenta, and G5 a pale rose, the brightest the strongest, as
   * a great aurora's upper curtain. None is cyan, nor Psi Watch's aqua or violet.
   */
  kpLevels: ['#818F94', '#E9D63B', '#F5A524', '#E8612B', '#D93B2E', '#C2379F', '#FFC2E0'],
  /**
   * The Timestream's eclipses past three years (decision D-PW, PW51): a solar eclipse the gold of the corona, a lunar
   * one the copper of the Moon in the Earth's shadow.
   */
  eclipses: { solar: '#FFE08A', lunar: '#D2693C' },
  /**
   * NOAA's ENLIL model of the solar wind (SW18), one at a time: its density, per cm³ scaled by r², and
   * its radial speed, km/s, each over its own bar's range. Each runs from a deep plum through rose to
   * a pale gold, so dense or fast streams and CMEs glow and the quiet wind is dim. Not cyan.
   */
  enlilDensity: [
    [0, '#140A2E'], [4, '#2E1660'], [8, '#6A2A9C'], [14, '#B23F9E'], [22, '#E85A86'],
    [32, '#FF8A6A'], [45, '#FFC285'], [60, '#FFF0D2'],
  ],
  /**
   * The CMEs' shells (SW23), by the speed DONKI measured near the Sun, km/s: a pale lilac-white when slow,
   * through gold and orange to a hot red when fast. Warmer and brighter than ENLIL's ramp, which they are
   * drawn over. Not cyan.
   */
  cmeSpeedKmS: [[300, '#F4F1FF'], [600, '#FFE58A'], [1000, '#FFAA3B'], [1500, '#FF6A2B'], [2500, '#FF2E4D']],
  enlilVelocity: [
    [200, '#10183F'], [300, '#22337A'], [400, '#4A4AB0'], [500, '#8A4DC0'], [600, '#C855A8'],
    [700, '#EE6A82'], [850, '#FF9C64'], [1100, '#FFD088'], [1600, '#FFF5DA'],
  ],
  rainMmH: [
    [0.1, '#B7E4A8'], [0.3, '#86D27A'], [1, '#4CB34F'], [2.5, '#1E8C3D'], [5, '#E9D63B'],
    [10, '#F2A22E'], [20, '#E25A2A'], [40, '#C3212F'], [70, '#A4268F'], [100, '#E9C0F2'],
  ],
  /**
   * The ψ field's heat (decision D-PW, PW57): Psi Watch's own aqua, from a deep sea-green where ψ is faint to the
   * aqua itself where the field condenses and a pale mint past it, on an eclipse's day. Where ψ is nought the
   * planet shows through. One hue, so it reads as Psi's and never as a temperature or the interactive cyan.
   */
  psiField: [
    [0.05, '#0B3B36'], [0.2, '#11705F'], [0.35, '#1FA98F'], [0.5, '#3FDCBE'], [0.65, '#5CF5DA'],
    [0.8, '#B5FFEF'], [1, '#F2FFFB'],
  ],
  /**
   * An earthquake's magnitude (D-EQ, EQ10): its flag's colour, a step each whole magnitude: a quiet grey under 3, the
   * warm severity ramp from 3 to 6, magenta from 7, so a great quake stands out on any skin. No cyan.
   */
  quakeMagnitude: [[0, '#A1ADB2'], [3, '#EACF83'], [4, '#FAAB3F'], [5, '#FD8537'], [6, '#FB594D'], [7, '#C2379F']],
  /**
   * How deep a quake began, km (D-EQ, EQ5): USGS's depth bands, 0–33, 33–70, 70–150, 150–300, 300–500, 500 and
   * deeper, from a warm red near the surface to violet deepest, each light enough for a flag's dark numbers. No cyan.
   */
  quakeDepthKm: [[0, '#FF8A80'], [33, '#FFB74D'], [70, '#FFF176'], [150, '#AED581'], [300, '#64B5F6'], [500, '#B39DDB']],
  /**
   * How strongly the ground shook, by Modified Mercalli Intensity (D-EQ, EQ11): USGS's own ShakeMap colours, II to X,
   * so a contour reads as it does on USGS's pages.
   */
  shakingMmi: [
    [2, '#BFCCFF'], [3, '#A0E6FF'], [4, '#80FFFF'], [5, '#7AFF93'], [6, '#FFFF00'], [7, '#FFC800'], [8, '#FF9100'],
    [9, '#FF0000'], [10, '#C80000'],
  ],
} as const;

/**
 * Colour by kind (critique-2026-11-01, OR3, OR15; plan A3): one colour for each of the twelve kinds of thing the
 * globe marks, used by every mode; a mode's own hue stays on its frame and badge, and severity is size and
 * brightness, never hue. Drafted on the Glyph Lexicon sheet (scripts/glyph-lexicon/kinds.ts, which measures them
 * under three kinds of colour blindness): as seen, every pair at least 0.10 apart in OKLab and every one at least
 * 0.11 from the interactive cyan. Unrest's chartreuse, AI Watch's magenta and the rescue orange are the owner's own.
 */
export const KIND_COLOURS = {
  conflict: '#E5484D',
  unrest: '#C2E83A',
  hazards: '#C47A45',
  weather: '#5BA4F5',
  health: '#F27BB5',
  cyber: '#9A6BFF',
  ai: '#F040C8',
  economy: '#E8C547',
  infra: '#8FA3B8',
  space: '#4F6BFF',
  civic: '#E6DFC8',
  missions: '#FF7A1F',
} as const;
export type KindColour = keyof typeof KIND_COLOURS;

/**
 * The sections and their tints (BD2, BD10), picked on the swatch sheet on
 * 2026-10-05. A tint goes in a section's frame only: its header rule, its
 * workspace name, its marker in the navigation; never on data or status. Each
 * is a grey of chroma 0.075 or less at OKLCH lightness 0.78, so none reads as a
 * status or as the interactive cyan (tested).
 */
export const SECTIONS = {
  situation: { name: 'Situation', tint: '#ABB8D2' },   // slate, oklch(0.78 0.04 265)
  collect: { name: 'Collect', tint: '#92BDE2' },       // steel blue, oklch(0.78 0.07 245)
  investigate: { name: 'Investigate', tint: '#BFB89B' }, // parchment, oklch(0.78 0.04 95)
  assemble: { name: 'Assemble', tint: '#CAB680' },     // brass, oklch(0.78 0.075 90)
  analyse: { name: 'Analyse', tint: '#9FC0B3' },       // jade grey, oklch(0.78 0.04 170)
  publish: { name: 'Publish', tint: '#D4ABB6' },       // rose, oklch(0.78 0.05 0)
} as const;
export type SectionId = keyof typeof SECTIONS;

/** Where each colour is used. Text on an input (700) must not be muted 400 or cyan 500: both fail AA there. */
export const ROLES = {
  surface: {
    globe: GUNMETAL[950],
    frame: GUNMETAL[900],
    panel: GUNMETAL[800],
    input: GUNMETAL[700],
    divider: GUNMETAL[600],
  },
  text: {
    heading: GUNMETAL[100],
    body: GUNMETAL[200],
    secondary: GUNMETAL[300],
    muted: GUNMETAL[400],
  },
  accent: {
    accent: CYAN[400],
    focus: CYAN[400],
    buttonFill: CYAN[500],
    buttonLabel: GUNMETAL[950],
    /** 4.62:1 on a panel. Gunmetal 500 reaches only 2.83:1. */
    inputBorder: GUNMETAL[400],
  },
} as const;

/**
 * Type, pairing A (plan item 8.2, decided 2026-09-26), self-hosted once from
 * the @fontsource packages main.tsx imports. Each stack falls back to a family
 * of the same kind. Keys and hashes are always in the data font, whose zero is
 * slashed; Aldrich is for the Starcom wordmark only.
 */
export const FONTS = {
  // Devanagari, for Hindi (D-ML, L2), right after Plex: its files load only when Devanagari is on screen.
  display: "'Oxanium', 'IBM Plex Sans', 'IBM Plex Sans Devanagari', system-ui, sans-serif",
  text: "'IBM Plex Sans', 'IBM Plex Sans Devanagari', system-ui, -apple-system, 'Segoe UI', sans-serif",
  data: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  wordmark: "'Aldrich', 'Oxanium', sans-serif",
} as const;

/** Nothing smaller (interface-upgrade.md, "Type"). guard-small-type.mjs holds the count of what is. */
export const MIN_TEXT_PX = 11;

/** WCAG 2.2 relative luminance of an sRGB hex colour. */
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** The WCAG 2.2 contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A hex colour in OKLab (Björn Ottosson's), for telling how far apart two colours look. */
function oklab(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const lin = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(2), lin(4)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Lightness, chroma and hue (degrees) of a hex colour in OKLCH. */
export function oklch(hex: string): { l: number; c: number; h: number } {
  const [l, a, b] = oklab(hex);
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** How far apart two colours look: the distance between them in OKLab. */
export function oklabDistance(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Every token as a CSS custom property, `--sc-…`, for stylesheets to read with var(). */
export function tokenVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [step, hex] of Object.entries(GUNMETAL)) vars[`--sc-gunmetal-${step}`] = hex;
  for (const [step, hex] of Object.entries(CYAN)) vars[`--sc-cyan-${step}`] = hex;
  for (const [role, hex] of Object.entries(ROLES.surface)) vars[`--sc-${role === 'divider' ? 'divider' : `surface-${role}`}`] = hex;
  for (const [role, hex] of Object.entries(ROLES.text)) vars[`--sc-text-${role}`] = hex;
  for (const [role, hex] of Object.entries(ROLES.accent)) vars[`--sc-${kebab(role)}`] = hex;
  for (const [name, hex] of Object.entries(SEMANTIC)) if (typeof hex === 'string') vars[`--sc-${name}`] = hex;
  SEMANTIC.severity.forEach((hex, i) => { vars[`--sc-severity-${i + 1}`] = hex; });
  for (const [name, hex] of Object.entries(TLP)) vars[`--sc-tlp-${name}`] = hex;
  for (const [section, { tint }] of Object.entries(SECTIONS)) vars[`--sc-tint-${section}`] = tint;
  for (const [role, stack] of Object.entries(FONTS)) vars[`--sc-font-${role}`] = stack;
  return vars;
}
