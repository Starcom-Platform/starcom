/**
 * The Glyph Lexicon's review sheet (D-GV GV0.3): every kind in draft.ts, every glyph the app draws today, the
 * shared icons, and a pick on each row that the owner's choices save to.
 *
 *   npx tsx scripts/glyph-lexicon/sheet.ts <out.html>
 *
 * Lucide's drawings come from lucide-react in node_modules, the registries' from src/symbols, Tabler's from
 * scripts/glyph-lexicon/tabler (fetched once from unpkg, MIT, and kept with the sheet). Nothing here is wired into
 * the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOMAINS, FRAMES, type DraftKind, type Frame } from './draft';
import { COLOUR_KINDS, closestPair, colourKindOf, seen, type Vision } from './kinds';
import { CONTROLS, CONTROL_GROUPS } from './controls';
import { GLYPHS, type GlyphEntry } from '../../src/symbols/uiSymbols';
import {
  DIPLOMACY_CATEGORY_SYMBOLS, GENERIC_CATEGORY_SYMBOL, INTEL_CATEGORY_SYMBOLS, symbolById, type IconNode, type SymbolEntry,
} from '../../src/symbols/symbolRegistry';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const TABLER_DIR = path.join(here, 'tabler');
const TABLER_VERSION = '3.31.0';
const out = process.argv[2];
if (!out) throw new Error('usage: sheet.ts <out.html>');

// ── Drawing an icon from its reference ──

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const markupOf = (icon: IconNode) =>
  icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')}/>`).join('');

/** The 24-unit drawing of a reference, its inner markup; or null for one still to be drawn. */
interface Drawn { inner: string; source: string; key: string; grid: 24 | 64 }

async function lucide(name: string): Promise<IconNode> {
  const file = path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`);
  if (!fs.existsSync(file)) throw new Error(`Lucide 0.525 has no ${name}`);
  const mod = await import(pathToFileURL(file).href) as { __iconNode: IconNode };
  return mod.__iconNode;
}

async function tabler(name: string): Promise<string> {
  const file = path.join(TABLER_DIR, `${name}.svg`);
  if (!fs.existsSync(file)) {
    const url = `https://unpkg.com/@tabler/icons@${TABLER_VERSION}/icons/outline/${name}.svg`;
    // A generic agent: nothing of the owner's travels with the request.
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Tabler ${TABLER_VERSION} has no ${name} (${response.status})`);
    fs.mkdirSync(TABLER_DIR, { recursive: true });
    fs.writeFileSync(file, await response.text());
  }
  const svg = fs.readFileSync(file, 'utf8');
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1] ?? '';
  // Tabler opens every icon with a transparent 24 × 24 box; it draws nothing.
  return inner.replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '').trim();
}

let intelBodies: ((variant: string) => string) | null | undefined;
async function intelBody(variant: string): Promise<string | null> {
  if (intelBodies === undefined) {
    try {
      const mod = await import('../../src/components/Globe/intelReportSprites');
      intelBodies = (v) => mod.intelVariantSvg(v as never);
    } catch {
      intelBodies = null;
    }
  }
  if (!intelBodies) return null;
  return /<svg[^>]*>([\s\S]*)<\/svg>/.exec(intelBodies(variant))?.[1] ?? null;
}

const sourceOf = (entry: SymbolEntry) => (entry.source.set === 'Lucide' ? `Lucide ${entry.name}` : `drawn for Starcom (${entry.name})`);
const keyOf = (entry: SymbolEntry) => (entry.source.set === 'Lucide' ? `lucide:${entry.name}` : `starcom:${entry.name}`);

async function draw(ref: string): Promise<Drawn | null> {
  const [set, ...rest] = ref.split(':');
  const name = rest.join(':');
  switch (set) {
    case 'lucide': return { inner: markupOf(await lucide(name)), source: `Lucide ${name}`, key: ref, grid: 24 };
    case 'tabler': return { inner: await tabler(name), source: `Tabler ${name}`, key: ref, grid: 24 };
    case 'glyph': {
      const entry = (GLYPHS as Record<string, GlyphEntry>)[name];
      if (!entry) throw new Error(`no glyph ${name}`);
      return { inner: markupOf(entry.icon), source: `${sourceOf(entry)}, as ${name}`, key: keyOf(entry), grid: 24 };
    }
    case 'symbol': {
      const entry = symbolById(name);
      if (!entry) throw new Error(`no symbol ${name}`);
      return { inner: markupOf(entry.icon), source: `${sourceOf(entry)}, as ${name}`, key: keyOf(entry), grid: 24 };
    }
    case 'intel': {
      const body = await intelBody(name);
      return body ? { inner: body, source: `the globe's Intel Report page (${name})`, key: ref, grid: 64 } : null;
    }
    case 'draw': return null;
    default: throw new Error(`unknown source in ${ref}`);
  }
}

// ── The pictures ──

const INK = '#E9EEF0';
const RIM = '#7CEBFE';
const GROUND = '#0A1113';

const plain = (d: Drawn | null, size: number) => (d
  ? (d.grid === 64
    ? `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${d.inner}</svg>`
    : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.inner}</svg>`)
  : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2.5"/><path d="M8 16l1-3.5 6.5-6.5 2.5 2.5L11.5 15z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`);

/** Each frame's shape on a 48-unit box, and how large the icon sits inside it. */
const FRAME_SHAPE: Record<Frame, { shape: (rim: string, dashed: boolean) => string; scale: number }> = {
  event: { scale: 1, shape: (rim, dashed) => `<circle cx="24" cy="24" r="21.5" fill="${GROUND}" stroke="${rim}" stroke-width="2.5"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` },
  asset: { scale: 1, shape: (rim, dashed) => `<rect x="3.5" y="3.5" width="41" height="41" rx="10" fill="${GROUND}" stroke="${rim}" stroke-width="2.5"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` },
  area: { scale: 0.95, shape: (rim, dashed) => `<polygon points="24,2.5 42.6,13.25 42.6,34.75 24,45.5 5.4,34.75 5.4,13.25" fill="${GROUND}" stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` },
  actor: { scale: 0.8, shape: (rim, dashed) => `<polygon points="24,1.75 46.25,24 24,46.25 1.75,24" fill="${GROUND}" stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` },
  protective: { scale: 0.88, shape: (rim, dashed) => `<path d="M24 2.75 L42.5 9 V22.5 C42.5 33.5 34.5 41.5 24 45.5 C13.5 41.5 5.5 33.5 5.5 22.5 V9 Z" fill="${GROUND}" stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` },
  forecast: { scale: 0.95, shape: (rim) => `<circle cx="24" cy="24" r="21.5" fill="${GROUND}" fill-opacity="0.6"/><path d="M33.2 4.6 A21.5 21.5 0 1 1 14.8 4.6" fill="none" stroke="${rim}" stroke-width="2.5" stroke-linecap="round"/>` },
};

function framed(d: Drawn | null, frame: Frame, size = 44, opts: { rim?: string; dashed?: boolean; badge?: string; struck?: boolean; glow?: boolean } = {}): string {
  const { shape, scale } = FRAME_SHAPE[frame];
  const rim = opts.rim ?? RIM;
  const s = (24 / (d?.grid ?? 24)) * scale;
  const offset = 24 - 12 * scale;
  const icon = d
    ? (d.grid === 64
      ? `<g transform="translate(${offset} ${offset}) scale(${s})">${d.inner}</g>`
      : `<g transform="translate(${offset} ${offset}) scale(${s})" fill="none" stroke="${INK}" stroke-width="${2 / scale}" stroke-linecap="round" stroke-linejoin="round">${d.inner}</g>`)
    : `<text x="24" y="28" text-anchor="middle" font-size="11" font-family="JetBrains Mono, monospace" fill="${INK}" opacity="0.7">draw</text>`;
  const glow = opts.glow ? `<circle cx="24" cy="24" r="23.5" fill="none" stroke="${rim}" stroke-width="5" opacity="0.28"/>` : '';
  const struck = opts.struck ? `<line x1="9" y1="39" x2="39" y2="9" stroke="${GROUND}" stroke-width="6" stroke-linecap="round"/><line x1="9" y1="39" x2="39" y2="9" stroke="${rim}" stroke-width="2.5" stroke-linecap="round"/>` : '';
  const badge = opts.badge ? `<circle cx="40" cy="8" r="7.5" fill="${GROUND}" stroke="${INK}" stroke-width="1.5"/><text x="40" y="11.2" text-anchor="middle" font-size="9" font-weight="700" font-family="IBM Plex Sans, sans-serif" fill="${INK}">${opts.badge}</text>` : '';
  return `<svg viewBox="-2 -2 52 52" width="${size}" height="${size}" aria-hidden="true">${glow}${shape(rim, opts.dashed ?? false)}${icon}${struck}${badge}</svg>`;
}

// ── Gathering the rows ──

interface Row { kind: DraftKind; domain: string; drawn: Drawn | null; today: Drawn | null | undefined; todaySame: boolean }

const rows: Row[] = [];
const usage = new Map<string, Array<{ id: string; meaning: string; frame: string; kind: boolean }>>();
const use = (key: string, entry: { id: string; meaning: string; frame: string; kind: boolean }) => {
  if (!usage.has(key)) usage.set(key, []);
  usage.get(key)!.push(entry);
};

for (const domain of DOMAINS) {
  for (const kind of domain.kinds) {
    const drawn = await draw(kind.icon);
    const today = kind.today ? await draw(kind.today) : undefined;
    rows.push({ kind, domain: domain.id, drawn, today, todaySame: !!today && !!drawn && today.key === drawn.key });
    // A modifier makes it another mark: the struck ticket is not the ticket.
    if (drawn) use(kind.modifier ? `${drawn.key}+${kind.modifier}` : drawn.key, { id: kind.id, meaning: kind.meaning, frame: kind.frame, kind: true });
  }
}
const interfaceGlyphs = Object.values(GLYPHS as Record<string, GlyphEntry>);
for (const g of interfaceGlyphs) use(keyOf(g), { id: g.id, meaning: g.meaning, frame: 'interface', kind: false });
const emblems: SymbolEntry[] = [...Object.values(INTEL_CATEGORY_SYMBOLS), ...Object.values(DIPLOMACY_CATEGORY_SYMBOLS), GENERIC_CATEGORY_SYMBOL];
for (const e of emblems) use(keyOf(e), { id: e.id, meaning: e.meaning, frame: 'emblem', kind: false });

/** Kinds that borrow an interface glyph on purpose (glyph:<id>) share it by design, not by accident. */
const borrowed = new Set(rows.filter((r) => r.kind.icon.startsWith('glyph:') || r.kind.icon.startsWith('symbol:')).map((r) => r.kind.icon.split(':').slice(1).join(':')));
const shared = [...usage.entries()]
  .map(([key, users]) => ({ key, users: users.filter((u) => u.kind || !borrowed.has(u.id) || users.filter((v) => v.kind).length === 0) }))
  .filter(({ users }) => users.length > 1 && new Set(users.map((u) => u.meaning)).size > 1)
  .sort((a, b) => b.users.length - a.users.length || a.key.localeCompare(b.key));
/*
 * To decide: a shared icon a kind takes part in, unless it is one thing seen two ways, that is every user a kind
 * and each in a frame of its own (a ship: a clash at sea, a fleet on the move). An interface glyph has no frame,
 * so on a rail or in a key it meets the kind's icon bare.
 */
const decide = shared.filter(({ users }) => {
  const kinds = users.filter((u) => u.kind);
  const bare = users.filter((u) => u.frame === 'interface');
  const oneThingTwoWays = new Set(kinds.map((u) => u.frame)).size === kinds.length;
  return (kinds.length > 1 && !oneThingTwoWays) || (kinds.length > 0 && bare.length > 0);
});
/** A kind sharing a category emblem: a report page's category and a mark's kind, often the same idea; worth a look. */
const withEmblem = shared.filter(({ users }) => !decide.some((d) => d.users === users) && users.some((u) => u.kind) && users.some((u) => u.frame === 'emblem'));

const count = (pred: (r: Row) => boolean) => rows.filter(pred).length;
const fromLucide = count((r) => r.kind.icon.startsWith('lucide:'));
const fromTabler = count((r) => r.kind.icon.startsWith('tabler:'));
const fromRegistry = count((r) => r.kind.icon.startsWith('glyph:') || r.kind.icon.startsWith('symbol:'));
const toDraw = rows.filter((r) => r.drawn === null);
const tablerUsed = [...new Set(rows.filter((r) => r.kind.icon.startsWith('tabler:')).map((r) => r.kind.icon.slice(7)))].sort();

// ── The page ──

const frameWord = (f: Frame) => `${FRAMES[f].shape}: ${FRAMES[f].says}`;
const iconCell = (d: Drawn | null, frame: Frame) => `<div class="glyphs">${framed(d, frame)}<span class="plain">${plain(d, 24)}${plain(d, 16)}</span></div>`;

function rowHtml(r: Row): string {
  const k = r.kind;
  const today = r.today === undefined
    ? '<span class="muted">nothing yet</span>'
    : r.todaySame
      ? '<span class="muted">the same</span>'
      : `<span class="today" title="${esc(r.today?.source ?? '')}">${plain(r.today ?? null, 24)}</span><span class="muted small">${esc(r.today?.source ?? 'none')}</span>`;
  return `<tr data-id="${esc(k.id)}">
<td>${k.modifier ? `<div class="glyphs">${framed(r.drawn, k.frame, 44, { struck: true })}<span class="plain">${plain(r.drawn, 24)}</span></div>` : iconCell(r.drawn, k.frame)}</td>
<td class="kind"><code>${esc(k.id).replace(/([:-])/g, '$1<wbr>')}</code><p>${esc(k.meaning)}</p>${k.note ? `<p class="note">${esc(k.note)}</p>` : ''}${(() => { const ck = colourKindOf(k.id); return ck ? `<span class="ck"><i style="background:${ck.colour}"></i>${esc(ck.name)}</span>` : ''; })()}</td>
<td class="src">${r.drawn ? esc(r.drawn.source) : `<strong>To draw:</strong> ${esc(k.icon.slice(5))}`}<span class="frame">${esc(frameWord(k.frame))}</span></td>
<td class="today-cell">${today}</td>
<td class="modes">${k.modes.map((m) => `<span class="chip">${esc(m)}</span>`).join(' ') || '<span class="muted">none yet</span>'}</td>
<td class="pick" data-pick="${esc(k.id)}" data-choices="kind"></td>
</tr>`;
}

const sample = await draw('lucide:bomb');
const grammar = `
<div class="frames">${(Object.keys(FRAMES) as Frame[]).map((f) => `<figure><div class="row">${framed(sample, f, 56)}</div><figcaption><strong>${esc(f)}</strong><br>${esc(FRAMES[f].shape)}: ${esc(FRAMES[f].says)}</figcaption></figure>`).join('')}</div>
<p>The modifiers say how it stands, each on its own channel:</p>
<div class="frames">
<figure><div class="row">${framed(sample, 'event', 56, { rim: '#EACF83' })}${framed(sample, 'event', 56, { rim: '#FD8537' })}${framed(sample, 'event', 56, { rim: '#FB594D' })}</div><figcaption><strong>Rim colour</strong><br>its meaning scale (severity, tier, stance), the only thing colour carries</figcaption></figure>
<figure><div class="row">${framed(sample, 'event', 56, { dashed: true })}</div><figcaption><strong>Dashed rim</strong><br>an approximate place</figcaption></figure>
<figure><div class="row">${framed(sample, 'event', 56, { badge: '4' })}</div><figcaption><strong>Corner badge</strong><br>a count (live since v51), confidence or recency</figcaption></figure>
<figure><div class="row">${framed(sample, 'event', 56, { struck: true })}</div><figcaption><strong>Strike-through</strong><br>withdrawn or cancelled</figcaption></figure>
<figure><div class="row">${framed(sample, 'event', 56, { glow: true, rim: '#FB594D' })}</div><figcaption><strong>Pulse</strong><br>new or critical (the Beacon style)</figcaption></figure>
</div>`;

const domainSections = DOMAINS.map((d) => {
  const mine = rows.filter((r) => r.domain === d.id);
  return `<section class="domain" id="d-${d.id}">
<h2>${esc(d.name)} <span class="count">${mine.length}</span></h2>
<p class="covers">${esc(d.covers)}</p>
<div class="scroll"><table><thead><tr><th>Proposed</th><th>Kind</th><th>Source and frame</th><th>Today</th><th>Drawn by</th><th>Your pick</th></tr></thead>
<tbody>${mine.map(rowHtml).join('\n')}</tbody></table></div>
</section>`;
}).join('\n');

const sharedSection = `<section id="shared"><h2>Icons used for more than one meaning <span class="count">${shared.length}</span></h2>
<p class="covers">One meaning, one icon (the grammar's first rule). The same icon in different frames can be one thing seen two ways (a ship: a clash at sea, a fleet on the move). In the same frame, or bare on a rail or in a key, it is two meanings to tell apart. ${decide.length} need a decision. ${withEmblem.length} share an Intel or Diplomacy category emblem, usually the same idea seen as a report's category; the rest differ by frame or are interface glyphs only.</p>
<div class="scroll"><table><thead><tr><th>Icon</th><th>Used by</th></tr></thead><tbody>
${(await Promise.all(shared.map(async ({ key, users }) => {
    const base = key.split('+')[0];
    const d = base.startsWith('starcom:') ? (await draw(`glyph:${interfaceGlyphs.find((g) => keyOf(g) === base)?.id}`)) : await draw(base);
    const flag = decide.some((x) => x.key === key) ? '<span class="flag">decide</span>'
      : withEmblem.some((x) => x.key === key) ? '<span class="flag soft">shares an emblem</span>' : '';
    return `<tr><td><div class="glyphs"><span class="plain">${plain(d, 24)}</span></div><span class="muted small">${esc(key)}</span>${flag}</td><td><ul class="users">${users.map((u) => `<li><code>${esc(u.id)}</code> ${esc(u.meaning)} <span class="muted">(${esc(u.frame)})</span></li>`).join('')}</ul></td></tr>`;
  }))).join('\n')}
</tbody></table></div></section>`;

const groups = new Map<string, GlyphEntry[]>();
for (const g of interfaceGlyphs) {
  const prefix = g.id.split(':')[0];
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix)!.push(g);
}
const GROUP_NAMES: Record<string, string> = {
  app: 'Apps', nav: 'Navigation', chat: 'Chat', mode: 'Globe modes', layer: 'Layers', action: 'Actions', sw: 'Space Weather parts',
  rlsh: 'RLSH', panel: 'Panels', note: "The Globe's notes", job: 'Jobs',
};
const interfaceSection = `<section id="interface"><h2>The interface's glyphs, as they are <span class="count">${interfaceGlyphs.length + emblems.length}</span></h2>
<p class="covers">What the bar, the rails, the panels and the notes draw today (uiSymbols.ts), and the category emblems (symbolRegistry.ts). Each was reviewed on the glyph sheet. They stay as they are unless a row above changes one.</p>
<div class="tiles">${[...groups.entries()].map(([prefix, list]) => `<h3>${esc(GROUP_NAMES[prefix] ?? prefix)}</h3>${list.map((g) => `<div class="tile" title="${esc(g.id)}">${plain({ inner: markupOf(g.icon), source: '', key: '', grid: 24 }, 24)}<span>${esc(g.meaning)}</span><code>${esc(g.id)}</code></div>`).join('')}`).join('')}
<h3>Category emblems</h3>${emblems.map((e) => `<div class="tile" title="${esc(e.id)}">${plain({ inner: markupOf(e.icon), source: '', key: '', grid: 24 }, 24)}<span>${esc(e.meaning)}</span><code>${esc(e.id)}</code></div>`).join('')}</div></section>`;

// ── Colour by kind (plan A3) and the rail's controls (plan A1) ──

const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan'];
const VISION_NAMES: Record<Vision, string> = { normal: 'as seen', protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia' };
const pairs = VISIONS.map((v) => ({ v, ...closestPair(v) }));
const allKinds = rows.map((r) => r.kind);
const colourRows = await Promise.all(COLOUR_KINDS.map(async (ck) => {
  const members = allKinds.filter((k) => colourKindOf(k.id)?.id === ck.id);
  const samples = (await Promise.all(members.slice(0, 4).map((k) => draw(k.icon)))).filter(Boolean) as Drawn[];
  return `<tr data-id="colour:${esc(ck.id)}">
<td><div class="swatches">${VISIONS.map((v) => `<span class="sw" style="background:${seen(ck.colour, v)}" title="${esc(VISION_NAMES[v])}"></span>`).join('')}</div><span class="muted small">${esc(ck.colour)}</span></td>
<td class="kind"><strong>${esc(ck.name)}</strong><p>${members.length} kinds take it.</p>${ck.note ? `<p class="note">${esc(ck.note)}</p>` : ''}</td>
<td><div class="glyphs" style="color:${ck.colour}">${samples.map((d) => plain(d, 24)).join('')}</div></td>
<td class="pick" data-pick="colour:${esc(ck.id)}" data-choices="colour"></td>
</tr>`;
}));
const colourSection = `<section id="colours"><h2>Colour by kind <span class="count">${COLOUR_KINDS.length}</span></h2>
<p class="covers">Twelve colours, one for each kind of thing (OR3, OR15), taken from the domains above so there is one taxonomy: a mark's icon says exactly what it is, its colour which of the twelve, its size and brightness how severe. A mode's own hue stays on its frame and badge. Every kind's marks carry icons of their own, so colour is never the only cue. Each swatch is shown as seen, then under protanopia, deuteranopia and tritanopia (Machado 2009, full severity).</p>
<p class="covers">The closest pair, in OKLab: ${pairs.map((p) => `${esc(VISION_NAMES[p.v])}, ${esc(p.a)} and ${esc(p.b)} at ${p.d.toFixed(3)}`).join('; ')}. As seen, every pair is at least 0.10 apart and every colour at least 0.11 from the interactive cyan; under full colour blindness twelve hues cannot all stay apart, and the icons carry the difference there.</p>
<div class="scroll"><table><thead><tr><th>Colour (as seen, P, D, T)</th><th>Kind</th><th>Its icons, in it</th><th>Your pick</th></tr></thead>
<tbody>${colourRows.join('\n')}</tbody></table></div></section>`;

const controlRows = await Promise.all(CONTROLS.map(async (ctl) => {
  const d = await draw(ctl.icon);
  return { group: ctl.group, html: `<tr data-id="${esc(ctl.id)}">
<td><div class="glyphs"><span class="plain">${plain(d, 24)}${plain(d, 16)}</span></div></td>
<td class="kind"><code>${esc(ctl.id)}</code><p>${esc(ctl.meaning)}</p></td>
<td class="src">${d ? esc(d.source) : `<strong>To draw:</strong> ${esc(ctl.icon.slice(5))}`}</td>
<td class="pick" data-pick="${esc(ctl.id)}" data-choices="control"></td>
</tr>` };
}));
const controlsSection = `<section id="controls"><h2>The rail's controls <span class="count">${CONTROLS.length}</span></h2>
<p class="covers">The buttons of the second left rail's kits (OR1, OR10): each one icon, its face showing its state, a click opening a flyout beside the rail. Grouped by kit; the last group is the controls only one mode needs.</p>
${CONTROL_GROUPS.map((g) => `<h3>${esc(g.name)}</h3><p class="covers">${esc(g.covers)}</p><div class="scroll"><table><thead><tr><th>Proposed</th><th>Control</th><th>Source</th><th>Your pick</th></tr></thead><tbody>${controlRows.filter((r) => r.group === g.id).map((r) => r.html).join('\n')}</tbody></table></div>`).join('\n')}
</section>`;

const total = rows.length + COLOUR_KINDS.length + CONTROLS.length;
const asOf = new Date().toISOString().slice(0, 10);
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starcom Glyph Lexicon</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Oxanium:wght@500;600;700&display=swap">
<style>
:root { --globe:#0A1113; --frame:#131B1E; --panel:#1C262A; --input:#283439; --divider:#3A474D; --heading:#E9EEF0; --body:#C7CFD3; --secondary:#A1ADB2; --muted:#818F94;
  --accent:#00C3DB; --accent-soft:#004952; --caution:#FFB848; --ok:#6CE98D; --danger:#FF7266; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--globe); color: var(--body); font: 15px/1.5 'IBM Plex Sans', system-ui, sans-serif; margin: 0; }
.wrap { max-width: 1240px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px; }
header h1 { font-family: Oxanium, 'IBM Plex Sans', sans-serif; font-weight: 600; letter-spacing: .02em; color: var(--heading); font-size: 2rem; margin: 0 0 6px; text-wrap: balance; }
.lead { max-width: 70ch; color: var(--body); margin: 0 0 14px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px 18px; font: 13px/1.4 'JetBrains Mono', monospace; color: var(--secondary); margin: 0 0 18px; font-variant-numeric: tabular-nums; }
.stats b { color: var(--heading); font-weight: 600; }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 22px; }
nav.toc a { color: var(--accent); text-decoration: none; border: 1px solid var(--divider); border-radius: 999px; padding: 3px 10px; font-size: 13px; }
nav.toc a:hover { border-color: var(--accent); }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: color-mix(in srgb, var(--globe) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--divider); padding-block: 10px; margin-inline: -16px; padding-inline: 16px; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; font-size: 14px; }
.bar .progress { font-family: 'JetBrains Mono', monospace; color: var(--heading); font-variant-numeric: tabular-nums; }
.bar .status { color: var(--muted); }
.bar label { display: inline-flex; gap: 6px; align-items: center; color: var(--secondary); cursor: pointer; }
h2 { font-family: Oxanium, 'IBM Plex Sans', sans-serif; font-weight: 600; color: var(--heading); font-size: 1.35rem; margin: 40px 0 4px; letter-spacing: .02em; }
h3 { color: var(--heading); font-size: .95rem; margin: 18px 0 8px; width: 100%; font-weight: 600; }
.count { font: 13px 'JetBrains Mono', monospace; color: var(--muted); font-weight: 400; margin-left: 6px; }
.covers { color: var(--secondary); max-width: 75ch; margin: 0 0 12px; }
section.ask { background: var(--frame); border: 1px solid var(--divider); border-radius: 10px; padding: 16px 18px; margin: 8px 0 0; }
section.ask h2 { margin-top: 0; }
section.ask ol { margin: 6px 0 0; padding-left: 20px; max-width: 80ch; } section.ask li { margin: 4px 0; }
.frames { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); gap: 12px; margin: 10px 0 14px; }
.frames figure { margin: 0; display: flex; flex-direction: column; gap: 6px; background: var(--frame); border: 1px solid var(--divider); border-radius: 8px; padding: 10px 12px; min-width: 0; }
.frames .row { display: flex; gap: 6px; }
.frames figcaption { font-size: 13px; color: var(--secondary); } .frames figcaption strong { color: var(--heading); text-transform: capitalize; }
.scroll { overflow-x: auto; border: 1px solid var(--divider); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; min-width: 900px; }
th { text-align: left; font: 600 12px 'IBM Plex Sans', sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; background: var(--frame); border-bottom: 1px solid var(--divider); }
td { padding: 10px; border-bottom: 1px solid var(--panel); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
tr.picked td { background: color-mix(in srgb, var(--accent-soft) 18%, transparent); }
.ck { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; color: var(--secondary); }
.ck i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.swatches { display: flex; gap: 4px; margin-bottom: 4px; }
.sw { width: 26px; height: 26px; border-radius: 6px; display: inline-block; border: 1px solid var(--divider); }
button.rest { margin-left: auto; font: 600 13px 'IBM Plex Sans', sans-serif; color: var(--globe); background: var(--accent); border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button.rest:disabled { opacity: .5; cursor: default; }
button.rest.confirm { background: var(--caution); }
.glyphs { display: flex; align-items: center; gap: 10px; color: var(--heading); }
.plain { display: inline-flex; align-items: center; gap: 8px; }
td.kind { min-width: 14rem; max-width: 22rem; } td.kind p { margin: 4px 0 0; color: var(--body); } td.kind p.note { color: var(--muted); font-size: 13px; }
code { font: 12.5px 'JetBrains Mono', monospace; color: var(--accent); overflow-wrap: anywhere; }
td.src { font-size: 13.5px; color: var(--body); min-width: 11rem; } td.src .frame { display: block; color: var(--muted); font-size: 12.5px; margin-top: 4px; }
td.today-cell { min-width: 8rem; } .today { color: var(--heading); display: inline-flex; vertical-align: middle; margin-right: 6px; }
.muted { color: var(--muted); } .small { font-size: 12.5px; display: block; margin-top: 2px; }
.chip { display: inline-block; font: 12px 'JetBrains Mono', monospace; color: var(--secondary); border: 1px solid var(--divider); border-radius: 4px; padding: 0 5px; margin: 0 2px 3px 0; }
td.pick { min-width: 15rem; }
.choices { display: flex; flex-wrap: wrap; gap: 4px; }
.choices button { font: 500 12.5px 'IBM Plex Sans', sans-serif; color: var(--body); background: var(--panel); border: 1px solid var(--divider); border-radius: 5px; padding: 4px 8px; cursor: pointer; }
.choices button:hover:not(:disabled) { border-color: var(--accent); color: var(--heading); }
.choices button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--globe); font-weight: 600; }
.choices button:disabled { cursor: default; opacity: .55; }
.pick input { margin-top: 6px; width: 100%; font: 13px 'IBM Plex Sans', sans-serif; color: var(--heading); background: var(--input); border: 1px solid #818F94; border-radius: 5px; padding: 5px 7px; }
.pick input:focus, .choices button:focus-visible, nav.toc a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.flag.soft { background: var(--input); color: var(--secondary); }
.flag { display: inline-block; margin-top: 4px; font: 600 11.5px 'IBM Plex Sans', sans-serif; letter-spacing: .05em; text-transform: uppercase; color: var(--globe); background: var(--caution); border-radius: 3px; padding: 1px 6px; }
ul.users { margin: 0; padding-left: 16px; } ul.users li { margin: 2px 0; }
.tiles { display: flex; flex-wrap: wrap; gap: 8px; }
.tile { display: grid; grid-template-columns: 24px 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; width: 17rem; background: var(--frame); border: 1px solid var(--divider); border-radius: 7px; padding: 8px 10px; color: var(--heading); }
.tile svg { grid-row: span 2; } .tile span { font-size: 13.5px; color: var(--body); min-width: 0; } .tile code { font-size: 11.5px; }
footer { margin-top: 44px; color: var(--muted); font-size: 13px; max-width: 80ch; } footer a { color: var(--accent); }
.hide-picked tr.picked { display: none; }
@media (max-width: 520px) { header h1 { font-size: 1.6rem; } .tile { width: 100%; } }
</style>
</head><body>
<div class="wrap">
<header>
<h1>Starcom Glyph Lexicon</h1>
<p class="lead">Every kind of thing Starcom marks, its proposed icon and frame; the twelve colours by kind; and the rail's controls: ${total} rows for your review before any is wired (critique-2026-11-01, OR2, OR3, OR15; plan A1 and A3). Pick each row, or approve every row you have not picked in one go: your picks save as you make them, and I read them from here.</p>
<div class="stats"><span>from Lucide <b>${fromLucide}</b></span><span>from Tabler <b>${fromTabler}</b></span><span>already in Starcom <b>${fromRegistry}</b></span><span>to draw <b>${toDraw.length}</b></span><span>shared icons <b>${shared.length}</b> (${decide.length} to decide)</span><span>as of <b>${asOf}</b></span></div>
<nav class="toc"><a href="#colours">Colour by kind</a>${DOMAINS.map((d) => `<a href="#d-${d.id}">${esc(d.name)}</a>`).join('')}<a href="#controls">Rail controls</a><a href="#shared">Shared icons</a><a href="#interface">Interface</a></nav>
</header>
<div class="bar"><span class="progress" id="progress">0 of ${total} picked</span><span class="status" id="status">Connecting…</span><label><input type="checkbox" id="hide"> Hide picked rows</label><button type="button" id="approve-rest" class="rest">Approve every row I haven't picked</button></div>

<section class="ask"><h2>What I'm asking</h2><ol>
<li><strong>Each row:</strong> Approve, Other icon (say which, or "you choose" in the note), Other frame or Other colour, or Not needed. Or approve every row you have not picked, with the button at the top, after changing the ones you want otherwise.</li>
<li><strong>Colour by kind:</strong> the twelve colours, first below, each shown as three kinds of colour blindness see it.</li>
<li><strong>The rail's controls:</strong> the kits' buttons, after the domains.</li>
<li><strong>The grammar:</strong> the row under the frames and modifiers is the scheme itself. Pick it too.</li>
<li><strong>The ${decide.length} shared icons marked "decide"</strong>, near the end: one icon for two meanings, a mark's and a rail's or a key's. Say which keeps it in the kind's note.</li>
<li><strong>The ${toDraw.length} to draw</strong> (${toDraw.map((r) => r.kind.id.split(':').pop()!.replace(/-/g, ' ')).join(', ')}): I draw them in Lucide's manner after your picks, on the next sheet.</li>
</ol></section>

<section id="grammar"><h2>The grammar</h2>
<p class="covers">Every mark answers three questions. <strong>What is it?</strong> The icon. <strong>What sort of thing?</strong> The frame. <strong>How does it stand?</strong> The modifiers. Each frame below draws the same bomb, so only the frame changes.</p>
${grammar}
<div class="scroll"><table><tbody><tr data-id="grammar:frames"><td><div class="glyphs">${framed(sample, 'event')}${framed(sample, 'asset')}${framed(sample, 'area')}</div></td><td class="kind"><code>grammar:frames</code><p>Six frames and five modifiers, as drawn above.</p></td><td class="src">globe-visuals-overhaul.md, "The ontology"</td><td class="today-cell"><span class="muted">a disc, a glow or a ring, by style</span></td><td class="modes"><span class="chip">every mode</span></td><td class="pick" data-pick="grammar:frames"></td></tr></tbody></table></div>
</section>

${colourSection}
${domainSections}
${controlsSection}
${sharedSection}
${interfaceSection}
<footer>
<p>Icons from <a href="https://lucide.dev">Lucide</a> 0.525 (ISC licence) and <a href="https://tabler.io/icons">Tabler Icons</a> ${TABLER_VERSION} (MIT licence: ${tablerUsed.join(', ')}), copied per glyph with credit. The marks drawn for Starcom are its own. Draft: scripts/glyph-lexicon/draft.ts in Starcom's repository; this page is generated from it.</p>
</footer>
</div>
<script>
(() => {
  const CHOICE_SETS = {
    kind: [['approve', 'Approve'], ['icon', 'Other icon'], ['frame', 'Other frame'], ['drop', 'Not needed']],
    colour: [['approve', 'Approve'], ['colour', 'Other colour'], ['drop', 'Not needed']],
    control: [['approve', 'Approve'], ['icon', 'Other icon'], ['drop', 'Not needed']],
  };
  const ids = [...document.querySelectorAll('td.pick')].map((td) => td.dataset.pick);
  const state = new Map();
  let db = null; let canWrite = false;
  const queue = new Map();
  const statusEl = document.getElementById('status');
  const progressEl = document.getElementById('progress');
  const total = ${total};
  const setStatus = (text) => { statusEl.textContent = text; };

  function render(id) {
    const td = document.querySelector('td.pick[data-pick="' + CSS.escape(id) + '"]');
    if (!td) return;
    const pick = state.get(id) || {};
    if (!td.firstChild) {
      const box = document.createElement('div'); box.className = 'choices';
      for (const [value, label] of (CHOICE_SETS[td.dataset.choices] || CHOICE_SETS.kind)) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.value = value; b.textContent = label;
        b.addEventListener('click', () => choose(id, pick => ({ ...pick, pick: pick.pick === value ? null : value })));
        box.appendChild(b);
      }
      const note = document.createElement('input'); note.type = 'text'; note.placeholder = 'A note (optional)'; note.setAttribute('aria-label', 'Note for ' + id);
      note.addEventListener('change', () => choose(id, pick => ({ ...pick, note: note.value.trim() })));
      td.append(box, note);
    }
    td.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(pick.pick === b.dataset.value)); b.disabled = !canWrite; });
    const input = td.querySelector('input');
    if (document.activeElement !== input) input.value = pick.note || '';
    input.disabled = !canWrite;
    td.closest('tr').classList.toggle('picked', !!pick.pick);
  }
  function renderProgress() {
    const picked = [...state.entries()].filter(([id, p]) => p.pick && id !== 'grammar:frames' && ids.includes(id)).length;
    progressEl.textContent = picked + ' of ' + total + ' picked';
  }
  function choose(id, change) {
    if (!db || !canWrite) return;
    const next = change(state.get(id) || {});
    state.set(id, next); render(id); renderProgress();
    // One write at a time to a document: each waits for the one before it.
    const before = queue.get(id) || Promise.resolve();
    const write = before.then(() => db.collection('picks').doc(id).set({ pick: next.pick || null, note: next.note || '', at: new Date().toISOString() }))
      .then(() => setStatus('Saved'))
      .catch((e) => setStatus(e && e.code === 'invalid_argument' ? 'This view cannot save picks: name rows in chat instead.' : 'Not saved (' + (e && e.code || 'error') + '): try again.'));
    queue.set(id, write);
  }
  ids.forEach(render);
  // Approve every row not yet picked: one click arms it, a second within five seconds does it, a row at a time.
  const restButton = document.getElementById('approve-rest');
  let armed = null;
  restButton.addEventListener('click', async () => {
    if (!db || !canWrite) { setStatus('Picks cannot be saved in this view.'); return; }
    const rest = ids.filter((id) => !(state.get(id) || {}).pick);
    if (!rest.length) { setStatus('Every row is picked.'); return; }
    if (!armed) {
      restButton.classList.add('confirm'); restButton.textContent = 'Click again to approve ' + rest.length + ' rows';
      armed = setTimeout(() => { armed = null; restButton.classList.remove('confirm'); restButton.textContent = "Approve every row I haven't picked"; }, 5000);
      return;
    }
    clearTimeout(armed); armed = null; restButton.classList.remove('confirm'); restButton.disabled = true;
    let done = 0;
    for (const id of rest) {
      choose(id, (pick) => ({ ...pick, pick: 'approve' }));
      await queue.get(id);
      done++; restButton.textContent = 'Approved ' + done + ' of ' + rest.length;
    }
    restButton.disabled = false; restButton.textContent = "Approve every row I haven't picked";
  });
  try { if (localStorage.getItem('lexicon-hide-picked') === '1') { document.getElementById('hide').checked = true; document.body.classList.add('hide-picked'); } } catch {}
  document.getElementById('hide').addEventListener('change', (e) => {
    document.body.classList.toggle('hide-picked', e.target.checked);
    try { localStorage.setItem('lexicon-hide-picked', e.target.checked ? '1' : '0'); } catch {}
  });
  (async () => {
    const claude = window.claude;
    if (!claude || typeof claude.use !== 'function') { setStatus('Picks save only inside Claude: name rows in chat instead.'); return; }
    const [store, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!store) { setStatus('Picks cannot be saved in this view: name rows in chat instead.'); return; }
    db = store;
    const may = user ? await user.can('data.write') : null;
    canWrite = may !== false;
    setStatus(canWrite ? 'Picks save as you make them.' : 'You can read the picks; only the owner and contributors make them.');
    ids.forEach(render);
    db.collection('picks').onSnapshot((snap) => {
      for (const doc of snap.docs) { const data = doc.data() || {}; state.set(doc.id, { pick: data.pick || null, note: data.note || '' }); }
      ids.forEach(render); renderProgress();
    }, () => setStatus('Live picks stopped: reload to see the latest.'));
  })();
})();
</script>
</body></html>`;

fs.writeFileSync(out, html);
console.log(`${total} kinds; Lucide ${fromLucide}, Tabler ${fromTabler}, registry ${fromRegistry}, to draw ${toDraw.length}; shared ${shared.length} (${decide.length} to decide); ${Math.round(html.length / 1024)} KB -> ${out}`);
