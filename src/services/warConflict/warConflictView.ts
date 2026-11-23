/**
 * What of War & Conflict is drawn, and how (decisions WC1-WC3 of 2026-10-02).
 *
 * An item stands for three days from when Mecha Jono reported it: the day's
 * news and the two before, which their daily brief covers one day at a time.
 * It fades through its last quarter and is hidden after. A warning that says
 * when it ends (`valid_until`) stands until then. With a window chosen on the
 * timeline, an item stands when it was reported inside the window, or when it
 * is a warning in force during it.
 *
 * The glyph is what happened, by the item's first, most specific event; the
 * backing is the most serious thing about it, so it never rests on colour
 * alone: a critical warning glows, a line that reports deaths is ringed, and
 * the rest are discs. A hover gives each casualty claim apart and says they
 * are not added, as their rule asks: two sides' numbers are two claims.
 *
 * The war map shades the countries of each war by its tier, and a country in
 * two wars takes the higher tier.
 */
import type { ConflictItem, WarItem, WarTier } from './warConflict';
import { WAR_TIERS } from './warConflict';
import { formatUtcDateTime } from '../../utils/utcTime';
import { THEATRE_COUNTRIES } from './theatreCountries';

/** The moment the globe shows: now while live; while paused, the chosen window, ending at `atS`. */
export interface WarConflictMoment {
  atS: number;
  window: { fromS: number; untilS: number } | null;
}

/** How long an item stands from when it was reported, unless it says when it ends. */
export const ITEM_LIVE_S = 72 * 60 * 60;
/** The faintest an item is drawn before it is hidden. */
export const FADE_FLOOR = 0.3;

export type ConflictGlyph =
  | 'strike' | 'fighting' | 'unrest' | 'captive' | 'sea' | 'diplomacy' | 'troops' | 'nuclear' | 'humanitarian'
  | 'warning' | 'shutdown' | 'sanctions' | 'report';

/** Every glyph, in the order the atlas lays them out. */
export const CONFLICT_GLYPHS: readonly ConflictGlyph[] = [
  'strike', 'fighting', 'unrest', 'captive', 'sea', 'diplomacy', 'troops', 'nuclear', 'humanitarian',
  'warning', 'shutdown', 'sanctions', 'report',
];

/** Their event types (vocabulary.json, `conflict.events`), by the glyph that shows them. */
const GLYPH_OF_EVENT: Record<string, ConflictGlyph> = {
  shootdown: 'strike', drone_strike: 'strike', airstrike: 'strike', missile_strike: 'strike', shelling: 'strike',
  bombing: 'strike', explosion: 'strike',
  // Their Interchange 3.6.3 (WC5): a launch takes the strike's glyph, though no strike is reported.
  missile_launch: 'strike',
  shooting: 'fighting', ground_fighting: 'fighting', attack: 'fighting', terror: 'fighting',
  protest: 'unrest', unrest: 'unrest',
  hostage: 'captive', arrest: 'captive',
  piracy: 'sea', dark_fleet: 'sea',
  diplomatic: 'diplomacy', ceasefire_talks: 'diplomacy', security_council: 'diplomacy',
  troop_movement: 'troops',
  nuclear_safety: 'nuclear',
  humanitarian: 'humanitarian',
  airspace_warning: 'warning', travel_warning: 'warning', state_of_emergency: 'warning', election_security: 'warning',
  internet_shutdown: 'shutdown',
  sanctions: 'sanctions', export_controls: 'sanctions',
};

/** An item with no event the glyphs know, by its category. */
const GLYPH_OF_CATEGORY: Record<string, ConflictGlyph> = {
  'conflict.airspace': 'warning',
  'conflict.travel_advice': 'warning',
  'conflict.security_council': 'diplomacy',
  'conflict.nuclear_safety': 'nuclear',
};

/** The backing: a critical warning, a line that reports deaths, or a report. Worst first. */
export type ConflictBacking = 'critical' | 'deadly' | 'report';
export const CONFLICT_BACKINGS: readonly ConflictBacking[] = ['critical', 'deadly', 'report'];

/** When an item stops standing, live. */
const endOf = (item: ConflictItem) => item.validUntil ?? item.reportedAt + ITEM_LIVE_S;

/** Whether an item is drawn at this moment. */
export function standsAt(item: ConflictItem, moment: WarConflictMoment): boolean {
  if (moment.window) {
    const reportedInside = item.reportedAt >= moment.window.fromS && item.reportedAt < moment.window.untilS;
    const inForce = item.validUntil !== undefined && item.reportedAt < moment.window.untilS && item.validUntil > moment.window.fromS;
    return reportedInside || inForce;
  }
  return item.reportedAt <= moment.atS && moment.atS < endOf(item);
}

/** How solid an item is drawn: whole until its last quarter, then down to FADE_FLOOR. */
export function fadeAt(item: ConflictItem, moment: WarConflictMoment): number {
  const until = endOf(item);
  const over = Math.max(until - item.reportedAt, 1) / 4;
  const left = until - moment.atS;
  if (left >= over) return 1;
  return FADE_FLOOR + (1 - FADE_FLOOR) * Math.max(left, 0) / over;
}

export function glyphOf(item: ConflictItem): ConflictGlyph {
  const known = item.events.map((event) => GLYPH_OF_EVENT[event.id]).find(Boolean);
  return known ?? (item.category ? GLYPH_OF_CATEGORY[item.category] : undefined) ?? 'report';
}

export function backingOf(item: ConflictItem): ConflictBacking {
  if (item.role === 'critical') return 'critical';
  return item.fatal ? 'deadly' : 'report';
}

/** Their sources (`t=source:<id>`), as a reader would name them. */
const SOURCE_NAMES: Record<string, string> = {
  wikipedia: "Wikipedia's Current events portal",
  un_news: 'UN News',
  un_press: 'UN Meetings Coverage',
  easa: 'EASA conflict zone bulletins',
  travel: 'US State Department travel advice',
  fcdo: 'UK Foreign Office travel advice',
  canada: 'Global Affairs Canada travel advice',
  iaea: 'the IAEA',
  radar: 'Cloudflare Radar',
  scr: 'Security Council Report',
  gfw: 'Global Fishing Watch',
  mofa_jp: "Japan's Ministry of Foreign Affairs",
  rferl: 'Radio Free Europe/Radio Liberty',
  // Items from Wikipedia's conflict timelines, each linking the outlet the timeline cites (23 Oct: 196 of 654 notes).
  wiki_timeline: "Wikipedia's conflict timelines",
  uk_mod: 'the UK Ministry of Defence',
};
export function sourceName(id: string): string {
  return SOURCE_NAMES[id] ?? id;
}

/** Whether this build has a glyph for an event type: one without is drawn by its category, or as a report. */
export function eventGlyphKnown(id: string): boolean {
  return id in GLYPH_OF_EVENT;
}

/** Whether this build names a source: one it does not is shown by its id. */
export function sourceNamed(id: string): boolean {
  return id in SOURCE_NAMES;
}

export interface UnknownToThisBuild {
  /** Event types with no glyph, with how many items name each, most first. */
  events: Array<{ id: string; count: number }>;
  /** Sources with no name, with how many items come from each, most first. */
  sources: Array<{ id: string; count: number }>;
}

/**
 * What these items name that this build does not know (decision IX1). Their
 * spec moves on: on 3 October five event types had no glyph and were drawn as
 * plain reports, and two sources had no name, found by chance. The feed and the
 * card say it instead, and `npm run audit:interchange` lists it on demand.
 */
export function unknownIn(items: readonly ConflictItem[]): UnknownToThisBuild {
  const events = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const item of items) {
    for (const id of new Set(item.events.map((e) => e.id))) if (!eventGlyphKnown(id)) events.set(id, (events.get(id) ?? 0) + 1);
    if (item.source && !sourceNamed(item.source)) sources.set(item.source, (sources.get(item.source) ?? 0) + 1);
  }
  const ranked = (counts: Map<string, number>) => [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return { events: ranked(events), sources: ranked(sources) };
}

const PRECISION_WORDS: Record<string, string> = {
  state: 'a province, marked at its centre',
  city: 'to about 11 km',
};

/** One casualty claim, as the line reports it. */
/** One casualty claim as the line reports it: a count with its qualifier, or its words. */
export function casualtyClaim(c: ConflictItem['casualties'][number]): string {
  if (c.count === null) return `"${c.words || c.kind}"`;
  return `${c.qualifier ? `${c.qualifier} ` : ''}${c.count} ${c.kind}`;
}

/**
 * What a hover says: the line, what happened and in which war, each casualty
 * claim apart, the forces named, where, and when and from where it was
 * reported. A place given as a point is named as the 0.1° it is drawn at.
 */
export function describeConflictItem(item: ConflictItem, regionName: (code: string) => string | null): string {
  const lines = [item.title];
  const what = item.events.map((e) => e.label).join(', ');
  if (what || item.theatre) lines.push([what, item.theatre ? `in the ${item.theatre.name}` : ''].filter(Boolean).join(', '));
  if (item.casualties.length) {
    lines.push(`Casualties as reported: ${item.casualties.map(casualtyClaim).join('; ')}${item.casualties.length > 1 ? ' (separate claims, not added)' : ''}.`);
  }
  if (item.actors.length) lines.push(`Forces and states named: ${item.actors.map((a) => a.name).join('; ')}.`);
  const country = item.jurisdiction ? regionName(item.jurisdiction) ?? item.jurisdiction.toUpperCase() : null;
  const where = [item.place?.words, country].filter(Boolean).join(', ');
  if (where) lines.push(`Where: ${where}${item.point && item.precision ? ` (${PRECISION_WORDS[item.precision]})` : item.point ? '' : ' (the country, as the line names no place in it)'}.`);
  const from = item.source ? ` from ${sourceName(item.source)}` : '';
  lines.push(`Reported ${formatUtcDateTime(item.reportedAt * 1000, { year: true })}${from}${item.license ? ` (${item.license})` : ''}.`);
  if (item.validUntil !== undefined) lines.push(`In force until ${formatUtcDateTime(item.validUntil * 1000, { year: true })}.`);
  return lines.join('\n');
}

/**
 * Each country on the war map, filled where a war is fought and outlined where it
 * is only on the war's list (theatre-lens.md, TL1, TL11, TL12).
 *
 * A war is fought in its theatres' countries (Mecha Jono's vocabulary). A war on
 * no theatre is fought in its one country when it lists one; listing several, it
 * says nothing of where in them, so they are only outlined. A country one war fills
 * is filled, at the worst tier among the wars filling it, whatever another war
 * outlines there; a country only outlined takes the worst tier among those.
 */
export function warMapCountries(
  wars: readonly WarItem[],
  theatreCountries: Readonly<Record<string, readonly string[]>> = THEATRE_COUNTRIES,
): Map<string, { tier: WarTier; wars: string[]; filled: boolean }> {
  const rank = (tier: WarTier) => WAR_TIERS.indexOf(tier);
  const filled = new Map<string, Array<{ tier: WarTier; name: string }>>();
  const outlined = new Map<string, Array<{ tier: WarTier; name: string }>>();
  const add = (into: typeof filled, code: string, war: WarItem) => into.set(code, [...(into.get(code) ?? []), { tier: war.tier, name: war.name }]);
  for (const war of wars) {
    const listed = [...new Set(war.countries.map((code) => code.split('-')[0]))];
    const fought = new Set(war.theatres.flatMap((t) => theatreCountries[t.slug] ?? []));
    if (fought.size === 0 && listed.length === 1) fought.add(listed[0]);
    for (const code of fought) add(filled, code, war);
    for (const code of listed) if (!fought.has(code)) add(outlined, code, war);
  }
  const entry = (list: Array<{ tier: WarTier; name: string }>, isFilled: boolean) => {
    const sorted = [...list].sort((a, b) => rank(a.tier) - rank(b.tier));
    return { tier: sorted[0].tier, wars: [...new Set(sorted.map((w) => w.name))], filled: isFilled };
  };
  const map = new Map([...filled].map(([code, list]) => [code, entry(list, true)] as const));
  for (const [code, list] of outlined) if (!map.has(code)) map.set(code, entry(list, false));
  return map;
}

/** A state's forces named in an item, from their country to where it happened (theatre-lens.md, TL6). */
export interface StateForceArc {
  itemId: string;
  /** The force, as the item names it. */
  actor: string;
  /** Their country, as an outline's code. */
  from: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
}

/**
 * An arc for each state force an item names acting outside its own country, from
 * that country's middle to where the item happened. Only state forces (TL6): an
 * armed group's country says where it comes from, not that a state acted. Only
 * where the item says where it happened, so "another country" can be told; and
 * one arc a country an item names, however many of its forces it names.
 */
export function stateForceArcs(
  items: readonly ConflictItem[],
  places: {
    /** Where the item happened, as the globe draws it, or null. */
    placeOf(item: ConflictItem): { lat: number; lng: number } | null;
    /** A code as an outline's, or null when there is none. */
    countryOf(code: string): string | null;
    middleOf(code: string): { lat: number; lng: number } | null;
  },
): StateForceArc[] {
  const arcs: StateForceArc[] = [];
  for (const item of items) {
    const where = item.jurisdiction ? places.countryOf(item.jurisdiction) : null;
    const end = where ? places.placeOf(item) : null;
    if (!where || !end) continue;
    const seen = new Set<string>();
    for (const actor of item.actors) {
      const from = actor.kind === 'state_force' && actor.country ? places.countryOf(actor.country) : null;
      const start = from && from !== where && !seen.has(from) ? places.middleOf(from) : null;
      if (!from || !start) continue;
      seen.add(from);
      arcs.push({ itemId: item.id, actor: actor.name, from, start, end });
    }
  }
  return arcs;
}

/**
 * Whether an Intel Report is one of War & Conflict's notes. They carry
 * `t=starcom_intel` too, so Intel Reports reads them; while War & Conflict is
 * on it draws them, and Intel Reports leaves them out, so each is drawn once.
 */
export function isWarConflictNote(tags: readonly string[] | undefined): boolean {
  return !!tags && (tags.includes('conflict_desk') || tags.includes('war_map'));
}
