/**
 * The join: globe on screen → a share card, using the shipped functions.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * Every piece of this feature was written, tested and committed before this
 * file, and none of them had ever run together. `scripts/smoke-share-card.mjs`
 * proved the APPROACH produced a good image by reimplementing the pipeline
 * inside the page — and said so in its own comment, because the modules were
 * bundled with no handle to reach them:
 *
 *   "what this proves is that the APPROACH produces a good image, not that
 *    the shipped functions were the ones that ran."
 *
 * That is an honest note about a real gap, and this file is what closes it.
 * The order below is the pipeline; there is now exactly one definition of it,
 * and the smoke calls this rather than a copy that can drift from it.
 *
 * ─── THE ONE CONSTRAINT THAT IS NOT OBVIOUS ────────────────────────────────
 *
 * The capture and the bounds computation must both happen before anything
 * awaits, and they must agree about the frame.
 *
 * `captureGlobeFrame` temporarily resizes the renderer and sets the camera's
 * aspect to match, then restores both in a `finally`. `computeGlobeScreenBounds`
 * projects through whatever aspect the camera holds when IT runs. So bounds
 * computed after the capture describe the LIVE camera — which is only the same
 * view when the capture preserved the aspect ratio.
 *
 * That is why this takes `scale` and not `width`/`height`. A scale multiplies
 * both axes, so the aspect is unchanged and the projection stays valid; an
 * arbitrary width and height would silently produce a crop box for a different
 * camera than the one in the picture. `captureGlobeFrame` still accepts both —
 * it is a lower-level function with a different job — and this refuses the one
 * it cannot use correctly rather than passing it through and hoping.
 */
import { skyLook } from '../../../solar-system/sky/skyLook';
import { SOLAR_SCALE_LEGEND_ID, solarScale, solarSystemShownNow } from '../../../solar-system/solarScale';
import type { Shot } from './shotSpec';
import { getGlobeAppearance, getResolvedGlobeSkin, GLOBE_SKIN_LABELS } from '../../../services/globe/globeAppearance';
import { getGlobeQuality, qualityStepOf } from '../../../services/globe/globeQuality';
import { captureGlobeFrame, GlobeCaptureError, type CaptureResult, type GlobeCaptureTarget } from './captureGlobeFrame';
import { computeGlobeScreenBounds, type BoundsTarget } from './globeScreenBounds';
import {
  buildGlobeViewProvenance,
  type CameraProvenance,
  type FeedProvenance,
  type GlobeViewProvenance,
  type LayerProvenance,
  type MarkProvenance,
  type AppearanceProvenance,
  type RaverWatchItemProvenance,
  type FrontPageProvenance,
  type InsetProvenance,
  COUNTRY_NAMES_SOURCE,
} from './shareCardProvenance';
import { getLegends, legendsAsCardsDraw, type LayerLegend } from '../../../services/globe/globeLegendStore';
import { cardShellLift, cardTerritoryStyle, legendsForCard, territoriesMissedCardStyle } from '../../../globe-engine/territoryLook';
import { readAtLift } from '../../../globe-engine/shellLift';
import { cardCountryNames, countryNamesInLastCapture, countryNamesMissedCard, setCardNameObstacles } from '../../../globe-engine/countryNamesLook';
import type { ScreenBox } from '../../../globe-engine/placeNames';
import { IMAGERY, imageryDrawn } from '../../../globe-engine/imagery';
import type { SourceCredit } from './sourceCredits';
import {
  CARD_PRESETS,
  CARD_TYPE_LARGER,
  cardWindow,
  computeShareCardLayout,
  DEFAULT_CARD_STYLE,
  GLYPH_EDGE_PX,
  calloutInPicture,
  fitPicture,
  pictureSizeFor,
  type CardFit,
  type CardPreset,
  type MeasureText,
  type ShareCardLayout,
  type ShareCardStyle,
  type TypeStep,
  ShareCardLayoutError,
} from './shareCardLayout';
import type { FeaturedReport } from './shareReports';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { REPORT_SPRITES } from '../../../components/Globe/globeAltitudes';
import { Vector3, type Object3D, type Scene } from 'three';
import { describeScene, keyedLayers, markPositions } from './describeView';
import { TEMPLATE_SPECS, type CardTemplate, type TemplateChooser } from './cardTemplates';
import { altTextFor } from './cardAltText';
import { bytesOfDataUrl, lintCard } from './cardLint';
import { withCardRecord } from './cardFileRecord';
import { encodeQr } from './cardQr';
import { layoutInset, type CardInset, type InsetLayout } from './closeUpInset';
import { timestreamProvenance, type StripModel } from './timestreamStrip';
import { chartProvenance, drawChartInset, layoutChartInset, type CardChart } from './chartCard';
import {
  canvasMeasurer,
  DEFAULT_CARD_THEME,
  drawShareCard,
  type Drawable2D,
  type ShareCardTheme,
} from './drawShareCard';
import { currentComparison, type Comparison } from '../../../globe-engine/compareLayers';
import { drawCompareHalves } from './compareHalves';

/** Everything the pipeline needs from the globe. Both halves of one object. */
export type ShareCardTarget = GlobeCaptureTarget & BoundsTarget;

/**
 * How much margin to leave around the sphere's computed bounds.
 *
 * 0.12, and the reason is written at `padBounds`: the geometry bounds the
 * SPHERE, while the globe renders an atmosphere glow beyond it. At 0.06 the
 * first composed card had the glow shaved off along the bottom edge — found by
 * opening the PNG, not by any test, because no test asserting containment of
 * surface points can see something that is not on the surface.
 */
export const DEFAULT_PAD_FRACTION = 0.12;

export class ShareCardCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareCardCompositionError';
  }
}

/** The 2D surface this needs: drawing, plus measurement for the layout. */
export type ShareCardContext = Drawable2D & { measureText(text: string): { width: number } };

export interface ShareCardCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): ShareCardContext | null;
  toDataURL(type?: string, quality?: number): string;
}

/**
 * The two browser capabilities this needs, injected.
 *
 * Not for purity — so the ORDER of the pipeline can be tested. jsdom has no
 * canvas and cannot decode an image, so the pixels are proven by the smoke;
 * what a unit test can hold onto is that the capture happened before the
 * bounds, that the padding was applied, and that a refusal refuses.
 */
export interface ComposeDeps {
  createCanvas(): ShareCardCanvas;
  /** Turn the capture's data URL back into something drawable. */
  loadImage(dataUrl: string): Promise<CanvasImageSource>;
  /** Read at the moment of capture, so `capturedAt` cannot be authored. */
  now(): Date;
  /**
   * The planet's look and its light source, read here rather than passed in: like
   * `now`, it is state of the running app, and a caller free to supply it would be
   * AUTHORING provenance, which this module exists to prevent.
   */
  appearance(): AppearanceProvenance;
  /**
   * What the drawn layers say their marks mean, read here for the same reason as
   * `appearance`: it is state of the running app, published by the layers as they
   * drew — a caller free to supply it would be authoring the legend.
   */
  legend(): LayerLegend[];
  /**
   * Who made the images the globe is drawing (globe-engine/imagery.ts), read here for the
   * same reason as `appearance`. Absent, the card credits no imagery.
   */
  imagery?(): readonly SourceCredit[];
  /**
   * Writes the card's record into its own file (cardFileRecord), so a copy carries
   * what it states. Absent, the file is left as the canvas made it.
   */
  writeRecord?(
    dataUrl: string,
    card: { mimeType: string; width: number; height: number; provenance: GlobeViewProvenance; alt?: string },
  ): { dataUrl: string; omitted: string[] };
  /**
   * The layers drawing in the card's picture, by the label their key uses, so the
   * card keys only those (IM12): measured through the camera as it stands, in the
   * window the capture renders. Absent, or null, when it cannot be told: every
   * layer is keyed then.
   */
  layersInPicture?(
    target: ShareCardTarget,
    frame: { width: number; height: number },
    crop: { x: number; y: number; width: number; height: number },
  ): string[] | null;
  /**
   * Where the picture's marks are, in the canvas's pixels, measured like
   * `layersInPicture`, for a close-up inset to keep clear of (IM35). Absent, or
   * null, when it cannot be told: the inset takes its corner by the item alone.
   */
  marksInPicture?(
    target: ShareCardTarget,
    frame: { width: number; height: number },
    crop: { x: number; y: number; width: number; height: number },
  ): Array<{ x: number; y: number }> | null;
}

export interface ComposeShareCardInput {
  /** Where the camera is, as react-globe.gl reports it. */
  camera: CameraProvenance;
  /** Every layer the operator could have on, with whether anything renders it. */
  layers: LayerProvenance[];
  /** Each source's state as the app was holding it. */
  feeds: FeedProvenance[];
  /** The analysis marks in the frame, or null when no analysis layer is up. */
  marks?: MarkProvenance | null;
  /** Linear multiplier on the on-screen canvas size. 2 gives four times the pixels. */
  scale?: number;
  padFraction?: number;
  /**
   * A published shape — see CARD_PRESETS. Applied under `style`, so an explicit
   * style field still wins; the preset is a starting point, not a lock.
   */
  preset?: CardPreset;
  style?: Partial<ShareCardStyle>;
  theme?: ShareCardTheme;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  /**
   * The report this card is about, as the app derived it from the globe
   * (shareReports.featuredReportFor). The card names it and points at its glyph,
   * and refuses if the glyph is not in the picture.
   */
  featured?: FeaturedReport | null;
  /** The view's own address, a deeplink v1 (provenance schema 10). */
  link?: string;
  /** The timeline's window in unix seconds, or null while live. */
  window?: { from: number; until: number } | null;
  /** The Raver Watch items drawn. */
  raverWatchItems?: RaverWatchItemProvenance[];
  /**
   * The drawn notes that carry a licence, each at its place (Interchange 3.25; schema 29): those in the picture are
   * credited on its Data line, and on a card that features one of them, that one alone (the owner's pick of 26 Oct).
   */
  licensed?: ReadonlyArray<{ id: string; lat: number; lng: number; licence: string }>;
  /** The shot this card is made from (schema 11). */
  shot?: Shot;
  /**
   * The card's template and who chose it (IM5, IM14): its badge opens the band
   * under the picture. Absent or null for the default card.
   */
  template?: { name: CardTemplate; chosenBy: TemplateChooser } | null;
  /** A front page's facts, which head the card in place of an item's (IM16). */
  frontPage?: FrontPageProvenance | null;
  /** Whether the card returns its alt text (the shot's `output.alt`). Default true. */
  alt?: boolean;
  /** A Timestream strip under the picture (D-PW, PW62, PW77): only when a shot asks. */
  timestream?: StripModel | null;
  /** An event chart over a corner of the picture (D-PW, PW87): only when a shot asks. */
  chart?: CardChart | null;
  /** A QR code of this short link, with the footer (IM13, IM30–IM32): only when a shot asks. */
  qr?: { link: string } | null;
  /**
   * A close-up of the featured item among its neighbours (IM34–IM36), in the
   * picture's corner: only when a shot asks, and only of the featured item.
   */
  inset?: CardInset | null;
  /**
   * The moment motion is held at while the picture renders (IM23): the paused
   * timeline's, which a shot's time.at sets (IM20). Default: the moment the card states.
   */
  stillAt?: number;
  /**
   * How the card frames the planet: what the camera framed, or the whole planet.
   * By default the view when the card features an item, the planet when not (IM9).
   */
  fit?: CardFit;
}

export interface ComposedShareCard {
  /** The finished card. */
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  /** What the card states, and why — the same object the caveats came from. */
  provenance: GlobeViewProvenance;
  /**
   * The region of the captured frame the card was cut from.
   *
   * Returned because its absence hid a real defect: when the crop box exceeds
   * the frame the layout clamps it, so the card is composed from the WHOLE
   * frame and looks fine — globe small, margins wide — with no number anywhere
   * saying the crop did nothing. Comparing this to `frame` says it plainly.
   */
  sourceRect: { x: number; y: number; width: number; height: number };
  /** The frame the card was cut from, for anyone who wants the uncropped view. */
  frame: CaptureResult;
  /** What a screen reader says for the card, from what it states (block I, item 5). Absent when not asked for. */
  alt?: string;
  /** What a poster would want to know before posting it; empty for a clean card. */
  warnings: string[];
  /** Where the card's picture and its footer are, in its pixels. */
  regions: CardRegions;
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where a card's parts are: the picture as drawn, and the band its footer is
 * drawn in, across the text's width: the card's, or a side card's column. The footer states the capture's moment and the build,
 * so it changes with every capture and every commit: a comparison of two cards
 * of one shot (golden cards, IM22) leaves that band out, and nothing else.
 */
export interface CardRegions {
  picture: Rect;
  footer: Rect;
  /** The QR code's square, quiet zone and all, when the card has one (IM32). */
  qr?: { x: number; y: number; size: number };
  /** The close-up inset's frame, when the card has one (IM35). */
  inset?: Rect;
  /** The event chart's square, when the card has one (D-PW, PW87). */
  chart?: Rect;
}

/**
 * The footer's band, from its lines as laid out: each is drawn from `y - fontPx`
 * (drawShareCard, top baseline), and its descenders reach a third of a line
 * below `y`. Two pixels either side for the antialiasing.
 */
function footerBand(layout: ShareCardLayout): Rect {
  const lines = layout.lines.filter((line) => line.kind === 'footer');
  if (lines.length === 0) return { x: layout.strip.x, y: layout.height, width: layout.strip.width, height: 0 };
  const top = Math.floor(Math.min(...lines.map((line) => line.y - line.fontPx))) - 2;
  const bottom = Math.ceil(Math.max(...lines.map((line) => line.y + line.fontPx / 3))) + 2;
  // Across the text's whole width: the card's, or a side card's column (IM27).
  return { x: layout.strip.x, y: top, width: layout.strip.width, height: bottom - top };
}

/** What the quality step drew, for the card to state — see globeQuality.ts. */
const qualityOnCard = () => {
  const state = getGlobeQuality();
  const step = qualityStepOf(state);
  return { setting: state.setting, detail: step.name, clouds: step.clouds, atmosphere: step.atmosphere };
};

/** The place Sky from a place is seen from, to 0.1°, as the key names it (D5); nothing at the other scales. */
const skyObserver = (): { observer?: { lat: number; lng: number } } => {
  const look = skyLook();
  return look ? { observer: { lat: Math.round(look.lat * 10) / 10, lng: Math.round(look.lng * 10) / 10 } } : {};
};

/** The key a card prints: the screen's, less the solar system's scale, which its caveat line says (OR9). */
const cardLegends = () => getLegends().filter((entry) => entry.layerId !== SOLAR_SCALE_LEGEND_ID);

/** A comparison as a card records it: the two halves' layers, and each half's name where it has one (schema 37). */
const compareOnCard = (c: Comparison) => ({ left: c.left, right: c.right, ...(c.labels ? { labels: c.labels } : {}) });

const browserDeps = (): ComposeDeps => ({
  createCanvas: () => document.createElement('canvas') as unknown as ShareCardCanvas,
  // The territories' entries in the card's style, which may not be the screen's (decision K5, TS3),
  // and each swatch as a card draws it: War & Conflict's hatching, which every capture draws (TL5).
  legend: () => legendsForCard(legendsAsCardsDraw(cardLegends())),
  imagery: () => imageryDrawn().map((id) => IMAGERY[id].source),
  appearance: () => ({
    // The skin actually drawn, not the choice: 'auto' is not a look, and "mode default"
    // on a card tells a reader nothing about the image in front of them.
    skin: GLOBE_SKIN_LABELS[getResolvedGlobeSkin()],
    lightMode: getGlobeAppearance().lightMode,
    // The card's style, not the screen's (decision K5, TS3).
    territories: cardTerritoryStyle(),
    // The names, only when the shot asked (TS10): the codes the capture placed, read after it is taken.
    ...(cardCountryNames()
      ? { countryNames: { codes: [...countryNamesInLastCapture().codes], source: COUNTRY_NAMES_SOURCE } }
      : {}),
    quality: qualityOnCard(),
    // The solar system's scale, when the picture drew any of it (schema 33; OR9).
    ...(solarSystemShownNow() > 0 ? { solarSystem: { scale: solarScale(), ...skyObserver() } } : {}),
    // Two layers side by side (schema 36; D-CM, CM3).
    ...(currentComparison() ? { compare: compareOnCard(currentComparison() as Comparison) } : {}),
  }),
  loadImage: (dataUrl) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ShareCardCompositionError(
      'The captured frame could not be decoded back into an image. The capture '
      + 'itself reported success, so this is a decode failure rather than a blank globe.',
    ));
    img.src = dataUrl;
  }),
  now: () => new Date(),
  writeRecord: withCardRecord,
  // Both read the scene after its frame was captured, so at the card's lift, not the screen's (shellLift.ts).
  marksInPicture: (target, frame, crop) => {
    try {
      return readAtLift(target.scene() as unknown as Scene, cardShellLift(), () =>
        markPositions({ scene: target.scene() as unknown as Object3D, camera: target.camera(), frame, crop, globeRadius: target.getGlobeRadius() }));
    } catch {
      return null;
    }
  },
  layersInPicture: (target, frame, crop) => {
    try {
      const legends = legendsForCard(legendsAsCardsDraw(cardLegends()));
      return keyedLayers(readAtLift(target.scene() as unknown as Scene, cardShellLift(), () => describeScene({
        scene: target.scene() as unknown as Object3D,
        camera: target.camera(),
        frame,
        crop,
        legends,
        globeRadius: target.getGlobeRadius(),
      })), legends);
    } catch {
      // A scene it cannot read: key everything rather than guess what is in the picture.
      return null;
    }
  },
});

/**
 * Where a report's glyph is in the canvas's pixels, or null when it is on the
 * far side of the planet. It may lie past the canvas: whether it is in the
 * picture is the card's window's to say.
 *
 * The glyph stands at REPORT_SPRITES, so that is the height projected, through
 * the camera as it stands, like computeGlobeScreenBounds.
 */
function projectGlyph(
  target: ShareCardTarget,
  position: { lat: number; lng: number },
  frame: { width: number; height: number },
): { x: number; y: number } | null {
  const camera = target.camera();
  // Lifted with the card's raised shell, as the glyph is (globe-engine/shellLift.ts).
  const radius = target.getGlobeRadius() * cardShellLift();
  const point = latLngToGlobeWorld(position.lat, position.lng, radius * REPORT_SPRITES);
  camera.updateMatrixWorld();
  // On the near side: the camera is above the point's horizon.
  const toCamera = new Vector3().subVectors(camera.position, point);
  if (toCamera.dot(point) <= 0) return null;
  const ndc = point.clone().project(camera);
  if (ndc.z < -1 || ndc.z > 1) return null;
  return { x: ((ndc.x + 1) / 2) * frame.width, y: ((1 - ndc.y) / 2) * frame.height };
}

/**
 * The picture a card will be, measured before anything is captured: the window
 * of the view it renders, its height in the card, and the layers its key names.
 * One measure for compose and for a dry run (describeView), so the two agree.
 *
 * A composed card (IM6) has a fixed height, so its picture is what its text
 * leaves, and its text includes the key of what the picture shows: measured from
 * the window it starts at, then from the window that height gives, keying both,
 * twice at most. A key naming a layer just outside the picture is the safe error.
 */
export interface CardPicture {
  /** The window of the view the card renders, in the canvas's pixels. */
  window: { x: number; y: number; width: number; height: number };
  /** The picture's size in the card, before scale: what the text leaves (IM6, IM27). */
  pictureWidth: number;
  pictureHeight: number;
  /** The layers the key names, or null to key every layer drawn. */
  keyLayers: string[] | null;
  canvasSize: { width: number; height: number };
  /** How the window frames the planet. */
  fit: CardFit;
  /** The style the card is laid out in: its preset's, one type step larger where it fits (IM38), and the caller's. */
  style: ShareCardStyle;
  /** Which type it took (IM38); absent for a size with one type, the 9:16. */
  typeStep?: TypeStep;
  /** The licences the notes in the picture carry (schema 29): read once, so the text is measured as it is drawn. */
  licences: string[];
}

export function planCardPicture(
  target: ShareCardTarget,
  input: ComposeShareCardInput,
  deps: ComposeDeps = browserDeps(),
  options: { measure?: MeasureText; capturedAt?: Date; key?: boolean } = {},
): CardPicture {
  const presetStyle = CARD_PRESETS[input.preset ?? DEFAULT_PRESET];
  const style: ShareCardStyle = { ...DEFAULT_CARD_STYLE, ...presetStyle, ...input.style };
  const padFraction = input.padFraction ?? DEFAULT_PAD_FRACTION;
  const canvasEl = target.renderer().domElement;
  const canvasSize = { width: canvasEl.width, height: canvasEl.height };
  const planet = computeGlobeScreenBounds(target, canvasSize);
  // A card about one item shows what the camera framed; one about none, the whole planet (IM9).
  const fit = input.fit ?? (input.featured ? 'view' : 'planet');
  const windowAt = (aspect: number) => cardWindow(planet, canvasSize, aspect, padFraction, fit);
  // What the key names: the layers drawing in the window (IM12).
  const keyOf = (window: CardPicture['window']) => (options.key !== false && deps.layersInPicture
    ? deps.layersInPicture(target, canvasSize, window)
    : null);
  // The licences the notes in the picture carry, from the window the card starts at: its Data line credits them.
  const licences = licencesIn(target, input.licensed, canvasSize, windowAt(style.globeAspect), input.featured?.id ?? null);

  if (style.height === undefined) {
    const window = windowAt(style.globeAspect);
    return { window, pictureWidth: style.width, pictureHeight: Math.round(style.width / style.globeAspect), keyLayers: keyOf(window), canvasSize, fit, style, licences };
  }

  // A composed card: its text first, its picture what the text leaves.
  const measure = options.measure ?? measurerFor(deps, input.theme ?? DEFAULT_CARD_THEME);
  const provenance = provenanceFor(input, deps, options.capturedAt ?? deps.now(), { width: 0, height: 0 }, licences);
  const planWith = (typeStyle: Partial<ShareCardStyle>): Omit<CardPicture, 'typeStep'> => {
    const laidOut: ShareCardStyle = { ...DEFAULT_CARD_STYLE, ...presetStyle, ...typeStyle, ...input.style };
    const sizeFor = (keyLayers: string[] | null) => pictureSizeFor({
      provenance,
      measure,
      style: { ...presetStyle, ...typeStyle, ...input.style },
      keyLayers,
      badge: input.template ? TEMPLATE_SPECS[input.template.name].badge : null,
      qr: !!input.qr,
      timestream: !!input.timestream,
    });
    let keyLayers = keyOf(windowAt(laidOut.globeAspect));
    let size = sizeFor(keyLayers);
    let window = windowAt(size.width / size.height);
    for (let pass = 0; pass < 2 && keyLayers !== null; pass++) {
      const seen = keyOf(window);
      const known: string[] = keyLayers;
      if (seen === null) {
        keyLayers = null;
      } else {
        const added = seen.filter((layer) => !known.includes(layer));
        if (!added.length) break;
        keyLayers = [...known, ...added];
      }
      size = sizeFor(keyLayers);
      window = windowAt(size.width / size.height);
    }
    return { window, pictureWidth: size.width, pictureHeight: size.height, keyLayers, canvasSize, fit, style: laidOut, licences };
  };
  /*
   * One type step larger where it fits, the compact type where the larger would
   * be refused (IM38): the whole picture planned in each, so a key the larger
   * type's window grew to name is measured in it too.
   */
  const larger = CARD_TYPE_LARGER[input.preset ?? DEFAULT_PRESET];
  if (!larger) return planWith({});
  try {
    return { ...planWith(larger), typeStep: 'larger' };
  } catch (e) {
    if (!(e instanceof ShareCardLayoutError)) throw e;
    return { ...planWith({}), typeStep: 'compact' };
  }
}

/**
 * The licences the notes in a window carry: each note whose glyph, on the near side, projects into it; on a card
 * that features one of them, that note's alone.
 */
function licencesIn(
  target: ShareCardTarget,
  licensed: ComposeShareCardInput['licensed'],
  canvasSize: { width: number; height: number },
  window: Rect,
  featuredId: string | null,
): string[] {
  if (!licensed?.length) return [];
  const own = featuredId === null ? [] : licensed.filter((note) => note.id === featuredId);
  if (own.length) return own.map((note) => note.licence);
  return licensed.filter((note) => {
    const at = projectGlyph(target, note, canvasSize);
    return at !== null && at.x >= window.x && at.x <= window.x + window.width && at.y >= window.y && at.y <= window.y + window.height;
  }).map((note) => note.licence);
}

/** The size a card is made at when none is asked: one meaning per size, everywhere (IM28). */
export const DEFAULT_PRESET: CardPreset = 'wide';

const NO_CONTEXT = 'No 2D context for the card canvas. Nothing can be composed without one, '
  + 'and returning the uncropped frame instead would publish an image with '
  + 'none of the caveats attached.';

/** A text measurer on a canvas of the card's own: none means no card can be laid out. */
function measurerFor(deps: ComposeDeps, theme: ShareCardTheme): MeasureText {
  const ctx = deps.createCanvas().getContext('2d');
  if (!ctx) {
    throw new ShareCardCompositionError(NO_CONTEXT);
  }
  return canvasMeasurer(ctx, theme.fontFamily);
}

/** The card's provenance: the one place its words come from, for measuring and for drawing alike. */
function provenanceFor(
  input: ComposeShareCardInput,
  deps: ComposeDeps,
  capturedAt: Date,
  frame: { width: number; height: number },
  licences: readonly string[] = [],
): GlobeViewProvenance {
  return buildGlobeViewProvenance({
    licences,
    capturedAt,
    // A paused moment is what the card shows: its sources are judged against it (D-W, step 5d).
    ...(input.stillAt !== undefined ? { shownAt: new Date(input.stillAt) } : {}),
    camera: input.camera,
    frame,
    layers: input.layers,
    feeds: input.feeds,
    marks: input.marks ?? null,
    appearance: deps.appearance(),
    imagery: deps.imagery?.() ?? [],
    legend: deps.legend(),
    featured: input.featured
      ? { id: input.featured.id, title: input.featured.title, lines: input.featured.lines }
      : null,
    link: input.link,
    ...(input.qr ? { qr: input.qr.link } : {}),
    window: input.window,
    raverWatchItems: input.raverWatchItems,
    shot: input.shot,
    template: input.template ?? null,
    frontPage: input.frontPage ?? null,
    timestream: input.timestream ? timestreamProvenance(input.timestream) : null,
    chart: input.chart ? chartProvenance(input.chart) : null,
  });
}

/** The picture's marks, from the canvas's pixels into the card's, less the featured item's own glyph. */
function cardMarksOf(
  marks: ReadonlyArray<{ x: number; y: number }> | null,
  window: Rect,
  picture: Rect,
  anchor: { x: number; y: number },
): Array<{ x: number; y: number }> {
  return (marks ?? [])
    .map((mark) => ({
      x: picture.x + ((mark.x - window.x) * picture.width) / window.width,
      y: picture.y + ((mark.y - window.y) * picture.height) / window.height,
    }))
    .filter((mark) => mark.x >= picture.x && mark.x <= picture.x + picture.width && mark.y >= picture.y && mark.y <= picture.y + picture.height)
    .filter((mark) => Math.hypot(mark.x - anchor.x, mark.y - anchor.y) > GLYPH_EDGE_PX);
}

/**
 * The featured item's label and its leader, placed as the layout will place them,
 * in the capture's pixels: the frame is the card's picture at its scale, so the
 * layout's map from the frame into the picture, run backwards.
 */
function calloutObstacles(
  glyph: { x: number; y: number },
  window: Rect,
  frame: { width: number; height: number },
  picture: { width: number; height: number },
  title: string,
  fontPx: number,
  measure: MeasureText,
): ScreenBox[] {
  const featuredAt = { x: ((glyph.x - window.x) * frame.width) / window.width, y: ((glyph.y - window.y) * frame.height) / window.height };
  const callout = calloutInPicture({ featuredAt, frame, picture, title, fontPx, measure });
  if (!callout) return [];
  const fitted = fitPicture({ x: 0, y: 0, ...picture }, frame);
  const sx = frame.width / fitted.width;
  const sy = frame.height / fitted.height;
  const box = (x1: number, y1: number, x2: number, y2: number): ScreenBox => ({
    x: (Math.min(x1, x2) - fitted.x) * sx,
    y: (Math.min(y1, y2) - fitted.y) * sy,
    width: Math.abs(x2 - x1) * sx,
    height: Math.abs(y2 - y1) * sy,
  });
  const { label, leader } = callout;
  return [
    box(label.x, label.y, label.x + label.width, label.y + label.height),
    box(leader.from.x, leader.from.y, leader.to.x, leader.to.y),
  ];
}

/** Boxes in the capture's pixels, as the card draws them: the frame is drawn onto the picture whole. */
function cardBoxesOf(boxes: readonly ScreenBox[], frame: { width: number; height: number }, picture: Rect): Rect[] {
  const sx = picture.width / frame.width;
  const sy = picture.height / frame.height;
  return boxes.map((b) => ({ x: picture.x + b.x * sx, y: picture.y + b.y * sy, width: b.width * sx, height: b.height * sy }));
}

/** What the card states of its inset (schema 16): what it draws and how finely, never where. */
const insetProvenanceOf = (inset: CardInset, laid: InsetLayout): InsetProvenance => ({
  kind: inset.kind,
  featured: inset.featured.id,
  shown: 1 + inset.others.length,
  within: inset.within,
  placedTo: inset.placedTo,
  gridKm: laid.gridKm,
  scale: laid.scale.text,
});

export async function composeShareCard(
  target: ShareCardTarget,
  input: ComposeShareCardInput,
  deps: ComposeDeps = browserDeps(),
): Promise<ComposedShareCard> {
  const theme = input.theme ?? DEFAULT_CARD_THEME;
  if (input.inset) {
    // A close-up is of the item the card is about, or it says something the card does not.
    if (!input.featured) {
      throw new ShareCardCompositionError(
        'A close-up draws the featured item among its neighbours, and this card has no featured item: '
        + 'feature one (focusReport), or leave the inset off.',
      );
    }
    if (input.inset.featured.id !== input.featured.id) {
      throw new ShareCardCompositionError(
        `The close-up of ${input.inset.featured.id} was made for another item than ${input.featured.id}: the card features another.`,
      );
    }
  }
  // The QR code's modules, when asked (IM30): its library is loaded here, before the measuring that nothing may interrupt.
  const qrModules = input.qr ? await encodeQr(input.qr.link) : null;

  // The card's canvas first: a composed card is measured in its type before its picture is captured.
  const canvas = deps.createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ShareCardCompositionError(NO_CONTEXT);
  }
  const measure = canvasMeasurer(ctx, theme.fontFamily);

  /* ─── nothing may await between the measuring and the capture ────────────
   * The card's window is measured through the camera as it stands, in the
   * canvas's own pixels, and the capture renders exactly that window, through
   * the camera's view offset, at the card's own resolution (block I, item 2):
   * the frame IS the card's picture. Before, the canvas was captured and cut,
   * and a square cut of a landscape canvas came out letterboxed and upscaled.
   */
  const scale = input.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new GlobeCaptureError(`scale must be a positive finite number, got ${scale}`);
  }
  // The moment the card states, read once: a composed card's text is measured with it before the capture.
  const capturedAt = deps.now();
  const plan = planCardPicture(target, input, deps, { measure, capturedAt });
  const { window, keyLayers } = plan;
  // The featured glyph, through the same camera, in the same pixels as the window.
  const glyph = input.featured ? projectGlyph(target, input.featured.position, plan.canvasSize) : null;
  // The picture's marks, likewise, for a close-up inset to keep clear of (IM35).
  const pictureMarks = input.inset && deps.marksInPicture ? deps.marksInPicture(target, plan.canvasSize, window) : null;
  const frameSize = { width: Math.round(plan.pictureWidth * scale), height: Math.round(plan.pictureHeight * scale) };
  // The names drawn in this capture keep clear of the label the card will draw (decision K5, TS11).
  setCardNameObstacles(cardCountryNames() && glyph && input.featured
    ? calloutObstacles(glyph, window, frameSize, { width: plan.pictureWidth, height: plan.pictureHeight }, input.featured.title, plan.style.bodyPx, measure)
    : []);
  let frame: CaptureResult;
  try {
    frame = captureGlobeFrame(target, {
      ...frameSize,
      view: window,
      mimeType: input.mimeType,
      quality: input.quality,
      stillAt: input.stillAt ?? capturedAt.getTime(),
    });
  } finally {
    setCardNameObstacles([]);
  }
  // The territories in the card's own style, and its names as its shot asked, or no card (decision K5, TS3, TS10).
  const missedStyle = territoriesMissedCardStyle() ?? countryNamesMissedCard();
  if (missedStyle) throw new GlobeCaptureError(missedStyle);
  /* ────────────────────────────────────────────────────────────────────── */

  const inWindow = glyph !== null
    && glyph.x >= window.x && glyph.x <= window.x + window.width
    && glyph.y >= window.y && glyph.y <= window.y + window.height;
  const featuredAt = glyph && inWindow
    ? { x: ((glyph.x - window.x) * frame.width) / window.width, y: ((glyph.y - window.y) * frame.height) / window.height }
    : null;

  if (input.featured && !featuredAt) {
    /*
     * Refused rather than composed without its subject. A post about one report
     * whose image does not show it would be the most misleading card this
     * pipeline could make, and it would look fine.
     */
    throw new ShareCardCompositionError(
      `The featured report "${input.featured.title}" is not in the picture: it is on the far `
      + 'side of the planet or outside the frame. Call frameReports([id]) to bring it into '
      + 'view, or focusReport(null) to compose without it.',
    );
  }

  // The whole frame is the picture: the window was rendered at the card's shape.
  const bounds = { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height, width: frame.width, height: frame.height };

  const provenance = provenanceFor(input, deps, capturedAt, { width: frame.width, height: frame.height }, plan.licences);

  const layout = computeShareCardLayout({
    provenance,
    bounds,
    frame: { width: frame.width, height: frame.height },
    measure,
    // The style the plan chose (IM38), the same the picture was measured in: laid
    // out in another, the card's text and its picture would disagree.
    style: plan.style,
    featuredAt,
    keyLayers,
    badge: input.template ? TEMPLATE_SPECS[input.template.name].badge : null,
    qr: !!input.qr,
    timestream: !!input.timestream,
  });

  if (layout.globeArea.height !== plan.pictureHeight || layout.globeArea.width !== plan.pictureWidth) {
    // The text measured before the capture and the text drawn are the same words; a difference is a fault here.
    throw new ShareCardCompositionError(
      `The card's picture was captured ${plan.pictureWidth}×${plan.pictureHeight}px and laid out `
      + `${layout.globeArea.width}×${layout.globeArea.height}px. Refusing rather than drawing a picture that does not fill its place.`,
    );
  }

  /*
   * The close-up, in the picture's corner away from the featured item and its
   * label (IM35), covering as few of the picture's marks as a corner can.
   */
  let insetLayout: InsetLayout | null = null;
  if (input.inset) {
    if (!layout.callout) {
      throw new ShareCardCompositionError('The featured item is not marked in the picture, so a close-up would point at nothing.');
    }
    const cardStyle = plan.style;
    insetLayout = layoutInset(input.inset, {
      picture: layout.globeRect,
      anchor: layout.callout.anchor,
      avoid: [layout.callout.label],
      marks: cardMarksOf(pictureMarks, window, layout.globeRect, layout.callout.anchor),
      names: cardBoxesOf(countryNamesInLastCapture().boxes, frame, layout.globeRect),
      style: { padding: cardStyle.padding, caveatPx: cardStyle.caveatPx },
      measure,
    });
  }
  // What the card states, with its inset when it has one.
  const stated: GlobeViewProvenance = {
    ...provenance,
    ...(plan.typeStep ? { typeStep: plan.typeStep } : {}),
    ...(insetLayout && input.inset ? { inset: insetProvenanceOf(input.inset, insetLayout) } : {}),
  };

  // Sizing the canvas resets its 2D state, so it happens BEFORE any drawing.
  // drawShareCard sets every property it relies on, so nothing is lost here —
  // but a resize placed after it would silently blank the card.
  canvas.width = layout.width;
  canvas.height = layout.height;

  const image = await deps.loadImage(frame.dataUrl);
  drawShareCard(ctx, image, layout, theme, qrModules || insetLayout || input.timestream
    ? {
      ...(qrModules ? { qr: qrModules } : {}),
      ...(insetLayout ? { inset: insetLayout } : {}),
      ...(input.timestream ? { timestream: input.timestream } : {}),
    }
    : undefined);
  /*
   * An event chart over a corner of the picture (D-PW, PW87): a lower corner first, clear of the featured item's label
   * and of a close-up; drawn over the picture, its lines in the card's text.
   */
  let chartRect: { x: number; y: number; width: number; height: number } | null = null;
  if (input.chart) {
    chartRect = layoutChartInset(layout.globeRect, [
      ...(layout.callout ? [layout.callout.label] : []),
      ...(insetLayout ? [insetLayout.rect] : []),
    ], plan.style.padding);
    drawChartInset(ctx as unknown as CanvasRenderingContext2D, chartRect, input.chart, theme);
  }
  // Two layers side by side (D-CM, CM3): the line where the halves meet, at the screen's middle in the card's window,
  // and each half's layer named in it (OR35).
  if (stated.appearance?.compare) {
    const at = (plan.canvasSize.width / 2 - window.x) / Math.max(1, window.width);
    const labelOf = (id: string) => input.layers.find((l) => l.id === id)?.label ?? id;
    const { left, right, labels } = stated.appearance.compare;
    drawCompareHalves(ctx as unknown as CanvasRenderingContext2D, layout.globeRect, at, labels?.left ?? labelOf(left), labels?.right ?? labelOf(right), {
      fontFamily: theme.fontFamily, px: plan.style.caveatPx,
    });
  }

  const asked = input.mimeType ?? 'image/png';
  let dataUrl = canvas.toDataURL(asked, input.quality);
  // The type the browser made, which is not always the one asked for: Safari makes a PNG when asked for a WebP.
  const mimeType = dataUrl.startsWith('data:') && dataUrl.includes(';') ? dataUrl.slice(5, dataUrl.indexOf(';')) : asked;
  // Written from what the card states, never by its caller (block I, item 5).
  const alt = input.alt === false ? undefined : altTextFor(stated, { fit: plan.fit, keyLayers });

  // The record written into the file, so a copy saved or forwarded carries it.
  const recordWarnings: string[] = [];
  if (deps.writeRecord) {
    try {
      const written = deps.writeRecord(dataUrl, {
        mimeType, width: layout.width, height: layout.height, provenance: stated, ...(alt !== undefined ? { alt } : {}),
      });
      dataUrl = written.dataUrl;
      if (written.omitted.length) {
        recordWarnings.push(
          `The file's copy of the record leaves out ${written.omitted.join(', ')}, too large for a JPEG's metadata; `
          + 'the card\'s provenance has them all.',
        );
      }
    } catch (e) {
      recordWarnings.push(`The record could not be written into the file (${e instanceof Error ? e.message : String(e)}); the card's provenance has it.`);
    }
  }

  return {
    dataUrl,
    width: layout.width,
    height: layout.height,
    mimeType,
    provenance: stated,
    ...(alt !== undefined ? { alt } : {}),
    warnings: [
      ...lintCard({
        headlineShortened: layout.headlineShortened,
        labelShortened: layout.callout?.text.endsWith('…') ?? false,
        featuredAt,
        frame: { width: frame.width, height: frame.height },
        bytes: bytesOfDataUrl(dataUrl),
        ...(insetLayout ? { insetCovers: insetLayout.covers, insetOverLabel: insetLayout.overLabel } : {}),
      }),
      ...recordWarnings,
    ],
    sourceRect: layout.sourceRect,
    frame,
    regions: {
      picture: { ...layout.globeRect },
      footer: footerBand(layout),
      ...(layout.qr ? { qr: { ...layout.qr } } : {}),
      ...(insetLayout ? { inset: { ...insetLayout.rect } } : {}),
      ...(chartRect ? { chart: { ...chartRect } } : {}),
    },
  };
}
