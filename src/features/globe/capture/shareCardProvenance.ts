/**
 * What a published globe image is allowed to claim.
 *
 * ─── THE PROBLEM THIS EXISTS FOR ───────────────────────────────────────────
 *
 * A screenshot leaves the app and keeps none of its context. Stage 0 of this
 * work removed three HUD panels that fabricated readings, and the reason given
 * was exactly this: "a screenshot does not carry the caveat that the numbers
 * were placeholders". The fix there was to stop fabricating. The fix HERE is to
 * make the image carry its caveats with it.
 *
 * So this is not decoration. A card that shows a space-weather layer while the
 * NOAA feed was unreachable is making a claim about the world that nothing
 * behind it supports — and once posted, it cannot be corrected. The one
 * distinction ThreatAssessmentPanel had to learn applies with more force to a
 * published image than to a panel somebody can refresh:
 *
 *   an empty feed and a quiet world look identical, and only one of them is
 *   news.
 *
 * ─── EVERY FIELD IS DERIVED ────────────────────────────────────────────────
 *
 * Nothing here is authored by a caller. `caveats` in particular is computed
 * from feed and layer state, so it cannot fall out of step with what the image
 * actually shows — the same discipline as the guards, applied to a picture.
 *
 * The envelope shape follows SpaceWeatherExportService's, including its
 * `origin` wording, because a reader who has seen one should recognise the
 * other and both are unsigned client-side captures.
 */

import { shortSha, getBuildIdentity } from '../../../utils/buildIdentity';
import type { LayerLegend } from '../../../services/globe/globeLegendStore';
import type { Shot } from './shotSpec';
import type { ChartProvenance } from './chartCard';
import { TEMPLATE_SPECS, type CardTemplate, type TemplateChooser } from './cardTemplates';
import { creditLine, creditsShown, CREDITS, dataCanBeInPicture, groupedLicences, imageryShown, type SourceCredit } from './sourceCredits';

/** A chart's ephemeris, named on the Data line (D-PW, PW87). */
const CHART_CREDIT = creditLine(CREDITS.astronomyEngine);
import { formatUtcDateTime, formatUtcTime } from '../../../utils/utcTime';

export const GLOBE_CAPTURE_SCHEMA = 'starcom.globe.capture' as const;
/**
 * 38: `chart` — an event chart drawn over a corner of the picture, when the card's shot asked for one (D-PW, PW87;
 *    contract v83): its moment and place, the sky outside's moment, its frame, houses and orbs, the five closest
 *    aspects across and what it could not give; its lines in the card's text, Astronomy Engine on the Data line.
 * 37: `appearance.compare.labels` — one layer at two moments (D-CM, CM4; contract v79): each half's name with its
 *    window ("Eco Disasters, 28 Oct – 4 Nov 2016"), a half being `<layer>@then`, the other moment's copy.
 * 36: `appearance.compare` — two layers side by side (D-CM, CM3; contract v78): `left` and `right`, the layer ids each
 *    half drew, each half without the other's; the picture names its halves, and a caveat says it.
 * 35: `appearance.solarSystem` may be `sky`, with its `observer`, the place the sky is seen from to 0.1° (plan D5;
 *    contract v74): the stars to magnitude 6 and the IAU's figures, and a caveat that the air is not drawn.
 * 34: `appearance.solarSystem` may be `diagram` (critique 2026-11-01, OR9; plan D4; contract v73): not to scale, the
 *    rings evenly spaced and each size on a log of the body's, and a caveat says so.
 * 33: `appearance.solarSystem` — the scale the picture drew the solar system at, when it drew any of it (critique
 *    2026-11-01, OR9; contract v72): `compact` or `true`. At Compact a caveat says which distances are not true.
 * 32: a `frontPage` may be the PsiOps Briefing (`kind: 'psi_briefing'`; D-PW, PW62, PW77; contract v64): the week from
 *    the card's moment, how many windows it holds and Psi Alerts are open, and Kp's largest in it with its day.
 * 31: `timestream` — a Timestream strip under the picture, when the card's shot asked for one (D-PW, PW62, PW77;
 *    contract v63): its span and the card's moment in it, its lanes, the bodies and the frame they are coloured in,
 *    how many windows it drew; its sources credited on the Data line.
 * 30: a `frontPage` may be a Psi Watch sky event or window (`kind: 'psi_event'`; decision D-PW, PW62, PW77; contract
 *    v62): its address and family, its title, its exact moment and window, the moment it is drawn at, its bodies and,
 *    for a window, its Zones. Its card carries the one Experimental badge (template `psi`) and no other psi text.
 * 29: `licences` — the licences the notes in the picture carry, each in full as its note gives it, its producer and
 *    day with it (Interchange 3.25; the owner's pick of 26 Oct). The Data line names each once, a platform's
 *    producers together under their licence. Absent when no note in the picture carries one.
 * 28: a `frontPage` may be the declassified desk's day (`kind: 'declassified'`; plan H9; contract v58): its
 *    count, the releases the card names with their sources, days, licences and links, and the Data line's
 *    words for them; with a caveat that none of them is on the globe.
 * 27: a `frontPage` may be Hero Watch's week (`kind: 'week'`; hero-watch.md, D-HW, HW10; contract
 *    v42): the week's relief, its lifeboat launches in Mecha Jono's roundup's own words, and its open
 *    field missions, with the roundup's ISO week, and how many countries, missions and stations it
 *    counts.
 * 26: a tonight page's `underWay` — the scene events already under way as tonight
 *    begins, which its card draws over tonight's hours and does not count
 *    (raver-nights.md, RN10); with a caveat saying how many, when any are.
 * 25: a `frontPage` may be tonight's (`kind: 'tonight'`; raver-nights.md, RN3;
 *    contract v38): the twelve hours from the shot's moment, its scene events
 *    counted, how many stand in heat, and a row a region with the first to start.
 *    A brief's front page is as before.
 * 24: `frontPage.lit` — the theatres a brief's front page lit, by slug, worst first,
 *    when its shot narrowed the brief to its worst theatres (theatre-lens.md, TL15;
 *    contract v37). Its `lines` are then a row a theatre (TL16). Absent on every other
 *    front page, which lights none.
 * 23: `appearance.countryNames` — the country names drawn, when the card's shot asked
 *    for them (decision K5, TS10–TS14; record territories.md): the codes placed, and
 *    their source. With them a caveat that the names are Natural Earth's, de facto
 *    control and all, and "Names: Natural Earth" in the credits. Absent on every card
 *    that did not ask, which draws none.
 * 22: `appearance.territories` — the style the country fills and borders were
 *    drawn in, `quiet` unless the card's shot named one, whatever the screen
 *    draws (decision K5, TS3; record territories.md); and the shot as drawn says
 *    it too, as `shot.appearance.territories`.
 * 21: `imagery` — who made the images in the picture: the globe's maps, its clouds,
 *    the planets and the Moon, as each is drawn (decisions TX8–TX10; record
 *    earth-textures.md). The card prints it after its data, on the same line.
 * 20: a `legend` entry may say the moment its values hold for (`when`), as a
 *    weather model's do: "for 6 Oct 22:12Z", "forecast for 7 Oct 06:00Z"
 *    (decision D-W, step 5a). The card prints it after the layer's name.
 *    Absent on every row without one.
 * 19: `credits` — the card's "Data:" line, each source whose data can be in
 *    the picture with its licence where the terms name one (record D-L,
 *    decision L5); and a feed may carry its `credits`, with the links the key
 *    shows.
 * 18: a `legend` entry may say what the emblem inside a mark means
 *    (`emblemMeans`) and list the emblems drawn (`emblems`: each its Symbol
 *    registry id, meaning and icon name), when an Intel Report glyph wears its
 *    category's (decisions BA12–BA15). Absent on every card without one.
 * 17: `typeStep` — which type the card was drawn in (IM38): one step larger
 *    where it fits, or the compact type it fell back to where the larger would
 *    be refused. Absent for a size with one type, the 9:16.
 * 16: `inset` — what a close-up inset draws, when a shot asked for one
 *    (decisions IM34–IM36): its kind, the featured item, how many places it
 *    marks, how far it looks, how finely they are placed, its grid and its
 *    scale bar. Never where the places are: their notes say that.
 * 15: `qr` — the short view link the card's QR code opens, when a shot asked
 *    for one (decisions IM13, IM31): what the code says, in words. Absent on
 *    every card without a code.
 * 14: `frontPage` — a front page's facts in place of an item's: the War &
 *    Conflict Brief of one UTC day (decision IM16), its title, lines, count,
 *    theatres and the items naming no war, as Starcom read them. Absent on
 *    every other card.
 * 13: `card` — the card's template (Mecha Jono's, decision IM5), its badge's
 *    word, and whether the item or the shot chose it (IM14); null on the
 *    default card. A badge the shot chose and the item does not state is a
 *    claim nobody checked, and a caveat says so.
 * 12: `caveatsShort` — each caveat as the card prints it, one short sentence,
 *    in the same order as `caveats` (decision IM11). Every caveat that applies
 *    stays on the card; the full wording stays here.
 * 11: `shot` — the shot a card was made from, as it was drawn (decision IM1;
 *    globe record, section 21), so the same picture can be made again. Absent
 *    on a card made without one, as from the share button.
 * 10: `link` — the view as a deeplink v1, so a card carries its own address
 *    (RW8); `window` — the timeline's window in unix seconds, null while live
 *    (RW7); `raverWatchItems` — the Raver Watch items drawn, so a post can cite
 *    each (globe record, section 19).
 * 9: `featured` — the one report a card is about, when an agent or a person chose
 *    one (decision D-F, section 18). Legend entries may also say what a number
 *    beside a mark means (`badgeMeans`) and swatches the style they sit in.
 * 8: `appearance.quality` — how much detail the device drew, so a card drawn without
 *    clouds or atmosphere says so.
 * 7: `legend` — what each drawn layer's colours and sizes mean, stated by the
 *    layer as it drew them (globeLegendStore), so a viewer can read the marks
 *    without the app.
 * 5: `appearance`; 6: `build.treeDirty`.
 * 4: a feed may carry a standing `note` about the nature of its data.
 * 3: added `marks`.
 * 2: added `build`.
 *
 * A card is a picture of a particular build of this app, and it did not say
 * which. That mattered little when a capture was a one-shot. It matters now
 * that holding one page open is the cheap way to work, because a session can
 * outlive the deploy that made it and nothing in the image would show that.
 */
export const GLOBE_CAPTURE_SCHEMA_VERSION = 38 as const;

/**
 * Named so a reader knows what they have: one browser's view at one moment,
 * carrying no signature. Phase 4 gives Mecha Jono its own signing identity, at
 * which point a card can be attested and this string changes — deliberately
 * not before.
 */
export const CAPTURE_ORIGIN = 'starcom-app client capture (unsigned)';

/** Where the camera was. A checkable fact about the view, not about the data. */
export interface CameraProvenance {
  lat: number;
  lon: number;
  /** Globe radii from the surface, as react-globe.gl reports it. */
  altitude: number;
}

/**
 * One data source, as the app found it at capture time.
 *
 * ─── THREE STATES THAT LOOK THE SAME ON AN EMPTY GLOBE ─────────────────────
 *
 * A layer showing nothing can mean its source failed, it loaded and found
 * nothing, or nobody can tell. The Satellites layer drew nothing for five
 * months after CelesTrak's certificate expired, and its card said "Layers
 * shown: Satellites" with no caveat — because the hook reported nothing about
 * its data at all, and absence of a report read as absence of a problem.
 *
 * So the shape distinguishes:
 *
 *   failed        `error` set                      → "did not load" caveat
 *   never loaded  `lastUpdated` null               → "had never loaded"
 *   loaded, untimed  `timestamped: false`          → no caveat; it arrived,
 *                                                     the source does not say when
 *   unreported    `unreported: true`               → the card says the layer
 *                                                     cannot tell empty from failed
 *
 * `timestamped: false` exists because conflating "loaded, time unknown" with
 * "never loaded" would caption a working layer as dead. `unreported` exists
 * because the alternative — saying nothing — is exactly what hid Satellites.
 */
export interface FeedProvenance {
  /** How the source is publicly known — NOAA, EIA, CelesTrak. */
  name: string;
  /** How a card names it where space is short, when `name` is long. */
  shortName?: string;
  /** ISO of the last SUCCESSFUL load, or null when nothing has loaded. */
  lastUpdated: string | null;
  /** The error the app was holding, if any. */
  error?: string | null;
  /** True while a fetch is outstanding and no data has arrived yet. */
  loading?: boolean;
  /** False when the source reports success but not WHEN. Defaults to true. */
  timestamped?: boolean;
  /** True when the layer does not report its source's health at all. */
  unreported?: boolean;
  /**
   * What a viewer must know about the NATURE of this source's data, whatever its
   * state — e.g. that GDELT's events are machine-coded from news and any one can
   * be miscoded. Stated once however many feeds share it, and only when something
   * from the source can be in the picture.
   */
  note?: string;
  /** The note in one short sentence, as a card prints it (IM11). Absent: the note is short already. */
  noteShort?: string;
  /** Who to credit for this source's data, as its terms ask (schema 19): the card names them, the key links them. */
  credits?: SourceCredit[];
  /** The layer it feeds, by the layer catalogue's id: what the globe's loading status reads it under (D-LS). */
  layer?: string;
  /** How far a load has come, where the layer counts it ("14 of 68"): real progress only (D-LS, LS2). */
  progress?: { done: number; total: number };
}

/** Each standing note that applies, once, with its short form. */
function standingNotePairs(feeds: readonly FeedProvenance[]): Array<{ full: string; short: string }> {
  const pairs = new Map<string, string>();
  for (const feed of feeds) {
    if (noteApplies(feed) && !pairs.has(feed.note!)) pairs.set(feed.note!, feed.noteShort ?? feed.note!);
  }
  return [...pairs].map(([full, short]) => ({ full, short }));
}

/**
 * The standing notes of the sources whose data can be in the picture — once each.
 * Shared by stills and clips so the two cannot state the rule differently.
 */
export function standingNotes(feeds: readonly FeedProvenance[]): string[] {
  const notes = new Set<string>();
  for (const feed of feeds) {
    if (noteApplies(feed)) notes.add(feed.note!);
  }
  return [...notes];
}

/**
 * Whether a source's standing note applies: only when something from it can be
 * in the picture. A note about data that is not drawn describes nothing a viewer
 * sees. One rule for the card and the in-app key (decision D-F, step 13), which
 * began showing notes when Satellites needed one.
 */
export function noteApplies(feed: FeedProvenance): boolean {
  return !!feed.note && dataCanBeInPicture(feed);
}

export interface LayerProvenance {
  /** The layer's id where the caller knows it: what a caveat decides on, never its label. */
  id?: string;
  label: string;
  /** The operator selected or pinned it. */
  active: boolean;
  /**
   * Whether anything renders it. GlobeLayerInfo carries this because pinning
   * an unimplemented layer is a no-op, and a card must not list a layer as
   * shown when nothing drew it.
   */
  implemented: boolean;
}

/**
 * How the planet was drawn, and where its light came from — both the viewer's choice
 * (services/globe/globeAppearance.ts), and both changing what a reader sees. 'sun' is
 * the real subsolar point for `capturedAt`; the other two are not, and say so in the
 * caveats.
 */
export interface AppearanceProvenance {
  skin: string;
  lightMode: 'sun' | 'headlamp' | 'flat';
  /** The territories' style the picture was drawn in (schema 22). Absent before. */
  territories?: 'classic' | 'quiet';
  /** The country names drawn, when the shot asked (schema 23): ADM0_A3 codes, sorted, and where they come from. */
  countryNames?: { codes: string[]; source: string };
  /**
   * How much detail was drawn, and whether the device or the viewer chose it
   * (services/globe/globeQuality.ts). Absent before schema 8.
   */
  quality?: {
    setting: 'auto' | 'high' | 'low';
    /** The step's name, e.g. 'no clouds'. */
    detail: string;
    clouds: boolean;
    atmosphere: boolean;
  };
  /** The scale the solar system was drawn at, when the picture drew any of it (schema 33; OR9). Absent otherwise. */
  solarSystem?: { scale: 'compact' | 'true' | 'diagram' | 'sky'; observer?: { lat: number; lng: number } };
  /** Two layers side by side, by their ids (schema 36; D-CM): each half drew its own, without the other's. */
  compare?: { left: string; right: string; labels?: { left: string; right: string } };
}

/** One Raver Watch item a card draws. */
export interface RaverWatchItemProvenance {
  /** `30023:<pubkey>:<d>`. */
  id: string;
  layer: string;
  level: string;
}

/**
 * A close-up inset's facts (schema 16; IM34): what it draws and how finely,
 * never where its places are, which their own notes state.
 */
export interface InsetProvenance {
  kind: 'venues' | 'heat';
  /** The featured item's id: the place ringed. */
  featured: string;
  /** How many places it marks, the featured one among them. */
  shown: number;
  /** How far it looks: `within 25 km`, or the state. */
  within: string;
  /** How finely its places are placed. */
  placedTo: string;
  /** The grid drawn, in kilometres, or null. */
  gridKm: number | null;
  /** Its scale bar's length, as printed. */
  scale: string;
}

export interface GlobeViewProvenance {
  schema: typeof GLOBE_CAPTURE_SCHEMA;
  schemaVersion: typeof GLOBE_CAPTURE_SCHEMA_VERSION;
  capturedAt: string;
  origin: string;
  camera: CameraProvenance;
  frame: { width: number; height: number };
  /** How the planet was drawn and lit. Absent on captures from before schema 5. */
  appearance?: AppearanceProvenance;
  /** Which build of the app drew this. */
  build: BuildProvenance;
  /** The analysis marks in the frame, or null when no analysis layer is up. */
  marks: MarkProvenance | null;
  /** Layers that were both selected AND have something behind them. */
  layersShown: string[];
  /**
   * How to read the marks: what colour and size mean, per layer that drew any.
   *
   * Published by the layers themselves rather than composed here — see
   * globeLegendStore for why a table beside the card would be a lie waiting to
   * happen. Empty when nothing that encodes anything is drawn.
   */
  legend: LayerLegend[];
  /** Selected but renders nothing. Named rather than quietly folded in. */
  layersSelectedButEmpty: string[];
  /**
   * The report this card is about, derived from the report on the globe
   * (shareReports.featuredReportFor). Absent when nothing was featured.
   */
  featured?: FeaturedProvenance;
  /** The view as a deeplink v1 that reads back as it (schema 10). */
  link?: string;
  /** The short view link the card's QR code opens, when it has one (schema 15; IM31). */
  qr?: string;
  /** What the card's close-up inset draws, when it has one (schema 16; IM34). */
  inset?: InsetProvenance;
  /** Which type the card was drawn in (schema 17; IM38). Absent for a size with one type. */
  typeStep?: 'larger' | 'compact';
  /** The timeline's window, in unix seconds; null while live (schema 10). */
  window?: { from: number; until: number } | null;
  /** The Raver Watch items drawn, by id, layer and level (schema 10). Absent when none. */
  raverWatchItems?: RaverWatchItemProvenance[];
  /** The shot the card was made from, as drawn (schema 11). Absent when none. */
  shot?: Shot;
  /** The card's template, its badge and who chose it (schema 13), or null for the default card. */
  card: CardProvenance | null;
  /** A front page's facts, in place of an item's (schema 14). Absent on every other card. */
  frontPage?: FrontPageProvenance;
  /** The Timestream strip under the picture (schema 31). Absent on a card without one. */
  timestream?: TimestreamProvenance;
  /** An event chart over a corner of the picture (schema 38). Absent on a card without one. */
  chart?: ChartProvenance;
  feeds: FeedProvenance[];
  /** The card's "Data:" line: each source whose data can be in the picture, once (schema 19). */
  credits: string[];
  /**
   * The licences the notes in the picture carry, each in full as its note gives it, its producer and day with it
   * (schema 29). Absent when none of them carries one.
   */
  licences?: string[];
  /** Who made the images drawn, after the data: "Imagery: …" (schema 21; TX8–TX10). */
  imagery: string[];
  /**
   * Everything a viewer needs in order not to over-read the image, derived
   * from the state above. Never authored.
   */
  caveats: string[];
  /** Each caveat as the card prints it, in the same order (schema 12). */
  caveatsShort: string[];
}

/**
 * A front page's facts, which the card heads and states in place of an item's:
 * a brief's (schema 14), tonight's (schema 25) or Hero Watch's week (schema 27). Every
 * reader needs only its title and lines.
 */
export type FrontPageProvenance = BriefFrontPage | TonightFrontPage | WeekFrontPage | DeclassifiedFrontPage | PsiFrontPage | PsiBriefingPage;

/** The War & Conflict Brief of one UTC day (IM16), as Starcom read it (schema 14). */
export interface BriefFrontPage {
  template: 'conflict_brief';
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  title: string;
  lines: string[];
  count: number;
  theatres: Array<{ name: string; count: number; tier: string | null }>;
  /** The day's items that name no war. */
  noTheatre: number;
  /** The theatres lit, worst first, when the brief was narrowed to them (schema 24; TL15). */
  lit?: string[];
}

/** Tonight, the twelve hours from the shot's moment, as Raver Watch read it (schema 25; RN3). */
export interface TonightFrontPage {
  kind: 'tonight';
  /** Unix seconds: from the shot's moment, twelve hours on. */
  fromS: number;
  untilS: number;
  title: string;
  lines: string[];
  /** The scene events starting in it, and how many stand in heat. */
  count: number;
  underHeat: number;
  /** The scene events already under way as it begins: drawn on its card, not counted (schema 26; RN10). */
  underWay: number;
  /** A row a region, the first to start first, each with its first start as its zone's clock reads it. */
  regions: Array<{ name: string; count: number; underHeat: number; first: { atS: number; local: string } }>;
}

/** Hero Watch's week, as drawn and as Mecha Jono's weekly roundup says it (schema 27; D-HW, HW10). */
export interface WeekFrontPage {
  kind: 'week';
  /** The roundup's ISO week, `2026-w41`, or null when no roundup was read. */
  week: string | null;
  title: string;
  lines: string[];
  /** Countries with relief, open field missions placed, and lifeboat stations drawn. */
  relief: number;
  missions: number;
  stations: number;
}

/** The declassified desk's day, as Mecha Jono's notes state it (schema 28; plan H9). */
export interface DeclassifiedFrontPage {
  kind: 'declassified';
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  title: string;
  lines: string[];
  /** The day's releases. */
  count: number;
  /** Those the card names, newest first, each whole as its note states it. */
  records: Array<{ d: string; title: string; source: string; sourceName: string; publishedAt: string; licence: string; link: string | null }>;
  /** The Data line's words for the releases named: each source with its licence, once. */
  credits: string[];
}

/** A Psi Watch sky event or window, as its note states it, drawn at one moment (schema 30; D-PW, PW62). */
export interface PsiFrontPage {
  kind: 'psi_event';
  /** Its address: `31923:<key>:psi-sky-…` or `31923:<key>:psi-window-…`. */
  address: string;
  family: 'psi_sky_event' | 'psi_window';
  title: string;
  lines: string[];
  /** Unix seconds: its exact moment, its window, and the moment the card draws it at. */
  exactS: number;
  window: { fromS: number; peakS: number; untilS: number };
  atS: number;
  /** The bodies its lines are drawn for, as the note names them. */
  bodies: string[];
  /** A window's places; none for a sky event. */
  zones: Array<{ id: string; name: string }>;
}

/** The PsiOps Briefing: the week from the card's moment (schema 32; D-PW, PW62, PW77). */
export interface PsiBriefingPage {
  kind: 'psi_briefing';
  /** Unix seconds: the week. */
  fromS: number;
  untilS: number;
  title: string;
  lines: string[];
  /** The windows in the week, and the Psi Alerts open at its start. */
  windows: number;
  alerts: number;
  /** Kp's largest in the week, from the start of its three hours, measured or expected; null when none is known. */
  kpTop: { kp: number; fromS: number; basis: string } | null;
}

/** The Timestream strip a card draws under its picture (schema 31; D-PW, PW62, PW77). */
export interface TimestreamProvenance {
  /** Unix seconds: the span it shows, and the card's moment in it. */
  fromS: number;
  untilS: number;
  atS: number;
  lanes: Array<'windows' | 'kp' | 'bodies'>;
  /** The bodies' lanes, and the frame their signs are read in. */
  bodies: string[];
  frame: 'galactic' | 'tropical';
  /** How many windows it drew. */
  windows: number;
  /** Its sources, as the Data line names them. */
  credits: string[];
}

/** A card's template as drawn (schema 13). */
export interface CardProvenance {
  template: CardTemplate;
  /** The badge's word, or null when the template has none. */
  badge: string | null;
  /** Whether the item said what it is, the shot chose for it (IM14), or the card is a front page. */
  chosenBy: TemplateChooser;
}

/** Why the analysis layer has nothing on it. Mirrors GlobeEmptyReason. */
export type AnalysisEmptyReason = 'no-observations' | 'nothing-qualified' | 'all-unplaceable';

/**
 * The analysis marks in the frame.
 *
 * ─── WHY `fabricated` IS NULLABLE AND THAT IS THE WHOLE POINT ──────────────
 *
 * GlobeIntelMark carries an `isMock` flag, and the globe renders fabricated
 * marks in a washed-out grey. It would have been easy to count those and
 * report a number.
 *
 * It would also have been wrong. The flag's only input — `mockEntityRefs` — is
 * never supplied, deliberately and with a reason recorded at the call site in
 * useGlobeIntelLayer: the correlation context works from Events, which do not
 * carry observation-level integrity, and "passing a zeroed summary would
 * render as 0% real, a worse claim than unmeasured".
 *
 * So every mark reports isMock false, and it is false STRUCTURALLY, not
 * measured false. Counting it would put "0 fabricated marks" on a published
 * image — a positive claim the system cannot support, in the feature built to
 * refuse exactly that.
 *
 * null therefore means unmeasured and produces a caveat saying so. A number
 * means something actually measured it. The two are not interchangeable and
 * this type refuses to let them be.
 */
export interface MarkProvenance {
  /** Marks drawn in the frame. */
  shown: number;
  /** Fabricated observations behind them, or null when nothing measured it. */
  fabricated: number | null;
  /** Observations behind the marks, when measured. */
  totalObservations: number | null;
  /** Why the layer is empty, when it is empty and the layer says why. */
  emptyReason: AnalysisEmptyReason | null;
}

/** Which build of the app drew the picture. */
export interface BuildProvenance {
  /** Full commit sha, or null when the bundle was not built from one. */
  sha: string | null;
  /** ISO timestamp of that build, or null on the same terms. */
  builtAt: string | null;
  /**
   * Whether the build's tree had uncommitted changes. Absent on captures from before
   * schema 6, where the question was never asked.
   */
  treeDirty?: boolean | null;
}

/** The report a card features: its title and the lines stated about it. */
export interface FeaturedProvenance {
  id: string;
  title: string;
  lines: string[];
}

export interface BuildProvenanceInput {
  capturedAt: Date;
  /**
   * Injected so a test can state it. Defaults to the running build, which is
   * the only honest source — a caller free to supply its own would be
   * AUTHORING provenance, which is the thing this module exists to prevent.
   */
  build?: BuildProvenance;
  /** Omitted when the capture has no analysis layer to describe. */
  marks?: MarkProvenance | null;
  /** What the drawn layers say their marks mean. Defaults to none. */
  legend?: LayerLegend[];
  /** The report featured, as the app derived it. Absent when none was chosen. */
  featured?: FeaturedProvenance | null;
  /** The view's own address, a deeplink v1. */
  link?: string;
  /** The link the card's QR code opens, when a shot asked for one. */
  qr?: string;
  /** The timeline's window in unix seconds, or null while live. */
  window?: { from: number; until: number } | null;
  /** The Raver Watch items drawn. */
  raverWatchItems?: RaverWatchItemProvenance[];
  /** The licences the notes in the picture carry, each in full (schema 29). Absent or empty: none. */
  licences?: readonly string[];
  /** The shot the card was made from. */
  shot?: Shot;
  /** The card's template and who chose it (IM14). Absent or null for the default card. */
  template?: { name: CardTemplate; chosenBy: TemplateChooser } | null;
  /** A front page's facts, as Starcom read them (IM16). Absent or null on any other card. */
  frontPage?: FrontPageProvenance | null;
  /** The Timestream strip under the picture, when the shot asked for one (schema 31). */
  timestream?: TimestreamProvenance | null;
  /** An event chart over a corner of the picture, when the shot asked for one (schema 38). */
  chart?: ChartProvenance | null;
  camera: CameraProvenance;
  frame: { width: number; height: number };
  appearance?: AppearanceProvenance;
  /** The makers of the images drawn, as the globe told them (globe-engine/imagery.ts). Defaults to none. */
  imagery?: readonly SourceCredit[];
  layers: LayerProvenance[];
  feeds: FeedProvenance[];
  /** Injected so staleness is testable without freezing the clock globally. */
  now?: Date;
  /**
   * The moment the card shows, when the timeline is paused there (D-W, step 5d):
   * each source is judged against it, as a clip's frame is against its own, so a
   * card of yesterday's weather does not call it a day stale. Absent, the capture.
   */
  shownAt?: Date;
}

/**
 * How old a feed may be before the card says so.
 *
 * Not a judgement about the data — a threshold past which a viewer would
 * reasonably want to know. Space weather moves in minutes; an hour-old reading
 * presented as current is misleading even though nothing lied.
 */
export const STALE_AFTER_MS = 60 * 60 * 1000;

/** A moment shown further ahead of the capture than this is a forecast's, and the card says so (SW19). */
export const AHEAD_AFTER_MS = 60 * 1000;

/**
 * An empty globe, explained.
 *
 * The three reasons are not remotely equivalent and the same blank Earth is
 * shown for all of them — which is the failure GlobeIntelLayer's own
 * `emptyReason` exists to end. A published image of an empty globe is the
 * sharpest form of it: the viewer cannot ask.
 */
/*
 * Exported so a recorded clip states an empty globe in the SAME words as a
 * still. A reader who has seen one should recognise the other, and two
 * separately-authored phrasings of one condition is how they start to differ.
 */
export const EMPTY_REASON_CAVEAT: Record<AnalysisEmptyReason, string> = {
  /*
   * Names the capturing browser, not "you". The globe's own status says "nothing of
   * yours to analyse", which is right there: it is addressed to the person using
   * the app. A card is read by strangers, and Mecha Jono pointed out that the same
   * words on a post read as addressed to them (2026-09-25).
   */
  'no-observations':
    'The browser that made this image had no observations of its own to analyse, so it '
    + 'shows no analysis. That is not a finding that there is nothing to find.',
  'nothing-qualified':
    'Analysis ran over real input and nothing met the threshold. An empty globe here '
    + 'is a result, not an absence of work.',
  'all-unplaceable':
    'Analysis produced results and none could be placed on a map, so this globe is '
    + 'empty for a rendering reason rather than an analytical one.',
};

/** EMPTY_REASON_CAVEAT, as a card prints it (IM11). It names the browser too, never "you". */
export const EMPTY_REASON_CAVEAT_SHORT: Record<AnalysisEmptyReason, string> = {
  'no-observations': 'The browser that made this had nothing to analyse: not a finding of nothing.',
  'nothing-qualified': 'Analysis ran and nothing met the threshold.',
  'all-unplaceable': 'Analysis found results that could not be placed on a map.',
};

/** What a card that draws country names says of them (decision K5, TS12). */
export const COUNTRY_NAMES_CAVEAT = "Country names and where they stand are Natural Earth's, which shows de facto control; some are disputed.";
export const COUNTRY_NAMES_CAVEAT_SHORT = 'Names: Natural Earth, de facto.';
/** Where the names come from, as the record states it. */
export const COUNTRY_NAMES_SOURCE = 'Natural Earth Admin 0 (public domain): NAME, LABEL_X/Y, LABELRANK, MIN_LABEL';

/** Shared with clipProvenance, for the same reason as EMPTY_REASON_CAVEAT. */
export const humanAge = (ms: number): string => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/**
 * What state a source is in — the one classification the share card and the
 * in-app key both use (decision D-F, step 11).
 *
 * The card always knew how old each layer's data was and whether its source had
 * failed; the live globe showed none of it. Now the key shows it too, and both
 * decide HERE, so the app cannot call a source fresh while an image captured the
 * same second calls it stale. Each surface then says what it needs: the card
 * states only what a viewer must be warned of, the key states every source.
 *
 * The order is the card's, and it matters: a source that does not report is
 * that, whatever else it holds; a failure outranks a missing timestamp.
 */
export type FeedState =
  | { kind: 'unreported' }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' }
  | { kind: 'never' }
  | { kind: 'untimed' }
  | { kind: 'unreadable'; raw: string }
  | { kind: 'loaded'; at: number; ageMs: number; stale: boolean };

export function feedState(feed: FeedProvenance, now: Date): FeedState {
  if (feed.unreported) return { kind: 'unreported' };
  if (feed.error) return { kind: 'failed', error: feed.error };
  if (feed.lastUpdated === null) {
    if (feed.loading) return { kind: 'loading' };
    return feed.timestamped !== false ? { kind: 'never' } : { kind: 'untimed' };
  }
  const at = new Date(feed.lastUpdated).getTime();
  const ageMs = now.getTime() - at;
  if (Number.isNaN(ageMs)) return { kind: 'unreadable', raw: feed.lastUpdated };
  return { kind: 'loaded', at, ageMs, stale: ageMs >= STALE_AFTER_MS };
}

/** What a card says of the solar system drawn Compact (OR9), full and as the card prints it (IM11). */
export const SOLAR_COMPACT_CAVEAT = 'The solar system is drawn Compact: every size and the Moon’s distance are true; every other distance from the Earth is drawn at about 1 in 19.7.';
export const SOLAR_COMPACT_CAVEAT_SHORT = 'Solar system Compact: distances but the Moon’s at 1 in 19.7.';
/** What a card says of the solar system drawn as a Diagram (D4): not to scale at all. */
export const SOLAR_DIAGRAM_CAVEAT = 'The solar system is drawn as a Diagram, not to scale: each planet on its own evenly spaced ring round the Sun, each size on a log of the body’s, and the space weather between the Sun and the Earth drawn in the diagram’s gap.';
export const SOLAR_DIAGRAM_CAVEAT_SHORT = 'Solar system as a Diagram: not to scale.';
/** What a card says of Sky from a place (D5): every place and size true, the air not drawn. */
export const SKY_CAVEAT = 'The sky is drawn without the air: no refraction near the horizon, no haze, and only the stars to magnitude 6; the daylight is a simple wash by the Sun’s height.';
export const SKY_CAVEAT_SHORT = 'Sky drawn without the air: no refraction or haze.';

export function buildGlobeViewProvenance(input: BuildProvenanceInput): GlobeViewProvenance {
  const now = input.now ?? input.capturedAt;
  const build = input.build ?? getBuildIdentity();
  const marks = input.marks ?? null;
  const caveats: string[] = [];
  const caveatsShort: string[] = [];
  // Each caveat with its short form, made together, so the card and this record agree on which apply (IM11).
  const say = (full: string, short: string) => { caveats.push(full); caveatsShort.push(short); };
  const named = (feed: FeedProvenance) => feed.shortName ?? feed.name;

  const layersShown = input.layers
    .filter((l) => l.active && l.implemented)
    .map((l) => l.label);
  const layersSelectedButEmpty = input.layers
    .filter((l) => l.active && !l.implemented)
    .map((l) => l.label);

  /*
   * A layer the operator switched on that draws nothing. Saying so matters
   * because the viewer's reasonable reading of "Satellites: on" is that the
   * satellites in the picture are the satellites — and if nothing rendered
   * them, the absence is the app's, not the sky's.
   */
  for (const label of layersSelectedButEmpty) {
    say(`${label} was selected but nothing renders it yet — its absence from the image is not an absence in the world.`, `${label} is selected but not drawn yet.`);
  }

  /*
   * A moment ahead of the capture is a forecast's (space-weather-visualization.md, SW19): the layers
   * that forecast show it, and the others what they held at the capture (those that filter by time,
   * only what falls in the window). Said once, and the sources are judged against the capture: against
   * the moment, every one would be days "older than" it.
   */
  const ahead = input.shownAt && input.shownAt.getTime() - now.getTime() > AHEAD_AFTER_MS ? input.shownAt : null;
  if (ahead) {
    const by = humanAge(ahead.getTime() - now.getTime());
    say(`The moment shown, ${formatUtcDateTime(ahead.getTime())}, is ${by} ahead of this capture. Layers that forecast show their forecast for it. The others show what they held at the capture, those that filter by time only what falls in the window.`,
      `${by} ahead of now: forecasts show it; other layers what they held.`);
  }
  const judgedAt = ahead ? now : input.shownAt ?? now;
  const before = input.shownAt && !ahead ? 'before the moment shown' : 'before this capture';
  for (const feed of input.feeds) {
    const state = feedState(feed, judgedAt);
    switch (state.kind) {
      case 'unreported':
        say(`${feed.name} does not report whether its data arrived — an empty result here cannot be told apart from a failed source.`, `${named(feed)} does not report whether its data arrived.`);
        break;
      case 'failed':
        /*
         * "Did not load", not "was unreachable": this is where every failure lands —
         * an outage, but also CelesTrak refusing a repeat download and EIA never asked
         * for want of a key. "Unreachable (needs an EIA key)" said the wrong thing
         * about why, in the one line that exists to say why.
         */
        say(`${feed.name} did not load (${state.error}) — nothing from it appears here, and that is not an all-clear.`, `${named(feed)} did not load; that is not an all-clear.`);
        break;
      case 'loading':
        say(`${feed.name} had not finished loading — the image may predate its first data.`, `${named(feed)} was still loading.`);
        break;
      case 'never':
        say(`${feed.name} had never loaded — nothing from it appears here.`, `${named(feed)} never loaded.`);
        break;
      case 'untimed':
        // It arrived, and the source does not say when. Nothing false to say, so
        // nothing is said.
        break;
      case 'unreadable':
        say(`${feed.name} reported an unreadable timestamp (${state.raw}) — its recency cannot be stated.`, `${named(feed)}'s time is unreadable.`);
        break;
      case 'loaded':
        if (state.stale) {
          say(`${feed.name} was last updated ${humanAge(state.ageMs)} ${before}.`,
            input.shownAt && !ahead ? `${named(feed)} was ${humanAge(state.ageMs)} older than the moment shown.` : `${named(feed)} was ${humanAge(state.ageMs)} old.`);
        }
        break;
    }
  }

  /*
   * Standing notes about what a source's data IS, after what state it was in.
   * Deduplicated: Diplomacy and Conflict Zones share GDELT's, and a card with both
   * would otherwise say it twice. Skipped for a source that failed or never
   * loaded — a note about data that is not in the picture would describe
   * something the viewer cannot see.
   */
  for (const note of standingNotePairs(input.feeds)) say(note.full, note.short);

  if (!layersShown.length) {
    say('No data layer was active — this is the globe itself, not a reading of anything.', 'No data layer: the globe alone.');
  }

  /*
   * A badge is a claim about the item (IM14). One the item states, it made; one
   * the shot chose for an item that does not say what it is, nobody here checked.
   */
  const card: CardProvenance | null = input.template
    ? { template: input.template.name, badge: TEMPLATE_SPECS[input.template.name].badge?.text ?? null, chosenBy: input.template.chosenBy }
    : null;
  if (card?.badge && card.chosenBy === 'shot') {
    say(`The badge "${card.badge}" was chosen by whoever made this card: the item does not state its role, so it could not be checked.`,
      'The badge is the card maker\'s: the item does not state its role.');
  }

  /*
   * Tonight's card draws tonight's twelve hours, so an event already under way as they
   * begin is on the globe and not in the lines (RN10): said, with how many, so a mark
   * the lines do not count is not read as one they missed.
   */
  const page = input.frontPage;
  // A release has no place: nothing on this globe is one of them (plan H9).
  if (page && 'kind' in page && page.kind === 'declassified') {
    say('The releases on this card have no place on the globe: none of them is drawn on it.', 'None of these releases is drawn.');
  }
  if (page && 'kind' in page && page.kind === 'tonight' && page.underWay > 0) {
    const n = page.underWay;
    const from = formatUtcTime(page.fromS * 1000);
    say(`${n} scene ${n === 1 ? 'event' : 'events'} already under way at ${from} ${n === 1 ? 'is' : 'are'} drawn on this card and not counted: its lines count the events starting in the twelve hours from then.`,
      `${n} ${n === 1 ? 'event' : 'events'} under way at ${from} ${n === 1 ? 'is' : 'are'} drawn, not counted.`);
  }

  /*
   * ─── WHAT THE MARKS ON THIS GLOBE DO AND DO NOT ESTABLISH ────────────────
   *
   * A pin on a 3D Earth reads as authoritative whatever produced it, which is
   * the reason GlobeIntelMark carries integrity information at all. A
   * published card is that problem with the analyst removed: no hover, no
   * sidebar, no working set — just the pins.
   */
  if (marks) {
    if (marks.shown > 0) {
      if (marks.fabricated === null) {
        say(
          `Whether any of the ${marks.shown} analysis marks rest on fabricated observations `
          + 'is not measured here — no fabrication flag is not the same as no fabrication.',
          `Fabrication behind the ${marks.shown} analysis marks is not measured.`,
        );
      } else if (marks.fabricated > 0) {
        const of = marks.totalObservations === null ? '' : ` of ${marks.totalObservations}`;
        say(
          `${marks.fabricated}${of} observations behind these marks are fabricated.`,
          `${marks.fabricated}${of} observations behind these marks are fabricated.`,
        );
      }
      /*
       * Precision. SourceObservation declares geoPrecisionM, and nothing
       * carries it through correlation onto a mark, so every mark is drawn as
       * a point. On a map a point IS the claim, and a published image asserts
       * it far more strongly than a list would.
       */
      say(
        'Marks are drawn as exact points; the observations\' stated location precision is not '
        + 'carried onto the globe, so the image implies more precision than the evidence may support.',
        'Marks are drawn as exact points; their stated precision is not shown.',
      );
    } else if (marks.emptyReason) {
      say(EMPTY_REASON_CAVEAT[marks.emptyReason], EMPTY_REASON_CAVEAT_SHORT[marks.emptyReason]);
    }
  }

  /*
   * An unidentified build. Stated rather than omitted, because a card that
   * says nothing about its build and a card from an unknown build look
   * identical to a reader, and they are not the same thing.
   */
  if (!build.sha) {
    say('This build is unidentified — the image cannot be traced to the code that drew it.', 'Unidentified build.');
  } else if (build.treeDirty) {
    /*
     * A sha with uncommitted changes behind it is worse than no sha: it invites a
     * reader to fetch that commit and check the image against it, and they would be
     * checking against code this capture was not drawn by.
     */
    say(
      `Built from a working tree with uncommitted changes — ${shortSha(build.sha) ?? 'this commit'} `
      + 'does not describe the code that drew this image.',
      `Uncommitted build: ${shortSha(build.sha) ?? 'its commit'} does not describe it.`,
    );
  }

  /*
   * Last, and unconditional. Everything above is a specific caveat about this
   * capture; this one is about what the artefact IS. Phase 4 changes it when
   * cards can be signed, and not before.
   */
  /*
   * Lighting that is not the Sun's. A reader takes a lit hemisphere on a globe to mean
   * daylight there; under the other two modes it means nothing of the kind, so the
   * image has to say so. The Sun needs no caveat, being true.
   */
  // Two layers side by side (D-CM, CM3): which half is which, so neither is read as the other's.
  const compared = input.appearance?.compare;
  if (compared) {
    const labelOf = (id: string) => input.layers.find((l) => l.id === id)?.label ?? id;
    const left = compared.labels?.left ?? labelOf(compared.left);
    const right = compared.labels?.right ?? labelOf(compared.right);
    say(
      `Side by side: ${left} in the left half, ${right} in the right; each half draws its own of the two.`,
      `Side by side: ${left} left, ${right} right.`,
    );
  }
  if (input.appearance?.lightMode === 'headlamp') {
    say('Lit from the camera so that nothing is in shadow — the day and night sides in this image are not real.', 'Lit from the camera: day and night are not real.');
  } else if (input.appearance?.lightMode === 'flat') {
    say('Lit evenly, with no day or night side — this image does not show where it was dark.', 'Lit evenly: no day or night is shown.');
  }

  /*
   * Detail given up for speed. Sharpness is never named: a capture is always drawn at a
   * pixel ratio of 1 (captureGlobeFrame), so that step never reaches the image. Clouds
   * and the atmosphere do, and a reader comparing two cards should know why one is plainer.
   */
  const quality = input.appearance?.quality;
  // Within Earth Weather the decorative clouds never draw, at any setting: its clouds are the satellites' (D-W, WX9).
  const weatherClouds = input.layers.some((l) => l.id === 'EarthWeather' && l.active && l.implemented);
  const missing = quality
    ? [!quality.clouds && !weatherClouds && 'clouds', !quality.atmosphere && 'the atmosphere'].filter(Boolean).join(' and ')
    : '';
  if (quality && missing) {
    if (quality.setting === 'low') {
      say(`Drawn at the Low quality setting, without ${missing}, so the planet looks plainer than the full globe. The data is unchanged.`,
        `Drawn at Low quality, without ${missing}; the data is unchanged.`);
    } else {
      say(`Drawn without ${missing} because this device could not keep up, so the planet looks plainer than on a faster one. The data is unchanged.`,
        `Drawn without ${missing} on this device; the data is unchanged.`);
    }
  }

  // The solar system drawn Compact (OR9): every size true, not every distance. At True nothing is drawn other than it is.
  if (input.appearance?.solarSystem?.scale === 'compact') {
    say(SOLAR_COMPACT_CAVEAT, SOLAR_COMPACT_CAVEAT_SHORT);
  } else if (input.appearance?.solarSystem?.scale === 'diagram') {
    say(SOLAR_DIAGRAM_CAVEAT, SOLAR_DIAGRAM_CAVEAT_SHORT);
  } else if (input.appearance?.solarSystem?.scale === 'sky') {
    say(SKY_CAVEAT, SKY_CAVEAT_SHORT);
  }

  // The names are Natural Earth's, and some are contested (decision K5, TS12).
  if (input.appearance?.countryNames) {
    say(COUNTRY_NAMES_CAVEAT, COUNTRY_NAMES_CAVEAT_SHORT);
  }

  say('Unsigned client-side capture: one browser\'s view at one moment, not an attested record.', 'Unsigned capture: one browser\'s view at one moment.');

  return {
    schema: GLOBE_CAPTURE_SCHEMA,
    schemaVersion: GLOBE_CAPTURE_SCHEMA_VERSION,
    capturedAt: input.capturedAt.toISOString(),
    origin: CAPTURE_ORIGIN,
    camera: input.camera,
    frame: input.frame,
    ...(input.appearance ? { appearance: input.appearance } : {}),
    build,
    marks,
    layersShown,
    legend: input.legend ?? [],
    layersSelectedButEmpty,
    ...(input.featured ? { featured: input.featured } : {}),
    ...(input.link ? { link: input.link } : {}),
    ...(input.qr ? { qr: input.qr } : {}),
    ...(input.window !== undefined ? { window: input.window } : {}),
    ...(input.raverWatchItems?.length ? { raverWatchItems: input.raverWatchItems } : {}),
    ...(input.shot ? { shot: input.shot } : {}),
    card,
    ...(input.frontPage ? { frontPage: input.frontPage } : {}),
    ...(input.timestream ? { timestream: input.timestream } : {}),
    ...(input.chart ? { chart: input.chart } : {}),
    feeds: input.feeds,
    // A declassified page's releases are not drawn, so no feed credits them: the page does (plan H9). And the
    // licences the notes in the picture carry, each once (schema 29).
    credits: [...new Set([
      ...creditsShown(input.feeds),
      ...(input.frontPage && 'kind' in input.frontPage && input.frontPage.kind === 'declassified' ? input.frontPage.credits : []),
      ...groupedLicences(input.licences ?? []),
      // The strip's sources, as they ask to be named (D-PW, PW62).
      ...(input.timestream?.credits ?? []),
      // A chart's ephemeris (D-PW, PW87).
      ...(input.chart ? [CHART_CREDIT] : []),
    ])],
    ...(input.licences?.length ? { licences: [...new Set(input.licences)] } : {}),
    imagery: imageryShown(input.imagery ?? []),
    caveats,
    caveatsShort,
  };
}

/**
 * The camera position as a line a person can read.
 *
 * Uses the same 2-decimal convention as DEFAULT_GEO_PRECISION_M in
 * SourceObservation — about a kilometre. A camera position is not an
 * observation and needs no protection, but two different coordinate formats in
 * one product is how a reader learns to distrust both.
 */
export function formatCameraLine(camera: CameraProvenance): string {
  const ns = camera.lat >= 0 ? 'N' : 'S';
  const ew = camera.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(camera.lat).toFixed(2)}°${ns} ${Math.abs(camera.lon).toFixed(2)}°${ew}`
    + ` · alt ${camera.altitude.toFixed(2)}R`;
}
