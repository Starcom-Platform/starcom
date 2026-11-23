/**
 * How IntelWeb colours its notes (decision D-IW, IW12).
 *
 * - **Assessment** (the default): critical, actionable, standard or raw, in the globe's own colours
 *   (`spriteGlyphFill`), as `intelVariantOf` reads it; a note stating none is raw, as on the globe.
 * - **Category:** one hue per top-level category word, the same word always the same hue.
 * - **Country, publisher:** the first country a note states (a region as its country), or its
 *   publisher, ten hues for the ten most frequent and one for the rest.
 * - **Age:** from the oldest note's time to the newest's, gunmetal to cyan.
 *
 * Only notes take the colour chosen: a hub, a stub, a mission package or a cluster keeps its kind's.
 * A note stating nothing of the kind chosen is in one muted colour, and the key says so. Hues come
 * from the design tokens and d3's schemes, not new literals.
 */
import * as d3 from 'd3';
import { spriteGlyphFill } from '../../../../components/Globe/intelReportSprites';
import type { IntelVariant } from '../../../../components/Globe/intelVariant';
import { INTEL_CATEGORIES } from '../../../../symbols/symbolRegistry';
import { CYAN, GUNMETAL } from '../../../../styles/tokens';
import type { IntelNode } from './IntelGraph';

export const COLOURINGS = ['assessment', 'category', 'country', 'publisher', 'age'] as const;
export type Colouring = typeof COLOURINGS[number];

/** One line of the key: the value (a variant, a word, a code, a key, a time; '' for none, '*' for the rest) and its colour. */
export interface ColourKeyEntry { value: string; colour: string }

const ASSESSMENTS: readonly IntelVariant[] = ['critical', 'actionable', 'standard', 'raw'];
const NONE = GUNMETAL[500];
const REST = GUNMETAL[300];
const CATEGORY_HUES = new Map(INTEL_CATEGORIES.map((word, i) => [word as string, d3.interpolateSinebow(i / INTEL_CATEGORIES.length)]));
/** A category word not yet in the list. */
const NEW_CATEGORY = GUNMETAL[100];

const countryOf = (n: IntelNode): string | null => {
  const stated = Array.isArray(n.metadata?.jurisdictions) ? n.metadata.jurisdictions as unknown[] : [];
  for (const j of stated) {
    const code = typeof j === 'string' ? j.trim().toLowerCase().split('-')[0] : '';
    if (/^[a-z]{2}$/.test(code)) return code;
  }
  return null;
};

/** Ten hues for the ten most frequent values, ties by value, one for the rest. */
function byFrequency(notes: readonly IntelNode[], valueOf: (n: IntelNode) => string | null) {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const v = valueOf(n);
    if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  const hue = new Map(ranked.slice(0, 10).map((v, i) => [v, d3.schemeTableau10[i]]));
  const key: ColourKeyEntry[] = ranked.slice(0, 10).map((value) => ({ value, colour: hue.get(value)! }));
  if (ranked.length > 10) key.push({ value: '*', colour: REST });
  return { colourOf: (n: IntelNode) => { const v = valueOf(n); return v === null ? NONE : hue.get(v) ?? REST; }, key };
}

export function noteColours(nodes: readonly IntelNode[], by: Colouring): { of: Map<string, string>; key: ColourKeyEntry[] } {
  const notes = nodes.filter((n) => n.type === 'report');
  const of = new Map<string, string>();
  let key: ColourKeyEntry[] = [];
  let colourOf: (n: IntelNode) => string;
  let stated: (n: IntelNode) => boolean;

  if (by === 'assessment') {
    const variantOf = (n: IntelNode): IntelVariant =>
      (ASSESSMENTS as readonly string[]).includes(String(n.metadata?.assessment)) ? n.metadata.assessment as IntelVariant : 'raw';
    colourOf = (n) => spriteGlyphFill(variantOf(n));
    stated = () => true;
    const present = new Set(notes.map(variantOf));
    key = ASSESSMENTS.filter((v) => present.has(v)).map((value) => ({ value, colour: spriteGlyphFill(value) }));
  } else if (by === 'category') {
    const wordOf = (n: IntelNode) => (typeof n.metadata?.intelCategory === 'string' ? n.metadata.intelCategory : null);
    colourOf = (n) => { const w = wordOf(n); return w === null ? NONE : CATEGORY_HUES.get(w) ?? NEW_CATEGORY; };
    stated = (n) => wordOf(n) !== null;
    const present = [...new Set(notes.map(wordOf).filter((w): w is string => w !== null))]
      .sort((a, b) => (CATEGORY_HUES.has(a) ? INTEL_CATEGORIES.indexOf(a as never) : 99) - (CATEGORY_HUES.has(b) ? INTEL_CATEGORIES.indexOf(b as never) : 99) || a.localeCompare(b));
    key = present.map((value) => ({ value, colour: CATEGORY_HUES.get(value) ?? NEW_CATEGORY }));
  } else if (by === 'age') {
    const timeOf = (n: IntelNode) => (n.timestamp instanceof Date && Number.isFinite(n.timestamp.getTime()) ? n.timestamp.getTime() : null);
    const times = notes.map(timeOf).filter((t): t is number => t !== null);
    const [oldest, newest] = [Math.min(...times), Math.max(...times)];
    const shade = d3.interpolateRgb(GUNMETAL[500], CYAN[100]);
    colourOf = (n) => { const t = timeOf(n); return t === null ? NONE : shade(newest > oldest ? (t - oldest) / (newest - oldest) : 1); };
    stated = (n) => timeOf(n) !== null;
    key = times.length ? [
      { value: new Date(oldest).toISOString(), colour: shade(0) },
      ...(newest > oldest ? [{ value: new Date(newest).toISOString(), colour: shade(1) }] : []),
    ] : [];
  } else {
    const valueOf = by === 'country' ? countryOf : (n: IntelNode) => (typeof n.metadata?.author === 'string' && n.metadata.author ? n.metadata.author : null);
    const ranked = byFrequency(notes, valueOf);
    colourOf = ranked.colourOf;
    stated = (n) => valueOf(n) !== null;
    key = ranked.key;
  }

  for (const n of notes) of.set(n.id, colourOf(n));
  if (notes.some((n) => !stated(n))) key.push({ value: '', colour: NONE });
  return { of, key };
}
