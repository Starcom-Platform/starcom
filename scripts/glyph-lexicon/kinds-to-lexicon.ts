/**
 * Writes src/features/globe/marks/kindLexicon.ts from the Lexicon draft (draft.ts, kinds.ts): every kind of thing the
 * globe marks, its icon's drawing, its frame and its colour kind (critique-2026-11-01, OR2, OR3; plan A3, A4). The
 * marks module draws from it. Run after picks on the Glyph Lexicon sheet change a kind:
 *
 *   npx tsx scripts/glyph-lexicon/kinds-to-lexicon.ts
 *
 * Icons come from Lucide (lucide-react in node_modules), Tabler (kept beside the sheet in tabler/), the app's own
 * registries, or the Intel Report page; a kind still to be drawn gets none, and is drawn as its frame alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMAINS } from './draft';
import { colourKindOf } from './kinds';
import { GLYPHS, type GlyphEntry } from '../../src/symbols/uiSymbols';
import { symbolById, type IconNode } from '../../src/symbols/symbolRegistry';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const OUT = path.join(ROOT, 'src/features/globe/marks/kindLexicon.ts');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const markupOf = (icon: IconNode) =>
  icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')}/>`).join('');

async function resolve(ref: string): Promise<{ icon: string; grid: 24 | 64 } | null> {
  const [set, ...rest] = ref.split(':');
  const name = rest.join(':');
  switch (set) {
    case 'lucide': {
      const mod = await import(pathToFileURL(path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`)).href) as { __iconNode: IconNode };
      return { icon: markupOf(mod.__iconNode), grid: 24 };
    }
    case 'tabler': {
      const file = path.join(here, 'tabler', `${name}.svg`);
      if (!fs.existsSync(file)) throw new Error(`Tabler ${name} is not kept beside the sheet: run the sheet once to fetch it`);
      const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
      return { icon: inner.replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '').replace(/\s+/g, ' ').trim(), grid: 24 };
    }
    case 'glyph': {
      const entry = (GLYPHS as Record<string, GlyphEntry>)[name];
      if (!entry) throw new Error(`no glyph ${name}`);
      return { icon: markupOf(entry.icon), grid: 24 };
    }
    case 'symbol': {
      const entry = symbolById(name);
      if (!entry) throw new Error(`no symbol ${name}`);
      return { icon: markupOf(entry.icon), grid: 24 };
    }
    case 'intel': {
      const mod = await import('../../src/components/Globe/intelReportSprites');
      const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(mod.intelVariantSvg(name as never))?.[1] ?? null;
      return body ? { icon: body, grid: 64 } : null;
    }
    case 'draw': return DRAWN_KINDS[ref] ? { icon: DRAWN_KINDS[ref], grid: 24 } : null;
    default: throw new Error(`unknown source in ${ref}`);
  }
}

/**
 * Starcom's own drawings for kinds no icon set has, on Lucide's 24-unit grid, a 2-unit stroke, round caps and joins,
 * drafted for the lexicon's review: a kind not here keeps the icon it has today.
 */
const DRAWN_KINDS: Record<string, string> = {
  // The station (critique-2026-11-01, OR30): a hub, a truss either side, two pairs of solar panels.
  'draw:a hub with two pairs of solar panels': '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M4 12h5"/><path d="M15 12h5"/><rect x="2" y="3" width="4" height="7" rx="0.5"/><rect x="2" y="14" width="4" height="7" rx="0.5"/><rect x="18" y="3" width="4" height="7" rx="0.5"/><rect x="18" y="14" width="4" height="7" rx="0.5"/><path d="M4 10v4"/><path d="M20 10v4"/>',
};

const lines: string[] = [];
let drawn = 0;
for (const domain of DOMAINS) {
  for (const k of domain.kinds) {
    // A kind still to be drawn keeps the icon it has today, until it is drawn (a frame alone read as a fault).
    const r = (await resolve(k.icon)) ?? (k.today ? await resolve(k.today) : null);
    const ck = colourKindOf(k.id);
    if (!ck) throw new Error(`${k.id} takes no colour kind`);
    if (r) drawn++;
    lines.push(`  '${k.id}': { meaning: ${JSON.stringify(k.meaning)}, frame: '${k.frame}', colour: '${ck.id}', grid: ${r?.grid ?? 24}, icon: ${JSON.stringify(r?.icon ?? '')}${k.modifier ? `, modifier: '${k.modifier}'` : ''} },`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `/**
 * Every kind of thing the globe marks (critique-2026-11-01, OR2, OR3; plan A3, A4), as drafted on the Glyph Lexicon
 * sheet and written by scripts/glyph-lexicon/kinds-to-lexicon.ts: do not edit by hand; change the draft and run it.
 * Each kind: what it means, its frame (the shape its icon sits in), its colour kind (tokens.ts KIND_COLOURS), and its
 * icon's drawing as SVG markup on a 24-unit grid (64 for an Intel Report's page). An icon still to be drawn is empty:
 * the kind is drawn with the icon it has today until then, or as its frame alone if it has none. Icons from Lucide
 * (ISC) and Tabler Icons (MIT), and Starcom's own.
 */
import type { KindColour } from '../../../styles/tokens';

export type KindFrame = 'event' | 'asset' | 'area' | 'actor' | 'protective' | 'forecast';

export interface KindEntry {
  meaning: string;
  frame: KindFrame;
  colour: KindColour;
  grid: 24 | 64;
  icon: string;
  modifier?: 'struck';
}

export const KINDS: Readonly<Record<string, KindEntry>> = {
${lines.join('\n')}
};
`);
console.log(`${lines.length} kinds (${drawn} drawn, ${lines.length - drawn} still to draw) -> ${OUT}`);
