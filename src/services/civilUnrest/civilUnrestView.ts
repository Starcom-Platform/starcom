/**
 * What Civil Unrest says on the globe (decision D-CU): which notes stand at a moment, where each is drawn, and the
 * words of its hover, its key and its card. A crowd count is always said with its claimant, side by side with the
 * others, never one as fact; a surge is always said as a surge in reporting, not in protest.
 */
import type { CivilUnrestItem, CivilUnrestSection, UnrestClaim } from './civilUnrest';
import { formatUtcDate } from '../../utils/utcTime';

/** How many days back a day of unrest stands, live or at a paused moment; a window shows the days in it. */
export const UNREST_LIVE_DAYS = 7;
/** How many days back a protest surge stands: it is the day's reporting. */
export const SURGE_LIVE_DAYS = 2;
/** How many of a place's days its hover names before it counts the rest. */
export const HOVER_DAYS = 4;

const DAY_S = 86_400;

export interface UnrestMoment {
  /** The moment shown, in unix seconds. */
  atS: number;
  /** A window chosen on the timeline, in unix seconds, or null while live or paused. */
  window: { fromS: number; untilS: number } | null;
}

/** When a note stands: a day of unrest its own day, from its address; anything else from when it was written. */
function spanOf(item: CivilUnrestItem): { fromS: number; untilS: number } {
  if (item.day) {
    const fromS = Date.parse(`${item.day}T00:00:00Z`) / 1000;
    return { fromS, untilS: fromS + DAY_S };
  }
  return { fromS: item.publishedAt, untilS: item.publishedAt + 1 };
}

/** Whether a note stands at a moment: within the window, or within its live days up to the moment. */
export function standsAt(item: CivilUnrestItem, moment: UnrestMoment): boolean {
  const span = spanOf(item);
  if (moment.window) return span.fromS < moment.window.untilS && span.untilS > moment.window.fromS;
  const days = item.section === 'ProtestSurges' ? SURGE_LIVE_DAYS : UNREST_LIVE_DAYS;
  return span.fromS <= moment.atS && span.untilS > moment.atS - days * DAY_S;
}

/** The notes that stand, in the sections on. */
export function drawnFor(items: readonly CivilUnrestItem[], moment: UnrestMoment, on: Readonly<Record<CivilUnrestSection, boolean>>): CivilUnrestItem[] {
  return items.filter((item) => on[item.section] && standsAt(item, moment));
}

/** Where a note is drawn: the city it gives, else its country; null when it names neither. */
export const placeKeyOf = (item: CivilUnrestItem): string | null => (item.point
  ? `point:${item.point.lat.toFixed(2)},${item.point.lon.toFixed(2)}`
  : item.jurisdiction ? `country:${item.jurisdiction}` : null);

/** The notes of a section, by the place each is drawn at, newest first; and those naming no place. */
export function byPlace(items: readonly CivilUnrestItem[]): { places: Array<{ key: string; items: CivilUnrestItem[] }>; unplaced: CivilUnrestItem[] } {
  const places = new Map<string, CivilUnrestItem[]>();
  const unplaced: CivilUnrestItem[] = [];
  for (const item of items) {
    const key = placeKeyOf(item);
    if (!key) { unplaced.push(item); continue; }
    places.set(key, [...(places.get(key) ?? []), item]);
  }
  return { places: [...places].map(([key, notes]) => ({ key, items: notes })), unplaced };
}

/** A note's kinds, as words: `protest`, `shutdown`, `general strike`. */
export const kindsText = (item: CivilUnrestItem): string => (item.kinds.length ? item.kinds.map((k) => k.replace(/_/g, ' ')).join(' and ') : 'unrest');

/** One crowd count, as its claimant states it: `550,000 (the Interior Ministry, as Le Monde reports)`. */
const claimText = (claim: UnrestClaim): string =>
  `${claim.stated} (${claim.claimantName}${claim.citedBy && claim.citedBy !== claim.claimantName ? `, as ${claim.citedBy} reports` : ''})`;

/** Every crowd count, side by side, never one as fact; or what the note says of none. */
export function claimsText(item: CivilUnrestItem): string {
  return item.claims.length
    ? `Crowd counts as claimed: ${item.claims.map(claimText).join(' · ')}${item.claims.length > 1 ? ' (separate claims, not added)' : ''}`
    : 'No crowd count stated';
}

const dayText = (item: CivilUnrestItem): string => (item.day
  ? formatUtcDate(Date.parse(`${item.day}T00:00:00Z`), { year: true })
  : formatUtcDate(item.publishedAt * 1000, { year: true }));

/** A place's hover: where, then each day of unrest there, newest first, with its kinds, counts and reporter. */
export function placeHover(items: readonly CivilUnrestItem[], placeName: string): string {
  const named = items.slice(0, HOVER_DAYS).map((item) => [
    `${dayText(item)}: ${kindsText(item)}${item.movement ? ` (${item.movement.name})` : ''}`,
    `  ${claimsText(item)}${item.authority ? `. Reported by ${item.authority}` : ''}`,
  ].join('\n'));
  const rest = items.length - named.length;
  return [`Civil Unrest · ${placeName}`, ...named, ...(rest > 0 ? [`and ${rest} more ${rest === 1 ? 'day' : 'days'}`] : [])].join('\n');
}

/** A surge's hover: its own title, which says it is a surge in reporting, not in protest. */
export function surgeHover(items: readonly CivilUnrestItem[], placeName: string): string {
  return [`Protest surge · ${placeName}`, ...items.map((item) => item.title), 'A surge in reporting, not in protest.'].join('\n');
}

/** What the card says of the notes drawn: how many, where, and what a count and a surge are. */
export function civilUnrestNote(days: number, surges: number, unplaced: number): string {
  if (days === 0 && surges === 0) return 'Civil Unrest: no day of unrest and no protest surge stands at the moment shown.';
  return `Civil Unrest: ${days} day${days === 1 ? '' : 's'} of unrest, each at its city or country, each crowd count beside its claimant. No count is taken as fact. `
    + `${surges} protest surge${surges === 1 ? '' : 's'}: a surge in reporting, not in protest. `
    + `${unplaced} name${unplaced === 1 ? 's' : ''} no place here, and ${unplaced === 1 ? 'is' : 'are'} not drawn.`;
}

/** The card's lines about a featured note: what, the counts beside their claimants, where, and from whom. */
export function featuredLines(item: CivilUnrestItem, where: string): string[] {
  if (item.section === 'ProtestSurges') {
    return [
      'Protest surge · a surge in reporting, not in protest',
      `Written ${formatUtcDate(item.publishedAt * 1000, { year: true })}`,
      where,
      'A signed Nostr event from The Record; its signature was checked on intake',
    ];
  }
  return [
    `Civil Unrest · ${kindsText(item)} · ${dayText(item)}${item.movement ? ` · ${item.movement.name}` : ''}`,
    claimsText(item),
    where,
    `${item.authority ? `Reported by ${item.authority}` : 'Posted on The Record'}${item.licence ? ` (${item.licence})` : ''}`,
  ];
}
