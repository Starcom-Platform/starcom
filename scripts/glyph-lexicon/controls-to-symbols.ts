/**
 * Writes src/symbols/controlGlyphs.ts from controls.ts: the second left rail's control glyphs (critique-2026-11-01,
 * OR1, OR10; plan A1), Lucide's element data copied as uiSymbols.ts copies it, and Starcom's own marks where Lucide
 * has none. Run after a pick on the Glyph Lexicon sheet changes a control's icon:
 *
 *   npx tsx scripts/glyph-lexicon/controls-to-symbols.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONTROLS } from './controls';

type IconNode = Array<[string, Record<string, string | number>]>;
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const OUT = path.join(ROOT, 'src/symbols/controlGlyphs.ts');

/** Starcom's own marks, on Lucide's 24-unit grid, a 2-unit stroke, round caps and joins. */
const OWN: Record<string, { name: string; icon: IconNode }> = {
  'draw:three parallel diagonal strokes in a square': {
    name: 'hatch-lines',
    icon: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['path', { d: 'M3 15 15 3' }], ['path', { d: 'M3 21 21 3' }], ['path', { d: 'M9 21 21 9' }]],
  },
  'draw:two nested crescents round a small disc': {
    name: 'belts-crescents',
    icon: [['circle', { cx: 12, cy: 12, r: 2.5 }], ['path', { d: 'M6.5 6.5a8 8 0 0 0 0 11' }], ['path', { d: 'M17.5 6.5a8 8 0 0 1 0 11' }], ['path', { d: 'M3.5 3.5a12 12 0 0 0 0 17' }], ['path', { d: 'M20.5 3.5a12 12 0 0 1 0 17' }]],
  },
};

const lines: string[] = [];
for (const c of CONTROLS) {
  let name: string; let icon: IconNode; let own = false;
  if (c.icon.startsWith('lucide:')) {
    name = c.icon.slice(7);
    const mod = await import(pathToFileURL(path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`)).href) as { __iconNode: IconNode };
    icon = mod.__iconNode.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'key'))]);
  } else if (OWN[c.icon]) {
    ({ name, icon } = OWN[c.icon]); own = true;
  } else throw new Error(`${c.id}: ${c.icon} is neither Lucide's nor drawn here`);
  // As uiSymbols.ts writes them: { cx: 12, d: '…' }, numbers bare.
  const value = (v: string | number) => (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(v) ? String(Number(v)) : `'${v}'`);
  const key = (k: string) => (/^[a-z]+$/i.test(k) ? k : `'${k}'`);
  const body = icon.map(([tag, attrs]) => `    ['${tag}', { ${Object.entries(attrs).map(([k, v]) => `${key(k)}: ${value(v)}`).join(', ')} }],`).join('\n');
  lines.push(`  '${c.id}': ${own ? 'mark' : 'glyph'}('${c.id}', ${JSON.stringify(c.meaning).replace(/'/g, "\\'").replace(/^"|"$/g, "'")}, '${name}', 'control', [\n${body}\n  ]),`);
}

fs.writeFileSync(OUT, `/**
 * The second left rail's control glyphs (critique-2026-11-01, OR1, OR10; plan A1), as drafted on the Glyph Lexicon
 * sheet and written by scripts/glyph-lexicon/controls-to-symbols.ts: do not edit by hand; change controls.ts and
 * run it. Lucide's element data (https://lucide.dev, ISC licence) from lucide-react 0.525.0, and Starcom's own marks
 * where Lucide has none. uiSymbols.ts takes them into GLYPHS, where one icon has one meaning.
 */
import type { IconNode } from './symbolRegistry';
import type { GlyphEntry, GlyphHue } from './uiSymbols';

const glyph = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Lucide', licence: 'ISC' } });
const mark = (id: string, meaning: string, name: string, hue: GlyphHue, icon: IconNode): GlyphEntry =>
  ({ id, meaning, name, icon, hue, source: { set: 'Starcom', licence: 'own' } });

export const CONTROL_GLYPHS = {
${lines.join('\n')}
} as const satisfies Record<string, GlyphEntry>;
`);
console.log(`${CONTROLS.length} control glyphs -> ${OUT}`);
