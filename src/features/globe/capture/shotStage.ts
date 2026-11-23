/**
 * Staging a shot on the globe, and rendering it (decision IM1; globe record,
 * section 21).
 *
 * A shot is staged through the operations the share handle already offers, in
 * one order: its layers, its time and its look; then it waits for its subject
 * to be drawn, frames it, and features it. What a shot does not state is left
 * as the page has it, and the shot returned states everything as it was drawn,
 * so the shot a card carries makes the same picture again.
 *
 * `planShotWith` is the dry run: it stages, says what is in frame and warns,
 * and composes nothing, so a render is never spent on a picture that would be
 * wrong. `renderShotWith` stages and composes, trying a blank frame once more
 * and meeting a byte limit by lowering the quality.
 *
 * Written against an interface rather than the hook, so the order and the
 * reading back are tested without a globe.
 */
import { readShot, type AskedShot, type Shot, type ShotImageType, type StripAsk } from './shotSpec';
import type { StripModel } from './timestreamStrip';
import { chartForCard, type CardChart } from './chartCard';
import { GlobeCaptureError } from './captureGlobeFrame';
import { decideTemplate, type CardTemplate, type ItemSays, type TemplateChooser } from './cardTemplates';
import { bytesOfDataUrl } from './cardLint';
import type { CardFit, CardPreset } from './shareCardLayout';
import type { DescribedLayer } from './describeView';
import type { GlobeLightMode, GlobeSkin } from '../../../services/globe/globeAppearance';
import { briefFrontRows, type WarConflictBrief } from '../../../services/warConflict/warConflictBrief';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import type { DeclassifiedFrontPage, FrontPageProvenance, PsiBriefingPage, PsiFrontPage, TonightFrontPage, WeekFrontPage } from './shareCardProvenance';
import type { FeaturedReport } from './shareReports';
import type { TerritoryStyle } from '../../../geopolitical/theme/territoryStyles';
import type { MarkerStyle } from '../../../components/Globe/markerStyles';
import type { PsiFieldLook } from '../../../services/psiWatch/psiField/psiFieldLooks';

/** The ψ field's looks on a card whose shot names none: heat and contours, as the panel starts (Mecha Jono, 30 Oct). */
const DEFAULT_CARD_PSI_LOOKS: readonly PsiFieldLook[] = ['heat', 'contours'];
/** Whether the ψ field is drawn: in front or pinned. */
const psiFieldDrawn = (deps: Pick<ShotStageDeps, 'listLayers'>): boolean =>
  deps.listLayers().some((l) => l.id === 'PsiModel' && (l.primary || l.pinned));

type Appearance = { skin: GlobeSkin | 'auto'; lightMode: GlobeLightMode; nightFill: number };
type View = { lat: number; lng: number; altitude: number };

/** What a card is, as compose returns it: only what staging reads of it. */
export interface StagedCard {
  dataUrl: string;
  /** The card's own warnings (cardLint), which a render returns with the plan's. */
  warnings?: string[];
}

export interface ShotStageDeps<Card extends StagedCard = StagedCard> {
  /** The layer ids this build has. */
  layers(): readonly string[];
  listLayers(): Array<{ id: string; primary: boolean; pinned: boolean }>;
  setLayer(id: string, options?: { clearOtherPins?: boolean }): unknown;
  pinLayers(ids: string[]): unknown;
  setTimeWindow(window: { from: number; until: number } | null): Promise<unknown>;
  /** Pause the shared timeline at a moment, in unix seconds, as a person would (IM20). */
  setTimeMoment(atS: number): Promise<unknown>;
  getTimeWindow(): { from: number | null; until: number | null; live: boolean };
  getAppearance(): Appearance;
  setAppearance(patch: Partial<Appearance>): void;
  /**
   * The territories' style the next cards draw, or null for the default, Quiet
   * (decision K5, TS3); and the style they draw now. A card's own, never the screen's.
   */
  setCardTerritories(style: TerritoryStyle | null): void;
  cardTerritories(): TerritoryStyle;
  /** Whether the next cards draw country names (decision K5, TS10), and until they can, or why not. */
  setCardCountryNames(asks: boolean): void;
  untilCountryNames(timeoutMs: number): Promise<void>;
  /**
   * One mark style for every layer, or null for each layer's own (plan H4); and until
   * the globe draws it, or why not. The shot's alone, never saved.
   */
  setCardMarkStyle(style: MarkerStyle | null): void;
  /** The ψ field's looks for the card, or null to give the person's back (Mecha Jono, 30 Oct). */
  setCardPsiLooks?(looks: readonly PsiFieldLook[] | null): void;
  untilMarkStyleDrawn(timeoutMs: number): Promise<void>;
  whenReady(options: { address?: string; timeoutMs: number }): Promise<{ ready: boolean; waitedMs: number; reason?: string }>;
  frameReports(ids: string[], options: { preset: CardPreset }): Promise<unknown>;
  setView(view: View): Promise<unknown>;
  focusReport(id: string | null): unknown;
  /** Until the globe shows this item featured, or nothing when null. */
  untilFeatured(id: string | null): Promise<void>;
  /** What a drawn item says it is (listReports), or null when it is not drawn. */
  reportOf(id: string): ItemSays | null;
  /** Why a drawn item may not have a close-up (IM2, IM36), or null when it may. */
  closeUpRefusal(id: string): string | null;
  /**
   * The War & Conflict Brief of `latest` or a UTC day once it is read, with the
   * centre of its drawn items, or null when they have no one centre. Throws why
   * when there is none (IM16).
   */
  untilBrief(day: string, timeoutMs: number): Promise<StagedBrief>;
  /**
   * An area's frame and what its card says (BA22, BA23), once its shape is
   * fetched, from the page as it stands. Throws why when there is none.
   */
  untilArea(code: string, preset: CardPreset, timeoutMs: number): Promise<StagedArea>;
  /** Light an area no report need name, or none (BA23). */
  lightArea(code: string | null): void;
  /** Until the globe shows that area lit, or none. */
  untilLit(code: string | null): Promise<void>;
  /**
   * A War & Conflict theatre's frame and what its card says (theatre-lens.md, TL3),
   * once the layer has read it: framed to its items standing, or to its countries
   * when none stand. Throws why when there is no such theatre.
   */
  untilTheatre(slug: string, preset: CardPreset, timeoutMs: number): Promise<StagedTheatre>;
  /**
   * The card's own theatre lens (theatre-lens.md, TL3, TL15): these theatres lit and
   * the rest of the war map faded, none for an empty list, whatever a person picked
   * on screen; null hands the lens back to the person's pick, untouched.
   */
  setLens(slugs: readonly string[] | null): void;
  /** Until the globe shows these theatres lit, and only these. */
  untilLensLit(slugs: readonly string[]): Promise<void>;
  /**
   * Tonight's page and where its events centre (raver-nights.md, RN3), once Scene
   * events are read: the twelve hours from the timeline's moment. Throws why when
   * no event starts in them.
   */
  untilTonight(timeoutMs: number): Promise<StagedTonight>;
  /**
   * Hero Watch's week, its page and where its relief and missions centre (hero-watch.md, HW10), once
   * Hero Watch is read. Throws why when nothing stands to put on it.
   */
  untilWeek(timeoutMs: number): Promise<StagedWeek>;
  /**
   * The declassified desk's day (plan H9): `latest` or a UTC day, its page, once its releases are read from The
   * Record. Throws why when the day has none.
   */
  untilDeclassified(day: string, timeoutMs: number): Promise<StagedDeclassified>;
  /**
   * A Psi Watch sky event or window (D-PW, PW62), once the kit's events are read: its page at the moment asked
   * (its exact one, or a unix second inside its window), the layer that draws it, and where to look from; opened, so
   * Planet lines draw its bodies. Throws why when there is no such event, or the moment is outside its window.
   */
  untilPsiEvent(address: string, at: 'exact' | number, timeoutMs: number): Promise<StagedPsi>;
  /**
   * The PsiOps Briefing (D-PW, PW62, PW77): the week from a moment, once the kit's notes and Kp are read; its page,
   * where to look from, and the week's first sky event opened so Planet lines draw it. Throws why when Psi Watch is off.
   */
  untilPsiBriefing(atS: number, timeoutMs: number): Promise<StagedPsiBriefing>;
  /**
   * The Timestream strip a card draws under its picture (D-PW, PW62, PW77), at the card's moment: its span and lanes
   * as asked, the card's own event lit, the bodies its lanes show. Throws why when Psi Watch is off.
   */
  stripFor(options: { ask: StripAsk; atS: number; lit: string[]; bodies: string[] }): Promise<StripModel>;
  /**
   * The timeline as the person has it, held: the function returned puts it back,
   * live, paused at its moment, or on its window (raver-nights.md, RN10). Tonight's
   * card draws tonight's hours and gives the person's timeline back after.
   */
  holdTimeline(): () => Promise<void>;
  /** Tonight's hours on the timeline, read from their start, until the timeline shows them (RN10). */
  showTonight(window: { from: number; until: number }): Promise<void>;
  compose(options: {
    preset: CardPreset; fit: CardFit; scale: number; mimeType: ShotImageType; quality?: number; shot: Shot;
    /** The card's template and who chose it (IM14), or null for the default card. */
    template: ChosenTemplate | null;
    /** A front page's facts, in place of an item's (IM16), or null. */
    frontPage: FrontPageProvenance | null;
    /** What a card about an area says, in place of a featured item's (BA23); absent for any other card. */
    area?: FeaturedReport | null;
    /** Whether the card returns its alt text (the shot's `output.alt`). */
    alt: boolean;
    /** A QR code of the view, with the footer, when the shot asks (`card.qr`, IM13). */
    qr?: boolean;
    /** A close-up of the featured item in the picture's corner, when the shot asks (`card.inset`, IM36). */
    inset?: boolean;
    /** A Timestream strip under the picture, when the shot asks (`card.strip`, PW62). */
    timestream?: StripModel | null;
    /** An event chart over a corner of the picture, when the shot asks (`card.chart`, PW87). */
    chart?: CardChart | null;
  }): Promise<Card>;
  describeView(options: { preset: CardPreset; fit: CardFit; qr?: boolean }): { layers: DescribedLayer[] };
  nextFrame(): Promise<void>;
  now(): number;
}

export interface ShotPlan {
  ok: boolean;
  shot?: Shot;
  notes: string[];
  warnings: string[];
  /** What a card of this shot would show, per drawn layer. */
  inFrame?: DescribedLayer[];
  /** How long the last card took on this page, in ms; null until one was made. */
  estimatedComposeMs?: number | null;
  reason?: string;
}

export interface ShotRender<Card extends StagedCard = StagedCard> {
  ok: boolean;
  card?: Card;
  shot?: Shot;
  notes: string[];
  warnings: string[];
  timing?: { stageMs: number; composeMs: number; bytes: number };
  reason?: string;
}

/** A brief as staged: its facts, and where its drawn items centre. */
export type StagedBrief = WarConflictBrief & { centre: { lat: number; lng: number } | null };

/** Hero Watch's week as staged (HW10): its page, and where its relief and missions centre, or null. */
export interface StagedWeek {
  page: WeekFrontPage;
  centre: { lat: number; lng: number } | null;
}

/** The PsiOps Briefing as staged (PW77): its page, where to look from, and the bodies of the sky event it opened. */
export interface StagedPsiBriefing {
  page: PsiBriefingPage;
  view: View | null;
  bodies: string[];
}

/** The layers the Briefing's card draws: Windows first, Planet lines and Psi Alerts beside it unless the shot pins its own. */
const BRIEFING_PINS = ['PsiLines', 'PsiRifts'];

/** A psi event as staged (D-PW, PW62): its page, the layer that draws it, and where to look from, or null. */
export interface StagedPsi {
  page: PsiFrontPage;
  primary: 'PsiLines' | 'PsiWindows';
  view: View | null;
}

/** The declassified desk's day as staged (plan H9): its page. Its releases have no place, so the camera stays. */
export interface StagedDeclassified {
  page: DeclassifiedFrontPage;
}

/** The sections the week's card draws: its primary, and the others pinned beside it unless the shot pins its own. */
const WEEK_LAYERS = ['Relief', 'FieldMissions', 'Lifeboats'] as const;

/** Tonight as staged (RN3): its page, and where its events centre, or null when they have no one centre. */
export interface StagedTonight {
  page: TonightFrontPage;
  centre: { lat: number; lng: number } | null;
}

/** A theatre as staged (theatre-lens.md, TL3): where to look from, and what its card says. */
export interface StagedTheatre {
  slug: string;
  view: View;
  card: FeaturedReport;
}

/** An area as staged (BA22, BA23): where to look from, and what its card says. */
export interface StagedArea {
  code: string;
  name: string;
  view: View;
  card: FeaturedReport;
}

/**
 * How far out a front page looks, in globe radii: far enough that a day's war
 * news, spread over continents, stands on the near side. The card shows the
 * whole planet whatever the altitude; this decides how much of it faces us.
 */
export const BRIEF_ALTITUDE = 2.5;

/**
 * A brief's front page; narrowed to its worst theatres (theatre-lens.md, TL15, TL16),
 * a row each in its lines, and the theatres it lit, by slug.
 */
const frontPageOf = (brief: WarConflictBrief, narrowed: number): FrontPageProvenance => ({
  template: 'conflict_brief',
  day: brief.day,
  title: brief.title,
  lines: narrowed ? briefFrontRows(brief, narrowed) : brief.lines,
  count: brief.count,
  theatres: brief.theatres.map(({ name, count, tier }) => ({ name, count, tier })),
  noTheatre: brief.noTheatre,
  ...(narrowed ? { lit: brief.theatres.slice(0, narrowed).map((t) => t.slug) } : {}),
});

/** The person's timeline while a shot holds it (RN10): its put-back, run once, or null when nothing holds it. */
interface HeldTimeline { putBack: (() => Promise<void>) | null }

/** The timeline put back after a shot that held it; a put-back that fails is said, never passed over. */
async function puttingBack<R extends { warnings: string[] }>(result: R, held: HeldTimeline): Promise<R> {
  const putBack = held.putBack;
  if (!putBack) return result;
  held.putBack = null;
  try {
    await putBack();
    return result;
  } catch (e) {
    return { ...result, warnings: [...result.warnings, `The timeline was not put back as it was: ${reasonOf(e)}`] };
  }
}

/** A card's template, and whether the item or the shot chose it (IM14). */
export interface ChosenTemplate { name: CardTemplate; chosenBy: TemplateChooser }

const DEFAULT_TIMEOUT_MS = 30_000;
/** Each retry over a byte limit multiplies the quality by this, down to the floor. */
const QUALITY_STEP = 0.8;
const QUALITY_FLOOR = 0.4;
/** How long the last card took, per page: a planner's estimate, measured rather than guessed. */
const lastComposeMs = new WeakMap<object, number>();

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** A layer drawing nothing in the picture: worth knowing before posting, in a plan and a render alike. */
const warningsOf = (inFrame: readonly DescribedLayer[]) => inFrame
  .filter((layer) => layer.inFrame === 0)
  .map((layer) => `${layer.layer} draws nothing in this picture${layer.drawn > 0 ? ` (${layer.drawn} elsewhere on the globe)` : ''}`);

/** Stages a shot already read, and states it as drawn. Throws a reason when it cannot. */
async function stage(
  asked: AskedShot,
  deps: ShotStageDeps,
  timeoutMs: number,
  held: HeldTimeline,
): Promise<{ shot: Shot; template: ChosenTemplate | null; frontPage: FrontPageProvenance | null; area: FeaturedReport | null; strip: StripModel | null; chart: CardChart | null }> {
  // Tonight's card holds the person's timeline as they had it, before the shot's own moment moves it (RN10).
  if ('tonight' in asked.subject) held.putBack = deps.holdTimeline();
  // No area lit but a shot's own, from the start: one lit by an earlier card stays out of this one even if this one fails.
  if (!('area' in asked.subject)) {
    deps.lightArea(null);
    await deps.untilLit(null);
  }
  if (asked.layers?.primary !== undefined) deps.setLayer(asked.layers.primary, { clearOtherPins: asked.layers.pins !== undefined });
  // A brief draws War & Conflict (IM16); readShot refused any other primary.
  else if ('brief' in asked.subject) deps.setLayer('WarConflict', { clearOtherPins: asked.layers?.pins !== undefined });
  // An area's card counts its Intel Reports (BA23); readShot refused any other primary.
  else if ('area' in asked.subject) deps.setLayer('IntelReports', { clearOtherPins: asked.layers?.pins !== undefined });
  // A theatre is War & Conflict's (TL3); readShot refused any other primary.
  else if ('theatre' in asked.subject) deps.setLayer('WarConflict', { clearOtherPins: asked.layers?.pins !== undefined });
  // Tonight is Scene events' (RN3); readShot refused any other primary.
  else if ('tonight' in asked.subject) deps.setLayer('SceneEvents', { clearOtherPins: asked.layers?.pins !== undefined });
  // The week draws Hero Watch (HW10): Relief, unless the shot names another of its sections.
  else if ('week' in asked.subject) deps.setLayer('Relief', { clearOtherPins: asked.layers?.pins !== undefined });
  // The declassified desk is an Intel desk: Intel Reports behind its page, whose releases have no place (plan H9).
  else if ('declassified' in asked.subject) deps.setLayer('IntelReports', { clearOtherPins: asked.layers?.pins !== undefined });
  // A psi event, opened and read first: its layer, and the moment it is drawn at, are its own (PW62).
  const psi = 'psiEvent' in asked.subject ? await deps.untilPsiEvent(asked.subject.psiEvent, asked.subject.at, timeoutMs) : null;
  if (psi && asked.layers?.primary === undefined) deps.setLayer(psi.primary, { clearOtherPins: asked.layers?.pins !== undefined });
  // The PsiOps Briefing, read first, so a page with Psi Watch off says why: the week from the shot's moment, or now (PW77).
  const briefing = 'psiBriefing' in asked.subject;
  const psiBrief = briefing ? await deps.untilPsiBriefing(asked.time && 'at' in asked.time ? asked.time.at : Math.floor(deps.now() / 1000), timeoutMs) : null;
  // It draws Windows first.
  if (briefing && asked.layers?.primary === undefined) deps.setLayer('PsiWindows', { clearOtherPins: asked.layers?.pins !== undefined });
  if (asked.layers?.pins !== undefined) deps.pinLayers(asked.layers.pins);
  // And the week's other sections beside it, where the shot pins none of its own: one card, the whole week.
  else if ('week' in asked.subject) deps.pinLayers(WEEK_LAYERS.filter((layer) => layer !== (asked.layers?.primary ?? 'Relief')));
  // A window's sky event drawn beside its places: Planet lines pinned, where the shot pins none of its own.
  else if (psi?.primary === 'PsiWindows') deps.pinLayers(['PsiLines']);
  else if (briefing) deps.pinLayers(BRIEFING_PINS);
  if (psi) await deps.setTimeMoment(psi.page.atS);
  else if (asked.time) {
    if ('at' in asked.time) await deps.setTimeMoment(asked.time.at);
    else await deps.setTimeWindow('live' in asked.time ? null : asked.time.window);
  }
  // The territories in the shot's style, or Quiet: never left from an earlier shot.
  deps.setCardTerritories(asked.appearance?.territories ?? null);
  // Names only where the shot asks, and then not until they can be drawn (TS10).
  const names = asked.appearance?.countryNames === true;
  deps.setCardCountryNames(names);
  if (names) await deps.untilCountryNames(timeoutMs);
  // The shot's mark style, or each layer's own: never left from an earlier shot.
  const markStyle = asked.appearance?.markStyle ?? null;
  deps.setCardMarkStyle(markStyle);
  await deps.untilMarkStyleDrawn(timeoutMs);
  // The ψ field's looks: the shot's, or heat and contours, whoever's panel is open (Mecha Jono, 30 Oct).
  const psiLooks: readonly PsiFieldLook[] = asked.appearance?.psiLooks ?? DEFAULT_CARD_PSI_LOOKS;
  deps.setCardPsiLooks?.(psiLooks);
  if (asked.appearance) {
    const { skin, light, nightFill } = asked.appearance;
    deps.setAppearance({
      ...(skin !== undefined ? { skin } : {}),
      ...(light !== undefined ? { lightMode: light } : {}),
      ...(nightFill !== undefined ? { nightFill } : {}),
    });
  }
  const address = 'address' in asked.subject ? asked.subject.address : undefined;
  // A psi event's address is awaited as an item's is: drawn, at its moment (the kit's ask, schemas_psi §3.6).
  const awaited = address ?? ('psiEvent' in asked.subject ? asked.subject.psiEvent : undefined);
  const ready = await deps.whenReady({ ...(awaited ? { address: awaited } : {}), timeoutMs });
  if (!ready.ready) throw new Error(ready.reason ?? 'The globe was not ready to capture.');
  const featured = asked.emphasis.featured && address ? address : null;
  const preset = asked.card?.preset ?? 'wide';
  // A brief's day, read, before anything is framed: its front page is what the card states.
  const brief = 'brief' in asked.subject ? await deps.untilBrief(asked.subject.brief, timeoutMs) : null;
  // An area's frame and its facts, from the page as it stands once ready (BA22, BA23).
  const area = 'area' in asked.subject ? await deps.untilArea(asked.subject.area, preset, timeoutMs) : null;
  // A theatre's frame and its facts, once War & Conflict has read it (TL3).
  const theatre = 'theatre' in asked.subject ? await deps.untilTheatre(asked.subject.theatre, preset, timeoutMs) : null;
  // Tonight from the timeline's moment, once Scene events are read (RN3).
  const tonight = 'tonight' in asked.subject ? await deps.untilTonight(timeoutMs) : null;
  // Hero Watch's week, once it is read and drawn (HW10).
  const week = 'week' in asked.subject ? await deps.untilWeek(timeoutMs) : null;
  // The declassified desk's day, once its releases are read (plan H9).
  const declassified = 'declassified' in asked.subject ? await deps.untilDeclassified(asked.subject.declassified, timeoutMs) : null;
  if (tonight) {
    /*
     * Tonight's hours on the timeline, read from their start, so the globe draws tonight's
     * events and not the week's, and flares what has just started at tonight's start (RN10);
     * then ready again.
     */
    await deps.showTonight({ from: tonight.page.fromS, until: tonight.page.untilS });
    const again = await deps.whenReady({ timeoutMs });
    if (!again.ready) throw new Error(again.reason ?? 'The globe was not ready to capture tonight.');
  }
  /*
   * The brief narrowed to its worst theatres, in its own order (TL15, TL10), and where
   * each is: one that cannot be framed is still lit and still has its row.
   */
  const narrowed = 'brief' in asked.subject ? asked.subject.theatres ?? 0 : 0;
  const front = brief && narrowed ? brief.theatres.slice(0, narrowed) : [];
  const frontMiddles = (await Promise.all(front.map((t) => deps.untilTheatre(t.slug, preset, timeoutMs).then((staged) => staged.view, () => null))))
    .filter((view): view is View => view !== null);
  // The badge is a claim about the item, so the item decides it where it says (IM14),
  // decided before the camera moves, so a refusal leaves the view as it was.
  const decided = decideTemplate(
    asked.card?.template ?? (brief ? 'conflict_brief' : declassified ? 'declassified' : psi || psiBrief ? 'psi' : undefined),
    featured !== null ? deps.reportOf(featured) ?? { layer: 'unknown' } : null,
  );
  if ('reason' in decided) throw new Error(decided.reason);
  // A close-up is of the featured item, and only of one that may have it (IM36): decided here too, before the camera moves.
  if (asked.card?.inset) {
    if (featured === null) {
      throw new Error('card.inset asks for a close-up of the featured item, and this shot features none: give subject.address, featured.');
    }
    const refusal = deps.closeUpRefusal(featured);
    if (refusal) throw new Error(refusal);
  }
  if ('address' in asked.subject) await deps.frameReports([asked.subject.address], { preset });
  else if ('view' in asked.subject) await deps.setView(asked.subject.view);
  else if (area) await deps.setView(area.view);
  else if (theatre) await deps.setView(theatre.view);
  else if (front.length) {
    // One planet, centred among the theatres lit (TL17), as far out as the brief card's.
    const among = centreOf(frontMiddles.map((m) => ({ latitude: m.lat, longitude: m.lng }))) ?? brief?.centre ?? null;
    if (among) await deps.setView({ lat: among.lat, lng: among.lng, altitude: BRIEF_ALTITUDE });
  } else if (brief?.centre) await deps.setView({ ...brief.centre, altitude: BRIEF_ALTITUDE });
  // Tonight's events facing us, from as far out as a front page's.
  else if (tonight?.centre) await deps.setView({ ...tonight.centre, altitude: BRIEF_ALTITUDE });
  // The week's relief and missions facing us, as far out.
  else if (week?.centre) await deps.setView({ ...week.centre, altitude: BRIEF_ALTITUDE });
  // A psi window's places facing us, or the sky event's first body overhead at the moment (PW62).
  else if (psi?.view) await deps.setView(psi.view);
  // The Briefing's places facing us, or its first sky event's body overhead.
  else if (psiBrief?.view) await deps.setView(psiBrief.view);
  deps.focusReport(featured);
  await deps.untilFeatured(featured);
  if (area) {
    deps.lightArea(area.code);
    await deps.untilLit(area.code);
  }
  // The card's own lens, or none: a person's pick in the brief panel never reaches a card (TL3).
  const lens = theatre ? [theatre.slug] : front.map((t) => t.slug);
  deps.setLens(lens);
  await deps.untilLensLit(lens);

  // What was drawn, read back, so the shot states the page as it was.
  const listed = deps.listLayers();
  const window = deps.getTimeWindow();
  /*
   * The Timestream strip, when asked (PW62, PW77): at the card's moment, its event lit and its bodies' lanes. The
   * moment is the psi event's, the shot's own, tonight's start, the end of the timeline's window, or now.
   */
  // The Briefing draws one unasked, over its week (PW77), unless the shot says `strip: false`.
  const stripAsk = asked.card?.strip === false ? null
    : asked.card?.strip ?? (psiBrief ? { from: psiBrief.page.fromS, until: psiBrief.page.untilS } : null);
  const strip = stripAsk
    ? await deps.stripFor({
      ask: stripAsk,
      atS: psi ? psi.page.atS : psiBrief ? psiBrief.page.fromS : asked.time && 'at' in asked.time ? asked.time.at : tonight ? tonight.page.fromS
        : !window.live && window.until !== null ? window.until : Math.floor(deps.now() / 1000),
      lit: psi ? [psi.page.address] : [],
      bodies: psi ? psi.page.bodies : psiBrief ? psiBrief.bodies : [],
    })
    : null;
  /*
   * An event chart, when asked (PW87): the sky outside at the shot's cursorAt, or the card's moment as the strip takes
   * it (the psi event's, the shot's own, the timeline's window's end, or now).
   */
  const chart = asked.card?.chart
    ? chartForCard(asked.card.chart, asked.time && 'at' in asked.time ? asked.time.at
      : !window.live && window.until !== null ? window.until : Math.floor(deps.now() / 1000))
    : null;
  const look = deps.getAppearance();
  const shot: Shot = {
    v: asked.v,
    // A brief as the day it drew, so the shot makes the same front page again.
    subject: brief ? { brief: brief.day, ...(narrowed ? { theatres: narrowed } : {}) }
      // The declassified desk's day as drawn, likewise.
      : declassified ? { declassified: declassified.page.day }
        // A psi event at the moment drawn, so the same shot draws it at the same moment again.
        : psi && 'psiEvent' in asked.subject ? { psiEvent: asked.subject.psiEvent, at: psi.page.atS } : asked.subject,
    layers: { primary: listed.find((l) => l.primary)?.id ?? null, pins: listed.filter((l) => l.pinned).map((l) => l.id) },
    // Tonight as its start, which makes the same tonight again; a moment as asked: the timeline's window around it is the timeline's, not the shot's.
    time: tonight ? { at: tonight.page.fromS } : psi ? { at: psi.page.atS } : asked.time && 'at' in asked.time
      ? { at: asked.time.at }
      : window.live || window.from === null || window.until === null ? { live: true } : { window: { from: window.from, until: window.until } },
    emphasis: { featured: featured !== null },
    // A card about one item, one area or one theatre shows what the camera framed; one about none, the whole planet (IM9).
    framing: { fit: asked.framing?.fit ?? (featured !== null || area || theatre ? 'view' : 'planet') },
    appearance: {
      skin: look.skin, light: look.lightMode, nightFill: look.nightFill, territories: deps.cardTerritories(),
      // Said only when drawn, as card.qr and card.inset are: a card without names says nothing of them.
      ...(names ? { countryNames: true as const } : {}),
      // Said only when asked: unstated, each layer drew the page's own.
      ...(markStyle ? { markStyle } : {}),
      // As drawn, where the ψ field is: named, or heat and contours.
      ...(asked.appearance?.psiLooks || psiFieldDrawn(deps) ? { psiLooks: [...psiLooks] } : {}),
    },
    card: {
      preset,
      ...(decided.template ? { template: decided.template } : {}),
      ...(asked.card?.qr ? { qr: true } : {}),
      ...(asked.card?.inset ? { inset: true } : {}),
      // As drawn: its span and lanes, so the same shot draws the same strip.
      ...(strip ? { strip: { from: Math.floor(strip.fromMs / 1000), until: Math.ceil(strip.untilMs / 1000), lanes: [...strip.lanes] } } : {}),
      // As drawn: its moments and frame, so the same shot draws the same chart.
      ...(chart ? { chart: { ...chart.drawn } } : {}),
    },
    output: {
      type: asked.output?.type ?? 'image/png',
      scale: asked.output?.scale ?? 1,
      ...(asked.output?.quality !== undefined ? { quality: asked.output.quality } : {}),
      ...(asked.output?.maxBytes !== undefined ? { maxBytes: asked.output.maxBytes } : {}),
      ...(asked.output?.alt !== undefined ? { alt: asked.output.alt } : {}),
    },
  };
  return {
    shot,
    template: decided.template && decided.chosenBy ? { name: decided.template, chosenBy: decided.chosenBy } : null,
    frontPage: brief ? frontPageOf(brief, narrowed) : tonight ? tonight.page : week ? week.page : declassified ? declassified.page
      : psi ? psi.page : psiBrief ? psiBrief.page : null,
    // A theatre's facts stand where an area's do, in place of a featured item's.
    area: area ? area.card : theatre ? theatre.card : null,
    strip,
    chart,
  };
}

/*
 * A shot's territories style is the shot's alone: when its plan or render ends,
 * however it ends, the next card (a person's own included) draws Quiet again.
 */

/** The dry run: staged, described and warned of, with nothing composed. */
export async function planShotWith(input: unknown, deps: ShotStageDeps, options: { timeoutMs?: number } = {}): Promise<ShotPlan> {
  const held: HeldTimeline = { putBack: null };
  try {
    return await puttingBack(await planStaged(input, deps, options, held), held);
  } finally {
    // Only when something threw past the put-back above: what threw is what is reported.
    await held.putBack?.().catch(() => undefined);
    deps.setCardTerritories(null);
    deps.setCardCountryNames(false);
    deps.setCardMarkStyle(null);
    deps.setCardPsiLooks?.(null);
    // The lens back to the person's own: a card's lens is the card's alone (TL3).
    deps.setLens(null);
  }
}

/** Staged and composed: the card, the shot as drawn, and how long each part took. */
export async function renderShotWith<Card extends StagedCard>(
  input: unknown,
  deps: ShotStageDeps<Card>,
  options: { timeoutMs?: number } = {},
): Promise<ShotRender<Card>> {
  const held: HeldTimeline = { putBack: null };
  try {
    return await puttingBack(await renderStaged(input, deps, options, held), held);
  } finally {
    // Only when something threw past the put-back above: what threw is what is reported.
    await held.putBack?.().catch(() => undefined);
    deps.setCardTerritories(null);
    deps.setCardCountryNames(false);
    deps.setCardMarkStyle(null);
    deps.setCardPsiLooks?.(null);
    deps.setLens(null);
  }
}

async function planStaged(input: unknown, deps: ShotStageDeps, options: { timeoutMs?: number }, held: HeldTimeline): Promise<ShotPlan> {
  const read = readShot(input, { layers: deps.layers() });
  if ('reason' in read) return { ok: false, notes: [], warnings: [], reason: read.reason };
  let shot: Shot;
  try {
    ({ shot } = await stage(read.shot, deps, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, held));
  } catch (e) {
    return { ok: false, notes: read.notes, warnings: [], reason: reasonOf(e) };
  }
  let inFrame: DescribedLayer[];
  try {
    inFrame = deps.describeView({ preset: shot.card.preset, fit: shot.framing.fit, ...(shot.card.qr ? { qr: true } : {}) }).layers;
  } catch (e) {
    // A picture that cannot be planned, as a composed card with more to say than it holds: a refusal, with why.
    return { ok: false, shot, notes: read.notes, warnings: [], reason: reasonOf(e) };
  }
  return { ok: true, shot, notes: read.notes, warnings: warningsOf(inFrame), inFrame, estimatedComposeMs: lastComposeMs.get(deps) ?? null };
}

async function renderStaged<Card extends StagedCard>(
  input: unknown,
  deps: ShotStageDeps<Card>,
  options: { timeoutMs?: number },
  held: HeldTimeline,
): Promise<ShotRender<Card>> {
  const read = readShot(input, { layers: deps.layers() });
  if ('reason' in read) return { ok: false, notes: [], warnings: [], reason: read.reason };
  const notes = [...read.notes];
  const stageStart = deps.now();
  let shot: Shot;
  let template: ChosenTemplate | null;
  let frontPage: FrontPageProvenance | null;
  let area: FeaturedReport | null;
  let strip: StripModel | null;
  let chart: CardChart | null;
  try {
    ({ shot, template, frontPage, area, strip, chart } = await stage(read.shot, deps as ShotStageDeps, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, held));
  } catch (e) {
    return { ok: false, notes, warnings: [], reason: reasonOf(e) };
  }
  // A frame for the page to settle: what follows the last change (a refill after the timeline moved,
  // a fill rebuilt after the camera stopped) draws before the picture, so the same shot makes the same one.
  await deps.nextFrame();
  const stageMs = deps.now() - stageStart;
  // What the picture holds, layer by layer: a layer drawing nothing in it is a warning, as in a plan.
  // Advice only: a picture that cannot be described still composes, or refuses for its own reason.
  let layerWarnings: string[] = [];
  try {
    layerWarnings = warningsOf(deps.describeView({ preset: shot.card.preset, fit: shot.framing.fit, ...(shot.card.qr ? { qr: true } : {}) }).layers);
  } catch {
    layerWarnings = [];
  }

  const composeStart = deps.now();
  const composeOnce = async (quality: number | undefined): Promise<Card> => {
    const at = { ...shot, output: { ...shot.output, ...(quality !== undefined ? { quality } : {}) } };
    const ask = {
      preset: shot.card.preset, fit: shot.framing.fit, scale: shot.output.scale, mimeType: shot.output.type,
      ...(quality !== undefined ? { quality } : {}), shot: at, template, frontPage, alt: shot.output.alt !== false,
      ...(area ? { area } : {}),
      ...(shot.card.qr ? { qr: true } : {}),
      ...(shot.card.inset ? { inset: true } : {}),
      ...(strip ? { timestream: strip } : {}),
      ...(chart ? { chart } : {}),
    };
    try {
      return await deps.compose(ask);
    } catch (e) {
      // Blank at one moment is not blank for good (see whenReady): once more, a frame later.
      if (!(e instanceof GlobeCaptureError)) throw e;
      await deps.nextFrame();
      return deps.compose(ask);
    }
  };
  try {
    let quality = shot.output.quality;
    let card = await composeOnce(quality);
    let bytes = bytesOfDataUrl(card.dataUrl);
    const limit = shot.output.maxBytes;
    if (limit !== undefined && bytes > limit) {
      if (shot.output.type === 'image/png') {
        return {
          ok: false, shot, notes, warnings: [],
          reason: `The card is ${bytes} bytes, over maxBytes ${limit}, and a PNG has no quality to lower. Ask for image/webp or image/jpeg, or a smaller scale.`,
        };
      }
      const startedAt = quality ?? 0.92;
      quality = startedAt;
      while (bytes > limit && quality * QUALITY_STEP >= QUALITY_FLOOR) {
        quality = Math.round(quality * QUALITY_STEP * 1000) / 1000;
        card = await composeOnce(quality);
        bytes = bytesOfDataUrl(card.dataUrl);
      }
      if (bytes > limit) {
        return { ok: false, shot, notes, warnings: [], reason: `The card is ${bytes} bytes at quality ${quality}, still over maxBytes ${limit}. Ask for a smaller scale.` };
      }
      notes.push(`The card was over ${limit} bytes at quality ${startedAt}: made at quality ${quality}, ${bytes} bytes.`);
      shot = { ...shot, output: { ...shot.output, quality } };
    }
    const composeMs = deps.now() - composeStart;
    lastComposeMs.set(deps, composeMs);
    return { ok: true, card, shot, notes, warnings: [...layerWarnings, ...(card.warnings ?? [])], timing: { stageMs, composeMs, bytes } };
  } catch (e) {
    return { ok: false, shot, notes, warnings: [], reason: reasonOf(e) };
  }
}
