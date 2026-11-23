/**
 * The War & Conflict Brief's front page (decision IM16): one UTC day of Mecha
 * Jono's war news, as their daily brief covers it, counted, with each theatre
 * and its count.
 *
 * Worst first, by the tier of the theatre's war on Wikipedia's list, then by
 * how many items it had that day: a skirmish with many lines is not worse
 * than a major war with one. A theatre on no war's list follows those that are,
 * and the items that name no war are counted apart, never dropped, so the
 * theatres and the rest always add up to the day.
 *
 * The item-by-item story is the clip (briefing playlists, block G); a card is
 * the day at a glance.
 */
import type { ConflictItem, WarItem, WarTier } from './warConflict';
import { WAR_TIERS } from './warConflict';
import { formatUtcDate } from '../../utils/utcTime';
import { cutTitle } from '../../utils/cutTitle';
import { backingOf, CONFLICT_BACKINGS } from './warConflictView';

/** A war's tier as a row names it (theatre-lens.md, TL8, TL16). */
export const TIER_WORDS: Record<WarTier, string> = { major_war: 'a major war', minor_war: 'a minor war', conflict: 'a conflict', skirmish: 'skirmishes' };

export interface BriefTheatre {
  slug: string;
  name: string;
  count: number;
  /** Its war's tier on Wikipedia's list, the worst where it is in several; null when on none. */
  tier: WarTier | null;
  /**
   * Its most serious item that day (theatre-lens.md, TL16): a critical warning, then
   * one reporting deaths, then a report, the newest of each. Always given by
   * warConflictBrief.
   */
  mostSerious?: { id: string; title: string };
}

export interface WarConflictBrief {
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  count: number;
  theatres: BriefTheatre[];
  /** That day's items that name no war. */
  noTheatre: number;
  /** That day's items, by id, newest first: what a front page frames. */
  ids: string[];
  /** The card's headline. */
  title: string;
  /** The card's facts, in order. */
  lines: string[];
}

const DAY_S = 24 * 60 * 60;
/** Each tier as the war map's key names it, as a heading for its theatres. */
const TIER_HEADING: Record<WarTier, string> = {
  major_war: 'Major wars',
  minor_war: 'Minor wars',
  conflict: 'Conflicts',
  skirmish: 'Skirmishes',
};
/** Holds a theatre to its count, so a wrapped line never leaves a number at the start of the next. */
const NO_BREAK = '\u00a0';
const dayOf = (unixS: number) => new Date(unixS * 1000).toISOString().slice(0, 10);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One day's brief, the newest day with items unless `day` names one; null when that day has none. For a card or a
 * clip (`capture`), a note that names a person is never a theatre's most serious line (D-NP, NP2); it is still
 * counted, since a count names no one.
 */
export function warConflictBrief(
  items: readonly ConflictItem[],
  wars: readonly WarItem[],
  day?: string,
  options: { capture?: boolean } = {},
): WarConflictBrief | null {
  if (!items.length) return null;
  const chosen = day ?? dayOf(Math.max(...items.map((it) => it.reportedAt)));
  const startS = Date.parse(`${chosen}T00:00:00Z`) / 1000;
  if (!Number.isFinite(startS)) return null;
  const ofDay = items
    .filter((it) => it.reportedAt >= startS && it.reportedAt < startS + DAY_S)
    .sort((a, b) => b.reportedAt - a.reportedAt);
  if (!ofDay.length) return null;

  // Each theatre's worst tier, from every war that lists it.
  const rank = (tier: WarTier | null) => (tier === null ? WAR_TIERS.length : WAR_TIERS.indexOf(tier));
  const tierOf = new Map<string, WarTier>();
  for (const war of wars) {
    for (const t of war.theatres) {
      const known = tierOf.get(t.slug);
      if (known === undefined || rank(war.tier) < rank(known)) tierOf.set(t.slug, war.tier);
    }
  }

  const bySlug = new Map<string, BriefTheatre>();
  const seriousness = (it: ConflictItem) => CONFLICT_BACKINGS.indexOf(backingOf(it));
  const mostSerious = new Map<string, ConflictItem>();
  // Newest first, so the first of each backing met is its newest.
  for (const it of ofDay) {
    if (!it.theatre) continue;
    const entry = bySlug.get(it.theatre.slug) ?? { slug: it.theatre.slug, name: it.theatre.name, count: 0, tier: tierOf.get(it.theatre.slug) ?? null };
    entry.count += 1;
    const known = mostSerious.get(it.theatre.slug);
    const quotable = !(options.capture && it.namesPeople);
    if (quotable && (!known || seriousness(it) < seriousness(known))) mostSerious.set(it.theatre.slug, it);
    const chosen = mostSerious.get(it.theatre.slug);
    if (chosen) entry.mostSerious = { id: chosen.id, title: chosen.title };
    bySlug.set(it.theatre.slug, entry);
  }
  const theatres = [...bySlug.values()]
    .sort((a, b) => rank(a.tier) - rank(b.tier) || b.count - a.count || a.name.localeCompare(b.name));
  const noTheatre = ofDay.filter((it) => !it.theatre).length;

  const date = formatUtcDate(startS * 1000, { year: true });
  // A line per tier, worst first, headed as the war map's key names it; then those on no war's list.
  const byTier = [...WAR_TIERS, null].flatMap((tier) => {
    const these = theatres.filter((t) => t.tier === tier);
    if (!these.length) return [];
    const heading = tier ? TIER_HEADING[tier] : 'On no war\'s list';
    return [`${heading}: ${these.map((t) => `${t.name}${NO_BREAK}${t.count}`).join(' · ')}`];
  });
  const lines = [
    `${plural(ofDay.length, 'item', 'items')} reported on ${date} (UTC), posted on The Record`,
    ...byTier,
    ...(noTheatre ? [`${noTheatre} ${noTheatre === 1 ? 'names' : 'name'} no war`] : []),
  ];
  return {
    day: chosen,
    count: ofDay.length,
    theatres,
    noTheatre,
    ids: ofDay.map((it) => it.id),
    title: `War & Conflict Brief · ${date}`,
    lines,
  };
}

/**
 * The window that shows a brief's day on the globe (theatre-lens.md, TL4): the UTC
 * day, from its first millisecond to its last, so the marks drawn are that day's
 * and the brief beside them says the same.
 */
export function briefDayWindow(day: string): { start: number; end: number } | null {
  const start = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(start) ? { start, end: start + DAY_S * 1000 - 1 } : null;
}

/** How many days a theatre's sparkline runs (theatre-lens.md, TL7): two weeks. */
export const SPARK_DAYS = 14;

/**
 * Each theatre's items a UTC day, for the `span` days ending on `day`, oldest
 * first (theatre-lens.md, TL7): the brief chip's sparkline. A day before the first
 * day anything was read is null, not read, which is not the same as a day with
 * none. Only the window's days are counted, so what was reported after `day` is
 * not; items naming no theatre are left out.
 */
export function theatreDays(
  items: readonly ConflictItem[],
  day: string,
  span = SPARK_DAYS,
): Map<string, Array<{ day: string; count: number | null }>> {
  const endS = Date.parse(`${day}T00:00:00Z`) / 1000;
  const days = Array.from({ length: span }, (_, i) => dayOf(endS - (span - 1 - i) * DAY_S));
  const firstRead = items.length ? dayOf(items.reduce((min, it) => Math.min(min, it.reportedAt), Infinity)) : null;
  const counts = new Map<string, Map<string, number>>();
  for (const it of items) {
    if (!it.theatre) continue;
    const perDay = counts.get(it.theatre.slug) ?? new Map<string, number>();
    const d = dayOf(it.reportedAt);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    counts.set(it.theatre.slug, perDay);
  }
  return new Map([...counts].map(([slug, perDay]) => [
    slug,
    days.map((d) => ({ day: d, count: firstRead === null || d < firstRead ? null : perDay.get(d) ?? 0 })),
  ]));
}

/**
 * The four-theatre front page's rows (theatre-lens.md, TL15, TL16): the day's count,
 * then for each of the brief's first `count` theatres, in its order, its name, its
 * items that day and its war's tier; and its most serious item by title.
 */
export function briefFrontRows(brief: WarConflictBrief, count: number): string[] {
  return [
    brief.lines[0],
    ...brief.theatres.slice(0, count).flatMap((t) => [
      `${t.name} · ${t.count} ${t.count === 1 ? 'item' : 'items'} · ${t.tier ? TIER_WORDS[t.tier] : 'on no war\'s list'}`,
      ...(t.mostSerious ? [`Most serious: ${cutTitle(t.mostSerious.title)}`] : []),
    ]),
  ];
}
