/**
 * The roster's one shape (decision D-RS, RS16–RS18): every larger kind of work, from a Cause to a Saga, as one
 * addressable event, kind 30084 Roster Item, defined in the interchange spec (rev 14, "Roster Item — 30084").
 *
 * Starcom defines the kinds; people and Mecha Jono make every instance (CR6). Nothing here names one.
 *
 * Two links, kept apart (RS18): `toward` is the work's own claim on what it is toward, which anyone may make;
 * `counts` is a parent's author saying which work they count as part of it. A reader shows which is which.
 *
 * Read strictly, as the spec states it: an event past a limit is refused, never cut, so what a reader shows is
 * all of what was signed.
 */
import { holdBackStory } from './storyCheck';

export const ROSTER_ITEM_KIND = 30084;
export const ROSTER_TOPIC = 'starcom_roster';

export const ROSTER_KINDS = [
  'cause', 'directive', 'initiative', 'campaign', 'operation', 'epic', 'quest_line', 'quest', 'adventure', 'story', 'saga',
] as const;
export type RosterKind = (typeof ROSTER_KINDS)[number];

/** Each kind's name, as a person reads it. */
export const ROSTER_KIND_NAME: Record<RosterKind, string> = {
  cause: 'Cause', directive: 'Directive', initiative: 'Initiative', campaign: 'Campaign', operation: 'Operation',
  epic: 'Epic', quest_line: 'Quest line', quest: 'Quest', adventure: 'Adventure', story: 'Story', saga: 'Saga',
};

export interface RosterLink {
  /** Another roster item (30084) or a Mission Package (30079): `<kind>:<pubkey>:<d>`. */
  coordinate: string;
  /** A relay it may be found on, or ''. */
  relay: string;
}

export interface RosterItem {
  d: string;
  kind: RosterKind;
  title: string;
  purpose?: string;
  /** What work under it must not do. */
  limits: string[];
  /** ISO 8601 UTC dates or times; '' is open at that end. */
  window?: { from: string; until: string };
  /** Jurisdiction codes, as globe intel's tag writes them. */
  places: string[];
  /** Up: what this work is toward. Anyone's claim (RS2). */
  toward: RosterLink[];
  /** Down: what this item's author counts as part of it. */
  counts: RosterLink[];
  /** The text for people. */
  text: string;
  /** A Directive's end state: what is true when it is done (RS2). */
  endState?: string;
  /** An Epic's criteria, as counts with their targets (RS7): rolled up from mission reports in step 4. */
  criteria?: Array<{ label: string; target: number }>;
  /** An Epic's evidence standard: what counts as done (RS7). */
  evidence?: string;
  /** An Operation's coordinator, when not its author (RS6, RS27). */
  coordinator?: string;
  /** An Operation ended before its window closed, or an Adventure called off by its caller: the date, and why (RS27, RS34). */
  ended?: { date: string; why: string };
  /** An Adventure's call (RS10, RS33): what is happening, its odds as its source states them, and that source. */
  call?: { what: string; odds: string; source: string };
  /** An Adventure's hazards, its places public, and a way to take part from home (RS43). */
  hazards?: string[];
  access?: 'public';
  fromHome?: string;
  /** An Initiative's first step, and whom it is for; its `purpose` is the problem (RS3). */
  firstStep?: string;
  forWhom?: string;
  /** What an Initiative grew into: a campaign or an epic its author started from it (RS54). Neither a claim nor a count. */
  grewInto?: RosterLink[];
}

/** An item as read from a signed event: whose it is, when, and where it stands. */
export interface ReadRosterItem extends RosterItem {
  author: string;
  createdAt: number;
  address: string;
  /** A story's lines held back as read, each where it was and what it held (RS58). */
  heldBack?: string[];
}

export type RosterRead =
  | { ok: true; item: ReadRosterItem }
  | { ok: false; reason: string; unknownKind?: string; retracted?: boolean };

/** The spec's limits, rev 14. */
export const ROSTER_LIMITS = {
  title: 200, purpose: 1000, limit: 300, limits: 20, places: 20, links: 100, text: 20_000,
  endState: 1000, evidence: 1000, criteria: 20, criterionLabel: 200,
  callWhat: 200, callOdds: 300, callSource: 500, hazards: 10, hazard: 300, fromHome: 300,
  firstStep: 1000, forWhom: 300, grewInto: 10,
} as const;
const WHOLE_COUNT = /^[1-9]\d{0,8}$/;

const COORDINATE = /^(30084|30079):[0-9a-f]{64}:[^\s]{1,200}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z)?$/;
const PLACE = /^[a-z0-9][a-z0-9:-]{1,59}$/;
const isKind = (k: string): k is RosterKind => (ROSTER_KINDS as readonly string[]).includes(k);

export const coordinateOf = (pubkey: string, d: string): string => `${ROSTER_ITEM_KIND}:${pubkey}:${d}`;

/** The unsigned event an item is: its kind, its tags in the spec's order, its text. */
export function rosterTemplate(item: RosterItem): { kind: number; tags: string[][]; content: string } {
  const tags: string[][] = [
    ['d', item.d],
    ['t', ROSTER_TOPIC],
    ['roster', item.kind],
    ['title', item.title],
  ];
  if (item.purpose) tags.push(['purpose', item.purpose]);
  if (item.firstStep) tags.push(['first_step', item.firstStep]);
  if (item.forWhom) tags.push(['for', item.forWhom]);
  if (item.call) tags.push(['call', item.call.what, item.call.odds, item.call.source]);
  for (const hazard of item.hazards ?? []) tags.push(['hazard', hazard]);
  if (item.access) tags.push(['access', item.access]);
  if (item.fromHome) tags.push(['from_home', item.fromHome]);
  if (item.endState) tags.push(['end_state', item.endState]);
  for (const c of item.criteria ?? []) tags.push(['criterion', c.label, String(c.target)]);
  if (item.evidence) tags.push(['evidence', item.evidence]);
  if (item.coordinator) tags.push(['coordinator', item.coordinator]);
  if (item.ended) tags.push(['ended', item.ended.date, item.ended.why]);
  for (const limit of item.limits) tags.push(['limit', limit]);
  if (item.window) tags.push(['window', item.window.from, item.window.until]);
  for (const place of item.places) tags.push(['place', place]);
  for (const link of item.toward) tags.push(['a', link.coordinate, link.relay, 'toward']);
  for (const link of item.counts) tags.push(['a', link.coordinate, link.relay, 'counts']);
  for (const link of item.grewInto ?? []) tags.push(['a', link.coordinate, link.relay, 'grew_into']);
  tags.push(['alt', `Starcom roster item: ${ROSTER_KIND_NAME[item.kind]} · ${item.title}`]);
  return { kind: ROSTER_ITEM_KIND, tags, content: item.text };
}

const plural = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** An https link, as a call's source must be: never another scheme a click would run. */
const isHttpsLink = (text: string): boolean => {
  try { return new URL(text).protocol === 'https:'; } catch { return false; }
};
const NEEDS_CALL = 'an adventure needs a call: what, its odds and their source';
const NEEDS_SAFETY = 'an adventure needs its hazards, public access and a way to take part from home';

/** An event as a roster item, or why not. */
export function readRosterEvent(event: { kind: number; pubkey: string; created_at: number; tags: string[][]; content: string }): RosterRead {
  if (event.kind !== ROSTER_ITEM_KIND) return { ok: false, reason: `not kind ${ROSTER_ITEM_KIND}` };
  const one = (name: string) => event.tags.find((t) => t[0] === name)?.[1];
  const all = (name: string) => event.tags.filter((t) => t[0] === name);
  const d = one('d');
  if (!d) return { ok: false, reason: 'no d tag' };
  const topics = all('t').map((t) => t[1]);
  if (!topics.includes(ROSTER_TOPIC)) return { ok: false, reason: `not tagged ${ROSTER_TOPIC}` };
  if (topics.includes('retracted')) return { ok: false, reason: 'retracted', retracted: true };
  const kind = one('roster') ?? '';
  if (!isKind(kind)) return { ok: false, reason: `a kind this build does not know: ${kind || 'none'}`, unknownKind: kind };
  const title = (one('title') ?? '').trim();
  if (!title) return { ok: false, reason: 'no title' };
  if (title.length > ROSTER_LIMITS.title) return { ok: false, reason: `title over ${plural(ROSTER_LIMITS.title)} characters` };
  const purpose = one('purpose');
  if (purpose !== undefined && purpose.length > ROSTER_LIMITS.purpose) return { ok: false, reason: `purpose over ${plural(ROSTER_LIMITS.purpose)} characters` };
  if (event.content.length > ROSTER_LIMITS.text) return { ok: false, reason: `text over ${plural(ROSTER_LIMITS.text)} characters` };
  const limits = all('limit').map((t) => t[1] ?? '').filter(Boolean);
  if (limits.length > ROSTER_LIMITS.limits) return { ok: false, reason: `over ${ROSTER_LIMITS.limits} limits` };
  if (limits.some((l) => l.length > ROSTER_LIMITS.limit)) return { ok: false, reason: `a limit over ${ROSTER_LIMITS.limit} characters` };
  const places = all('place').map((t) => t[1] ?? '').filter((p) => PLACE.test(p));
  if (places.length > ROSTER_LIMITS.places) return { ok: false, reason: `over ${ROSTER_LIMITS.places} places` };
  const links = (marker: 'toward' | 'counts' | 'grew_into'): RosterLink[] => all('a')
    .filter((t) => t[3] === marker && COORDINATE.test(t[1] ?? ''))
    .map((t) => ({ coordinate: t[1], relay: t[2] ?? '' }));
  const toward = links('toward');
  const counts = links('counts');
  if (toward.length > ROSTER_LIMITS.links || counts.length > ROSTER_LIMITS.links) return { ok: false, reason: `over ${ROSTER_LIMITS.links} links one way` };
  // What an Initiative grew into is another roster item: a campaign or an epic (RS54).
  const grewInto = links('grew_into').filter((l) => l.coordinate.startsWith(`${ROSTER_ITEM_KIND}:`));
  if (grewInto.length > ROSTER_LIMITS.grewInto) return { ok: false, reason: `grew into over ${ROSTER_LIMITS.grewInto} items` };
  const firstStep = one('first_step');
  if (firstStep !== undefined && firstStep.length > ROSTER_LIMITS.firstStep) return { ok: false, reason: `first step over ${plural(ROSTER_LIMITS.firstStep)} characters` };
  const forWhom = one('for');
  if (forWhom !== undefined && forWhom.length > ROSTER_LIMITS.forWhom) return { ok: false, reason: `whom it is for over ${plural(ROSTER_LIMITS.forWhom)} characters` };
  const endState = one('end_state');
  if (endState !== undefined && endState.length > ROSTER_LIMITS.endState) return { ok: false, reason: `end state over ${plural(ROSTER_LIMITS.endState)} characters` };
  const evidence = one('evidence');
  if (evidence !== undefined && evidence.length > ROSTER_LIMITS.evidence) return { ok: false, reason: `evidence over ${plural(ROSTER_LIMITS.evidence)} characters` };
  const criteria = all('criterion')
    .filter((t) => (t[1] ?? '').trim() && (t[1] ?? '').length <= ROSTER_LIMITS.criterionLabel && WHOLE_COUNT.test(t[2] ?? ''))
    .map((t) => ({ label: t[1].trim(), target: Number(t[2]) }));
  if (criteria.length > ROSTER_LIMITS.criteria) return { ok: false, reason: `over ${ROSTER_LIMITS.criteria} criteria` };
  const coordinator = one('coordinator');
  const endedTag = all('ended')[0];
  const ended = endedTag && /^\d{4}-\d{2}-\d{2}$/.test(endedTag[1] ?? '') && (endedTag[2] ?? '').length <= ROSTER_LIMITS.limit
    ? { date: endedTag[1], why: endedTag[2] ?? '' } : undefined;
  const windowTag = all('window')[0];
  const windowOk = windowTag && [windowTag[1] ?? '', windowTag[2] ?? ''].every((m) => m === '' || MOMENT.test(m));
  // An Adventure is kept only with what its safety rules need (RS10, RS33): a call quoting its source, a window
  // with both ends, a place, and a mission package as its trials.
  let call: RosterItem['call'];
  let safety: Pick<RosterItem, 'hazards' | 'access' | 'fromHome'> = {};
  if (kind === 'adventure') {
    const [, what = '', odds = '', source = ''] = all('call')[0] ?? [];
    if (what.length > ROSTER_LIMITS.callWhat) return { ok: false, reason: `call over ${plural(ROSTER_LIMITS.callWhat)} characters` };
    if (odds.length > ROSTER_LIMITS.callOdds) return { ok: false, reason: `odds over ${plural(ROSTER_LIMITS.callOdds)} characters` };
    if (source.length > ROSTER_LIMITS.callSource) return { ok: false, reason: `source over ${plural(ROSTER_LIMITS.callSource)} characters` };
    if (!what.trim() || !odds.trim() || !isHttpsLink(source)) return { ok: false, reason: NEEDS_CALL };
    if (!windowOk || !windowTag[1] || !windowTag[2]) return { ok: false, reason: 'an adventure needs a window with both ends' };
    if (places.length === 0) return { ok: false, reason: 'an adventure needs a place' };
    if (!counts.some((l) => l.coordinate.startsWith('30079:'))) return { ok: false, reason: 'an adventure needs a mission package as its trials' };
    call = { what: what.trim(), odds: odds.trim(), source };
    // What could hurt, that its places are public, and a way for anyone who cannot go out (RS43).
    const hazards = all('hazard').map((t) => (t[1] ?? '').trim()).filter(Boolean);
    const fromHome = (one('from_home') ?? '').trim();
    if (hazards.length > ROSTER_LIMITS.hazards) return { ok: false, reason: `over ${ROSTER_LIMITS.hazards} hazards` };
    if (hazards.some((h) => h.length > ROSTER_LIMITS.hazard)) return { ok: false, reason: `a hazard over ${ROSTER_LIMITS.hazard} characters` };
    if (fromHome.length > ROSTER_LIMITS.fromHome) return { ok: false, reason: `way from home over ${ROSTER_LIMITS.fromHome} characters` };
    if (hazards.length === 0 || one('access') !== 'public' || !fromHome) return { ok: false, reason: NEEDS_SAFETY };
    safety = { hazards, access: 'public', fromHome };
  }
  const read: ReadRosterItem = {
      d, kind, title,
      ...(purpose !== undefined ? { purpose } : {}),
      limits,
      ...(windowOk ? { window: { from: windowTag[1] ?? '', until: windowTag[2] ?? '' } } : {}),
      places, toward, counts,
      text: event.content,
      ...(endState !== undefined ? { endState } : {}),
      ...(criteria.length ? { criteria } : {}),
      ...(evidence !== undefined ? { evidence } : {}),
      ...(coordinator && /^[0-9a-f]{64}$/.test(coordinator) ? { coordinator } : {}),
      ...(ended ? { ended } : {}),
      ...(call ? { call } : {}),
      ...safety,
      ...(firstStep ? { firstStep } : {}),
      ...(forWhom ? { forWhom } : {}),
      ...(grewInto.length ? { grewInto } : {}),
      author: event.pubkey,
      createdAt: event.created_at,
      address: coordinateOf(event.pubkey, d),
  };
  // Another app's story is shown with what names or places people held back (RS58).
  return { ok: true, item: kind === 'story' ? holdBackStory(read) : read };
}
