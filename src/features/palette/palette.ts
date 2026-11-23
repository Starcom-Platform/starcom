/**
 * The command palette's machinery (D-CP; UX plan E1): what a result is, where results come from, how a query finds
 * them, the last picks, and whether the palette is open. The palette itself is components/CommandPalette.
 *
 * Results come from sources that register themselves where what they offer lives: the header gives places, records
 * and the applications; the Globe gives layers and modes, its rail's controls, the time bar and the items it draws.
 * With the Globe closed, its sections are not there, and nothing offers what cannot be done.
 */
import { useSyncExternalStore } from 'react';
import type { GlyphName } from '../../symbols/uiSymbols';

/** The palette's sections, in the order shown (CP1). */
export const PALETTE_SECTIONS = ['recent', 'commands', 'places', 'globe', 'layers', 'records', 'apps'] as const;
export type PaletteSection = (typeof PALETTE_SECTIONS)[number];
/** How many of each section show at once. */
export const SECTION_LIMIT: Readonly<Record<PaletteSection, number>> = {
  recent: 8, commands: 8, places: 6, globe: 6, layers: 6, records: 6, apps: 6,
};

export interface PaletteResult {
  /** Stable across opens: a recent pick is found again by it. */
  id: string;
  section: Exclude<PaletteSection, 'recent'>;
  title: string;
  /** What it does or is, said before Enter (CP2). */
  description: string;
  glyph?: GlyphName;
  /** Other words that find it, not shown. */
  keywords?: string;
  /** Not offered with the box empty: found by its words, or among the recent picks. */
  quiet?: boolean;
  run: () => void;
}

export interface PaletteSource {
  id: string;
  /** Its results for a query, the box's words as typed; '' for the empty box. */
  results: (query: string) => readonly PaletteResult[] | Promise<readonly PaletteResult[]>;
}

// ── Sources ──────────────────────────────────────────────────────────────────
const sources = new Map<string, PaletteSource>();
let sourcesVersion = 0;
const sourceListeners = new Set<() => void>();
const tellSources = () => { sourcesVersion += 1; sourceListeners.forEach((l) => l()); };

/** Offers a source's results until the function returned is called; a source of the same id is replaced. */
export function registerPaletteSource(source: PaletteSource): () => void {
  sources.set(source.id, source);
  tellSources();
  return () => {
    if (sources.get(source.id) === source) { sources.delete(source.id); tellSources(); }
  };
}

export function paletteSources(): PaletteSource[] {
  return [...sources.values()];
}

export function usePaletteSourcesVersion(): number {
  return useSyncExternalStore((l) => { sourceListeners.add(l); return () => { sourceListeners.delete(l); }; }, () => sourcesVersion, () => 0);
}

// ── Matching ─────────────────────────────────────────────────────────────────
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const wordsOf = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * How well a result answers a query, 0 for not at all: every word typed must begin a word of its title, keywords or
 * description, or be found in its title. The title's first word counts most, then its others, then its keywords, then
 * its description. "rain on" finds "Rain: on"; "last 7" finds "Last 7 days"; "jap" finds "Japan".
 */
export function paletteScore(result: Pick<PaletteResult, 'title' | 'description' | 'keywords'>, query: string): number {
  const typed = wordsOf(query);
  if (!typed.length) return 1;
  const title = wordsOf(result.title);
  const keys = wordsOf(result.keywords ?? '');
  const said = wordsOf(result.description);
  const whole = fold(result.title);
  let score = 0;
  for (const w of typed) {
    if (title[0]?.startsWith(w)) score += 8;
    else if (title.some((t) => t.startsWith(w))) score += 5;
    else if (keys.some((k) => k.startsWith(w))) score += 4;
    else if (whole.includes(w)) score += 2;
    else if (said.some((d) => d.startsWith(w))) score += 1;
    else return 0;
  }
  // A shorter title answers the same words more closely.
  return score + 1 / (1 + title.length);
}

/** The results that answer a query, best first. */
export function paletteMatch<T extends Pick<PaletteResult, 'title' | 'description' | 'keywords'>>(results: readonly T[], query: string, limit = Infinity): T[] {
  return results
    .map((result, i) => ({ result, i, score: paletteScore(result, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.result);
}

// ── Recent picks (CP4) ───────────────────────────────────────────────────────
export const RECENT_LIMIT = 8;
const RECENT_KEY = 'starcom:palette-recent';
let recent: string[] | null = null;
const recentListeners = new Set<() => void>();

function readRecent(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT) : [];
  } catch { return []; }
}

/** The ids of the last picks, newest first. */
export function paletteRecent(): readonly string[] {
  recent ??= readRecent();
  return recent;
}

function keepRecent(next: string[]): void {
  recent = next;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* kept for this page only */ }
  recentListeners.forEach((l) => l());
}

export function rememberPick(id: string): void {
  keepRecent([id, ...paletteRecent().filter((r) => r !== id)].slice(0, RECENT_LIMIT));
}

export function clearPaletteRecent(): void {
  keepRecent([]);
}

export function usePaletteRecent(): readonly string[] {
  return useSyncExternalStore((l) => { recentListeners.add(l); return () => { recentListeners.delete(l); }; }, paletteRecent, () => []);
}

// ── Open or closed ───────────────────────────────────────────────────────────
export interface PaletteOpened {
  query: string;
  /** With the box empty, this section whole: the globe's layers button opens Layers and modes (CP5). */
  section?: Exclude<PaletteSection, 'recent'>;
}
let open: PaletteOpened | null = null;
const openListeners = new Set<() => void>();
const tellOpen = () => openListeners.forEach((l) => l());

/** Opens the palette, its box holding `query`, and with it empty, `section` whole if one is named. */
export function openPalette(query = '', section?: PaletteOpened['section']): void {
  open = section ? { query, section } : { query };
  tellOpen();
}

export function closePalette(): void {
  if (!open) return;
  open = null;
  tellOpen();
}

export function paletteOpen(): PaletteOpened | null {
  return open;
}

export function usePaletteOpen(): PaletteOpened | null {
  return useSyncExternalStore((l) => { openListeners.add(l); return () => { openListeners.delete(l); }; }, paletteOpen, () => null);
}

export function resetPaletteForTests(): void {
  sources.clear();
  recent = null;
  open = null;
  sourcesVersion = 0;
}
