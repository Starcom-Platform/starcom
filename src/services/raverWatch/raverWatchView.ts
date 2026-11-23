/**
 * What of Raver Watch is drawn, and how (globe record, section 19, Phase 1
 * step 3; RW6).
 *
 * An item is drawn while it applies. Live, that is from `valid_from` until
 * `valid_until`; with a window chosen on the timeline, when its time overlaps
 * the window (RW7). It fades as its end nears and is hidden after it: their
 * notes carry no NIP-40 expiration, since relays delete expired events and the
 * history is worth keeping, so ending it is ours to do.
 *
 * The level is the mark's backing, red a glow, amber a ring and info a disc,
 * so it never rests on colour alone. The glyph is what it is: a drug-check
 * alert is the lab's flask, and an incident is its category.
 *
 * From v1.1 (their answers of 2026-10-01, and the owner's decisions that day):
 * a scene event is drawn from a week before its start until its end, marked
 * not begun until it starts, and with a window chosen it is drawn when its own
 * night overlaps the window. A cancelled one is kept, struck through. A
 * subdivision with no outline here falls back to its country's; a warning for
 * all of Europe outlines Europe. Policy news is listed apart, and what names
 * no place is listed, never drawn.
 *
 * From v1.2 (their update of 2026-10-02, and the owner's decision RW12): a
 * scene event at a public venue is drawn at the venue and says its address,
 * crediting OpenStreetMap; a HeatRisk note is the heat glyph and says the
 * National Weather Service's level in its words. Genres read as words.
 *
 * This weekend is Friday 00:00 to Monday 06:00 in each event's own time zone
 * (raver-nights.md, RN11, RN11a): its window spans every zone's, and a scene
 * event in it is drawn only when it starts in its own town's weekend. A hover
 * and a card say who is playing, as the event's tags name them (RN13).
 */
import type { RaverWatchArtist, RaverWatchFestival, RaverWatchItem, RaverWatchLevel } from './raverWatch';
import { formatUtcDate, formatUtcDateTime } from '../../utils/utcTime';
import { US_STATE_CODE } from './usStates';
import { ownWeekend, weekendFridayOf } from './raverWatchWindows';

/** The moment the globe shows: now while live; while paused, the chosen window, ending at `atS`. */
export interface RaverWatchMoment {
  atS: number;
  window: { fromS: number; untilS: number } | null;
}

export type RaverWatchGlyph = 'alert' | 'drugs' | 'heat' | 'crowd' | 'violence' | 'closure' | 'incident' | 'event' | 'cancelled';

/** Every glyph, in the order the atlas lays them out. */
export const RAVER_WATCH_GLYPHS: readonly RaverWatchGlyph[] = [
  'alert', 'drugs', 'heat', 'crowd', 'violence', 'closure', 'incident', 'event', 'cancelled',
];

/** Their incident categories that have a glyph of their own; any other is drawn as an incident. */
const INCIDENT_GLYPHS: Record<string, RaverWatchGlyph> = {
  drugs: 'drugs', heat: 'heat', crowd: 'crowd', violence: 'violence', closure: 'closure',
};

/** The faintest an item is drawn before it is hidden: fading, and still seen. */
export const FADE_FLOOR = 0.3;
const WEEK_S = 7 * 24 * 60 * 60;
/** How far ahead of its start a scene event is drawn, live: their suggestion, the owner's choice. */
export const LOOKAHEAD_S = WEEK_S;

/** A scene event's own night, when the item is one. */
const nightOf = (item: RaverWatchItem) =>
  (item.start !== undefined && item.end !== undefined ? { start: item.start, end: item.end } : null);

/**
 * A scene event the weekend's window holds that does not start in its own
 * town's weekend: a Thursday night in London (raver-nights.md, RN11, RN11a).
 * False in any other window, and for a zone this browser does not know, which
 * the window alone judges.
 */
export function outsideItsWeekend(item: RaverWatchItem, moment: RaverWatchMoment): boolean {
  const night = nightOf(item);
  if (!night || !moment.window || !item.startTzid) return false;
  if (!(night.start < moment.window.untilS && night.end > moment.window.fromS)) return false;
  const friday = weekendFridayOf({ start: moment.window.fromS * 1000, end: moment.window.untilS * 1000 });
  const own = friday === null ? null : ownWeekend(friday, item.startTzid);
  return own !== null && !(own.start <= night.start * 1000 && night.start * 1000 < own.end);
}

/** Whether an item is drawn at this moment. */
export function standsAt(item: RaverWatchItem, moment: RaverWatchMoment): boolean {
  const night = nightOf(item);
  if (night) {
    if (moment.window) return night.start < moment.window.untilS && night.end > moment.window.fromS && !outsideItsWeekend(item, moment);
    return Math.max(item.validFrom, night.start - LOOKAHEAD_S) <= moment.atS && moment.atS < night.end;
  }
  if (moment.window) return item.validFrom < moment.window.untilS && item.validUntil > moment.window.fromS;
  return item.validFrom <= moment.atS && moment.atS < item.validUntil;
}

/** A scene event, live, that has not started yet. With a window chosen, the window says when to look. */
export function notBegunAt(item: RaverWatchItem, moment: RaverWatchMoment): boolean {
  const night = nightOf(item);
  return night !== null && moment.window === null && moment.atS < night.start;
}

/** How long an event's flare runs from its start, in the world's time (raver-nights.md, RN5). */
export const FLARE_S = 20 * 60;

/**
 * How far through its flare a scene event is at this moment, 0 at its start to just
 * under 1 twenty minutes on, or null when it is not flaring (raver-nights.md, RN1):
 * before its start, after its flare, called off, or not a scene event. The moment is
 * the world's, live, paused or a sweep's frame, so a screen and a clip agree; a range
 * read to its end has none (RN10).
 */
export function flareAt(item: RaverWatchItem, moment: RaverWatchMoment): number | null {
  if (item.layer !== 'SceneEvents' || item.start === undefined || item.cancelled) return null;
  // A range read to its end, as a dragged window is, has no one moment for a start to have just passed.
  if (moment.window && moment.atS >= moment.window.untilS) return null;
  const into = moment.atS - item.start;
  return into >= 0 && into < FLARE_S ? into / FLARE_S : null;
}

/** How near a HeatRisk town's point an event stands to be in that town (raver-nights.md, RN4). */
export const HEAT_TOWN_KM = 25;
/**
 * A HeatRisk note's day: the 24 hours before it ends. Mecha Jono's notes end at
 * 06:00 local the morning after the day they name, and apply from when they were
 * published, up to a week before it; so the day is read from the end, never from
 * `validFrom` (raver-nights.md, RN4). A day the clocks change is an hour off at one end.
 */
const HEAT_DAY_S = 24 * 60 * 60;
/** The HeatRisk from which an event carries a halo: Orange (RN2). */
export const HEAT_HALO_FROM = 2;

const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * The heat a scene event stands in (raver-nights.md, RN2, RN4): the worst HeatRisk of
 * a town within HEAT_TOWN_KM whose day covers the event's start, when it is Orange or
 * worse; else null, and null for an event called off, or with no place or start. A
 * note that states no level is read by its colour, as the heat close-up reads it.
 */
export function heatAround(event: RaverWatchItem, notes: readonly RaverWatchItem[]): number | null {
  if (event.layer !== 'SceneEvents' || event.cancelled || event.start === undefined || !event.point) return null;
  let worst = -1;
  for (const note of notes) {
    if (note.layer !== 'HeatRisk' || !note.point) continue;
    // The note's own day, not the week before it while it stood as a forecast: Magenta for the 8th is not the 2nd's heat.
    if (event.start < note.validUntil - HEAT_DAY_S || note.validUntil <= event.start) continue;
    if (kmBetween(event.point, note.point) > HEAT_TOWN_KM) continue;
    worst = Math.max(worst, note.heatRisk ?? (note.level === 'red' ? 3 : note.level === 'amber' ? 2 : 0));
  }
  return worst >= HEAT_HALO_FROM ? worst : null;
}

/** How long tonight runs from its moment: as the Raver Watch panel's Tonight (raver-nights.md, RN7). */
export const TONIGHT_S = 12 * 60 * 60;

/** The regions a US zone is read as; any other zone is read by its area or its city (RN8). */
const US_REGIONS: Record<string, string> = {
  'America/Los_Angeles': 'US Pacific',
  'America/Denver': 'US Mountain', 'America/Phoenix': 'US Mountain', 'America/Boise': 'US Mountain',
  'America/Chicago': 'US Central',
  'America/New_York': 'US Eastern', 'America/Detroit': 'US Eastern',
  'America/Indiana/Indianapolis': 'US Eastern', 'America/Kentucky/Louisville': 'US Eastern',
  'America/Anchorage': 'Alaska', 'Pacific/Honolulu': 'Hawaii',
};
const regionOfZone = (tz: string | undefined) => {
  if (!tz) return 'Elsewhere';
  if (US_REGIONS[tz]) return US_REGIONS[tz];
  if (tz.startsWith('Europe/')) return 'Europe';
  if (tz.startsWith('Australia/')) return 'Australia';
  return `${(tz.split('/').pop() ?? tz).replace(/_/g, ' ')} time`;
};
/** A start as its zone's clock reads it, `21:00 PDT`: a US zone's own name, else its offset. */
const localStart = (atS: number, tz: string | undefined) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz ?? 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' })
      .formatToParts(new Date(atS * 1000));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('hour')}:${part('minute')} ${part('timeZoneName')}`.trim();
  } catch {
    return `${new Date(atS * 1000).toISOString().slice(11, 16)}Z`;
  }
};

/** What a row of all-day events gives for its first start. */
const ALL_DAY = 'all day';

/** Tonight, for its card (raver-nights.md, RN3, RN7, RN8). */
export interface Tonight {
  fromS: number;
  untilS: number;
  /** The scene events starting in it, and how many stand in heat (RN2). */
  count: number;
  underHeat: number;
  /**
   * The scene events already under way as it begins, started before and not ended:
   * its card draws them, as the globe does over tonight's hours, and its count leaves
   * them out (RN10).
   */
  underWay: number;
  /** A row a region, the first to start first: the night as it moves west. */
  regions: Array<{ name: string; count: number; underHeat: number; first: { atS: number; local: string } }>;
  /** Where its events are, for the card to centre on. */
  points: Array<{ lat: number; lon: number }>;
}

/**
 * The scene events starting in the twelve hours from `fromS` (not called off, not
 * news, placed), a row a region by the zone each was listed in, ordered by the first
 * to start, with how many stand in heat.
 */
export function tonightOf(items: readonly RaverWatchItem[], fromS: number): Tonight {
  const untilS = fromS + TONIGHT_S;
  const heatNotes = items.filter((it) => it.layer === 'HeatRisk');
  const drawable = items.filter((it) => it.layer === 'SceneEvents' && !it.sceneNews && !it.cancelled && it.point);
  const events = drawable.filter((it) => it.start !== undefined && it.start >= fromS && it.start < untilS);
  const underWay = drawable.filter((it) => {
    const night = nightOf(it);
    return night !== null && night.start < fromS && night.end > fromS;
  }).length;
  const byRegion = new Map<string, Tonight['regions'][number]>();
  let underHeat = 0;
  for (const it of events) {
    const name = regionOfZone(it.startTzid);
    const hot = heatAround(it, heatNotes) !== null;
    if (hot) underHeat += 1;
    // An all-day event has no first start to give (3.25): a row of them alone says all day.
    const startOf = (): { atS: number; local: string } => ({ atS: it.start!, local: it.allDay ? ALL_DAY : localStart(it.start!, it.startTzid) });
    const row = byRegion.get(name) ?? { name, count: 0, underHeat: 0, first: startOf() };
    row.count += 1;
    if (hot) row.underHeat += 1;
    if (!it.allDay && (row.first.local === ALL_DAY || it.start! < row.first.atS)) row.first = startOf();
    byRegion.set(name, row);
  }
  return {
    fromS,
    untilS,
    count: events.length,
    underHeat,
    underWay,
    regions: [...byRegion.values()].sort((a, b) => a.first.atS - b.first.atS || a.name.localeCompare(b.name)),
    points: events.map((it) => ({ lat: it.point!.lat, lon: it.point!.lon })),
  };
}

/** Tonight in a card's lines: how many start and how many in heat, then a row a region, as many as are shown. */
export function tonightLines(tonight: Tonight, regionsShown = 6): string[] {
  const from = new Date(tonight.fromS * 1000).toISOString().slice(11, 16);
  const events = (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`;
  const shown = tonight.regions.slice(0, regionsShown);
  const more = tonight.regions.length - shown.length;
  return [
    `${tonight.count} scene ${tonight.count === 1 ? 'event starts' : 'events start'} in the twelve hours from ${from}Z`
      + `${tonight.underHeat ? `, ${tonight.underHeat} in a hot town` : ''}`,
    ...shown.map((r) => `${r.name} · ${events(r.count)}${r.underHeat ? ` · ${r.underHeat} under heat` : ''} · ${r.first.local === ALL_DAY ? ALL_DAY : `first ${r.first.local}`}`),
    ...(more ? [`and ${more} more ${more === 1 ? 'region' : 'regions'}`] : []),
  ];
}

/**
 * How solid an item is drawn, from 1 down to FADE_FLOOR. Whole until its end
 * nears; then fading over the last week, or the last quarter of an item
 * shorter than four weeks, so a two-day item does not start fading at once.
 */
export function fadeAt(item: RaverWatchItem, moment: RaverWatchMoment): number {
  // A scene event fades over its own night, not over the fortnight since it was listed.
  const night = nightOf(item);
  const from = night ? night.start : item.validFrom;
  const until = night ? night.end : item.validUntil;
  const over = Math.min(WEEK_S, Math.max(until - from, 1) / 4);
  const left = until - moment.atS;
  if (left >= over) return 1;
  return FADE_FLOOR + (1 - FADE_FLOOR) * Math.max(left, 0) / over;
}

export function glyphOf(item: RaverWatchItem): RaverWatchGlyph {
  if (item.layer === 'DrugCheckAlerts') return 'alert';
  if (item.layer === 'HeatRisk') return 'heat';
  if (item.layer === 'SceneEvents') return item.cancelled ? 'cancelled' : 'event';
  return (item.category && INCIDENT_GLYPHS[item.category]) || 'incident';
}

/** The level as the note states it; info when it states none. */
export function levelOf(item: RaverWatchItem): RaverWatchLevel {
  return item.level ?? 'info';
}

/** Policy news (laws, licensing, drug policy): news, not an incident, so listed apart and not drawn. */
export function isNews(item: RaverWatchItem): boolean {
  return isPolicyNews(item) || item.sceneNews === true;
}

/** Policy and law: a scene incident about a rule, not an event. */
export function isPolicyNews(item: RaverWatchItem): boolean {
  return item.layer === 'SceneIncidents' && item.category === 'policy';
}

/**
 * The region to outline for a jurisdiction: its own outline, or, for a
 * subdivision with none here, its country's, as their v1.1 asks of a reader.
 */
export function regionToOutline(code: string, canOutline: (code: string) => boolean): string | null {
  if (canOutline(code)) return code;
  // A US state has an outline here, fetched when first named: until it comes,
  // nothing, rather than the whole country for a moment.
  if (US_STATE_CODE.test(code)) return null;
  const country = code.split('-')[0];
  return country !== code && canOutline(country) ? country : null;
}

/**
 * The countries an area wider than a country covers, as two-letter codes.
 * Europe is the continent's states, the EU's and the rest, Russia and Turkey
 * left out: a warning from a European lab is not one for Vladivostok or Van.
 */
const REGION_COUNTRIES: Record<NonNullable<RaverWatchItem['region']>, readonly string[]> = {
  europe: [
    'al', 'ad', 'at', 'ba', 'be', 'bg', 'by', 'ch', 'cy', 'cz', 'de', 'dk', 'ee', 'es', 'fi', 'fr', 'gb', 'gr', 'hr',
    'hu', 'ie', 'is', 'it', 'li', 'lt', 'lu', 'lv', 'mc', 'md', 'me', 'mk', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'rs',
    'se', 'si', 'sk', 'sm', 'ua', 'va', 'xk',
  ],
};
export function countriesOf(region: NonNullable<RaverWatchItem['region']>): readonly string[] {
  return REGION_COUNTRIES[region];
}

/** Whether an item can be put on the globe at all: a point, a region outlined here, or a wide area. */
const placeable = (item: RaverWatchItem, canOutline: (code: string) => boolean) =>
  !!item.point || (!!item.jurisdiction && regionToOutline(item.jurisdiction, canOutline) !== null);

/**
 * What is listed instead of drawn, at this moment, newest first: what names no
 * place or a region not outlined here, and a warning for a wide area, which
 * names neither and is outlined as well; and, apart, policy news.
 */
export function elsewhere(
  items: readonly RaverWatchItem[],
  moment: RaverWatchMoment,
  canOutline: (code: string) => boolean,
): { unplaced: RaverWatchItem[]; news: RaverWatchItem[]; sceneNews: RaverWatchItem[] } {
  const standing = items.filter((item) => standsAt(item, moment)).sort((a, b) => b.validFrom - a.validFrom);
  return {
    unplaced: standing.filter((item) => !isNews(item) && !placeable(item, canOutline)),
    news: standing.filter(isPolicyNews),
    // Scene news (RW17), apart from policy and law: festivals, tours and releases, never drawn.
    sceneNews: standing.filter((item) => item.sceneNews === true),
  };
}

/** A genre as words: they publish `drum_and_bass`. */
export function genreName(genre: string): string {
  return genre.replace(/_/g, ' ');
}

/** The NWS HeatRisk's own names for its levels, 0 to 4. */
const HEAT_RISK_NAMES = ['Green', 'Yellow', 'Orange', 'Red', 'Magenta'] as const;
export function heatRiskName(level: number): string {
  return HEAT_RISK_NAMES[level] ?? String(level);
}

/** Whom a venue and its address are credited to: OpenStreetMap's licence asks for it. */
export const VENUE_CREDIT = 'Venue and address: OpenStreetMap contributors, ODbL.';

const degrees = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(1)}°${value < 0 ? negative : positive}`;

/** A moment in the time zone an event was listed in: `Fri 2 Oct 22:00`. */
function inZone(unixS: number, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(unixS * 1000));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')} ${part('hour')}:${part('minute')}`;
  } catch {
    // A zone this browser does not know: UTC alone, which follows anyway.
    return '';
  }
}

/** A day in the time zone an event was listed in: `Tue 3 Nov`; null for a zone this browser does not know. */
function dayInZone(unixS: number, zone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(unixS * 1000));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')}`;
  } catch {
    return null;
  }
}

/**
 * An all-day scene event's days in its own zone (3.25's `time_precision: "day"`): `Tue 3 Nov (Europe/Paris), all day`,
 * or from one day to another; in UTC dates where its zone is unknown here.
 */
export function allDayText(night: { start: number; end: number }, zone: string | undefined): string {
  const first = (zone && dayInZone(night.start, zone)) || formatUtcDate(night.start * 1000);
  const last = (zone && dayInZone(night.end - 1, zone)) || formatUtcDate((night.end - 1) * 1000);
  return `${first === last ? first : `${first} to ${last}`}${zone ? ` (${zone})` : ' (UTC)'}, all day`;
}

/** The licence a note carries, credited on it; a public venue's OpenStreetMap credit is said once, as VENUE_CREDIT. */
const licenceText = (item: RaverWatchItem): string => (item.license && !(item.precision === 'venue' && /OpenStreetMap/i.test(item.license))
  ? ` Licence: ${item.license}.` : '');

/** How many of a line-up a hover or a card names before saying how many more. */
export const LINEUP_NAMED = 4;

/** Who is playing, as their tags name them, and nothing else (RN13): `Playing: A, B, C, D and 2 more`. */
export function lineupText(lineup: readonly RaverWatchArtist[], lead = 'Playing:'): string {
  const named = lineup.slice(0, LINEUP_NAMED).map((a) => a.name).join(', ');
  return `${lead} ${named}${lineup.length > LINEUP_NAMED ? ` and ${lineup.length - LINEUP_NAMED} more` : ''}`;
}

/** The festivals scene news names, each with its country when it gives one: `Festival: Tomorrowland (BE)`. */
export function festivalText(festivals: readonly RaverWatchFestival[]): string {
  const named = festivals.map((f) => (f.country ? `${f.name} (${f.country.toUpperCase()})` : f.name)).join(', ');
  return `${festivals.length === 1 ? 'Festival' : 'Festivals'}: ${named}`;
}

/**
 * What a hover says: the item, its source, where it applies and when, in UTC.
 * A place given as a point is named as the 0.1° it is drawn at (RW3). A scene
 * event says its night in its own time zone and in UTC, its town and genres,
 * who is playing (RN13), and its venue only when the venue is a public one (RW12), credited. A
 * HeatRisk note says its level as the NWS names it, and until when, to the
 * hour: it applies for a day.
 */
/** Said with every drug-check alert. */
export const NO_ALERT_IS_NOT_SAFE = 'No alert is not a sign that anything is safe.';

export function describeItem(
  item: RaverWatchItem,
  regionName: (code: string) => string | null,
  moment?: RaverWatchMoment,
  /** Whether to credit a venue's source: a list of a venue's events credits it once, after them. */
  { credit = true }: { credit?: boolean } = {},
): string {
  const night = nightOf(item);
  if (night) {
    const local = item.startTzid ? inZone(night.start, item.startTzid) : '';
    const when = item.allDay ? allDayText(night, item.startTzid)
      : `${local ? `${local} (${item.startTzid}), ` : ''}${formatUtcDateTime(night.start * 1000)} until ${formatUtcDateTime(night.end * 1000)}`;
    const genres = item.genres?.length ? `: ${item.genres.map(genreName).join(', ')}` : '';
    const notBegun = moment && notBegunAt(item, moment) ? ' Not begun.' : '';
    const credited = credit && item.precision === 'venue' ? ` ${VENUE_CREDIT}` : '';
    const playing = item.lineup?.length ? ` ${lineupText(item.lineup)}.` : '';
    const festival = item.festivals?.length ? ` ${festivalText(item.festivals)}.` : '';
    return `${item.cancelled ? 'Cancelled: ' : ''}${item.title}${genres} — ${item.location ?? 'a town'}, ${when}.${playing}${festival} Listed by ${item.source}.${notBegun}${credited}${licenceText(item)}`;
  }
  const where = item.region
    ? `Applies across ${item.region === 'europe' ? 'Europe' : item.region}`
    : item.point
      ? item.precision === 'state'
        ? `Stands for a whole state or province, marked at its main city near ${degrees(item.point.lat, 'N', 'S')} ${degrees(item.point.lon, 'E', 'W')}; not a venue`
        : `Applies near ${degrees(item.point.lat, 'N', 'S')} ${degrees(item.point.lon, 'E', 'W')} (to about 11 km)`
      : item.jurisdiction
        ? `Applies to ${regionName(item.jurisdiction) ?? item.jurisdiction.toUpperCase()}`
        : 'Names no place';
  const heat = item.layer === 'HeatRisk';
  const date = (s: number) => (heat ? formatUtcDateTime : formatUtcDate)(s * 1000, { year: true });
  const risk = heat && item.heatRisk !== undefined ? ` NWS HeatRisk ${heatRiskName(item.heatRisk)} (${item.heatRisk} of 4).` : '';
  // A drug check finds only what it tests for: no alert is never "safe" (the legal review of 2026-10-17).
  const notSafe = item.layer === 'DrugCheckAlerts' ? ` ${NO_ALERT_IS_NOT_SAFE}` : '';
  return `${item.title} — ${item.source}.${risk} ${where}, from ${date(item.validFrom)} until ${date(item.validUntil)}. Level: ${levelOf(item)}.${notSafe}${licenceText(item)}`;
}

export interface NotDrawn {
  /** Past their end at this moment: hidden, as RW6 says. */
  ended: number;
  /** Not begun at this moment. */
  notYet: number;
  /** Applying to a region this globe has no outline for, such as a US state. */
  regionNotDrawn: number;
  /** Naming neither a point nor a region. */
  noPlace: number;
  /** Policy news: listed apart, not drawn (v1.1). */
  news: number;
  /** Scene news: listed apart, not drawn (v1.5, RW17). */
  sceneNews: number;
  /** Scene events in the weekend's window that do not start in their own town's weekend (RN11). */
  outsideWeekend: number;
}

/** What of these is not drawn at this moment, by why, for the key to say. */
export function notDrawn(
  items: readonly RaverWatchItem[],
  moment: RaverWatchMoment,
  regionDrawable: (code: string) => boolean,
): NotDrawn {
  const counts: NotDrawn = { ended: 0, notYet: 0, regionNotDrawn: 0, noPlace: 0, news: 0, sceneNews: 0, outsideWeekend: 0 };
  const endOf = moment.window ? moment.window.fromS : moment.atS;
  for (const item of items) {
    if (!standsAt(item, moment)) {
      if (outsideItsWeekend(item, moment)) counts.outsideWeekend += 1;
      else if (item.validUntil <= endOf) counts.ended += 1;
      else counts.notYet += 1;
      continue;
    }
    if (item.sceneNews === true) { counts.sceneNews += 1; continue; }
    if (isNews(item)) { counts.news += 1; continue; }
    if (item.point || item.region) continue;
    if (!item.jurisdiction) counts.noPlace += 1;
    else if (regionToOutline(item.jurisdiction, regionDrawable) === null) counts.regionNotDrawn += 1;
  }
  return counts;
}
