/**
 * A shot: one declarative description of one picture (decision IM1; globe
 * record, section 21).
 *
 * One description drives the screen, the link, the card and the clip, so what
 * a person sees and what is posted are the same picture. Mecha Jono writes a
 * shot; `planShot` stages it and says what is in frame; `renderShot` makes the
 * card, which carries the shot as it was drawn, so any image can be made again.
 *
 * ─── STRICT WHERE IT PROTECTS THE PICTURE ──────────────────────────────────
 *
 *   An unknown field is refused, so a misspelt key never silently does nothing.
 *   A field that would change WHAT the picture shows, and is not built yet, is
 *   refused with what will build it: a caller must never post a picture of
 *   something other than what it asked for.
 *   A field that only changes HOW it looks, and is not built yet, is dropped
 *   with a note, and the picture is made without it.
 *
 * The guardrails are not fields, so no shot can switch one off: RLSH is never
 * drawn, a camera is never below one globe radius, a link is never finer than
 * 0.01°, and every caveat that applies is on the card.
 */
import type { ChartAsk, ChartDrawn } from './chartCard';
import { ZODIAC_FRAMES, type ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { CARD_FITS, CARD_PRESETS, type CardFit, type CardPreset } from './shareCardLayout';
import { HISTORY_FLOOR_S } from '../timebar/timebarRange';
import { SHARE_ALTITUDE_CEILING, SHARE_ALTITUDE_FLOOR } from './shareReports';
import { CARD_TEMPLATES, TEMPLATE_SPECS, type CardTemplate } from './cardTemplates';
import { GLOBE_LIGHT_MODE_LABELS, GLOBE_SKIN_LABELS, type GlobeLightMode, type GlobeSkin } from '../../../services/globe/globeAppearance';
import { areaCodeOf } from '../areas/areaRegistry';
import { TERRITORY_STYLES, isTerritoryStyle, type TerritoryStyle } from '../../../geopolitical/theme/territoryStyles';
import { MARKER_STYLES, isMarkerStyle, type MarkerStyle } from '../../../components/Globe/markerStyles';
import { isPsiAddress } from './psiAddress';
import { PSI_FIELD_LOOKS, type PsiFieldLook } from '../../../services/psiWatch/psiField/psiFieldLooks';

export const SHOT_VERSION = 1 as const;
/** As many layers beside the subject's as a deeplink carries, so a shot's link reads back as it. */
const MAX_PINS = 4;
const ADDRESS_MAX = 300;
const SCALE_MAX = 4;
export const SHOT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ShotImageType = (typeof SHOT_IMAGE_TYPES)[number];

export type ShotSubject =
  | { address: string }
  | { view: { lat: number; lng: number; altitude: number } }
  /**
   * The War & Conflict Brief's front page (IM16): `latest`, or a UTC day as `YYYY-MM-DD`;
   * with `theatres`, narrowed to its worst theatres, 1 to 4, lit together on one planet
   * (theatre-lens.md, TL15).
   */
  | { brief: string; theatres?: number }
  /** An area, by its code (BA22, BA23): framed to its largest part, its Intel Reports counted. */
  | { area: string }
  /** A War & Conflict theatre, by its slug (theatre-lens.md, TL3): framed to its items, its countries lit. */
  | { theatre: string }
  /** Tonight's scene events, the twelve hours from the shot's moment, on their front page (raver-nights.md, RN3). */
  | { tonight: 'latest' }
  /** Hero Watch's week on its front page: its relief, lifeboat launches and field missions (hero-watch.md, HW10). */
  | { week: 'latest' }
  /** The declassified desk's day on its front page (plan H9): `latest`, or a UTC day as `YYYY-MM-DD`. */
  | { declassified: string }
  /**
   * A Psi Watch sky event or window by its address (decision D-PW, PW62; the kit's `schemas_psi.md` §3.6), drawn at
   * its exact moment or at a unix second inside its window. As drawn, `at` is the moment, in unix seconds.
   */
  | { psiEvent: string; at: 'exact' | number }
  /** The PsiOps Briefing (D-PW, PW62, PW77): the week from the shot's moment on its front page, a strip under the globe. */
  | { psiBriefing: 'latest' };
export type ShotTime =
  | { live: true }
  | { window: { from: number; until: number } }
  /** A moment, in whole unix seconds: the timeline paused there, the sun there (IM20). */
  | { at: number };
export interface ShotAppearance {
  skin?: GlobeSkin | 'auto'; light?: GlobeLightMode; nightFill?: number;
  /** The territories' style on the card (decision K5, v33). Unstated, a card draws Quiet, whatever the screen draws. */
  territories?: TerritoryStyle;
  /** Natural Earth's country names on the card (decision K5, TS10, v34). Unstated, a card draws none. */
  countryNames?: boolean;
  /**
   * One mark style for every layer that takes one, whatever the page's person picked (plan H4, v54).
   * Unstated, each layer draws the page's: its default (Intel Reports a halo disc) or the person's pick.
   */
  markStyle?: MarkerStyle;
  /** The ψ field's looks (Mecha Jono, 30 Oct): named, or heat and contours, whoever's panel is open. */
  psiLooks?: PsiFieldLook[];
}
export interface ShotOutput {
  type?: ShotImageType; quality?: number; scale?: number; maxBytes?: number;
  /** Whether the card returns its alt text, written from what it states (block I, item 5). Default true. */
  alt?: boolean;
}

/**
 * A Timestream strip under the picture (D-PW, PW62, PW77): `true` for the card's moment ±3 days with Windows, Kp and
 * the event's bodies, or its own span in unix seconds and its lanes. As drawn, its span and lanes stated.
 */
export const STRIP_LANES = ['windows', 'kp', 'bodies'] as const;
export type StripAsk = true | { from?: number; until?: number; lanes?: Array<(typeof STRIP_LANES)[number]> };
export interface StripDrawn { from: number; until: number; lanes: Array<(typeof STRIP_LANES)[number]> }

/** What a caller asked for, read and checked: unstated parts are left to the page as it stands. */
export interface AskedShot {
  v: typeof SHOT_VERSION;
  subject: ShotSubject;
  layers?: { primary?: string; pins?: string[] };
  time?: ShotTime;
  emphasis: { featured: boolean };
  /** How the card frames the planet: what the camera framed, or the whole planet. */
  framing?: { fit?: CardFit };
  appearance?: ShotAppearance;
  /** Its preset, and Mecha Jono's template for it (IM5, IM14). */
  /** `strip: false` says none, where a subject draws one unasked (the Briefing). */
  card?: { preset?: CardPreset; template?: CardTemplate; qr?: boolean; inset?: boolean; strip?: StripAsk | false; chart?: ChartAsk };
  output?: ShotOutput;
}

/** A shot as it was drawn: every part stated, the unstated ones as the page had them. */
export interface Shot {
  v: typeof SHOT_VERSION;
  subject: ShotSubject;
  layers: { primary: string | null; pins: string[] };
  time: ShotTime;
  emphasis: { featured: boolean };
  framing: { fit: CardFit };
  appearance: { skin: GlobeSkin | 'auto'; light: GlobeLightMode; nightFill: number; territories: TerritoryStyle; countryNames?: true; markStyle?: MarkerStyle; psiLooks?: PsiFieldLook[] };
  /** The template as drawn: the item's own where it says (IM14). Absent on the default card. */
  card: { preset: CardPreset; template?: CardTemplate; qr?: boolean; inset?: boolean; strip?: StripDrawn; chart?: ChartDrawn };
  output: ShotOutput & { type: ShotImageType; scale: number };
}

export type ShotReading = { ok: true; shot: AskedShot; notes: string[] } | { ok: false; reason: string };

/**
 * Not built yet: what would change what the picture shows (refused), and what
 * only changes how it looks (dropped with a note). Each says what will build it.
 */
const REFUSED_UNTIL_BUILT: Record<string, string> = {
  'subject.mission': 'a mission as the subject is not built yet: it comes with renderMission',
};
const NOTED_UNTIL_BUILT: Record<string, string> = {
  'framing.tilt': 'framing.tilt is not built yet: drawn looking straight down',
  'framing.padding': 'framing.padding is not built yet: framed with the default margin',
  'framing.offset': 'framing.offset is not built yet: the subject is centred',
  'layers.opacity': 'layers.opacity is not built yet: each layer is drawn at its own opacity',
  'emphasis.others': 'emphasis.others is not built yet: a featured item dims the rest, as it always has',
  'appearance.clouds': 'appearance.clouds is not built yet: the quality setting decides, and the card says which',
  'appearance.atmosphere': 'appearance.atmosphere is not built yet: the quality setting decides, and the card says which',
  'card.timeZone': 'card.timeZone is not built yet: times are given in UTC',
  'card.callouts': 'card.callouts is not built yet: only the featured item is labelled',
};
/** The layers Hero Watch's week is drawn on, one of them the week's card's primary. */
const HERO_WATCH_SECTIONS: readonly unknown[] = ['Relief', 'FieldMissions', 'Lifeboats'];
/** The Psi Watch layers a psi event's card may draw first (D-PW, PW62). */
const PSI_EVENT_LAYERS: readonly unknown[] = ['PsiLines', 'PsiWindows', 'PsiField', 'PsiZones', 'PsiRifts'];
const BUILT = [
  'v', 'subject.address', 'subject.view', 'subject.brief', 'subject.area', 'subject.theatre', 'subject.theatres', 'subject.tonight', 'subject.week', 'subject.declassified',
  'subject.psiEvent', 'subject.at', 'subject.psiBriefing', 'layers.primary', 'layers.pins', 'time.live', 'time.window', 'time.at',
  'emphasis.featured', 'framing.fit', 'appearance.skin', 'appearance.light', 'appearance.nightFill', 'appearance.territories', 'appearance.countryNames', 'appearance.markStyle', 'appearance.psiLooks', 'card.preset',
  'card.template', 'card.qr', 'card.inset', 'card.strip', 'card.chart', 'output.type', 'output.quality', 'output.scale', 'output.maxBytes', 'output.alt',
];

/** Every field a shot may carry, as the share contract publishes it. */
export const SHOT_FIELDS = {
  built: BUILT,
  notBuilt: [...Object.keys(REFUSED_UNTIL_BUILT), ...Object.keys(NOTED_UNTIL_BUILT)],
} as const;

const SECTIONS = ['subject', 'layers', 'time', 'emphasis', 'framing', 'appearance', 'card', 'output'] as const;
const KNOWN = new Set([...BUILT, ...SHOT_FIELDS.notBuilt]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
// Back to the quakes' history, 2150 BC (D-EQ, EQ15): seconds before 1970 are negative.
const wholeSeconds = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= HISTORY_FLOOR_S;

class Refusal extends Error {}
const refuse = (reason: string): never => { throw new Refusal(reason); };

/**
 * A shot, read: what the caller asked for and notes on what was dropped, or
 * why it was refused. `layers` are the ids this build has (listLayers).
 */
export function readShot(input: unknown, known: { layers: readonly string[] }): ShotReading {
  try {
    return readOrThrow(input, known);
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    throw e;
  }
}

function readOrThrow(input: unknown, known: { layers: readonly string[] }): ShotReading {
  if (!isObject(input)) refuse('A shot is an object: { subject, layers?, time?, emphasis?, appearance?, card?, output? }.');
  const shot = input as Record<string, unknown>;
  const notes: string[] = [];

  // Every field is one this version knows, or it is refused before anything else is read.
  for (const [key, value] of Object.entries(shot)) {
    if (key === 'v') continue;
    if (!(SECTIONS as readonly string[]).includes(key)) refuse(`unknown field "${key}"`);
    if (!isObject(value)) refuse(`"${key}" is an object`);
    for (const field of Object.keys(value as object)) {
      if (!KNOWN.has(`${key}.${field}`)) refuse(`unknown field "${key}.${field}"`);
    }
  }
  if (shot.v !== undefined && shot.v !== SHOT_VERSION) refuse(`a shot of version ${String(shot.v)}: this build reads version ${SHOT_VERSION}`);
  const section = (name: (typeof SECTIONS)[number]) => (shot[name] ?? {}) as Record<string, unknown>;
  const stated = (name: (typeof SECTIONS)[number], field: string) => Object.prototype.hasOwnProperty.call(section(name), field);
  for (const path of Object.keys(REFUSED_UNTIL_BUILT)) {
    const [name, field] = path.split('.') as [(typeof SECTIONS)[number], string];
    if (stated(name, field)) refuse(REFUSED_UNTIL_BUILT[path]);
  }
  for (const path of Object.keys(NOTED_UNTIL_BUILT)) {
    const [name, field] = path.split('.') as [(typeof SECTIONS)[number], string];
    if (stated(name, field)) notes.push(NOTED_UNTIL_BUILT[path]);
  }

  const out: AskedShot = { v: SHOT_VERSION, subject: readSubject(section('subject'), notes), emphasis: { featured: false } };

  const layers = section('layers');
  if (stated('layers', 'primary') || stated('layers', 'pins')) {
    const has = (id: unknown): id is string => typeof id === 'string' && known.layers.includes(id);
    const read: { primary?: string; pins?: string[] } = {};
    if (stated('layers', 'primary')) {
      const primary = layers.primary;
      if (primary === 'RLSH') refuse('RLSH is never drawn in a card or a clip');
      if (primary === 'SafetyWindows') refuse('Safety windows are never drawn in a card or a clip');
      if (!has(primary)) return refuse(`unknown layer ${String(primary)}: listLayers() lists what this build has`);
      if ('brief' in out.subject && primary !== 'WarConflict') refuse('A brief draws War & Conflict: pin other layers beside it with layers.pins');
      if ('week' in out.subject && !HERO_WATCH_SECTIONS.includes(primary)) {
        refuse('The week\'s card draws Hero Watch, so its primary layer is Relief, FieldMissions or Lifeboats: pin others beside it with layers.pins');
      }
      if ('tonight' in out.subject && primary !== 'SceneEvents') {
        refuse('Tonight\'s card draws Scene events, so its primary layer is SceneEvents: pin others beside it with layers.pins');
      }
      if ('theatre' in out.subject && primary !== 'WarConflict') {
        refuse('A card about a theatre draws War & Conflict, so its primary layer is WarConflict: pin others beside it with layers.pins');
      }
      if ('area' in out.subject && primary !== 'IntelReports') {
        refuse('A card about an area counts its Intel Reports, so its primary layer is IntelReports: pin others beside it with layers.pins');
      }
      if (('psiEvent' in out.subject || 'psiBriefing' in out.subject) && !PSI_EVENT_LAYERS.includes(primary)) {
        refuse('A Psi Watch card draws Psi Watch, so its primary layer is one of PsiLines, PsiWindows, PsiField, PsiZones or PsiRifts: pin others beside it with layers.pins');
      }
      read.primary = primary;
    }
    if (stated('layers', 'pins')) {
      if (!Array.isArray(layers.pins)) refuse('layers.pins is a list of layer ids');
      const pins = layers.pins as unknown[];
      if (pins.includes('RLSH')) refuse('RLSH is never drawn in a card or a clip');
      if (pins.includes('SafetyWindows')) refuse('Safety windows are never drawn in a card or a clip');
      const unknown = pins.filter((id) => !has(id));
      if (unknown.length) refuse(`unknown layer ${unknown.map(String).join(', ')}: listLayers() lists what this build has`);
      if (pins.length > MAX_PINS) refuse(`at most ${MAX_PINS} layers beside the subject's, as a link carries`);
      read.pins = [...new Set(pins as string[])];
    }
    out.layers = read;
  }

  const time = section('time');
  if (['live', 'window', 'at'].filter((kind) => stated('time', kind)).length > 1) refuse('time is live, a window or a moment: one of them');
  if (stated('time', 'live')) {
    if (time.live !== true) refuse('time.live is true; to ask for a window, give time.window');
    out.time = { live: true };
  } else if (stated('time', 'window')) {
    const window = time.window as Record<string, unknown> | undefined;
    if (!isObject(window) || !wholeSeconds(window.from) || !wholeSeconds(window.until) || window.from >= window.until) {
      refuse('time.window is { from, until } in whole unix seconds, from before until');
    }
    out.time = { window: { from: (window as { from: number }).from, until: (window as { until: number }).until } };
    // Tonight is twelve hours from one moment (RN3): a window leaves it unsaid which.
    if ('tonight' in out.subject) refuse('tonight is the twelve hours from one moment: give time.at, or time.live for now');
    // The week's card shows what stands at one moment, beside the roundup of its week.
    if ('week' in out.subject) refuse('the week\'s card shows what stands at one moment: give time.at, or time.live for now');
    // The Briefing is the week from one moment (PW77).
    if ('psiBriefing' in out.subject) refuse('the PsiOps Briefing is the week from one moment: give time.at, or time.live for now');
  } else if (stated('time', 'at')) {
    if (!wholeSeconds(time.at)) refuse('time.at is a moment in whole unix seconds');
    out.time = { at: time.at as number };
  }
  // A psi event's moment is its subject's `at`; a shot as drawn repeats it as time.at, which reads back the same (PW62).
  if ('psiEvent' in out.subject && out.time && !('at' in out.time && out.time.at === out.subject.at)) {
    refuse('a psi event is drawn at its subject.at, "exact" or a unix second inside its window: give the moment there, not in time');
  }

  const featuredAsked = section('emphasis').featured;
  if (featuredAsked !== undefined && typeof featuredAsked !== 'boolean') refuse('emphasis.featured is true or false');
  const featured = 'address' in out.subject ? featuredAsked !== false : false;
  if (featuredAsked === true && !('address' in out.subject)) refuse('emphasis.featured needs an address as the subject: there is no item to feature');
  out.emphasis = { featured };

  if (stated('framing', 'fit')) {
    const fit = section('framing').fit;
    if (typeof fit !== 'string' || !(CARD_FITS as readonly string[]).includes(fit)) refuse(`fit "${String(fit)}": the fits are ${CARD_FITS.join(', ')}`);
    out.framing = { fit: fit as CardFit };
  }

  const appearance = section('appearance');
  const look: ShotAppearance = {};
  if (stated('appearance', 'skin')) {
    if (typeof appearance.skin !== 'string' || !(appearance.skin in GLOBE_SKIN_LABELS)) refuse(`skin "${String(appearance.skin)}": the skins are ${Object.keys(GLOBE_SKIN_LABELS).join(', ')}`);
    look.skin = appearance.skin as GlobeSkin | 'auto';
  }
  if (stated('appearance', 'light')) {
    if (typeof appearance.light !== 'string' || !(appearance.light in GLOBE_LIGHT_MODE_LABELS)) refuse(`light "${String(appearance.light)}": the lights are ${Object.keys(GLOBE_LIGHT_MODE_LABELS).join(', ')}`);
    look.light = appearance.light as GlobeLightMode;
  }
  if (stated('appearance', 'nightFill')) {
    if (!finite(appearance.nightFill) || appearance.nightFill < 0 || appearance.nightFill > 1) refuse('appearance.nightFill is 0 to 1');
    look.nightFill = appearance.nightFill as number;
  }
  if (stated('appearance', 'territories')) {
    if (!isTerritoryStyle(appearance.territories)) refuse(`territories "${String(appearance.territories)}": the styles are ${TERRITORY_STYLES.join(', ')}`);
    look.territories = appearance.territories as TerritoryStyle;
  }
  if (stated('appearance', 'countryNames')) {
    if (typeof appearance.countryNames !== 'boolean') {
      refuse("appearance.countryNames is true or false: Natural Earth's country names, by their rank and the picture's zoom, never over a mark");
    }
    look.countryNames = appearance.countryNames as boolean;
  }
  if (stated('appearance', 'markStyle')) {
    if (!isMarkerStyle(appearance.markStyle)) refuse(`markStyle "${String(appearance.markStyle)}": the styles are ${MARKER_STYLES.join(', ')}`);
    look.markStyle = appearance.markStyle as MarkerStyle;
  }
  if (stated('appearance', 'psiLooks')) {
    const named = appearance.psiLooks;
    const known = PSI_FIELD_LOOKS as readonly unknown[];
    if (!Array.isArray(named) || named.length === 0 || named.some((l) => !known.includes(l)) || new Set(named).size !== named.length) {
      refuse(`appearance.psiLooks names the ψ field's looks to draw, each once: any of ${PSI_FIELD_LOOKS.join(', ')}`);
    }
    // In the panel's order, whatever order they were named in.
    look.psiLooks = PSI_FIELD_LOOKS.filter((l) => (named as unknown[]).includes(l));
  }
  if (Object.keys(look).length) out.appearance = look;

  const card: NonNullable<AskedShot['card']> = {};
  if (stated('card', 'preset')) {
    const preset = section('card').preset;
    if (typeof preset !== 'string' || !(preset in CARD_PRESETS)) refuse(`unknown preset "${String(preset)}": the contract lists ${Object.keys(CARD_PRESETS).join(', ')}`);
    card.preset = preset as CardPreset;
  }
  if (stated('card', 'template')) {
    // Which template, here; whether the item agrees with it, when the item is known (shotStage, IM14).
    const template = section('card').template;
    if (typeof template !== 'string' || !(CARD_TEMPLATES as readonly string[]).includes(template)) {
      refuse(`unknown template "${String(template)}": the templates are ${CARD_TEMPLATES.join(', ')}`);
    }
    const spec = TEMPLATE_SPECS[template as CardTemplate];
    if (spec.notBuilt) refuse(spec.notBuilt);
    if ('brief' in out.subject && template !== 'conflict_brief') refuse('a brief\'s card is conflict_brief');
    // The templates are Mecha Jono's, and none of them is a page about tonight: its title says what it is.
    if ('tonight' in out.subject) refuse('tonight\'s card takes no template: none of the templates is a page about tonight');
    if ('week' in out.subject) refuse('the week\'s card takes no template: none of the templates is a page about Hero Watch\'s week');
    if ('declassified' in out.subject && template !== 'declassified') refuse('the declassified day\'s card is declassified');
    if (template === 'declassified' && !('declassified' in out.subject)) {
      refuse('declassified is the declassified desk\'s front page: its subject is { declassified: "latest" } or a UTC day');
    }
    if (('psiEvent' in out.subject || 'psiBriefing' in out.subject) && template !== 'psi') refuse('a Psi Watch card is psi');
    if (template === 'psi' && !('psiEvent' in out.subject || 'psiBriefing' in out.subject)) {
      refuse('psi is a Psi Watch card: its subject is { psiEvent, at } or { psiBriefing: "latest" }');
    }
    if (spec.about === 'item' && !featured) refuse(`${String(template)} is a card about one item, and this shot features none`);
    if (template === 'conflict_brief' && !('brief' in out.subject)) {
      refuse(`${String(template)} is the brief's front page: its subject is { brief: "latest" } or a UTC day`);
    }
    card.template = template as CardTemplate;
  }
  if (stated('card', 'qr')) {
    const { qr } = section('card');
    if (typeof qr !== 'boolean') refuse('card.qr is true or false: a QR code of the view, with the footer, for an image reposted where its link does not survive');
    card.qr = qr as boolean;
  }
  if (stated('card', 'inset')) {
    const { inset } = section('card');
    if (typeof inset !== 'boolean') {
      refuse('card.inset is true or false: a close-up of the featured item among its neighbours, in the picture\'s corner, for a public venue or a heat town');
    }
    card.inset = inset as boolean;
  }
  if (stated('card', 'strip')) {
    const { strip } = section('card');
    if (strip === true || strip === false) card.strip = strip;
    else {
      if (!isObject(strip)) refuse('card.strip is true, for the card\'s moment ±3 days, or { from, until, lanes } in whole unix seconds');
      const ask = strip as Record<string, unknown>;
      const unknown = Object.keys(ask).filter((k) => !['from', 'until', 'lanes'].includes(k));
      if (unknown.length) refuse(`unknown field "card.strip.${unknown[0]}": a strip is { from, until, lanes }`);
      if (ask.from !== undefined && !wholeSeconds(ask.from)) refuse('card.strip.from is a moment in whole unix seconds');
      if (ask.until !== undefined && !wholeSeconds(ask.until)) refuse('card.strip.until is a moment in whole unix seconds');
      if (ask.from !== undefined && ask.until !== undefined && (ask.from as number) >= (ask.until as number)) refuse('card.strip runs from before until');
      if (ask.lanes !== undefined && (!Array.isArray(ask.lanes) || ask.lanes.length === 0
        || ask.lanes.some((l) => !(STRIP_LANES as readonly unknown[]).includes(l)))) {
        refuse(`card.strip.lanes is a list of ${STRIP_LANES.join(', ')}`);
      }
      card.strip = {
        ...(ask.from !== undefined ? { from: ask.from as number } : {}),
        ...(ask.until !== undefined ? { until: ask.until as number } : {}),
        ...(ask.lanes !== undefined ? { lanes: [...new Set(ask.lanes as Array<(typeof STRIP_LANES)[number]>)] } : {}),
      };
    }
  }
  /*
   * An event chart over a corner of the picture (D-PW, PW87): when and where it happened, and, unless said, the sky
   * at the card's moment outside it, in the Galactic Centre frame unless said.
   */
  if (stated('card', 'chart')) {
    const { chart } = section('card');
    if (!isObject(chart)) refuse('card.chart is { at, lat, lng, title?, cursorAt?, frame? }: when and where, in unix seconds and degrees');
    const ask = chart as Record<string, unknown>;
    const unknown = Object.keys(ask).filter((k) => !['at', 'lat', 'lng', 'title', 'cursorAt', 'frame'].includes(k));
    if (unknown.length) refuse(`unknown field "card.chart.${unknown[0]}": a chart is { at, lat, lng, title, cursorAt, frame }`);
    if (!wholeSeconds(ask.at)) refuse('card.chart.at is when it happened, in whole unix seconds');
    if (!finite(ask.lat) || Math.abs(ask.lat) > 90) refuse('card.chart.lat is a latitude, -90 to 90');
    if (!finite(ask.lng) || Math.abs(ask.lng) > 180) refuse('card.chart.lng is a longitude, -180 to 180');
    if (ask.title !== undefined && (typeof ask.title !== 'string' || !ask.title.trim() || ask.title.length > 160)) refuse('card.chart.title is words, 160 characters at most');
    if (ask.cursorAt !== undefined && !wholeSeconds(ask.cursorAt)) refuse('card.chart.cursorAt is the sky outside\'s moment, in whole unix seconds');
    if (ask.frame !== undefined && !(ZODIAC_FRAMES as readonly unknown[]).includes(ask.frame)) refuse(`card.chart.frame is ${ZODIAC_FRAMES.join(' or ')}`);
    card.chart = {
      at: ask.at as number, lat: ask.lat as number, lng: ask.lng as number,
      ...(typeof ask.title === 'string' ? { title: ask.title.trim() } : {}),
      ...(ask.cursorAt !== undefined ? { cursorAt: ask.cursorAt as number } : {}),
      ...(ask.frame !== undefined ? { frame: ask.frame as ZodiacFrame } : {}),
    };
  }
  if (Object.keys(card).length) out.card = card;

  const output = section('output');
  const made: ShotOutput = {};
  if (stated('output', 'type')) {
    if (!(SHOT_IMAGE_TYPES as readonly unknown[]).includes(output.type)) refuse(`output.type "${String(output.type)}": the types are ${SHOT_IMAGE_TYPES.join(', ')}`);
    made.type = output.type as ShotImageType;
  }
  if (stated('output', 'quality')) {
    if (!finite(output.quality) || output.quality <= 0 || output.quality > 1) refuse('output.quality is above 0 and at most 1');
    if (made.type === 'image/png') notes.push('output.quality was not used: a PNG has no quality');
    else made.quality = output.quality as number;
  }
  if (stated('output', 'scale')) {
    if (!finite(output.scale) || output.scale <= 0 || output.scale > SCALE_MAX) refuse(`output.scale is above 0 and at most ${SCALE_MAX}`);
    made.scale = output.scale as number;
  }
  if (stated('output', 'maxBytes')) {
    if (!Number.isSafeInteger(output.maxBytes) || (output.maxBytes as number) <= 0) refuse('output.maxBytes is a whole number of bytes above 0');
    made.maxBytes = output.maxBytes as number;
  }
  if (stated('output', 'alt')) {
    // Never the caller's words: alt text that differed from the card would be a second card nobody can see.
    if (typeof output.alt !== 'boolean') refuse('output.alt is true or false: the alt text is written from what the card states');
    made.alt = output.alt as boolean;
  }
  if (Object.keys(made).length) out.output = made;

  return { ok: true, shot: out, notes };
}

/** `latest`, or a real UTC day as `YYYY-MM-DD`. */
const isDay = (day: unknown): boolean => day === 'latest'
  || (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day);

function readSubject(subject: Record<string, unknown>, notes: string[]): ShotSubject {
  const kinds = ['address', 'view', 'brief', 'area', 'theatre', 'tonight', 'week', 'declassified', 'psiEvent', 'psiBriefing'].filter((kind) => Object.prototype.hasOwnProperty.call(subject, kind));
  if (kinds.length === 0) {
    refuse('a shot needs a subject: { address } of an item listReports() lists, { view: { lat, lng, altitude } }, { brief: "latest" }, { area } as listAreas() names one, { theatre } as the War & Conflict Brief names one, { tonight: "latest" }, { week: "latest" }, { declassified: "latest" }, { psiEvent, at } or { psiBriefing: "latest" }');
  }
  if (kinds.length > 1) refuse('a shot has one subject: an address, a view, a brief, an area, a theatre, tonight, the week, the declassified day, a psi event or the PsiOps Briefing');
  const narrowed = Object.prototype.hasOwnProperty.call(subject, 'theatres');
  if (narrowed && kinds[0] !== 'brief') refuse('subject.theatres goes with subject.brief: how many of its theatres to light, worst first');
  const timed = Object.prototype.hasOwnProperty.call(subject, 'at');
  if (timed && kinds[0] !== 'psiEvent') refuse('subject.at goes with subject.psiEvent: the moment the psi event is drawn at');
  if (kinds[0] === 'psiBriefing') {
    if (subject.psiBriefing !== 'latest') refuse('subject.psiBriefing is "latest": the PsiOps Briefing, the week from the shot\'s moment');
    return { psiBriefing: 'latest' };
  }
  if (kinds[0] === 'psiEvent') {
    if (!isPsiAddress(subject.psiEvent)) {
      refuse('subject.psiEvent is a Psi Watch sky event\'s or window\'s address, 31923:<key>:psi-sky-… or 31923:<key>:psi-window-…');
    }
    const at = timed ? subject.at : 'exact';
    if (at !== 'exact' && !wholeSeconds(at)) refuse('subject.at is "exact" or a moment inside the event\'s window, in whole unix seconds');
    return { psiEvent: subject.psiEvent as string, at: at as 'exact' | number };
  }
  if (kinds[0] === 'declassified') {
    if (!isDay(subject.declassified)) refuse('subject.declassified is "latest" or a UTC day as YYYY-MM-DD: the declassified desk\'s releases of that day');
    return { declassified: subject.declassified as string };
  }
  if (kinds[0] === 'week') {
    if (subject.week !== 'latest') refuse('subject.week is "latest": Hero Watch\'s week as it stands, with the latest roundup read');
    return { week: 'latest' };
  }
  if (kinds[0] === 'tonight') {
    if (subject.tonight !== 'latest') refuse('subject.tonight is "latest": tonight, the twelve hours from the shot\'s moment');
    return { tonight: 'latest' };
  }
  if (kinds[0] === 'theatre') {
    const slug = typeof subject.theatre === 'string' ? subject.theatre.trim().toLowerCase() : '';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      refuse('subject.theatre is a theatre\'s slug, such as "russia-ukraine": the War & Conflict Brief names them, and listReports() gives each War & Conflict item\'s');
    }
    return { theatre: slug };
  }
  if (kinds[0] === 'area') {
    const code = typeof subject.area === 'string' ? areaCodeOf(subject.area) : null;
    if (!code) refuse(`subject.area is an area's code, such as "union:eu": listAreas() gives every code`);
    return { area: code as string };
  }
  if (kinds[0] === 'brief') {
    const day = subject.brief;
    if (!isDay(day)) refuse('subject.brief is "latest" or a UTC day as YYYY-MM-DD');
    if (!narrowed) return { brief: day as string };
    const count = subject.theatres;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 4) {
      refuse('subject.theatres is how many of the brief\'s theatres to light, worst first: 1 to 4');
    }
    return { brief: day as string, theatres: count as number };
  }
  if (kinds[0] === 'address') {
    const address = subject.address;
    if (typeof address !== 'string' || address.length === 0 || address.length > ADDRESS_MAX || /[\s<>"]/.test(address)) {
      refuse('subject.address is an id listReports() lists');
    }
    return { address: address as string };
  }
  const view = subject.view as Record<string, unknown>;
  if (!isObject(view)) refuse('subject.view is { lat, lng, altitude }');
  if (!finite(view.lat) || Math.abs(view.lat) > 90) refuse('subject.view.lat is -90 to 90');
  if (!finite(view.lng) || Math.abs(view.lng) > 180) refuse('subject.view.lng is -180 to 180');
  if (!finite(view.altitude)) refuse('subject.view.altitude is in globe radii');
  let altitude = view.altitude as number;
  if (altitude < SHARE_ALTITUDE_FLOOR) {
    notes.push(`subject.view.altitude ${altitude} was raised to ${SHARE_ALTITUDE_FLOOR} globe radius, the floor every framing keeps`);
    altitude = SHARE_ALTITUDE_FLOOR;
  } else if (altitude > SHARE_ALTITUDE_CEILING) {
    notes.push(`subject.view.altitude ${altitude} was lowered to ${SHARE_ALTITUDE_CEILING} globe radii, the ceiling`);
    altitude = SHARE_ALTITUDE_CEILING;
  }
  return { view: { lat: view.lat as number, lng: view.lng as number, altitude } };
}

/**
 * A renderBatch request as a shot. A request is either a shot, or the v9 form
 * Mecha Jono's proposal used, `{ address | area, preset?, layers?, window?,
 * template? }`, read as the same shot would be: its layers pinned, its window
 * the timeline's (null for live), its template its card's. An area is a shot
 * of the area (v30).
 */
export function shotOfRequest(request: unknown): { shot: unknown } | { refused: string } {
  if (!isObject(request)) return { refused: 'A request is an object: a shot, or { address | area | theatre | brief | tonight | week | declassified | psiEvent | psiBriefing, theatres?, at?, preset?, layers?, window?, template? }.' };
  if ('subject' in request) return { shot: request };
  const { address, area, theatre, brief, theatres, tonight, week, declassified, psiEvent, psiBriefing, at, preset, layers, window, template } = request;
  if ([address, area, theatre, brief, tonight, week, declassified, psiEvent, psiBriefing].filter((v) => v !== undefined).length > 1) {
    return { refused: 'A request names one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing.' };
  }
  // The PsiOps Briefing, the week from the timeline's moment or the request's window (PW77), read as a shot reads it.
  if (psiBriefing !== undefined) {
    const card = { ...(preset !== undefined ? { preset } : {}), ...(template !== undefined ? { template } : {}) };
    return {
      shot: {
        subject: { psiBriefing },
        ...(layers !== undefined ? { layers: { pins: layers } } : {}),
        ...(window !== undefined ? { time: window === null ? { live: true } : { window } } : {}),
        ...(Object.keys(card).length ? { card } : {}),
      },
    };
  }
  // A psi event, drawn at its exact moment or at `at` (PW62): read as a shot reads one, its window refused there.
  if (psiEvent !== undefined) {
    const card = { ...(preset !== undefined ? { preset } : {}), ...(template !== undefined ? { template } : {}) };
    return {
      shot: {
        subject: { psiEvent, ...(at !== undefined ? { at } : {}) },
        ...(layers !== undefined ? { layers: { pins: layers } } : {}),
        ...(window !== undefined ? { time: window === null ? { live: true } : { window } } : {}),
        ...(Object.keys(card).length ? { card } : {}),
      },
    };
  }
  // An area, framed to its largest part (BA22): its code, as listAreas() gives it.
  if (area !== undefined && (typeof area !== 'string' || areaCodeOf(area) === null)) {
    return { refused: 'A request\'s area is an area\'s code, such as "union:eu": listAreas() gives every code.' };
  }
  if (area === undefined && theatre === undefined && brief === undefined && tonight === undefined && week === undefined && declassified === undefined
    && (typeof address !== 'string' || address === '')) {
    return { refused: 'A request needs the address of an item drawn: an id listReports() lists.' };
  }
  if (layers !== undefined && !Array.isArray(layers)) return { refused: 'A request\'s layers are a list of layer ids, as pinLayers takes them.' };
  const card = {
    ...(preset !== undefined ? { preset } : {}),
    ...(template !== undefined ? { template } : {}),
  };
  return {
    shot: {
      // A theatre is read as a shot reads one, its slug checked there (theatre-lens.md, TL3).
      // A brief, and how many of its theatres, are read as a shot reads them (TL15).
      subject: area !== undefined ? { area } : theatre !== undefined ? { theatre }
        : brief !== undefined ? { brief, ...(theatres !== undefined ? { theatres } : {}) }
          : tonight !== undefined ? { tonight } : week !== undefined ? { week } : declassified !== undefined ? { declassified } : { address },
      ...(layers !== undefined ? { layers: { pins: layers } } : {}),
      ...(window !== undefined ? { time: window === null ? { live: true } : { window } } : {}),
      ...(Object.keys(card).length ? { card } : {}),
    },
  };
}
