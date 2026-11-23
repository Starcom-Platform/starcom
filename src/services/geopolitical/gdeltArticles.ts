/**
 * One event per article (decision D-DP, DP1). GDELT codes the news by machine, and one article can
 * be many rows: on 2026-10-13, 12,074 cooperative rows came from 2,751 articles, one of them 146
 * rows. Counted as rows, a story told at length looked like a busy day of diplomacy.
 *
 * Rows sharing an article, the same two countries (either way round) and the same CAMEO code are one
 * event: the earliest row, saying how many rows it stood for and the widest reporting GDELT counted
 * among them. Pure.
 */
import type { RealGdeltEvent } from './gdeltEventExport';

const keyOf = (e: RealGdeltEvent) => [e.sourceUrl, [e.actor1ISO3, e.actor2ISO3].sort().join('|'), e.eventCode].join('\u0000');
const widest = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));

export function oneEventPerArticle(events: readonly RealGdeltEvent[]): RealGdeltEvent[] {
  const ordered = [...events].sort((a, b) => a.dateAdded.localeCompare(b.dateAdded) || a.id.localeCompare(b.id));
  const byKey = new Map<string, RealGdeltEvent>();
  for (const e of ordered) {
    const key = keyOf(e);
    const held = byKey.get(key);
    if (!held) { byKey.set(key, { ...e, rows: 1 }); continue; }
    const mentions = widest(held.mentions, e.mentions);
    const sources = widest(held.sources, e.sources);
    const articles = widest(held.articles, e.articles);
    byKey.set(key, {
      ...held, rows: (held.rows ?? 1) + 1,
      ...(mentions !== undefined ? { mentions } : {}),
      ...(sources !== undefined ? { sources } : {}),
      ...(articles !== undefined ? { articles } : {}),
    });
  }
  // In the order the events were given, by their first row.
  const firstIndex = new Map<string, number>();
  events.forEach((e, i) => { if (!firstIndex.has(keyOf(e))) firstIndex.set(keyOf(e), i); });
  return [...byKey.values()].sort((a, b) => firstIndex.get(keyOf(a))! - firstIndex.get(keyOf(b))!);
}
