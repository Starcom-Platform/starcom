/**
 * The Symbol registry (K3): each meaning an icon, addressed by what it means
 * rather than by a file, so a mark can be chosen, coloured and explained by
 * its meaning wherever it is drawn (iconography directive; after RaveLite's
 * elementMarks).
 *
 * Begun now with the Intel Report categories (BA12): a report's stated
 * category is drawn as an emblem inside its glyph (BA14). Block D's K3 extends
 * the same registry to the bar, the rail, quick access and the HUD, and gives
 * each meaning its hue there. A category has none: on a glyph, colour is the
 * assessment's.
 *
 * The icons are Lucide's (https://lucide.dev), ISC licence: "Permission to use,
 * copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this
 * permission notice appear in all copies." Copyright (c) Lucide Contributors
 * 2022; portions (c) Cole Bemis 2013-2022 as part of Feather (MIT). Their
 * element data is copied here, on Lucide's 24-unit grid, rather than imported
 * from lucide-react's internals, because the glyph atlas bakes markup, not
 * React components.
 */
import type { DiplomaticEventCategory } from '../geopolitical/theme/diplomaticEventTheme';

/** An icon as Lucide draws it: its SVG elements, on a 24-unit grid. */
export type IconNode = ReadonlyArray<readonly [tag: 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline', attrs: Readonly<Record<string, string | number>>]>;

export interface SymbolEntry {
  /** What it is addressed by: `<family>:<meaning>`. */
  id: string;
  /** What it means, as a person reads it in a key. */
  meaning: string;
  /** The icon's name in its set, for a reader of the spec. */
  name: string;
  icon: IconNode;
  /** Lucide's (ISC), or a mark drawn for Starcom on Lucide's grid where Lucide has none (K3). */
  source: { set: 'Lucide'; licence: 'ISC' } | { set: 'Starcom'; licence: 'own' };
}

const LUCIDE = { set: 'Lucide', licence: 'ISC' } as const;

/**
 * The top-level `category:` words The Record's Intel notes use (BA13), most used
 * first: ten when this began, four more by the time it was built (2026-10-04).
 * A word arriving after them is drawn with the generic icon until it is given one.
 */
export const INTEL_CATEGORIES = [
  'conflict', 'charity', 'health', 'funding', 'civic', 'cyber', 'safety', 'intel', 'world', 'remedy',
  'hazard', 'digital', 'aid', 'accountability',
] as const;
export type IntelCategory = typeof INTEL_CATEGORIES[number];

const category = (word: IntelCategory, meaning: string, name: string, icon: IconNode): SymbolEntry =>
  ({ id: `intel-category:${word}`, meaning, name, icon, source: LUCIDE });

export const INTEL_CATEGORY_SYMBOLS: Readonly<Record<IntelCategory, SymbolEntry>> = {
  conflict: category('conflict', 'conflict and war', 'swords', [
    ['polyline', { points: '14.5 17.5 3 6 3 3 6 3 17.5 14.5' }],
    ['line', { x1: 13, x2: 19, y1: 19, y2: 13 }],
    ['line', { x1: 16, x2: 20, y1: 16, y2: 20 }],
    ['line', { x1: 19, x2: 21, y1: 21, y2: 19 }],
    ['polyline', { points: '14.5 6.5 18 3 21 3 21 6 17.5 9.5' }],
    ['line', { x1: 5, x2: 9, y1: 14, y2: 18 }],
    ['line', { x1: 7, x2: 4, y1: 17, y2: 20 }],
    ['line', { x1: 3, x2: 5, y1: 19, y2: 21 }],
  ]),
  charity: category('charity', 'charities', 'hand-heart', [
    ['path', { d: 'M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16' }],
    ['path', { d: 'm7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9' }],
    ['path', { d: 'm2 15 6 6' }],
    ['path', { d: 'M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z' }],
  ]),
  health: category('health', 'health and outbreaks', 'heart-pulse', [
    ['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }],
    ['path', { d: 'M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27' }],
  ]),
  funding: category('funding', 'funding and grants', 'banknote', [
    ['rect', { width: 20, height: 12, x: 2, y: 6, rx: 2 }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
    ['path', { d: 'M6 12h.01M18 12h.01' }],
  ]),
  civic: category('civic', 'civic process and public comment', 'landmark', [
    ['path', { d: 'M10 18v-7' }],
    ['path', { d: 'M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z' }],
    ['path', { d: 'M14 18v-7' }],
    ['path', { d: 'M18 18v-7' }],
    ['path', { d: 'M3 22h18' }],
    ['path', { d: 'M6 18v-7' }],
  ]),
  cyber: category('cyber', 'cyber security', 'shield-alert', [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M12 8v4' }],
    ['path', { d: 'M12 16h.01' }],
  ]),
  safety: category('safety', 'safety and recalls', 'hard-hat', [
    ['path', { d: 'M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5' }],
    ['path', { d: 'M14 6a6 6 0 0 1 6 6v3' }],
    ['path', { d: 'M4 15v-3a6 6 0 0 1 6-6' }],
    ['rect', { x: 2, y: 15, width: 20, height: 4, rx: 1 }],
  ]),
  intel: category('intel', 'intelligence and convergence', 'radar', [
    ['path', { d: 'M19.07 4.93A10 10 0 0 0 6.99 3.34' }],
    ['path', { d: 'M4 6h.01' }],
    ['path', { d: 'M2.29 9.62A10 10 0 1 0 21.31 8.35' }],
    ['path', { d: 'M16.24 7.76A6 6 0 1 0 8.23 16.67' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M17.99 11.66A6 6 0 0 1 15.77 16.67' }],
    ['circle', { cx: 12, cy: 12, r: 2 }],
    ['path', { d: 'm13.41 10.59 5.66-5.66' }],
  ]),
  world: category('world', 'world news', 'globe', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ]),
  remedy: category('remedy', 'remedies and redress', 'scale', [
    ['path', { d: 'm16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z' }],
    ['path', { d: 'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z' }],
    ['path', { d: 'M7 21h10' }],
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2' }],
  ]),
  hazard: category('hazard', 'natural hazards', 'cloud-lightning', [
    ['path', { d: 'M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973' }],
    ['path', { d: 'm13 12-3 5h4l-3 5' }],
  ]),
  digital: category('digital', 'connectivity and shutdowns', 'wifi', [
    ['path', { d: 'M12 20h.01' }],
    ['path', { d: 'M2 8.82a15 15 0 0 1 20 0' }],
    ['path', { d: 'M5 12.859a10 10 0 0 1 14 0' }],
    ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0' }],
  ]),
  aid: category('aid', 'disaster aid', 'life-buoy', [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm4.93 4.93 4.24 4.24' }],
    ['path', { d: 'm14.83 9.17 4.24-4.24' }],
    ['path', { d: 'm14.83 14.83 4.24 4.24' }],
    ['path', { d: 'm9.17 14.83-4.24 4.24' }],
    ['circle', { cx: 12, cy: 12, r: 4 }],
  ]),
  accountability: category('accountability', 'accountability and exclusions', 'gavel', [
    ['path', { d: 'm14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8' }],
    ['path', { d: 'm16 16 6-6' }],
    ['path', { d: 'm8 8 6-6' }],
    ['path', { d: 'm9 7 8 8' }],
    ['path', { d: 'm21 11-8-8' }],
  ]),
};

/**
 * The cooperative CAMEO categories GDELT's diplomatic events fall in (decision D-DP, DP4), each its
 * own icon, none another meaning's. Provisional until the glyph sheet confirms them.
 */
const diplomacy = (word: DiplomaticEventCategory, meaning: string, name: string, icon: IconNode): SymbolEntry =>
  ({ id: `diplomacy:${word}`, meaning, name, icon, source: LUCIDE });

export const DIPLOMACY_CATEGORY_SYMBOLS: Readonly<Record<DiplomaticEventCategory, SymbolEntry>> = {
  intent: diplomacy('intent', 'intent to cooperate, said', 'message-square-quote', [
    ['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
    ['path', { d: 'M8 12a2 2 0 0 0 2-2V8H8' }],
    ['path', { d: 'M14 12a2 2 0 0 0 2-2V8h-2' }],
  ]),
  consult: diplomacy('consult', 'consultations', 'messages-square', [
    ['path', { d: 'M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z' }],
    ['path', { d: 'M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1' }],
  ]),
  diplomatic: diplomacy('diplomatic', 'diplomatic cooperation', 'thumbs-up', [
    ['path', { d: 'M7 10v12' }],
    ['path', { d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z' }],
  ]),
  agreement: diplomacy('agreement', 'formal agreements signed', 'signature', [
    ['path', { d: 'm21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284' }],
    ['path', { d: 'M3 21h18' }],
  ]),
  material: diplomacy('material', 'material cooperation', 'package', [
    ['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ]),
  aid: diplomacy('aid', 'aid provided', 'gift', [
    ['rect', { x: 3, y: 8, width: 18, height: 4, rx: 1 }],
    ['path', { d: 'M12 8v13' }],
    ['path', { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' }],
    ['path', { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' }],
  ]),
  yield: diplomacy('yield', 'yielding', 'undo-2', [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }],
  ]),
};

/** A category word not yet given an icon of its own (BA13): drawn as a tag until it is. */
export const GENERIC_CATEGORY_SYMBOL: SymbolEntry = {
  id: 'intel-category:other',
  meaning: 'another category',
  name: 'tag',
  icon: [
    ['path', { d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z' }],
    ['circle', { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
  ],
  source: LUCIDE,
};

/** A symbol by its id, or null when the registry holds none by it. */
export function symbolById(id: string): SymbolEntry | null {
  if (id === GENERIC_CATEGORY_SYMBOL.id) return GENERIC_CATEGORY_SYMBOL;
  return [...Object.values(INTEL_CATEGORY_SYMBOLS), ...Object.values(DIPLOMACY_CATEGORY_SYMBOLS)].find((symbol) => symbol.id === id) ?? null;
}

const escaped = (value: string | number) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * An icon as SVG markup, scaled from its 24-unit grid into a square box, stroked
 * in one colour as Lucide draws it. For baking into a glyph: the atlas loads
 * markup through an image, under a CSP, so nothing in it may refer outside it.
 */
export function iconMarkup(
  icon: IconNode,
  box: { x: number; y: number; size: number; stroke: number; colour: string },
): string {
  const colour = escaped(box.colour);
  const elements = icon.map(([tag, attrs]) => {
    const written = Object.entries(attrs)
      .map(([name, value]) => `${name}="${value === 'currentColor' ? colour : escaped(value)}"`)
      .join(' ');
    return `<${tag} ${written}/>`;
  }).join('');
  return `<g transform="translate(${box.x} ${box.y}) scale(${box.size / 24})" fill="none" stroke="${colour}" `
    + `stroke-width="${box.stroke}" stroke-linecap="round" stroke-linejoin="round">${elements}</g>`;
}
