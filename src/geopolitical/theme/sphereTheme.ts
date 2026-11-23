// sphereTheme.ts — the Spheres layer's colours.
//
// A Sphere is a domain of influence (the canon's word, FusionGirl wiki "Sphere"):
// here, the states a language or a community of states reaches. Spheres overlap —
// Canada is in the Anglosphere and the Francophonie, Equatorial Guinea in three —
// so each has a hue of its own, and Spheres that share or border countries are kept
// at least 25° apart (tested). None is cyan, the app's own colour and "selected".
//
// Pure, with no THREE scene or DOM, as zoneTheme.ts is, so it is tested alone.
import { swatchCss } from './zoneTheme';

const SPHERE_COLORS: Readonly<Record<string, number>> = {
  'sphere:anglosphere': 0xd64545,     // red
  'sphere:malay': 0xd9643f,           // vermilion
  'sphere:germanosphere': 0xe07b38,   // orange
  'sphere:hispanosphere': 0xdcae3c,   // amber
  'sphere:turkic': 0xd8d04a,          // yellow
  'sphere:nordic': 0x93c03f,          // lime
  'sphere:lusosphere': 0x4cb05a,      // green
  'sphere:arabophone': 0x3fb87f,      // jade
  'sphere:francophonie': 0x5470d6,    // blue
  'sphere:russophone': 0x8e5bd6,      // violet
  'sphere:persianate': 0xc455d6,      // orchid
  'sphere:sinosphere': 0xd651a0,      // pink
  'sphere:swahili': 0xd6545f,         // rose
};

const UNKNOWN_SPHERE = 0xa0a0a0;

export function sphereColor(code: string): number {
  return SPHERE_COLORS[code] ?? UNKNOWN_SPHERE;
}

/** Every Sphere this theme colours, for the tests and the legend's order. */
export function coloredSpheres(): string[] {
  return Object.keys(SPHERE_COLORS);
}

export const sphereCss = (code: string): string => swatchCss(sphereColor(code));

/** A Sphere's fill: faint, since Spheres overlap and a country under three must still read. */
export const SPHERE_FILL_OPACITY = 0.13;
