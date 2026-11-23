/**
 * useGlobeShareCard — makes the capture pipeline reachable from the page.
 *
 * ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 *
 * The Phase 1 commit recorded its own coverage gap plainly:
 *
 *   "NOT yet proven end to end: captureGlobeFrame itself in a browser. It is
 *    not reachable from the page until Phase 2 wires it, so the smoke
 *    reproduces its mechanics against the real canvas rather than calling it."
 *
 * A function nothing can call has not been proven by its unit tests — those
 * run against a stub renderer, which is exactly the thing that cannot exhibit
 * the failure the function exists to prevent. This hook gives it a caller: a
 * button for a person, and a handle for an agent.
 *
 * ─── WHY THE AGENT HANDLE IS NOT GATED TO DEVELOPMENT ──────────────────────
 *
 * `useGlobeDebugTools` gates `window.__globeDebugApi` behind
 * NODE_ENV === 'development', and that is right for a debug API: it exposes
 * globe internals, and it exists to serve the test harness.
 *
 * This is a different thing and gets the opposite decision. Mecha Jono drives
 * the deployed build — the same one people see — and gating this to dev would
 * mean the agent publishes images of an app nobody is looking at. So the
 * handle ships, and it is kept to exactly the surface that justifies it: the
 * two functions the button itself uses, with no way to reach the scene, the
 * camera, or any app state through them.
 *
 * It discloses nothing either: the card is composed from what is already
 * rendered on screen, plus feed state that the HUD already shows. There is no
 * privilege here to escalate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import {
  captureGlobeFrame,
  captureSession,
  type CaptureOptions,
  type CaptureResult,
} from '../../../features/globe/capture/captureGlobeFrame';
import { CARD_PRESETS, type CardPreset } from '../../../features/globe/capture/shareCardLayout';
import { shotOfRequest, type Shot, type ShotImageType } from '../../../features/globe/capture/shotSpec';
import { layersFor, type LayersForCategory } from '../../../features/globe/capture/layersFor';
import { planShotWith, renderShotWith, type ChosenTemplate, type ShotPlan, type ShotRender, type ShotStageDeps } from '../../../features/globe/capture/shotStage';
import { decideTemplate, type CardTemplate } from '../../../features/globe/capture/cardTemplates';
import type { WarConflictBrief } from '../../../services/warConflict/warConflictBrief';
import type { FrontPageProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { centreOf } from '../../../services/intel/globe/linkedRecordPlacement';
import { DEFAULT_GLOBE_APPEARANCE, getGlobeAppearance, setGlobeAppearance, type GlobeAppearance } from '../../../services/globe/globeAppearance';

const lookIsDefault = (look: GlobeAppearance) => look.skin === DEFAULT_GLOBE_APPEARANCE.skin
  && look.lightMode === DEFAULT_GLOBE_APPEARANCE.lightMode && look.nightFill === DEFAULT_GLOBE_APPEARANCE.nightFill;
import { effectiveReportLook, readReportLook, setReportLookOverride, type ReportLook } from '../../../services/intel/reportLook';
import { layerChoicesInForce, readLayerChoices, type ShareLayerChoices } from '../../../features/globe/rail/railHandle';
import { encodeLayerChoices, LAYER_CHOICES_PARAM, setPageLayerChoices } from '../../../features/globe/rail/layerChoices';
import { whatsNewSince, whatsNewWindow, WHATS_NEW_FEEDS, type WhatsNew } from '../../../features/globe/capture/whatsNew';
import { declassifiedCard } from '../../../features/globe/capture/declassifiedCard';
import { psiCard } from '../../../features/globe/capture/psiCard';
import { psiBriefing } from '../../../features/globe/capture/psiBriefing';
import { isPsiAddress } from '../../../features/globe/capture/psiAddress';
import { loadPsiNotes } from '../../../services/psiWatch/livePsi';
import { psiKitOn } from '../../../services/psiWatch/psiKitSwitch';
import { getPsiLinesState, setPsiLinesEvent, setPsiOpened } from '../../../services/psiWatch/psiLinesStore';
import { ASTRO_BODIES, type AstroBody } from '../../../services/psiWatch/astro/sky';
import { boundsOf } from '../../../services/geoint/pointInPolygon';
import { stripModel, type StripModel } from '../../../features/globe/capture/timestreamStrip';
import type { CardChart } from '../../../features/globe/capture/chartCard';
import { loadKpRecord } from '../../../services/psiWatch/timestream/kpLoad';
import { psiLaneItems } from '../../../services/psiWatch/timestream/psiLanes';
import { LANE_BODIES, type LaneBody } from '../../../services/psiWatch/timestream/skyColumns';
import { DEFAULT_FRAME } from '../../../services/psiWatch/astro/frames';
import { DECLASS_DAYS, declassDay, readDeclassified } from '../../../services/declassified/declassDesk';
import { effectiveWeatherLook, getWeatherLookOverride, readWeatherLook, setWeatherLookOverride, type WeatherLook, type WeatherLookInForce } from '../../../services/weather/weatherLook';
import { setSkyLook, skyLook, type SkyLook } from '../../../solar-system/sky/skyLook';
import { darkSkyPossible, isSolarScale, scaleGliding, setPageSolarScale, SOLAR_SCALES, solarScale, solarScaleFrom, type SolarScale } from '../../../solar-system/solarScale';
import {
  frameForReports,
  groupsOfShareReports,
  SHARE_ALTITUDE_CEILING,
  SHARE_ALTITUDE_FLOOR,
  type FeaturedReport,
  type ShareReportGroup,
  type ShareReportInfo,
} from '../../../features/globe/capture/shareReports';
import { getFeaturedReportId, setFeaturedReportId } from '../../../features/globe/capture/featuredReportStore';
import { reportsInArea, shareAreas, type ShareArea } from '../../../features/globe/capture/shareAreas';
import { areaByCode, areaCodeOf } from '../../../features/globe/areas/areaRegistry';
import { loadAreaShapes } from '../../../features/globe/areas/areaShapes';
import { litAreaDrawn, setLitArea } from '../../../features/globe/areas/litArea';
import { frameForArea, outsideInWords } from '../../../features/globe/capture/areaFrame';
import { areaCardFacts } from '../../../features/globe/capture/areaCard';
import { frameForTheatre, theatreCardFacts } from '../../../features/globe/capture/theatreCard';
import { tonightCard } from '../../../features/globe/capture/tonightCard';
import { weekCard } from '../../../features/globe/capture/weekCard';
import type { HeroWatchWeek } from '../../../services/heroWatch/heroWatchWeek';
import type { Tonight } from '../../../services/raverWatch/raverWatchView';
import type { TheatreFacts } from './useGlobeWarConflict';
import { loadTerritories } from './useTerritories';
import type { FitView } from '../../../features/globe/capture/shareReports';
import { describeScene, type ViewDescription } from '../../../features/globe/capture/describeView';
import { planReportTour, type TourPlan } from '../../../features/globe/capture/reportTour';
import { setReplayMoment } from '../../Globe/replayClock';
import { holdForCapture } from '../../../globe-engine/captureClock';
import { holdLiveDraws } from '../../../globe-engine/liveDraws';
import { IMAGERY, imageryDrawn, cloudsSettled } from '../../../globe-engine/imagery';
import { imageryShown } from '../../../features/globe/capture/sourceCredits';
import type { SurfaceReadiness } from '../globeSurface';
import { planReplay, replayMomentAt, REPLAY_PACES, REVEAL_SHARE, type ReplayPace, type ReplayPlan } from '../../../features/globe/capture/replayPace';
import { CARD_FITS, type CardFit } from '../../../features/globe/capture/shareCardLayout';
import { getLegends } from '../../../services/globe/globeLegendStore';
import { cardShellLift, cardTerritoryStyle, legendsForCard, setCardTerritoryStyle } from '../../../globe-engine/territoryLook';
import { readAtLift } from '../../../globe-engine/shellLift';
import { countryNamesMissedCard, setCardCountryNames, setClipCountryNames, untilCountryNames } from '../../../globe-engine/countryNamesLook';
import { setCardMarkStyle, untilMarkStyleDrawn } from '../../../services/globe/cardMarkStyle';
import { setCardPsiFieldLooks } from '../../../services/psiWatch/psiField/psiFieldLooks';
import { intelDrawnReadiness } from '../../../services/intel/intelReportsDrawn';
import {
  composeShareCard,
  planCardPicture,
  type CardRegions,
  type ComposedShareCard,
  type ComposeShareCardInput,
  type ShareCardTarget,
} from '../../../features/globe/capture/composeShareCard';
import type {
  FeedProvenance,
  GlobeViewProvenance,
  LayerProvenance,
  MarkProvenance,
} from '../../../features/globe/capture/shareCardProvenance';
import { isStillLoading } from '../../../features/globe/loadStatus/layerLoadStatus';
import { useGlobeLayerControl, type GlobeLayerId, type GlobeLayerCategory } from './useGlobeLayerControl';
import { useVisualizationMode, type VisualizationMode } from '../../../context/VisualizationModeContext';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import { deeplinkSearch, type Deeplink, type DeeplinkLayer } from '../../../context/deeplinkV1';
import { OPEN_PARAM } from '../../../features/globe/inspector/openFromLink';

/** How close an item's link opens the camera, in Earth radii above the ground: the region round it. */
const LINK_ALTITUDE = 0.8;
import { qrViewLink } from '../../../features/globe/capture/cardQr';
import { closeUpRefusalFor, type CardInset, type CloseUpRefusal } from '../../../features/globe/capture/closeUpInset';
import { capLabel, DEFAULT_REPORT_CAP, effectiveReportCap, isCapRefusal, readReportCap, setReportCapOverride } from '../../../services/intel/reportCap';
import { useCyberCommandSettings } from '../../../hooks/useCyberCommandSettings';
import type { MarkerStyle } from '../markerStyles';
import {
  SHARE_HANDLE_CONTRACT,
  SHARE_HANDLE_NAME,
  SHARE_HANDLE_VERSION,
} from '../../../features/globe/capture/shareHandleContract';
import { setGlobePointOfView } from '../../../utils/globeCameraMath';
import { canvasIsOnScreen } from '../../../features/globe/capture/canvasOnScreen';
import { getBuildIdentity } from '../../../utils/buildIdentity';
import { buildCameraTrack, type CameraKeyframe } from '../../../features/globe/capture/cameraTrack';
import {
  ClipRecordingError,
  DEFAULT_FPS,
  MAX_FRAMES,
  recordGlobeClip,
  type EndCardMode,
  type RecordedClip,
} from '../../../features/globe/capture/recordGlobeClip';
import { PLAYLISTS, PLAYLIST_TITLES, planPlaylist, type PlaylistId, type TourOffer } from '../../../features/globe/tour/briefingPlaylist';
import { captionAt, markerAt, planTourClip, type TourClipPlan } from '../../../features/globe/tour/tourClip';
import { setTourMarker } from '../../../features/globe/tour/tourMarker';
import { drawTourCaption, layoutTourCaption } from '../../../features/globe/capture/tourCaptionCard';
import type { TourCaption } from '../../../features/globe/tour/tourPlayer';
import type { ClipStory, ClipTour } from '../../../features/globe/capture/clipProvenance';
import { applyStep, captureStep, releaseChoices, storyFrom, type Story } from '../../../features/story/story';
import { planStoryClip, spanAt, STORY_MAX_FRAMES, type StoryClipPlan } from '../../../features/story/storyClip';
import { setStoryClipRecorder } from '../../../features/story/storyMp4';
import { setChartCardMaker } from '../../../features/psi/chartCardMaker';
import { messagesNow } from '../../../i18n/app/i18n';
import { layoutEndCard } from '../../../features/globe/capture/clipEndCard';
import { canvasMeasurer, drawEndCardPage } from '../../../features/globe/capture/drawShareCard';
import type { ClipProvenance } from '../../../features/globe/capture/clipProvenance';
import { heatMapReadiness, heatMapThenReadiness } from './useGlobeHeatMap';
import { windFlowReadiness, windFlowThenReadiness } from './useGlobeWindFlow';
import { eFieldReadiness } from './useGlobeEField';
import { auroraReadiness } from './useGlobeAurora';
import { shieldReadiness } from './useGlobeMagneticShield';
import { psiModelReadiness } from './useGlobePsiModel';
import { fieldLinesReadiness } from './useGlobeFieldLines';
import { vanAllenReadiness } from './useGlobeVanAllenBelts';
import { cuspsReadiness } from './useGlobeCusps';
import { tailSheetReadiness } from './useGlobeTailSheet';
import { heliosphereReadiness } from './useGlobeHeliosphere';
import { nearEarthFlowReadiness } from './useGlobeNearEarthFlow';
import { enlilReadiness } from './useGlobeEnlil';
import { cmesReadiness } from './useGlobeCmes';
import { boundaryMomentReadiness } from './useGlobeBoundaryMoment';
import { heroWatchReadiness } from './useGlobeHeroWatch';
import { aiWatchReadiness } from './useGlobeAiWatch';
import { civilUnrestReadiness } from './useGlobeCivilUnrest';
import { quakeReplayReadiness, quakeShakingReadiness } from './useGlobeEcoKindMarks';
import { DECAY_CHOICES_S, DEFAULT_DECAY_S, setClipQuakeReplay, type DecaySeconds } from '../../../features/globe/timebar/playClock';
import { quakePlatesReadiness } from './useGlobeQuakePlates';
import { quakeThenWindowReadiness, quakeWindowReadiness } from '../../../hooks/useQuakeWindow';
import { HISTORY_FLOOR_S } from '../../../features/globe/timebar/timebarRange';
import { missionsReadiness } from './useGlobeMissions';
import { realCloudsReadiness, realCloudsThenReadiness } from './useGlobeRealClouds';
import { rainReadiness, rainThenReadiness } from './useGlobeRain';
import { allDrawnFor } from '../weather/weatherDrawn';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { noticedWhenUsed, drawnAtFullDetail } from '../../../features/globe/capture/shareActivity';
import { holdFullDetail } from '../../../services/globe/globeQuality';
import { beginComparison, comparableLayers, currentComparison, endComparison, momentComparison, type Comparison } from '../../../globe-engine/compareLayers';
import { EARLIER_CHOICES } from '../../../features/globe/compare/quakeMoments';
import { COMPARE_AHEAD_HOURS, COMPARE_MOMENT_LAYERS } from '../../../features/globe/capture/shareHandleContract';
import { comparePins } from '../../Compare/comparePins';
import { drawCompareHalves } from '../../../features/globe/capture/compareHalves';
import { FONTS } from '../../../styles/tokens';

/**
 * The name an agent looks for. One definition, in shareHandleContract, because
 * the contract and the thing it describes drifting apart is the failure this
 * is all here to prevent.
 */
export const SHARE_HANDLE = SHARE_HANDLE_NAME;

/** The styles setMarkerStyle accepts, as values rather than only as a type. */
const MARKER_STYLE_VALUES: readonly MarkerStyle[] = ['disc', 'glow', 'ring'];

/** A sweep's longest span: a clip's forecast hours load as at most eight of the model's steps (D-W, data rule 7). */
const SWEEP_MAX_S = 24 * 3600;
/**
 * A sweep's longest span with no forecast layer drawn (D-PW, PW62; the kit's question 3): no model step to load, so
 * a Psi window of weeks, or a year of Kp, sweeps in one clip.
 */
const LONG_SWEEP_MAX_S = 400 * 86_400;
/** The layers whose moments load as a model's steps: a sweep over them keeps to a day. */
const FORECAST_LAYERS = new Set(['EarthWeather', 'SpaceWeather']);
/** A stepped sweep's shortest step: a minute. */
const SWEEP_STEP_MIN_S = 60;
/** How far apart a sweep's moments are visited before its first frame: the model's step. */
const SWEEP_WARM_STEP_MS = 3 * 3_600_000;
/** How long a visit may take to load and draw its step: a cold read can take minutes (D-W, data rule 6). */
const SWEEP_WARM_WAIT_MS = 120_000;
/** How long a frame may take to draw its moment, its steps already loaded. */
const SWEEP_FRAME_WAIT_MS = 30_000;
/** How long a clip asking for country names waits for them to be drawable: the overlay up, the face loaded. */
const CLIP_NAMES_WAIT_MS = 15_000;
/** How long a clip or tour waits for every layer to be redrawn in the style it asks for (plan H4). */
const CLIP_MARK_STYLE_WAIT_MS = 5_000;
/** How long a clip waits for every shown layer to be drawn before its camera moves (plan H3): whenReady's own wait. */
const CLIP_READY_WAIT_MS = 30_000;

/** One layer, as an agent sees it. */
export interface ShareLayerInfo {
  id: GlobeLayerId;
  label: string;
  category: GlobeLayerCategory;
  implemented: boolean;
  active: boolean;
  primary: boolean;
  pinned: boolean;
}

/** What decides the subject of a capture, as opposed to the camera. */
export interface GlobeShareControls {
  listLayers: () => ShareLayerInfo[];
  setLayer: (
    layerId: GlobeLayerId,
    options?: { pin?: boolean; clearOtherPins?: boolean },
  ) => { primary: GlobeLayerId; pinned: GlobeLayerId[] };
  pinLayers: (layerIds: GlobeLayerId[]) => { pinned: GlobeLayerId[] };
  setMarkerStyle: (
    layerId: GlobeLayerId,
    style: MarkerStyle,
  ) => { layer: GlobeLayerId; style: MarkerStyle };
}

/**
 * What the agent handle returns. Deliberately JSON-serialisable end to end:
 * a Playwright `page.evaluate` has to be able to bring it back across the
 * boundary, and a value that silently becomes `{}` there is the same class of
 * quiet failure this feature exists to refuse.
 */
/** A comparison side by side, as the handle states it (v78; one layer at two moments, v79; a forecast hour, v80). */
export interface ShareCompare {
  comparison: {
    left: string;
    right: string;
    /** Each half's name with its window, for one layer at two moments (v79). */
    labels?: { left: string; right: string };
    /** One layer at two moments (v79): how the other moment was chosen; a held window in unix seconds; hours ahead (v80). */
    moment?: { layer: string; earlier: string } | { layer: string; window: { from: number; until: number } } | { layer: string; ahead: number };
  } | null;
  /** The layers that can be drawn side by side now, by their ids. */
  compareLayers: string[];
}

/** A comparison as the handle states it: a held window in unix seconds, as the handle's windows are (v79). */
function comparisonStated(c: Comparison | null): ShareCompare['comparison'] {
  if (!c) return null;
  const pick = c.moment?.pick;
  const moment = c.moment && pick
    ? ('earlier' in pick ? { layer: c.moment.layer, earlier: pick.earlier }
      : 'ahead' in pick ? { layer: c.moment.layer, ahead: pick.ahead }
        : { layer: c.moment.layer, window: { from: Math.floor(pick.held.from / 1000), until: Math.floor(pick.held.until / 1000) } })
    : undefined;
  return { left: c.left, right: c.right, ...(c.labels ? { labels: c.labels } : {}), ...(moment ? { moment } : {}) };
}

export interface ShareHandleResult {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  provenance: GlobeViewProvenance;
  /** The crop taken from the frame, and the frame it came from. */
  sourceRect: { x: number; y: number; width: number; height: number };
  frame: { width: number; height: number };
  /** What a screen reader says for the card, written from what it states (contract v17). */
  alt?: string;
  /** What a poster would want to know before posting it; empty for a clean card (contract v17). */
  warnings: string[];
  /** Where the picture is, and the footer's band, which changes with every capture (contract v20). */
  regions: CardRegions;
}

/** Where the camera is. Same shape react-globe.gl's pointOfView() uses. */
export interface ShareView {
  lat: number;
  lng: number;
  altitude: number;
}

/**
 * What `recordClip` hands back across the automation boundary.
 *
 * Frames, not a video file. Frame i depicts track time i/fps exactly, so the
 * caller assembles them at `fps` and the result's timing is the track's timing:
 *
 *   ffmpeg -framerate <fps> -i f%04d.jpg -c:v libx264 -pix_fmt yuv420p out.mp4
 *
 * See recordGlobeClip for why real-time recording could not promise that.
 */
export interface ShareClipResult {
  /** JPEG data URLs, in order. */
  frames: string[];
  fps: number;
  mimeType: string;
  width: number;
  height: number;
  /** What the clip may claim. Its time ranges refer to the footage. */
  provenance: ClipProvenance;
  stats: RecordedClip['stats'];
}

export interface ShareHandle {
  /**
   * The API version, for an agent to check before calling anything.
   *
   * Separate from the provenance schema version a card carries: this is how
   * the picture is obtained, that is what the picture says. See
   * shareHandleContract for why one number could not honestly serve both.
   */
  version: typeof SHARE_HANDLE_VERSION;
  /** The globe, cropped and captioned with its own caveats. */
  compose(options?: { scale?: number; preset?: CardPreset; fit?: CardFit }): Promise<ShareHandleResult>;
  /** Where the camera is right now. */
  getView(): ShareView;
  /**
   * Move the camera, and resolve once it has arrived.
   *
   * ─── THIS IS THE COST LEVER, NOT A CONVENIENCE ───────────────────────────
   *
   * Measured on the deployed build: a cold page load transfers 16.42 MB from
   * our own origin across 70 requests and takes 13s to reach a capturable
   * frame. A second capture in the SAME page costs 0.3 KB and 2.4s.
   *
   * Without this method an agent wanting a second viewpoint has no option but
   * to reload, so the expensive path was the only path we offered. A 300-frame
   * camera move at one load per frame is ~4.9 GB; held in one session it is
   * 16.42 MB once and then nothing.
   *
   * Returns where the camera ACTUALLY ended up, read back from the globe
   * rather than echoed from the request — altitude is clamped, and a caller
   * that trusts its own input would caption the image with a position the
   * picture is not taken from.
   */
  setView(pov: Partial<ShareView>, options?: { transitionMs?: number; settleMs?: number }): Promise<ShareView>;
  /**
   * Record the globe along a keyframed camera path.
   *
   * Warms the whole path first, so no region loads its geometry on camera.
   * Refuses on a blank globe, and refuses if the layers change mid-clip — see
   * clipProvenance for why a camera move must show one fixed state.
   */
  recordClip(options: {
    keyframes: CameraKeyframe[];
    /** Output frame rate. A choice, not a property of the machine. */
    fps?: number;
    /** JPEG quality, 0..1. */
    quality?: number;
    settleMs?: number;
    /** `read` (default) holds each end-card page to be read; `poster` one frame each. */
    endCard?: EndCardMode;
    /**
     * Reveal the Intel Reports in time order as the clip plays: each appears at
     * its event time, or when it was written. Over `from`..`until` (unix
     * seconds) when named, else the timeline's window when one is set, else the
     * earliest and latest report times drawn (BA2); reports outside it stay
     * hidden while it plays. The quakes drawn as flags are replayed with them
     * (D-EQ, EQ21): each rises and bursts as the replay reaches it and fades over
     * `decayS` seconds of the clip, 1, 4 (the default) or 10.
     */
    replay?: { pace?: ReplayPace; from?: number; until?: number; decayS?: number };
    /**
     * Move the shared moment from `from` to `until` (unix seconds) over the
     * footage, every layer drawn for each frame's moment: Earth Weather's
     * forecast hours flow (decision D-W, step 5c), a Psi window's weeks pass
     * (D-PW, PW62). At most 24 hours apart while Earth Weather or Space Weather
     * is drawn, every model step the span crosses loaded before the first frame;
     * else at most 400 days. With `step`, whole seconds, the moment jumps by it
     * and holds between. Each frame is captured once its moment is drawn. The
     * moment is left as it was found. Not with `replay`.
     */
    sweep?: { from: number; until: number; step?: number };
    /**
     * Draw Natural Earth's country names in every frame, as a card whose shot
     * asks does (decision K5, TS10; contract v35): placed frame by frame, never
     * over a mark, fading over a fifth of a second of footage. Refused while the
     * territories overlay is off or the names' face has not loaded. The record
     * says so (clip schema 7), and the end card credits "Names: Natural Earth".
     */
    countryNames?: boolean;
    /**
     * One mark style for every layer that takes one, as a card's `appearance.markStyle`
     * (plan H4, contract v54), whatever the page's person picked; unstated, each layer's
     * own. The record says so (clip schema 9).
     */
    markStyle?: MarkerStyle;
  }): Promise<ShareClipResult>;
  /**
   * Record a briefing playlist as a clip (contract v39; briefing-playlists.md,
   * BP14–BP21): the screen tour of `war` (War & Conflict today), `raves` (Raver
   * Watch tonight) or `heat` (the heat watch), shown with its layers and moment and
   * put back after, as the Tour button does. It waits up to `timeoutMs` (default
   * 20 s) for the layer's read and tours what arrived. The clip opens on the whole
   * planet, then flies to each stop and holds it for its reading time, as many of
   * the worst stops as fit the frames a call may hold at `fps`; each frame carries
   * its moment's caption, burned in, and the clip's record lists every caption with
   * its times (clip schema 8). Returns what recordClip returns.
   */
  recordTour(options: {
    playlist: PlaylistId;
    fps?: number;
    /** JPEG quality, 0..1. */
    quality?: number;
    settleMs?: number;
    endCard?: EndCardMode;
    /** How long to wait for the layer's read before touring what arrived. */
    timeoutMs?: number;
    /** One mark style for every layer, as recordClip's (plan H4, contract v54). */
    markStyle?: MarkerStyle;
  }): Promise<ShareClipResult>;
  /**
   * A story recorded as one clip (D-ST, ST3, ST7, ST8; v81): `story` as its link carries it ({ id, title, steps }), each
   * step's layers, choices and window set as the footage reaches it, the camera flown between its steps and held for
   * each one's hold, its caption burned in. Up to 1,800 frames (a minute at 30 fps) where every other clip keeps 900:
   * the steps that fit, and the clip says when some were left out. Its record is clip schema 14's `story`. Returns
   * what recordClip returns; the view before is put back after.
   */
  recordStory(options: {
    story: unknown;
    fps?: number;
    /** JPEG quality, 0..1. */
    quality?: number;
    settleMs?: number;
    endCard?: EndCardMode;
  }): Promise<ShareClipResult>;
  /**
   * The raw frame, uncropped and uncaptioned.
   *
   * Here because it is the single call the whole capture path rests on, so an
   * agent can exercise it directly — and because Phase 6's camera-motion video
   * needs frames, not cards. It is the same function the compose path uses;
   * this is an entry point, not a second implementation.
   */
  captureFrame(options?: CaptureOptions): CaptureResult;
  /**
   * Every layer this build has, with its live state.
   *
   * Discovery rather than a hardcoded list on the agent's side: an id that was
   * right in one release is not automatically right in the next, and a layer
   * added to the catalogue should become reachable without the other codebase
   * being edited.
   */
  listLayers(): ShareLayerInfo[];
  /**
   * Choose the layer drawn, which is the thing v3 could not do.
   *
   * The camera could move and the subject could not change: the layer comes
   * from `visualizationMode.subMode`, which defaults to CyberCommand /
   * IntelReports, persists to localStorage and has no URL. So an agent in a
   * fresh browser could reach exactly one of eleven views, and the other ten
   * needed a person to click the HUD.
   *
   * Sets the MODE as well as the sub-mode — they are not independent, and a
   * sub-mode without its mode is a pair the app never generates.
   */
  setLayer(
    layerId: GlobeLayerId,
    options?: { pin?: boolean; clearOtherPins?: boolean },
  ): { primary: GlobeLayerId; pinned: GlobeLayerId[] };
  /** Show several layers at once. An empty array clears every pin. */
  pinLayers(layerIds: GlobeLayerId[]): { pinned: GlobeLayerId[] };
  /**
   * How one layer's marks are drawn: disc, glow or ring.
   *
   * Accepted for ConflictZones and ResourceZones and has no visible effect
   * there — the first tells its two kinds apart BY shape, the second draws no
   * point marks at all. Refusing would be tidier and would make a caller
   * special-case two layers out of eleven for no gain.
   */
  setMarkerStyle(
    layerId: GlobeLayerId,
    style: MarkerStyle,
  ): { layer: GlobeLayerId; style: MarkerStyle };
  /**
   * Resolve once the globe can actually be captured.
   *
   * The cheapest optimisation on offer. Without it an agent guesses a settle
   * time: guess low and it captures a half-drawn globe, guess high and it
   * burns wall clock on every shot. Both mistakes end in a reload, and a
   * reload is the only part of this that costs bandwidth.
   *
   * Resolves with `ready: false` on timeout rather than rejecting, because a
   * caller that reads a slow globe as a crash will reload — the expensive
   * outcome this exists to avoid.
   *
   * **Not a guarantee.** It reports drawability at the moment it is asked, and
   * a later compose can still refuse as blank — observed once in a five-layer
   * sweep. Retry a refused compose; it costs no network traffic, where a
   * reload costs about 20 MB.
   */
  whenReady(options?: { timeoutMs?: number; address?: string }): Promise<ShareReadiness>;
  /**
   * Every Intel Report drawn now, as an agent may see it (decision D-F, section
   * 18, item 2). Never an RLSH entity, and never a position finer than 0.1°.
   * With `{ counts: true }` (v25, BA1): the same list, and how many Intel Reports
   * matched against how many the cap let the globe draw, so a cut list says so.
   */
  listReports(): ShareReportInfo[];
  listReports(options: { counts: true }): { reports: ShareReportInfo[]; intelReports: ShareReportCounts | null };
  /**
   * With `{ area }` (v30, BA21): those standing in the area, by `listAreas()`'s
   * code or a bare `eu`. A promise, since the areas' shapes are fetched the
   * first time one is asked for.
   */
  listReports(options: { area: string; counts?: false }): Promise<ShareReportInfo[]>;
  listReports(options: { area: string; counts: true }): Promise<{ reports: ShareReportInfo[]; intelReports: ShareReportCounts | null }>;
  /**
   * Each group of Intel Reports drawn (v27, BA10): a place's, under one glyph,
   * or a territory's, under one outline, its members most severe first. Every
   * Intel Report listReports() lists is in exactly one, which its `group` names;
   * focusReport features any member, and the card says which of how many it is.
   */
  listGroups(): ShareReportGroup[];
  /**
   * Every area a report's jurisdiction tag can name (v29, BA16–BA18): its code,
   * kind and name, its members where it is made of countries, and where that
   * was taken from and when.
   */
  listAreas(): ShareArea[];
  /**
   * How many Intel Reports the globe draws for this page (v25, BA5, BA7): a
   * whole number from 10, 'max' (1,000) or 'unlimited'; null returns it to the
   * person's own setting. Never saved: an agent never changes a person's cap.
   */
  setReportCap(cap: number | 'max' | 'unlimited' | null): ShareReportCap;
  /** The cap in force, and whether this page's handle or the person's setting set it. */
  getReportCap(): ShareReportCap;
  /**
   * Whether each Intel Report glyph wears its category's emblem (v28, BA14,
   * BA15), for this page only, never saved: an agent never changes a person's
   * setting. null returns to the person's.
   */
  setReportLook(look: ReportLook | null): ShareReportLook;
  /** The look in force, and whether this page's handle or the person's setting set it. */
  getReportLook(): ShareReportLook;
  /**
   * A layer's own choices on the second left rail (v68; critique-2026-11-01, OR12): War & Conflict's items, arcs,
   * deaths rings and war map so far, each layer's kit choices as they come (the contract's `layerChoices` names
   * them). For this page only, never saved: an agent never changes a person's choices; null returns the layer to
   * the person's. A choice a layer keeps in its own settings is refused, named.
   */
  setLayerChoices(layer: string, choices: Record<string, unknown> | null): ShareLayerChoices;
  /** A layer's choices in force, and whether this page's handle set any. */
  getLayerChoices(layer: string): ShareLayerChoices;
  /**
   * What Earth Weather draws (v31, WX9): the ground's colour (temperature,
   * rain, the stations' air quality, or none), the wind's streaks, the
   * satellites' clouds. Any of the three, for this page only, never saved: an
   * agent never changes a person's settings. A part not named stays as it is;
   * null returns all three to the person's. Draws while Earth Weather is shown.
   */
  setWeather(look: Partial<WeatherLook> | null): ShareWeather;
  /** Earth Weather's look in force, and for each part whether this page's handle or the person's setting set it. */
  getWeather(): ShareWeather;
  /**
   * The solar system's scale (v72; critique-2026-11-01, OR9, OR31): 'compact', every size and the Moon's distance
   * true and every other distance from the Earth at about 1 in 19.7, or 'true', every distance true, the camera
   * reaching out past Neptune. For this page only, never saved: an agent never changes a person's settings; null
   * returns the person's. A switch glides for a second and a half, and whenReady waits for it to settle.
   */
  setScale(scale: SolarScale | null): ShareScale;
  /**
   * Two layers side by side (D-CM, CM3; v78): `left` and `right`, layer ids, each drawn in its half without the other's;
   * either one not drawn is pinned for it. Only a layer that can be drawn apart may be named (`compareLayers`); null
   * ends it, letting go of what it pinned. Cards and clips draw both halves, each named. One layer at two moments
   * (v79): `{ layer: 'EcologicalDisasters', earlier }` or `{ layer, window }`; Earth Weather beside a forecast hour
   * (v80): `{ layer: 'EarthWeather', ahead }`, the hours one of `compareAhead`.
   */
  setCompare(comparison: { left: string; right: string } | { layer: string; earlier?: string; window?: { from: number; until: number }; ahead?: number } | null): ShareCompare;
  /** The comparison drawn, and the layers that can be drawn side by side now. */
  getCompare(): ShareCompare;
  /** The scale in force, and whether this page's handle or the person chose it. */
  getScale(): ShareScale;
  /**
   * Where Sky from a place looks (v74; plan D5): `az` from north through east and `alt` above the horizon, degrees, and
   * `fov` the view's height, 5 to 120. Sky opens with setScale('sky') at the point under the view's centre (setView
   * first to choose it); anything that moves the camera closes it. Returns the observer and the look, or refuses while
   * Sky is not open.
   */
  setSky(look: Partial<Pick<SkyLook, 'az' | 'alt' | 'fov'>>): SkyLook;
  /** The observer and the look while Sky from a place is open, else null. */
  getSky(): SkyLook | null;
  /**
   * What is new since a moment (v57, plan H10), in whole unix seconds, to `until` or now, 31 days at most: for
   * Space Weather, the alerts, warnings and watches SWPC issued and the CMEs DONKI saw; for Resources, EIA's yearly
   * series written since. Each item with its title, time, source and link, newest first. Each source says whether it
   * was read and how far back it reaches, and a layer is `complete` only when every one reaches the moment.
   */
  whatsNew(since: number, options?: { until?: number }): Promise<WhatsNew>;
  /**
   * Move the camera to show these reports in a card of this preset, at no lower
   * than one globe radius. Refuses unknown ids, and a set with no one side of the
   * planet to look at.
   */
  frameReports(
    ids: string[],
    options?: { preset?: CardPreset; transitionMs?: number; settleMs?: number },
  ): Promise<ShareView>;
  /**
   * Move the camera to show an area in a card of this preset (v30, BA22): its
   * largest part, and each other part that fits with it. Says what is outside
   * the frame, or null when all of it is in. Lights nothing: a shot of the area
   * (`subject.area`) frames it, lights it and cards it.
   */
  frameArea(
    area: string,
    options?: { preset?: CardPreset; transitionMs?: number; settleMs?: number },
  ): Promise<ShareView & { outside: string | null }>;
  /**
   * Feature one report, or none. Its place is drawn larger and the rest dimmed,
   * and the next card names it and points at it. Refuses an id not on the globe.
   */
  focusReport(id: string | null): { featured: ShareReportInfo | null };
  /**
   * What is in the picture a card of this preset would cut, per drawn layer:
   * how many hoverable marks, and the first few by name. RLSH is never described.
   */
  describeView(options?: { preset?: CardPreset; fit?: CardFit; qr?: boolean }): { preset: CardPreset; fit: CardFit } & ViewDescription;
  /**
   * Keyframes for a tour of these reports: all of them, then each cluster at no
   * lower than the framing floor, then all of them again. Moves nothing; hand
   * `keyframes` to recordClip.
   */
  planReportTour(
    ids: string[],
    options?: { preset?: CardPreset; maxStops?: number; holdMs?: number; travelMs?: number },
  ): TourPlan;
  /**
   * Move the app's shared time window, the one the timeline shows and a person
   * sees (RW7): `{ from, until }` in whole unix seconds, or null for live.
   * Resolves once the window has moved and the marks have been redrawn for it.
   */
  setTimeWindow(window: { from: number; until: number } | null): Promise<ShareTimeWindow>;
  /** The app's shared time window: live, or the window chosen, in unix seconds. */
  getTimeWindow(): ShareTimeWindow;
  /**
   * Many cards in one page load, in order (contract v9). Each request names
   * the address of an item drawn, as listReports() lists it; its layers and
   * window, when given, are set first and stay set for the next request. The
   * item is awaited (whenReady with its address), framed, featured and
   * composed, and a blank frame is tried once more. Each result says what
   * failed and why, and the batch goes on. Nothing is featured after it.
   *
   * Not built yet, and said so rather than guessed at: an `area` (frameArea)
   * is refused with its reason, and a `template` makes the default card, with
   * a note saying so.
   */
  renderBatch(requests: ShareBatchRequest[], options?: { timeoutMs?: number }): Promise<ShareBatchResult[]>;
  /**
   * The dry run of a shot (contract v11; decision IM1): it is read, staged
   * (layers, time, look, subject waited for, framed, featured) and described,
   * and nothing is composed. Returns the shot as staged, what is in frame per
   * layer, warnings, notes on what was dropped, and how long the last card on
   * this page took, so a render is never spent on a wrong picture.
   */
  planShot(shot: unknown, options?: { timeoutMs?: number }): Promise<ShotPlan>;
  /**
   * A shot, staged and made into a card (contract v11). The card's provenance
   * carries the shot as it was drawn, so it can be made again. A blank frame is
   * tried once more; a card over `output.maxBytes` is made again at a lower
   * quality, or refused when it is a PNG.
   */
  renderShot(shot: unknown, options?: { timeoutMs?: number }): Promise<ShotRender<ShareHandleResult>>;
  /**
   * Starcom's layers for one of Mecha Jono's categories (contract v12; their v9
   * proposal), `group.kind` as their vocabulary writes it. Only layers this
   * build draws; a kind it does not know falls back to its group.
   */
  layersFor(category: string): LayersForCategory;
  /**
   * The card of one item with Mecha Jono's template for it (contract v14; their
   * v9 proposal): a shot of that address, its badge the item's own where the
   * item says what it is (IM14). Returns what compose returns, or throws why
   * there is no card.
   */
  composeFor(
    address: string,
    options?: { template?: CardTemplate; preset?: CardPreset; scale?: number; timeoutMs?: number },
  ): Promise<ShareHandleResult>;
}

/**
 * Whether the globe can be captured, and with an address whether that item is
 * drawn too; when not, why, in words a caller can act on.
 */
export interface ShareReadiness {
  ready: boolean;
  waitedMs: number;
  reason?: string;
}

/** One card asked of renderBatch. */
export interface ShareBatchRequest {
  /** An item drawn, by its id in listReports(): a Raver Watch item's is its `<kind>:<pubkey>:<d>` address. */
  address?: string;
  /** An area's code, as listAreas() gives it, for a card about the area (v30). */
  area?: string;
  /** A War & Conflict theatre's slug, for a card about the theatre (v36). */
  theatre?: string;
  /** "latest" or a UTC day, for the War & Conflict Brief's front page (v37). */
  brief?: string;
  /** Beside `brief`: its worst theatres to light, 1 to 4 (v37). */
  theatres?: number;
  preset?: CardPreset;
  /** The layers to show, as pinLayers takes them. */
  layers?: GlobeLayerId[];
  /** The shared time window, as setTimeWindow takes it. */
  window?: { from: number; until: number } | null;
  /** A card template. Not built yet: the default card is made, and a note says so. */
  template?: string;
}

/** One card from renderBatch, or why there is none. */
export interface ShareBatchResult {
  ok: boolean;
  card?: ShareHandleResult;
  reason?: string;
  /** What was dropped or changed, in one line (v9); `notes` lists them (v11). */
  note?: string;
  notes?: string[];
  /** The shot as it was drawn (v11). */
  shot?: Shot;
  timing?: { stageMs: number; composeMs: number; bytes: number };
}

/** What the internal compose takes: the handle's options, and a shot's type, quality and the shot. */
interface ComposeOptions {
  scale?: number;
  preset?: CardPreset;
  fit?: CardFit;
  mimeType?: ShotImageType;
  quality?: number;
  shot?: Shot;
  /** A shot's template and who chose it; unstated, the featured item's own (IM14). */
  template?: ChosenTemplate | null;
  /** A front page's facts, which head the card in place of an item's (IM16). */
  frontPage?: FrontPageProvenance | null;
  /** A Timestream strip under the picture (D-PW, PW62), made by staging. */
  timestream?: StripModel | null;
  /** An event chart over a corner of the picture (D-PW, PW87), made by staging. */
  chart?: CardChart | null;
  /** What a card about an area says, in place of a featured item's (BA23). */
  area?: FeaturedReport | null;
  /** Whether the card returns its alt text (the shot's `output.alt`). Default true. */
  alt?: boolean;
  /** A QR code of the short view link, with the footer, when a shot asks (`card.qr`, IM13). */
  qr?: boolean;
  /** A close-up of the featured item, in the picture's corner, when a shot asks (`card.inset`, IM36). */
  inset?: boolean;
}

/** How many Intel Reports matched, against how many the cap drew (v25, BA1). */
export interface ShareReportCounts {
  shown: number;
  /** An upper bound: the priority filter ran only over what was read. */
  matching: number;
  /** The cap in force, null for Unlimited. */
  cap: number | null;
  truncated: boolean;
}

/** A report cap as the handle states it. */
/** The glyphs' look in force (v28, BA15), and who set it: this page's handle, or the person. */
export interface ShareReportLook {
  emblems: boolean;
  from: 'handle' | 'setting';
}

/** Earth Weather's look in force (v31, WX9), and who set each part: this page's handle, or the person. */
export type ShareWeather = WeatherLookInForce;

/** The solar system's scale in force (v72), and who chose it. */
export interface ShareScale {
  scale: SolarScale;
  from: 'handle' | 'person';
}

export interface ShareReportCap {
  cap: number | null;
  label: string;
  from: 'handle' | 'setting';
}

/** The time window as an agent reads it: null ends while live. */
export interface ShareTimeWindow {
  from: number | null;
  until: number | null;
  live: boolean;
}

/*
 * ─── THE INTERFACE AND THE PUBLISHED CONTRACT MUST DESCRIBE ONE SURFACE ────
 *
 * Adding a method to ShareHandle and forgetting to declare it ships an
 * undeclared API: it works, agents discover it, and it becomes load-bearing
 * before anyone decided to support it. Removing one without bumping the
 * version breaks a consumer that read the contract and believed it.
 *
 * This fails the BUILD in both directions. It lives here rather than in a test
 * because tsconfig.app.json excludes **\/*.test.ts from typechecking — a
 * compile-time assertion in a test file is not compiled, and would be a check
 * that checks nothing.
 */
type DeclaredHandleKey =
  | typeof SHARE_HANDLE_CONTRACT.properties[number]
  | keyof typeof SHARE_HANDLE_CONTRACT.methods;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _HandleMatchesPublishedContract = Assert<Same<keyof ShareHandle, DeclaredHandleKey>>;

export interface UseGlobeShareCardOptions {
  globeRef: MutableRefObject<GlobeMethods | undefined>;
  /**
   * Each source's state as the app is holding it, derived by the caller from
   * the hooks it already consumes. Passed in rather than read here so this
   * does not open a second subscription to every feed in the app — and so the
   * caveats are derived from the same values the HUD is showing.
   */
  feeds: FeedProvenance[];
  /**
   * The analysis marks in the frame, derived by the caller from the same
   * layers the globe renders. Null when no analysis layer is up at all.
   *
   * Passed in for the same reason as `feeds`: so the card describes the state
   * the viewer is looking at, not a second read of it.
   */
  marks: MarkProvenance | null;
  /**
   * Called when the share handle moves the camera on purpose — setView, or a
   * recordClip camera track.
   *
   * Globe.tsx's first-visit turn (useTurnToFirstIntel) stands down for a
   * person's drag, and a move made in code does not fire the controls' `start`
   * event, so without this an agent's chosen pose was overridden ~15 s after
   * load when the first reports arrived. Reported by Mecha Jono, 2026-09-25.
   */
  onViewChosen?: () => void;
  /**
   * Layers drawn by a switch other than the layer control — the GeoPolitical
   * overlay toggles, which turn a renderer on whatever the mode. The layer
   * control cannot know about those, so without this the card named the
   * layer's data source and not the layer itself, whose shapes were in the
   * picture.
   */
  alsoDrawn?: readonly GlobeLayerId[];
  /**
   * The Intel Reports drawn now, derived by the caller from the glyph layer's
   * places (shareReports.listShareReports) — what listReports returns.
   */
  shareReports?: readonly ShareReportInfo[];
  /** The quakes drawn as flags, by their times, ms: a clip's replay replays them with the reports (D-EQ, EQ21). */
  quakeTimes?: readonly number[];
  /**
   * The featured report as the card should state it, derived by the caller from
   * the report on the globe (shareReports.featuredReportFor). Null when none is
   * featured, or when the one chosen is not drawn.
   */
  featured?: FeaturedReport | null;
  /**
   * The War & Conflict Brief of a UTC day, the newest unless one is named, from
   * the War & Conflict layer (IM16); null while it is off or the day has none.
   */
  briefOf?: (day?: string) => WarConflictBrief | null;
  /**
   * Whether the planet's surface is drawn as its skin (globeSurface.ts).
   * whenReady waits for it: until the material and its textures are in, a card
   * draws a planet without its skin. Absent where nothing reports it.
   */
  surface?: SurfaceReadiness;
  /**
   * A close-up of a drawn item (IM34–IM36), from the layer that drew it: Raver
   * Watch's public venues and heat towns. Undefined for an item it did not draw.
   */
  closeUp?: (id: string) => Promise<CardInset | CloseUpRefusal | undefined>;
  /** Why a drawn item may not have a close-up: null when it may, undefined when the layer did not draw it. */
  closeUpRefusal?: (id: string) => string | null | undefined;
  /**
   * Why an item a layer holds is not drawn (Mecha Jono's ask D): its layer off,
   * outside the moment shown, and so on. Undefined when no layer holds it.
   */
  whyNotDrawn?: (id: string) => string | null | undefined;
  /**
   * The Intel Reports drawn and matched, with the person's own cap (v25, BA1):
   * what the globe's "Showing N of M" notice states.
   */
  reportCounts?: { shown: number; matching: number; setting: number | null };
  /** The person's own look for the glyphs (v28, BA15): whether they wear their category's emblem. */
  reportLookSetting?: ReportLook;
  /** What the person's settings have Earth Weather draw (v31, WX9). */
  weatherSetting?: WeatherLook;
  /** War & Conflict's theatres, for a card about one (v36; theatre-lens.md, TL3). */
  theatres?: TheatreLens;
  /** Tonight from a moment in unix seconds, from Raver Watch's scene events, for its card (v38; raver-nights.md, RN3). */
  tonightOf?: (fromS: number) => Tonight;
  /** The drawn notes that carry a licence, each at its place: a card credits those in its picture (Interchange 3.25). */
  licensed?: ReadonlyArray<{ id: string; lat: number; lng: number; licence: string }>;
  /** Hero Watch's week as drawn, for its card (v42; hero-watch.md, HW10). Throws when nothing stands to put on it. */
  weekOf?: () => HeroWatchWeek;
  /** The briefing tour's playlists, as the Tour button reads and shows them, for a playlist as a clip (v39). */
  tours?: TourSources;
}

/** What a briefing tour reads and shows (briefing-playlists.md, BP1, BP5, BP9). */
export interface TourSources {
  /** What a playlist's layer offers now, and whether its read is done; null while it has nothing. */
  candidatesFor(id: PlaylistId, nowMs: number): TourOffer | null;
  /** Shows a playlist's layers and moment; returns how to put back what it changed. */
  show(id: PlaylistId): () => void;
}

/** How long a playlist clip waits for its layer's read, as the screen tour does (BP21). */
const TOUR_READ_WAIT_MS = 20_000;

/** Whether two lists name the same theatres, in any order. */
const sameTheatres = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((slug) => b.includes(slug));

/** War & Conflict's theatres as a card about one needs them (theatre-lens.md, TL3). */
export interface TheatreLens {
  /** What a theatre's card says and where it is, or null when nothing read names it. */
  facts(slug: string): TheatreFacts | null;
  /** The theatres read, for a refusal to list. */
  slugs(): string[];
  /**
   * A card's own lens (TL3, TL15): these theatres lit, none for an empty list,
   * whatever the person picked; null hands the lens back to the person's pick.
   */
  lens(slugs: readonly string[] | null): void;
  /** The theatres lit now: what the globe draws, not what was asked. */
  lit(): readonly string[];
}

export interface UseGlobeShareCardResult {
  /** Compose a card from the current view. Rejects rather than returning a blank. */
  shareView: (options?: { scale?: number; preset?: CardPreset }) => Promise<ComposedShareCard>;
  /** True while a composition is in flight — the image decode makes it async. */
  busy: boolean;
  /** The last failure, in the words the pipeline used. Cleared on the next attempt. */
  error: string | null;
  /** True once the globe can actually be captured. */
  ready: boolean;
  /**
   * An item's address (the inspector, OR23): this view's link, turned to the item at a close height, with `open=`
   * so the link reopens it in the inspector (openFromLink.ts).
   */
  linkTo: (at: { lat: number; lng: number }, noteId: string) => string;
}

/**
 * Resolve the globe into the shape the capture path needs.
 *
 * Returns null before the first frame. That is a normal state, not an error:
 * react-globe.gl populates these lazily, and a button should be disabled
 * rather than throwing at a person who clicked it a second too early.
 */
function resolveTarget(
  globeRef: MutableRefObject<GlobeMethods | undefined>,
): ShareCardTarget | null {
  const globe = globeRef.current as unknown as Partial<ShareCardTarget> | undefined;
  if (!globe) return null;
  if (typeof globe.renderer !== 'function') return null;
  if (typeof globe.scene !== 'function') return null;
  if (typeof globe.camera !== 'function') return null;
  if (typeof globe.getGlobeRadius !== 'function') return null;
  /*
   * The globe a person would see, not merely a globe object.
   *
   * For about five seconds after the handle is installed, globeRef points at a
   * 200×200 placeholder with no layout box, and a compose then returned a card
   * with no Earth in it and no error — reported by Mecha Jono, 2026-09-25. The
   * blank-frame guard could not catch it because the placeholder is not blank.
   * Every capture path, whenReady, and the share button's `ready` pass through
   * here, so refusing it once refuses it everywhere.
   */
  const canvas = (globe as ShareCardTarget).renderer().domElement;
  if (!canvasIsOnScreen(canvas)) return null;
  return globe as ShareCardTarget;
}

const waitMs = (ms: number) => (ms > 0
  ? new Promise<void>((resolve) => { window.setTimeout(resolve, ms); })
  : Promise.resolve());

/*
 * One frame, so a capture taken straight after a move sees the camera at its
 * destination. This does NOT wait for level-of-detail assets the new altitude
 * may pull in — that is unbounded and unobservable from here, so `settleMs` is
 * offered rather than a guess made on the caller's behalf.
 */
/**
 * How long a change of the timeline is waited for before it is called refused. It
 * rebuilds every layer's marks: on a page drawing hundreds of scene events under
 * software rendering that ran past the 3 s every other wait here allows, and a shot
 * was refused a window the timeline took a moment later (found on starcom.app,
 * 2026-10-10).
 */
const TIMELINE_WAIT_MS = 15_000;

const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof window.requestAnimationFrame !== 'function') { resolve(); return; }
  window.requestAnimationFrame(() => resolve());
});

/** Where the camera is, asked of the globe rather than remembered. */
function readView(globeRef: MutableRefObject<GlobeMethods | undefined>): ShareView {
  const globe = globeRef.current;
  if (!globe || typeof globe.pointOfView !== 'function') {
    throw new Error('The globe has not finished initialising — it has no camera position yet.');
  }
  const pov = globe.pointOfView();
  return { lat: pov.lat, lng: pov.lng, altitude: pov.altitude };
}

/** Nothing listed — stable, so the ref below does not churn on every render. */
const NO_SHARE_REPORTS: readonly ShareReportInfo[] = [];
const NO_QUAKE_TIMES: readonly number[] = [];

/** How long frames must come out blank under a dark sky before whenReady says so (OR9). */
const DARK_SKY_MS = 2000;
/** How tall whenReady's probe frame is, and how tall it is asked again before a far view is called blank. */
const PROBE_PX = 64;
const PROBE_FAR_PX = 256;

/**
 * Whether the globe has drawn a frame that can be captured. A small frame of the canvas's own shape: a square one sees
 * less across than a wide screen, and called a view blank whose Sun stood in the screen's corner. And a far view can
 * be all but empty at 64 px, what is drawn there under a pixel, so it is asked again at 256 before it is called blank
 * (found 2 Nov: the solar system from 3,000 radii out was blank at 64 and 128 px, drawn at 256).
 */
function frameIsDrawn(target: ShareCardTarget): boolean {
  const canvas = target.renderer().domElement;
  const aspect = canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 1;
  const drawnAt = (px: number) => {
    try {
      captureGlobeFrame(target, { width: Math.max(1, Math.round(px * aspect)), height: px, mimeType: 'image/jpeg', quality: 0.1 });
      return true;
    } catch {
      return false;
    }
  };
  return drawnAt(PROBE_PX) || drawnAt(PROBE_FAR_PX);
}

export const useGlobeShareCard = (
  {
    globeRef, feeds, marks, alsoDrawn, onViewChosen,
    shareReports = NO_SHARE_REPORTS, featured = null, briefOf, surface, closeUp, closeUpRefusal, whyNotDrawn, reportCounts,
    reportLookSetting, weatherSetting, theatres, tonightOf, weekOf, tours, licensed, quakeTimes = NO_QUAKE_TIMES,
  }: UseGlobeShareCardOptions,
): UseGlobeShareCardResult => {
  const { layers: catalogue, pinLayer, clearPins, unpinLayer, isLayerActive } = useGlobeLayerControl();
  /*
   * The layers its published contract names, and no others. The catalogue can
   * hold a layer before the contract does: Raver Watch's joined it for people
   * first, and join the contract with v8, which adds the time window beside
   * them as promised to Mecha Jono (globe record, section 19). Until then an
   * agent reading v7 is never handed a layer v7 does not list.
   */
  // Psi Watch's layers too, only while its switch is on (decision D-PW, PW19, PW62): off, an agent is never handed them.
  const layers = catalogue.filter((l) => (SHARE_HANDLE_CONTRACT.layers as readonly string[]).includes(l.id)
    && (l.category !== 'PsiWatch' || psiKitOn()));
  const { visualizationMode, setVisualizationMode } = useVisualizationMode();
  /*
   * The shared time window (RW7), read at call time like the rest: the handle is
   * installed once, and a window captured then would be the load's forever.
   */
  const temporal = useTemporalStateOptional();
  const temporalRef = useRef(temporal);
  temporalRef.current = temporal;
  const windowSeconds = (): { from: number; until: number } | null => {
    const chosen = temporalRef.current?.timeWindow;
    return chosen ? { from: Math.floor(chosen.start.getTime() / 1000), until: Math.floor(chosen.end.getTime() / 1000) } : null;
  };
  /** The moment the timeline is paused at, in ms; null while live, when the weather moves with the clock. */
  const pausedAt = (): number | null => {
    const timeline = temporalRef.current;
    return timeline && !timeline.isLive ? timeline.currentTime : null;
  };
  const { updateMarkerStyle } = useCyberCommandSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /*
   * Straight from the layer catalogue, including `implemented`. This is the
   * derivation the whole caveat about "selected but nothing renders it" rests
   * on — the catalogue already knows which layers are no-ops, and nothing here
   * gets to decide otherwise.
   */
  const alsoDrawnKey = (alsoDrawn ?? []).join(',');
  const layerProvenance = useMemo<LayerProvenance[]>(
    () => layers.map((l) => ({
      id: l.id,
      label: l.label,
      active: l.isActive || (alsoDrawn ?? []).includes(l.id),
      implemented: l.isImplemented,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not array identity
    [layers, alsoDrawnKey],
  );

  /*
   * This view's own address, a deeplink v1 (RW8): the layer, what is pinned
   * beside it, the camera, the featured report and the window. The builder is
   * the parser's inverse, so the link reads back as the view it was made from.
   */
  const viewDeeplink = (view: ShareView): Deeplink => {
    const sub = visualizationMode.subMode as DeeplinkLayer;
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      v: 1,
      sub,
      mode: visualizationMode.mode,
      at: { lat: round(view.lat), lng: round(view.lng), alt: round(view.altitude) },
      pins: layers
        .filter((l) => l.isPinned && l.id !== sub && l.id !== 'RLSH')
        .map((l) => l.id as DeeplinkLayer)
        .slice(0, 4),
      focus: getFeaturedReportId(),
      win: windowSeconds(),
      // The look, when it is not the default, so the link opens the picture lit as drawn (v2).
      ...(lookIsDefault(getGlobeAppearance()) ? {} : {
        look: { skin: getGlobeAppearance().skin, light: getGlobeAppearance().lightMode, nightFill: getGlobeAppearance().nightFill },
      }),
    };
  };
  /*
   * The rail's choices for the layers a link draws (OR12: kept in links, `lc=`). Read back by layerChoices.ts on
   * load; the QR's short link leaves them out (cardQr.ts).
   */
  const choicesPart = (link: Deeplink): string => {
    const lc = encodeLayerChoices([link.sub, ...link.pins].filter((l): l is DeeplinkLayer => Boolean(l)));
    return lc ? `&${LAYER_CHOICES_PARAM}=${lc}` : '';
  };
  const viewLink = (view: ShareView): string => {
    const link = viewDeeplink(view);
    return `${globalThis.location?.origin ?? ''}/${deeplinkSearch(link)}${choicesPart(link)}`;
  };

  /** What compose is given for these options: one place, so a dry run plans the picture compose makes. */
  const inputFor = useCallback(
    (options?: ComposeOptions): ComposeShareCardInput => {
      const view = readView(globeRef);
      // A card about an area features the area (BA23), and no item.
      const item = options?.area ? null : featured;
      // The share button's card, and compose(): the featured item's own badge, where it says what it is (IM14).
      const own = options?.template === undefined
        ? decideTemplate(undefined, item ? (shareReports ?? []).find((r) => r.id === item.id) ?? null : null)
        : null;
      const template = options?.template !== undefined
        ? options.template
        : own && !('reason' in own) && own.template && own.chosenBy ? { name: own.template, chosenBy: own.chosenBy } : null;
      return {
        camera: { lat: view.lat, lon: view.lng, altitude: view.altitude },
        layers: layerProvenance,
        feeds,
        marks,
        scale: options?.scale,
        preset: options?.preset,
        ...(options?.fit ? { fit: options.fit } : {}),
        ...(options?.mimeType ? { mimeType: options.mimeType } : {}),
        ...(options?.quality !== undefined ? { quality: options.quality } : {}),
        ...(options?.shot ? { shot: options.shot } : {}),
        template,
        ...(options?.frontPage ? { frontPage: options.frontPage } : {}),
        ...(options?.timestream ? { timestream: options.timestream } : {}),
        ...(options?.chart ? { chart: options.chart } : {}),
        ...(options?.alt === false ? { alt: false } : {}),
        // A paused timeline's moment holds the picture's motion (IM20, IM23); live, compose uses its own.
        ...(temporal && !temporal.isLive ? { stillAt: temporal.currentTime } : {}),
        featured: options?.area ?? item,
        link: viewLink(view),
        // The QR code's short link to the view on the public site (IM31), when a shot asks for one.
        ...(options?.qr ? { qr: { link: qrViewLink(viewDeeplink(view)) } } : {}),
        window: windowSeconds(),
        raverWatchItems: (shareReports ?? [])
          .filter((report) => report.layer !== 'IntelReports')
          .map((report) => ({ id: report.id, layer: report.layer, level: report.variant })),
        ...(licensed?.length ? { licensed } : {}),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewLink and windowSeconds read refs and render state
    [globeRef, layerProvenance, feeds, marks, featured, shareReports, visualizationMode, layers, temporal, licensed],
  );

  /*
   * Close-ups, read at call time like the reports: the layer that drew an item
   * answers for it, and an item no layer answers for is refused by its kind,
   * never an Intel Report (IM2).
   */
  const closeUpRef = useRef(closeUp);
  closeUpRef.current = closeUp;
  const closeUpRefusalRef = useRef(closeUpRefusal);
  closeUpRefusalRef.current = closeUpRefusal;
  const whyNotDrawnRef = useRef(whyNotDrawn);
  // The psi event a card last opened (D-PW, PW62), by address: a window has no lines of its own to say it is drawn.
  const psiOpenedRef = useRef<string | null>(null);
  whyNotDrawnRef.current = whyNotDrawn;
  const reportCountsRef = useRef(reportCounts);
  reportCountsRef.current = reportCounts;
  const reportLookSettingRef = useRef(reportLookSetting);
  reportLookSettingRef.current = reportLookSetting;
  /** The glyphs' look in force, as the handle states it (v28). */
  const lookInForce = useCallback((): ShareReportLook => effectiveReportLook(reportLookSettingRef.current ?? { emblems: true }), []);
  const weatherSettingRef = useRef(weatherSetting);
  weatherSettingRef.current = weatherSetting;
  /** Earth Weather's look in force, as the handle states it (v31); without the person's, where people start. */
  const weatherInForce = useCallback((): ShareWeather => effectiveWeatherLook(weatherSettingRef.current ?? { colour: 'temperature', wind: true, clouds: true }), []);
  // Read at call time, like composeRef: listReports must describe the globe now.
  const shareReportsRef = useRef(shareReports);
  shareReportsRef.current = shareReports;
  const quakeTimesRef = useRef(quakeTimes);
  quakeTimesRef.current = quakeTimes;
  /** The report cap in force, as the handle states it (v25). */
  const capInForce = useCallback((): ShareReportCap => {
    const { cap, from } = effectiveReportCap(reportCountsRef.current?.setting ?? DEFAULT_REPORT_CAP);
    return { cap, label: capLabel(cap), from };
  }, []);
  const closeUpRefusalOf = useCallback((id: string): string | null => {
    const own = closeUpRefusalRef.current?.(id);
    if (own !== undefined) return own;
    return closeUpRefusalFor(shareReportsRef.current.find((report) => report.id === id)?.layer ?? 'unknown');
  }, []);

  const compose = useCallback(
    async (options?: ComposeOptions): Promise<ComposedShareCard> => {
      const target = resolveTarget(globeRef);
      if (!target) {
        throw new Error(
          'The globe has not finished initialising — there is no renderer to '
          + 'capture from yet. This is the state before the first frame, not a failure.',
        );
      }
      const chosen = getFeaturedReportId();
      if (chosen !== null && !featured) {
        /*
         * A report was chosen and is not drawn now — the layer was switched, or
         * the report was replaced. Composing without it would publish a card that
         * is not about what the caller asked for, and look fine doing it.
         */
        throw new Error(
          `focusReport chose "${chosen}", which is not on the globe now. Call listReports() `
          + 'for what is drawn, or focusReport(null) to compose without a featured report.',
        );
      }
      // The close-up, made by the layer that drew the item, before anything is measured (IM36).
      let inset: CardInset | null = null;
      if (options?.inset) {
        if (!featured) {
          throw new Error('A close-up draws the featured item among its neighbours, and no item is featured: focusReport(id) first.');
        }
        const refusal = closeUpRefusalOf(featured.id);
        if (refusal) throw new Error(refusal);
        const made = await closeUpRef.current?.(featured.id);
        if (!made) throw new Error(`No layer drawing "${featured.id}" makes a close-up of it.`);
        if ('refused' in made) throw new Error(made.refused);
        inset = made;
      }
      return composeShareCard(target, { ...inputFor(options), ...(inset ? { inset } : {}) });
    },
    [globeRef, featured, inputFor, closeUpRefusalOf],
  );

  const shareView = useCallback(
    async (options?: { scale?: number; preset?: CardPreset }): Promise<ComposedShareCard> => {
      setBusy(true);
      setError(null);
      try {
        return await compose(options);
      } catch (e) {
        // Kept verbatim. Every refusal in this pipeline explains what went
        // wrong and why it refused instead of guessing; paraphrasing it into
        // "capture failed" throws away the only part that helps.
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [compose],
  );

  /*
   * `compose` changes identity whenever the layers or feeds change, and the
   * window handle must not close over a stale one — a card captioned with the
   * layer state from three mode-switches ago is precisely the kind of quiet
   * lie this feature exists to prevent. The ref is read at call time.
   */
  const onViewChosenRef = useRef(onViewChosen);
  onViewChosenRef.current = onViewChosen;
  const composeRef = useRef(compose);
  composeRef.current = compose;
  const inputForRef = useRef(inputFor);
  inputForRef.current = inputFor;

  /*
   * ─── THE WORLD AS IT IS NOW, NOT AS IT WAS WHEN RECORDING BEGAN ──────────
   *
   * recordClip runs for seconds inside one call. Anything it closed over at
   * the start is frozen there, so a feed that fails at second four would be
   * sampled as healthy for all ten — and clipProvenance would faithfully state
   * a clean history that never happened. Refreshed every render, read at
   * sample time.
   */
  const worldRef = useRef({ layers: layerProvenance, feeds, marks });
  worldRef.current = { layers: layerProvenance, feeds, marks };

  // Read at call time too: a brief waits on the layer the shot just turned on.
  const briefOfRef = useRef(briefOf);
  briefOfRef.current = briefOf;
  const theatresRef = useRef(theatres);
  theatresRef.current = theatres;
  const tonightOfRef = useRef(tonightOf);
  tonightOfRef.current = tonightOf;
  const weekOfRef = useRef(weekOf);
  weekOfRef.current = weekOf;
  const toursRef = useRef(tours);
  toursRef.current = tours;
  const feedsRef = useRef(feeds);
  feedsRef.current = feeds;
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const featuredRef = useRef(featured);
  featuredRef.current = featured;

  /*
   * ─── THE CONTROLS THAT DECIDE WHAT IS DRAWN ──────────────────────────────
   *
   * Held in a ref for the same reason compose is: the handle is installed once
   * per globe, and rebuilding it on every render would delete and re-add the
   * global underneath an agent that is mid-call.
   *
   * `setLayer` writes the visualization MODE as well as the sub-mode, because
   * they are not independent — a sub-mode belongs to exactly one mode, and
   * setting one without the other produces a pair the app never generates.
   * The mode is taken from the layer catalogue's own category rather than from
   * a second mapping here, so a layer added there cannot become unreachable.
   */
  /*
   * ─── THE CONTROLS THAT DECIDE WHAT IS DRAWN ──────────────────────────────
   *
   * Reassigned wholesale on every render, exactly as composeRef is, and for
   * the same two reasons. The handle is installed once per globe, so building
   * these into it directly would delete and re-add the global underneath an
   * agent mid-call. And a useRef INITIALISER would capture the first render's
   * `layers` and never let go — listLayers would report the state the page had
   * when it loaded, forever, which is the most convincing kind of wrong.
   *
   * `setLayer` writes the visualization MODE as well as the sub-mode, because
   * they are not independent: a sub-mode belongs to exactly one mode, and
   * setting one without the other produces a pair the app never generates. The
   * mode comes from the layer catalogue's own category rather than a second
   * mapping here, so a layer added there cannot become unreachable from here.
   */
  const controlsRef = useRef<GlobeShareControls>(null as unknown as GlobeShareControls);
  controlsRef.current = {
    listLayers: () => layers.map((l) => ({
      id: l.id,
      label: l.label,
      category: l.category,
      implemented: l.isImplemented,
      active: l.isActive,
      primary: l.isPrimary,
      pinned: l.isPinned,
    })),

    setLayer: (layerId, options) => {
      const info = layers.find((l) => l.id === layerId);
      if (!info) {
        throw new Error(
          `No layer "${layerId}". Call listLayers() for what this build actually has — `
          + 'an id that was right in one release is not automatically right in the next.',
        );
      }
      if (options?.clearOtherPins) clearPins();
      setVisualizationMode({ mode: info.category, subMode: layerId } as VisualizationMode);
      if (options?.pin) pinLayer(layerId);
      return {
        primary: layerId,
        pinned: layers.filter((l) => l.isPinned).map((l) => l.id),
      };
    },

    /*
     * Several layers at once, which is what "maximum visualization" means in
     * practice: the pin machinery already existed and nothing outside the HUD
     * could reach it. An empty array clears, so one method covers both
     * directions rather than making a caller remember a second one.
     */
    pinLayers: (layerIds) => {
      const known = new Set(layers.map((l) => l.id));
      const unknown = layerIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new Error(`Unknown layer(s): ${unknown.join(', ')}. Call listLayers() for what exists.`);
      }
      clearPins();
      for (const id of layerIds) pinLayer(id);
      return { pinned: [...layerIds] };
    },

    setMarkerStyle: (layerId, style) => {
      if (!MARKER_STYLE_VALUES.includes(style)) {
        throw new Error(
          `Unknown marker style "${style}". The contract lists ${MARKER_STYLE_VALUES.join(', ')}.`,
        );
      }
      updateMarkerStyle(layerId, style);
      return { layer: layerId, style };
    },
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    /*
     * Moving the camera on purpose: setView, and frameReports after it has worked
     * out where to. One path, so both tell the first-visit turn to stand down and
     * both go through telemetry.
     */
    const moveCamera = async (pov: Partial<ShareView>, options?: { transitionMs?: number; settleMs?: number }): Promise<ShareView> => {
      onViewChosenRef.current?.();
      const globe = globeRef.current;
      if (!globe) {
        throw new Error('The globe has not finished initialising — the camera cannot be moved yet.');
      }
      const current = readView(globeRef);
      const target = {
        lat: pov.lat ?? current.lat,
        lng: pov.lng ?? current.lng,
        altitude: pov.altitude ?? current.altitude,
      };
      const transitionMs = options?.transitionMs ?? 0;

      /*
       * setGlobePointOfView, never globe.pointOfView directly.
       *
       * globe.gl's imperative setter moves the three.js camera and never
       * fires OrbitControls' change event, which is the only thing
       * globeCameraTelemetry listens to — so the LOD detail tier and
       * TinyGlobe's orientation marker stay frozen at the old altitude. An
       * agent that moved the camera with the raw call would capture a new
       * view rendered at the previous view's level of detail. See the note
       * on setGlobePointOfView for how that was found.
       */
      setGlobePointOfView(globe as unknown as Parameters<typeof setGlobePointOfView>[0], target, transitionMs);

      await waitMs(transitionMs);
      await nextFrame();
      if (options?.settleMs) await waitMs(options.settleMs);

      return readView(globeRef);
    };

    /*
     * ─── WHY A READINESS SIGNAL IS AN OPTIMISATION ─────────────────────────
     *
     * Without it an agent has to guess a settle time. Guess low and it
     * composes a half-drawn globe; guess high and it burns wall clock on
     * every capture. Both failures end the same way — a reload — and a
     * reload is the only thing in this system that costs bandwidth, because
     * capture itself never touches the network.
     *
     * Resolves rather than rejects on timeout, reporting `ready: false` and
     * why. A caller that treats a slow globe as a crash will reload, which is
     * the expensive mistake this exists to prevent; one that reads the flag
     * can decide to capture anyway, or to wait longer, without paying again.
     *
     * With an address (v9) it waits for THAT item to be drawn as well: a
     * globe that can be captured is not yet one that shows what the card is
     * about, and Mecha Jono's posts are each about one item.
     */
    /** The shown layers' feeds that are loading now (D-LS, LS5). */
    const feedsStillLoading = () => {
      const now = Date.now();
      return feedsRef.current.filter((f) => isStillLoading(f, now));
    };
    const listedNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
    const waitUntilReady = async (options?: { timeoutMs?: number; address?: string }): Promise<ShareReadiness> => {
      const timeoutMs = options?.timeoutMs ?? 30000;
      const address = options?.address;
      const startedAt = Date.now();
      let why = 'the globe has not finished initialising';
      // When the frames began to come out blank under a dark sky (OR9): said after DARK_SKY_MS, not after the whole wait.
      let darkSince: number | null = null;
      /*
       * Readiness is a DRAWN FRAME, not a resolvable API.
       *
       * The first version of this polled resolveTarget, which only asks
       * whether the renderer/scene/camera methods exist. They exist long
       * before anything is drawn, and they keep existing across a layer
       * change while the scene is rebuilt — so it returned true immediately
       * and the very next compose threw "the captured frame is blank". A
       * readiness signal that cannot detect unreadiness is worse than none,
       * because a caller stops checking for what it reported.
       *
       * So it captures a deliberately tiny frame and lets captureGlobeFrame's
       * own blankness test answer — the same check the real capture applies.
       *
       * ─── IT IS NOT A GUARANTEE, AND MUST NOT BE READ AS ONE ─────────────
       *
       * Measured, not assumed: across a five-layer sweep this returned
       * `ready: true` after 1854ms for CyberThreats and the compose 1200ms
       * later still refused as blank. Drawability is a property of a MOMENT,
       * and `preserveDrawingBuffer` is false, so a globe that could be
       * captured when asked is not necessarily one that can be captured
       * later.
       *
       * What this buys is the wait for first paint, which is real and worth
       * having. What a caller must still do is RETRY a compose that throws
       * GlobeCaptureError rather than treating it as fatal — a retry costs
       * nothing because it never touches the network, and a reload costs
       * ~20 MB. renderBatch does.
       */
      /*
       * A frame first, so a change asked for just before has rendered before anything
       * here is read. A layer of another mode builds a new engine and skin, and the first
       * look saw the old mode's surface, settled and ready: a card then drew the previous
       * skin under a record naming the new one (found on starcom.app, 2026-10-10).
       */
      await nextFrame();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // A psi event is drawn once it is open with Psi Watch on: a sky event on Planet lines, a window with its own (PW62).
        const psiDrawn = address !== undefined && isPsiAddress(address) && psiKitOn()
          && (getPsiLinesState().event?.address === address || psiOpenedRef.current === address);
        const drawn = address === undefined || psiDrawn || shareReportsRef.current.some((r) => r.id === address);
        const surfaceNow = surfaceRef.current;
        const target = drawn ? resolveTarget(globeRef) : null;
        if (!drawn) {
          // The layer that holds it says why it does not draw it (ask D); else the general hint.
          why = isPsiAddress(address)
            ? `"${address}" is not open: a shot { subject: { psiEvent, at } } opens it, with Psi Watch on (it is unless ?psi=off hid it)`
            : whyNotDrawnRef.current?.(address)
              ?? `"${address}" is not among the items drawn: listReports() lists what is. Is its layer on, and does the time window include it?`;
        } else if (surfaceNow && !surfaceNow.ready) {
          // A frame can be captured before the skin is in: it is the planet without its surface.
          why = `the globe's surface was still loading (${surfaceNow.loading.join(', ')}): a card then would draw the planet without it`;
        } else if (scaleGliding()) {
          // Nor while the solar system glides to a new scale (OR9): a card then would draw it between the two.
          why = "the solar system was still gliding to its new scale: a card then would draw it between the two";
        } else if (!heatMapReadiness().ready) {
          // Nor before the temperature field is drawn, while Earth Weather shows it (D-W).
          why = `${heatMapReadiness().why}: a card then would show the ground without it`;
        } else if (!windFlowReadiness().ready) {
          // Nor before the wind's streaks are, while Earth Weather shows wind (D-W, WX3).
          why = `${windFlowReadiness().why}: a card then would show no wind`;
        } else if (!rainReadiness().ready) {
          // Nor before the rain is drawn, while Earth Weather's colour is rain (D-W, WX4).
          why = `${rainReadiness().why}: a card then would show the ground without it`;
        } else if (!realCloudsReadiness().ready) {
          // Nor before the satellites' clouds are, while Earth Weather shows clouds (D-W, WX2).
          why = `${realCloudsReadiness().why}: a card then would show a sky without them`;
        } else if (!eFieldReadiness().ready) {
          // Nor before the geoelectric field is drawn, while Space Weather shows it (D-SW, SW1).
          why = `${eFieldReadiness().why}: a card then would show the ground without it`;
        } else if (!auroraReadiness().ready) {
          // Nor before the aurora's forecast is, while Space Weather shows the aurora (D-SW, SW3).
          why = `${auroraReadiness().why}: a card then would show no aurora`;
        } else if (!fieldLinesReadiness().ready) {
          // Nor before the field lines are traced, while Space Weather shows them (D-SW, SW4).
          why = `${fieldLinesReadiness().why}: a card then would show no field lines`;
        } else if (!vanAllenReadiness().ready) {
          // Nor before GOES's electrons are read, while Space Weather shows the belts (D-SW, SW5).
          why = `${vanAllenReadiness().why}: a card then would show the belts at the wrong brightness`;
        } else if (!cuspsReadiness().ready) {
          // Nor before the cusps are traced, while Space Weather shows them (D-SW, SW5).
          why = `${cuspsReadiness().why}: a card then would show no cusps`;
        } else if (!tailSheetReadiness().ready) {
          // Nor before the tail's current sheet is found, while Space Weather shows it (D-SW, SW5).
          why = `${tailSheetReadiness().why}: a card then would show no tail sheet`;
        } else if (!heliosphereReadiness().ready) {
          // Nor before the 7 days of wind are read, while Space Weather shows the stream (D-SW, SW6).
          why = `${heliosphereReadiness().why}: a card then would show no solar wind`;
        } else if (!nearEarthFlowReadiness().ready) {
          // Nor before the wind near the Earth is drawn, while Space Weather shows it (D-SW, SW17).
          why = `${nearEarthFlowReadiness().why}: a card then would show no solar wind near the Earth`;
        } else if (!enlilReadiness().ready) {
          // Nor before ENLIL's frames for the moment are read, while Space Weather shows it (D-SW, SW18).
          why = `${enlilReadiness().why}: a card then would show another moment's model, or none`;
        } else if (!cmesReadiness().ready) {
          // Nor before DONKI's CMEs for the moment are read, while Space Weather shows them (D-SW, SW22).
          why = `${cmesReadiness().why}: a card then would show no CMEs`;
        } else if (!boundaryMomentReadiness().ready) {
          // Nor before the wind for the moment is read, while the magnetopause or bow shock is drawn (D-SW, SW30).
          why = `${boundaryMomentReadiness().why}: a card then would show the magnetopause for another moment`;
        } else if (!heroWatchReadiness().ready) {
          // Nor before Hero Watch's records are read, while a section of it is on (D-HW).
          why = `${heroWatchReadiness().why}: a card then would show none of its responders`;
        } else if (!aiWatchReadiness().ready) {
          // Nor before AI Watch's notes are read, while a section of it is on (D-AW).
          why = `${aiWatchReadiness().why}: a card then would show none of its notes`;
        } else if (!civilUnrestReadiness().ready) {
          // Nor before Civil Unrest's notes are read and their countries outlined, while a section of it is on (D-CU).
          why = `${civilUnrestReadiness().why}: a card then would show none of its days of unrest`;
        } else if (!quakeShakingReadiness().ready) {
          // Nor before USGS's ShakeMaps for the quakes shown are read, while their flags are drawn (D-EQ, EQ11).
          why = `${quakeShakingReadiness().why}: a card then would show rings in place of the shaking USGS mapped`;
        } else if (!heatMapThenReadiness().ready || !rainThenReadiness().ready || !windFlowThenReadiness().ready || !realCloudsThenReadiness().ready) {
          // Nor before a comparison's forecast half is drawn (D-CM, CM5).
          why = `${[heatMapThenReadiness(), rainThenReadiness(), windFlowThenReadiness(), realCloudsThenReadiness()].find((r) => !r.ready)?.why ?? 'The forecast half was still loading'}: its half would show none`;
        } else if (!quakeThenWindowReadiness().ready) {
          // Nor before the quakes of a comparison's other moment are read (D-CM, CM4).
          why = `${quakeThenWindowReadiness().why}: its half would show none`;
        } else if (!quakeReplayReadiness().ready) {
          // Nor before the quakes are drawn for a clip's replay, while one is about to record (D-EQ, EQ21).
          why = `${quakeReplayReadiness().why}: its first frame would show the window's quakes all at once`;
        } else if (!quakeWindowReadiness().ready) {
          // Nor before the quakes for the window shown are read from USGS and EMSC (D-EQ, EQ1, EQ2).
          why = `${quakeWindowReadiness().why}: a card then would show another window's quakes`;
        } else if (!quakePlatesReadiness().ready) {
          // Nor before the plate boundaries are read, while they are drawn beside the quakes (D-EQ, EQ8).
          why = `${quakePlatesReadiness().why}: a card then would show the quakes without them`;
        } else if (!missionsReadiness().ready) {
          // Nor before the missions are read, placed and counted, while Missions is on (D-MF, step 5e).
          why = `${missionsReadiness().why}: a card then would show none of its missions`;
        } else if (!shieldReadiness().ready) {
          // Nor before IGRF-14 is read, while Psi Watch's magnetic shield is on (D-PW, PW58).
          why = `${shieldReadiness().why}: a card then would show no field`;
        } else if (!psiModelReadiness().ready) {
          // Nor before the ψ field is computed for the moment shown, while Psi Watch's ψ field is on (D-PW, PW78).
          why = `${psiModelReadiness().why}: a card then would show another moment's field, or none`;
        } else if (pausedAt() !== null && !allDrawnFor(pausedAt()!)) {
          /*
           * Nor before each weather layer has drawn the paused moment (D-W, step 5d).
           * The moment reaches a layer in an effect after the render that moved
           * the cursor, and until then its readiness is the hour before's: a card
           * taken then shows another hour's weather under this one's time.
           */
          why = `Earth Weather had not drawn ${formatUtcDateTime(pausedAt()!, { year: true })}: a card then would show another hour's weather`;
        } else if (feedsStillLoading().length > 0) {
          /*
           * Nor while a shown layer's feed is still loading (D-LS, LS5). The checks above are the layers that
           * said they draw late; Eco Disasters, Comm Hubs, Cyber Threats and Conflict Zones never did, and a card
           * made when this released predated their data. A feed that has not reported at all, and may never, is
           * not waited on: the card says so instead.
           */
          const loading = feedsStillLoading().map((f) => f.shortName ?? f.name);
          why = `${listedNames(loading)} ${loading.length === 1 ? 'was' : 'were'} still loading: a card then would predate ${loading.length === 1 ? 'its' : 'their'} data`;
        } else if (!intelDrawnReadiness().ready) {
          // Nor before the Intel Reports just read are on the globe, a render away from it (H3).
          why = `${intelDrawnReadiness().why}: a card then would show fewer than were read`;
        } else if (target) {
          if (frameIsDrawn(target)) {
            return { ready: true, waitedMs: Date.now() - startedAt };
          } else {
            // Blank, or a lost context. Both mean "not yet"; keep waiting.
            why = 'the globe had not drawn a frame that could be captured: it was blank';
            /*
             * Unless it is the dark sky (OR9): far out at True 1:1, looking away from the Sun, nothing is drawn but the
             * names over the frame, and nothing will be. Said once it has held for DARK_SKY_MS.
             */
            if (darkSkyPossible()) {
              darkSince ??= Date.now();
              if (Date.now() - darkSince >= DARK_SKY_MS) {
                return {
                  ready: false,
                  waitedMs: Date.now() - startedAt,
                  reason: 'nothing is drawn in this view: far out at True 1:1 the Earth is under a pixel and the Sun is out of the frame, so a card would be dark sky. Turn toward the Sun, come in toward the Earth, or setScale("compact")',
                };
              }
            }
          }
        }
        if (Date.now() - startedAt >= timeoutMs) {
          return { ready: false, waitedMs: Date.now() - startedAt, reason: `After ${timeoutMs} ms, ${why}` };
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    };

    /** Until something the next render brings is true, or a refusal saying what did not happen. */
    /** What a card of this preset fits points into: the camera's field and the frame's and card's shapes. */
    const fitViewFor = (preset: CardPreset): FitView | null => {
      const target = resolveTarget(globeRef);
      if (!target) return null;
      const camera = target.camera() as { fov?: number };
      const canvas = target.renderer().domElement as { clientWidth?: number; clientHeight?: number; width: number; height: number };
      const frameAspect = (canvas.clientWidth && canvas.clientHeight)
        ? canvas.clientWidth / canvas.clientHeight
        : canvas.width / canvas.height;
      return { fovDeg: camera.fov ?? 50, frameAspect, cardAspect: CARD_PRESETS[preset].globeAspect };
    };

    /**
     * An area's frame for a card of this preset (BA22), and what is outside it in
     * words: by its code or a bare eu, once its shape is fetched. Throws why not.
     */
    const areaFrameFor = async (asked: unknown, preset: CardPreset) => {
      const code = typeof asked === 'string' ? areaCodeOf(asked) : null;
      const area = code ? areaByCode(code) : null;
      if (!code || !area) throw new Error(`No area "${String(asked)}". listAreas() gives every code.`);
      if (!(preset in CARD_PRESETS)) {
        throw new Error(`Unknown preset "${preset}". The contract lists ${Object.keys(CARD_PRESETS).join(', ')}.`);
      }
      const shapes = await loadAreaShapes();
      const shape = shapes?.get(code);
      if (!shape) throw new Error('The areas\' shapes could not be fetched. Ask again to try once more.');
      const view = fitViewFor(preset);
      if (!view) throw new Error('The globe has not finished initialising — the camera cannot be moved yet.');
      const frame = frameForArea(shape, view);
      if (!frame) throw new Error(`${area.name} is too large for one card even in its largest part.`);
      // The countries, to name what is outside: without them, the continents do.
      const territories = await loadTerritories().catch(() => undefined);
      const outside = outsideInWords(frame, view, { area, territories, shapes });
      // Aimed a hair above the floor, as frameReports is.
      const altitude = Math.max(frame.altitude, SHARE_ALTITUDE_FLOOR + 1e-6);
      return { area, shape, frame, outside, view: { lat: frame.centre.lat, lng: frame.centre.lng, altitude } };
    };

    const untilRendered = async (reached: () => boolean, failure: string, withinMs = 3000) => {
      const giveUpAt = Date.now() + withinMs;
      while (!reached()) {
        if (Date.now() > giveUpAt) throw new Error(failure);
        await nextFrame();
        if (typeof window.requestAnimationFrame !== 'function') await waitMs(16);
      }
    };

    /*
     * Until a feed has finished loading, not when its first note arrives: notes come
     * one by one, and a front page counting the first would say "1 item" of a day
     * with fourteen. Throws when it could not be read.
     */
    const untilFeedRead = async (feedName: 'War & Conflict' | 'Scene events' | 'Relief', timeoutMs: number, what: 'brief' | 'theatre' | 'tonight' | 'week') => {
      const giveUpAt = Date.now() + timeoutMs;
      for (;;) {
        const feed = feedsRef.current.find((f) => f.shortName === feedName);
        if (feed && !feed.loading) {
          if (feed.error) throw new Error(`${feedName} could not be read (${feed.error}), so there is no ${what} to draw.`);
          return;
        }
        if (Date.now() > giveUpAt) throw new Error(`${feedName} had not loaded after ${timeoutMs} ms, so there is no ${what} to draw.`);
        await nextFrame();
        await waitMs(100);
      }
    };

    /** A card as it crosses the automation boundary. */
    const forHandle = (card: Awaited<ReturnType<typeof composeRef.current>>): ShareHandleResult => ({
      dataUrl: card.dataUrl,
      width: card.width,
      height: card.height,
      mimeType: card.mimeType,
      provenance: card.provenance,
      sourceRect: card.sourceRect,
      // `frame` carries a second full-size data URL. Dropping it here keeps
      // the value that crosses the automation boundary to one image.
      frame: { width: card.frame.width, height: card.frame.height },
      ...(card.alt !== undefined ? { alt: card.alt } : {}),
      warnings: card.warnings ?? [],
      regions: card.regions,
    });

    /*
     * The handle's own operations, as a shot is staged through them (shotStage.ts):
     * one order, and the shot that comes back states the page as it was drawn.
     */
    const shotDeps: ShotStageDeps<ShareHandleResult> = {
      layers: () => controlsRef.current.listLayers().map((l) => l.id),
      listLayers: () => controlsRef.current.listLayers(),
      setLayer: (id, options) => controlsRef.current.setLayer(id as GlobeLayerId, options),
      pinLayers: (ids) => controlsRef.current.pinLayers(ids as GlobeLayerId[]),
      setTimeWindow: (chosen) => handle.setTimeWindow(chosen),
      // A shot's moment pauses the shared timeline there, as a person would (IM20).
      setTimeMoment: async (atS) => {
        const timeline = temporalRef.current;
        if (!timeline) throw new Error('This page has no timeline to pause at a moment.');
        timeline.setCurrentTime(atS * 1000);
        await untilRendered(
          () => temporalRef.current?.isLive === false && temporalRef.current?.currentTime === atS * 1000,
          `The timeline did not pause at ${atS}: it had not moved after ${TIMELINE_WAIT_MS / 1000} s.`,
          TIMELINE_WAIT_MS,
        );
      },
      getTimeWindow: () => handle.getTimeWindow(),
      getAppearance: () => getGlobeAppearance(),
      setAppearance: (patch) => setGlobeAppearance(patch),
      setCardTerritories: (style) => setCardTerritoryStyle(style),
      cardTerritories: () => cardTerritoryStyle(),
      setCardCountryNames: (asks) => setCardCountryNames(asks),
      untilCountryNames: (timeoutMs) => untilCountryNames(timeoutMs),
      setCardMarkStyle: (style) => setCardMarkStyle(style),
      setCardPsiLooks: (looks) => setCardPsiFieldLooks(looks),
      untilMarkStyleDrawn: (timeoutMs) => untilMarkStyleDrawn(timeoutMs),
      whenReady: (options) => waitUntilReady(options),
      frameReports: (ids, options) => handle.frameReports(ids, options),
      setView: (view) => moveCamera(view),
      focusReport: (id) => handle.focusReport(id),
      untilFeatured: (id) => untilRendered(
        () => (id === null ? featuredRef.current === null : featuredRef.current?.id === id),
        id === null ? 'The featured item was cleared and the globe still featured it after 3 s.'
          : `"${id}" was chosen to feature and the globe had not featured it after 3 s.`,
      ),
      reportOf: (id) => shareReportsRef.current.find((report) => report.id === id) ?? null,
      closeUpRefusal: (id) => closeUpRefusalOf(id),
      // The brief once War & Conflict has finished loading (untilFeedRead).
      untilBrief: async (day, timeoutMs) => {
        const named = day === 'latest' ? undefined : day;
        await untilFeedRead('War & Conflict', timeoutMs, 'brief');
        const brief = briefOfRef.current?.(named) ?? null;
        if (!brief) {
          throw new Error(named
            ? `No War & Conflict items were read for ${named} (UTC).`
            : 'No War & Conflict items have been read, so there is no brief to draw.');
        }
        // Centred on the day's items that are drawn, or on the newest when they have no one centre.
        const drawn = new Map(shareReportsRef.current.map((report) => [report.id, report]));
        const placed = brief.ids.flatMap((id) => drawn.get(id) ?? []);
        const centre = centreOf(placed.map((report) => ({ latitude: report.lat, longitude: report.lng })))
          ?? (placed[0] ? { lat: placed[0].lat, lng: placed[0].lng } : null);
        return { ...brief, centre: centre ? { lat: centre.lat, lng: centre.lng } : null };
      },
      untilTheatre: async (slug, preset, timeoutMs) => {
        await untilFeedRead('War & Conflict', timeoutMs, 'theatre');
        const lens = theatresRef.current;
        const facts = lens?.facts(slug) ?? null;
        if (!facts) {
          const read = lens?.slugs() ?? [];
          throw new Error(`No theatre "${slug}" in what War & Conflict has read${read.length ? `; it has read ${read.join(', ')}` : ''}.`);
        }
        if (!(preset in CARD_PRESETS)) {
          throw new Error(`Unknown preset "${preset}". The contract lists ${Object.keys(CARD_PRESETS).join(', ')}.`);
        }
        const view = fitViewFor(preset);
        if (!view) throw new Error('The globe has not finished initialising — the camera cannot be moved yet.');
        // Over its countries, built round the smallest; on its items when none fits (TL14).
        const frame = frameForTheatre(facts.countries.map((country) => country.region), facts.reports, view);
        if (!frame) throw new Error(`${facts.name} has no country drawn here and no item standing, so a card about it has nowhere to look.`);
        // Aimed a hair above the floor, as frameReports is.
        const altitude = Math.max(frame.altitude, SHARE_ALTITUDE_FLOOR + 1e-6);
        return {
          slug,
          view: { lat: frame.centre.lat, lng: frame.centre.lng, altitude },
          card: theatreCardFacts({ slug, name: facts.name, reports: facts.reports, war: facts.war, position: frame.position }),
        };
      },
      setLens: (slugs) => theatresRef.current?.lens(slugs),
      /*
       * The person's timeline as they had it (RN10): live, or paused at a moment with
       * the window around it. Put back the way they could have set it: a dragged window
       * ends at its moment; any other pause sits in the step around its moment.
       */
      holdTimeline: () => {
        const timeline = temporalRef.current;
        const was = timeline && !timeline.isLive
          ? { at: timeline.currentTime, window: timeline.timeWindow && { start: timeline.timeWindow.start.getTime(), end: timeline.timeWindow.end.getTime() } }
          : null;
        return async () => {
          const now = temporalRef.current;
          if (!now) return;
          if (was === null) {
            now.setIsLive(true);
            await untilRendered(() => temporalRef.current?.isLive === true, `The timeline did not return to live: it had not moved after ${TIMELINE_WAIT_MS / 1000} s.`, TIMELINE_WAIT_MS);
            return;
          }
          if (was.window && was.window.end === was.at) now.setTimeWindow(was.window.start, was.window.end);
          else now.setCurrentTime(was.at);
          await untilRendered(
            () => temporalRef.current?.isLive === false && temporalRef.current?.currentTime === was.at,
            `The timeline did not return to ${new Date(was.at).toISOString()}: it had not moved after ${TIMELINE_WAIT_MS / 1000} s.`,
            TIMELINE_WAIT_MS,
          );
        };
      },
      // Tonight's hours shown from their start: the moment the card is of, as the shot states it.
      showTonight: async ({ from, until }) => {
        const timeline = temporalRef.current;
        if (!timeline) throw new Error('This page has no timeline to show tonight on.');
        timeline.setTimeWindow(from * 1000, until * 1000, from * 1000);
        await untilRendered(() => {
          const now = temporalRef.current;
          const shown = windowSeconds();
          return now?.isLive === false && now.currentTime === from * 1000 && shown?.from === from && shown.until === until;
        }, `Tonight's hours did not take: the timeline had not changed after ${TIMELINE_WAIT_MS / 1000} s.`, TIMELINE_WAIT_MS);
      },
      // Tonight from the moment the timeline is paused at, or now, once Scene events are read whole (RN3).
      untilTonight: async (timeoutMs) => {
        await untilFeedRead('Scene events', timeoutMs, 'tonight');
        const read = tonightOfRef.current;
        if (!read) throw new Error('This page has no Raver Watch to read tonight from.');
        return tonightCard(read(Math.floor((pausedAt() ?? Date.now()) / 1000)));
      },
      // Hero Watch's week as drawn, once its records are read whole: Relief's feed, one read for all of Hero Watch (HW10).
      untilWeek: async (timeoutMs) => {
        await untilFeedRead('Relief', timeoutMs, 'week');
        const read = weekOfRef.current;
        if (!read) throw new Error('This page has no Hero Watch to read the week from.');
        return weekCard(read());
      },
      /*
       * A Psi Watch sky event or window (D-PW, PW62), from the kit's notes until the key change brings live ones:
       * opened, so the panel shows it and Planet lines draw its bodies, as a person's pick would.
       */
      untilPsiEvent: async (address, at) => {
        if (!psiKitOn()) throw new Error('Psi Watch is hidden in this page: ?psi=off hid it, and ?psi=kit shows it again.');
        const [kit, shapes] = await Promise.all([loadPsiNotes(), loadAreaShapes()]);
        const staged = psiCard(kit.map((f) => f.event), address, at, (id) => {
          const outline = shapes?.get(id);
          if (!outline) return null;
          const [west, south, east, north] = boundsOf(outline.geometry);
          return { lat: (south + north) / 2, lng: (west + east) / 2 };
        });
        if ('refused' in staged) throw new Error(staged.refused);
        psiOpenedRef.current = address;
        if (staged.sky) {
          const { sky } = staged;
          setPsiOpened(sky.address);
          setPsiLinesEvent({
            address: sky.address, title: sky.title,
            bodies: sky.bodies.filter((body): body is AstroBody => (ASTRO_BODIES as readonly string[]).includes(body)),
            from: sky.window.from, until: sky.window.until, exact: sky.exact,
          });
        }
        return { page: staged.page, primary: staged.primary, view: staged.view };
      },
      /*
       * The Timestream strip under a card's picture (D-PW, PW62, PW77): the kit's windows (the live notes from the
       * key change) and Kp as the lane reads it, in the Galactic Centre frame (PW5), with the drawer closed or open.
       */
      stripFor: async ({ ask, atS, lit, bodies }) => {
        if (!psiKitOn()) throw new Error('card.strip draws the Timestream, which shows with Psi Watch on: ?psi=off hid it in this page, and ?psi=kit shows it again.');
        const [kit, kp] = await Promise.all([loadPsiNotes(), loadKpRecord()]);
        const span = ask === true ? {} : ask;
        try {
          return stripModel({
            atMs: atS * 1000,
            ...(span.from !== undefined ? { fromMs: span.from * 1000 } : {}),
            ...(span.until !== undefined ? { untilMs: span.until * 1000 } : {}),
            ...(span.lanes ? { lanes: span.lanes } : {}),
            items: psiLaneItems(kit),
            lit,
            kp,
            bodies: bodies.filter((b): b is LaneBody => (LANE_BODIES as readonly string[]).includes(b)),
            frame: DEFAULT_FRAME,
          });
        } catch (e) {
          throw new Error(`card.strip: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      // The PsiOps Briefing (PW77): the week from the moment, from the kit's notes and Kp, its first sky event opened.
      untilPsiBriefing: async (atS) => {
        if (!psiKitOn()) throw new Error('Psi Watch is hidden in this page: ?psi=off hid it, and ?psi=kit shows it again.');
        const [kit, kp, shapes] = await Promise.all([loadPsiNotes(), loadKpRecord(), loadAreaShapes()]);
        const staged = psiBriefing(kit.map((f) => f.event), kp, atS, (id) => {
          const outline = shapes?.get(id);
          if (!outline) return null;
          const [west, south, east, north] = boundsOf(outline.geometry);
          return { lat: (south + north) / 2, lng: (west + east) / 2 };
        });
        if (staged.sky) {
          const { sky } = staged;
          setPsiOpened(sky.address);
          setPsiLinesEvent({
            address: sky.address, title: sky.title,
            bodies: sky.bodies.filter((body): body is AstroBody => (ASTRO_BODIES as readonly string[]).includes(body)),
            from: sky.window.from, until: sky.window.until, exact: sky.exact,
          });
        }
        return { page: staged.page, view: staged.view, bodies: staged.sky?.bodies ?? [] };
      },
      // The declassified desk's day, its releases read from The Record when asked (plan H9).
      untilDeclassified: async (day) => {
        const read = declassDay(await readDeclassified(), day);
        if (!read) {
          throw new Error(day === 'latest'
            ? `The Record holds no declassified release from the last ${DECLASS_DAYS} days, or did not answer in time.`
            : `The Record holds no declassified release for ${day} in the last ${DECLASS_DAYS} days, or did not answer in time.`);
        }
        return declassifiedCard(read);
      },
      untilLensLit: (slugs) => untilRendered(
        () => sameTheatres(theatresRef.current?.lit() ?? [], slugs),
        slugs.length === 0 ? 'The theatre lens was cleared and the globe still lit a theatre after 3 s.'
          : `${slugs.map((slug) => `"${slug}"`).join(', ')} ${slugs.length === 1 ? 'was' : 'were'} chosen for the lens and the globe had not lit ${slugs.length === 1 ? 'it' : 'them'} after 3 s.`,
      ),
      untilArea: async (code, preset) => {
        const { area, shape, frame, outside, view } = await areaFrameFor(code, preset);
        // What stands in it now (BA21), as listReports({ area }) would say.
        const inArea = reportsInArea(shareReportsRef.current, shape);
        return { code: area.code, name: area.name, view, card: areaCardFacts({ area, reports: inArea, outside, position: frame.position }) };
      },
      lightArea: (code) => setLitArea(code),
      untilLit: (code) => untilRendered(
        () => litAreaDrawn() === code,
        code === null ? 'The lit area was cleared and the globe still lit it after 3 s.'
          : `"${code}" was lit and the globe had not drawn it after 3 s.`,
      ),
      compose: async (options) => forHandle(await composeRef.current(options)),
      describeView: (options) => handle.describeView(options),
      nextFrame: async () => { await nextFrame(); await waitMs(150); },
      now: () => Date.now(),
    };

    /** One request of a batch, as a shot: a card, or why there is none. Never throws. */
    const renderOne = async (request: unknown, timeoutMs: number): Promise<ShareBatchResult> => {
      const shot = shotOfRequest(request);
      if ('refused' in shot) return { ok: false, reason: shot.refused };
      const result = await renderShotWith(shot.shot, shotDeps, { timeoutMs });
      return {
        ok: result.ok,
        ...(result.card ? { card: result.card } : {}),
        ...(result.shot ? { shot: result.shot } : {}),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.notes.length ? { note: result.notes.join(' '), notes: result.notes } : {}),
        ...(result.timing ? { timing: result.timing } : {}),
      };
    };

    /*
     * The playlist a clip is touring, set only by recordTour for its recordClip: its captions are
     * drawn into each frame and kept in the clip's record. Never a caller's to pass, so no clip
     * carries captions its own tour did not plan.
     */
    let touring: { plan: TourClipPlan; tour: ClipTour } | null = null;
    /**
     * The story a clip is showing, set only by recordStory (and the Story panel's mp4) for its recordClip (D-ST, ST8):
     * its captions drawn into each frame, each step's layers, choices and window set as the footage reaches it, its
     * frame limit a minute's, and, for the panel, each frame streamed to its encoder rather than kept.
     */
    let storying: { plan: StoryClipPlan; story: Story; clip: ClipStory; shown: number; stream: ((frame: CaptureResult, index: number) => Promise<void>) | null } | null = null;

    /**
     * A story recorded as one clip (D-ST, ST3, ST7, ST8): planned to a minute at most, the first step's world set
     * before the warm-up so its data is read before frame 0, each later step's set as the footage reaches it; for the
     * Story panel, each frame streamed to its encoder. However it ends, the view before is put back and every
     * layer's choices given back.
     */
    const recordStoryWith = async (
      options: { story?: unknown; fps?: number; quality?: number; settleMs?: number; endCard?: EndCardMode } | undefined,
      stream: ((frame: CaptureResult, index: number) => Promise<void>) | null,
    ): Promise<ShareClipResult> => {
      const story = storyFrom(options?.story);
      if (!story || !story.steps.length) {
        throw new ClipRecordingError('story is a story as its link carries it, { id, title, steps: [{ view, layer, pins, choices, window, caption, holdS }] }, with a step at least.');
      }
      const fps = options?.fps ?? DEFAULT_FPS;
      if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new ClipRecordingError(`fps must be in (0, 60], got ${fps}.`);
      const words = messagesNow().story;
      let plan: StoryClipPlan;
      try {
        plan = planStoryClip(story, words, { fps, maxFrames: STORY_MAX_FRAMES });
      } catch (e) {
        throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
      }
      let before: ReturnType<typeof captureStep> | null = null;
      try { before = captureStep(handle); } catch { /* nothing drawn to put back */ }
      try {
        await applyStep(handle, story.steps[0], { transitionMs: 0 });
        storying = {
          plan, story, shown: 0, stream,
          clip: {
            title: story.title || words.untitled, shown: plan.shown, total: plan.total, partial: plan.partial,
            steps: plan.spans.map((span) => {
              const step = story.steps[span.index];
              return { index: span.index, fromMs: span.fromMs, toMs: span.toMs, layer: step.layer, pins: [...step.pins], window: step.window, caption: step.caption };
            }),
          },
        };
        return await handle.recordClip({
          keyframes: plan.keyframes, fps,
          ...(options?.quality !== undefined ? { quality: options.quality } : {}),
          ...(options?.settleMs !== undefined ? { settleMs: options.settleMs } : {}),
          ...(options?.endCard !== undefined ? { endCard: options.endCard } : {}),
        });
      } finally {
        storying = null;
        releaseChoices(handle, story.steps);
        if (before) await applyStep(handle, before, { transitionMs: 0, ready: false }).catch(() => undefined);
      }
    };

    const handle: ShareHandle = {
      version: SHARE_HANDLE_VERSION,
      compose: async (options) => forHandle(await composeRef.current(options)),
      captureFrame: (options) => {
        const target = resolveTarget(globeRef);
        if (!target) {
          throw new Error('The globe has not finished initialising — nothing to capture yet.');
        }
        // The raw frame: the globe alone. Drawing over a frame is a tour clip's own (BP15); a run of frames, a clip's.
        const { overlay: _overlay, session: _session, ...raw } = options ?? {};
        // Held still at the paused moment when paused, as the contract has it (v19) and compose does: it was held at
        // now, and the planets jumped to today's places for the frame (found 25 Oct).
        const temporal = temporalRef.current;
        const stillAt = raw.stillAt ?? (temporal && !temporal.isLive ? temporal.currentTime : undefined);
        return captureGlobeFrame(target, { ...raw, ...(stillAt !== undefined ? { stillAt } : {}) });
      },
      getView: () => readView(globeRef),
      setView: (pov, options) => moveCamera(pov, options),
      recordClip: async (options) => {
        onViewChosenRef.current?.();
        const target = resolveTarget(globeRef);
        const globe = globeRef.current;
        if (!target || !globe) {
          throw new Error('The globe has not finished initialising — there is nothing to record yet.');
        }
        const track = buildCameraTrack(options.keyframes);

        /*
         * A replay's span (BA2): what the caller named, else the timeline's
         * window, else the reports' own first and last times. Refused rather than
         * guessed when it has nothing to sweep — a sweep over one moment would say
         * nothing and caption itself as a replay.
         */
        // One time track per clip, refused before either is planned (D-W, step 5c).
        if (options.sweep !== undefined && options.replay) {
          throw new ClipRecordingError(
            'A clip takes a replay or a sweep, not both: a replay reveals reports by their own times '
            + 'while a sweep moves the moment every layer draws, and the two would disagree about the moment shown.',
          );
        }
        let replay: ReplayPlan | null = null;
        let replayDecayS: DecaySeconds = DEFAULT_DECAY_S;
        if (options.replay) {
          const pace = options.replay.pace ?? 'even';
          if (!REPLAY_PACES.includes(pace)) {
            throw new ClipRecordingError(`replay.pace must be one of ${REPLAY_PACES.join(', ')}, got ${String(pace)}.`);
          }
          const decayS = options.replay.decayS ?? DEFAULT_DECAY_S;
          if (!(DECAY_CHOICES_S as readonly unknown[]).includes(decayS)) {
            throw new ClipRecordingError(`replay.decayS is one of ${DECAY_CHOICES_S.join(', ')}: the seconds of the clip each quake fades over, got ${String(decayS)}.`);
          }
          replayDecayS = decayS as DecaySeconds;
          try {
            replay = planReplay({
              times: shareReportsRef.current.map((r) => (r.time ? Date.parse(r.time.iso) : null)),
              pace,
              named: { from: options.replay.from, until: options.replay.until },
              window: windowSeconds(),
              quakes: quakeTimesRef.current,
            });
          } catch (e) {
            throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
          }
        }
        /*
         * A sweep moves the shared moment across its span over the footage
         * (decision D-W, step 5c). At most a day: a clip's forecast hours load
         * as at most eight of the model's steps (D-W's data rule 7). Never with
         * a replay, which reveals reports by their own times: the two would
         * disagree about the moment shown.
         */
        let sweep: { fromMs: number; untilMs: number; stepMs: number | null; forecasts: boolean } | null = null;
        if (options.sweep !== undefined) {
          const { from, until, step } = (options.sweep ?? {}) as { from?: unknown; until?: unknown; step?: unknown };
          if (typeof from !== 'number' || typeof until !== 'number'
            || !Number.isSafeInteger(from) || !Number.isSafeInteger(until) || from < 0 || from >= until) {
            throw new ClipRecordingError('sweep takes { from, until, step? } in whole unix seconds, from before until.');
          }
          // A day while Earth Weather or Space Weather draws, whose moments load as a model's steps; else 400 days (PW62).
          const forecasts = layers.some((l) => l.isActive && FORECAST_LAYERS.has(l.id));
          if (forecasts && until - from > SWEEP_MAX_S) {
            throw new ClipRecordingError(
              `A sweep spans at most 24 hours while Earth Weather or Space Weather is drawn; this one spans ${((until - from) / 3600).toFixed(1)}. `
              + 'They load a clip\'s forecast hours as at most eight of the model\'s steps: record a day or less per clip, or sweep without them.',
            );
          }
          if (until - from > LONG_SWEEP_MAX_S) {
            throw new ClipRecordingError(`A sweep spans at most 400 days; this one spans ${Math.round((until - from) / 86_400)}.`);
          }
          // A stepped sweep (the kit's question 3): the moment jumps by its step and holds between.
          if (step !== undefined && (typeof step !== 'number' || !Number.isSafeInteger(step) || step < SWEEP_STEP_MIN_S || step > until - from)) {
            throw new ClipRecordingError('sweep.step is whole seconds, a minute at least and no more than the span: the moment jumps by it and holds between.');
          }
          if (!temporalRef.current) throw new ClipRecordingError('This page has no timeline for a sweep to move.');
          sweep = { fromMs: from * 1000, untilMs: until * 1000, stepMs: typeof step === 'number' ? step * 1000 : null, forecasts };
        }
        const timeline = temporalRef.current;
        const before = sweep && timeline
          ? { live: timeline.isLive, at: timeline.currentTime, window: timeline.timeWindow }
          : null;
        /** The moment shown once every layer following the timeline has drawn it, or a refusal saying it was not. */
        const showMoment = async (ms: number, limitMs: number) => {
          timeline!.setCurrentTime(ms);
          const giveUpAt = Date.now() + limitMs;
          while (!(allDrawnFor(ms) && heatMapReadiness().ready && windFlowReadiness().ready
            && rainReadiness().ready && realCloudsReadiness().ready && enlilReadiness().ready && cmesReadiness().ready
            && boundaryMomentReadiness().ready)) {
            if (Date.now() > giveUpAt) {
              throw new ClipRecordingError(
                `The weather, ENLIL, the CMEs or the magnetopause for ${formatUtcDateTime(ms, { year: true })} were not drawn after ${Math.round(limitMs / 1000)} s: `
                + 'a frame then would show another moment.',
              );
            }
            await nextFrame();
            if (typeof window.requestAnimationFrame !== 'function') await waitMs(16);
          }
        };
        /** Back to the moment the sweep found: live, a dragged range, or a paused moment. */
        const restoreMoment = () => {
          if (!before || !timeline) return;
          if (before.live) timeline.setIsLive(true);
          else if (before.window && before.window.end.getTime() === before.at) timeline.setTimeWindow(before.window.start.getTime(), before.window.end.getTime());
          else timeline.setCurrentTime(before.at);
        };
        let shownMoment: number | null = null;
        const pov = globe as unknown as Parameters<typeof setGlobePointOfView>[0];
        const quality = options.quality ?? 0.9;
        // A playlist's captions, drawn into each frame at its moment (BP15, BP19), when recordTour is recording one.
        const tourClip = touring;
        // A story's captions and steps (D-ST, ST8), when recordStory is recording one.
        const storyClip = storying;
        if (storyClip && (tourClip || replay || sweep)) {
          throw new ClipRecordingError('A story drives the layers and the time itself: it is recorded alone, with no tour, replay or sweep.');
        }
        // Two layers side by side through the clip (D-CM, CM3): each frame names its halves, as a card does.
        const clipComparison = currentComparison();
        const labelOfLayer = (id: string) => catalogue.find((l) => l.id === id)?.label ?? id;
        const captionSurface = tourClip || storyClip || clipComparison ? document.createElement('canvas') : null;
        // Each caption laid out once, every one on the first frame: one that cannot hold a field mission's
        // safety limits whole in this frame refuses the clip there, not minutes in (HW13).
        const captionLayouts = new Map<TourCaption, ReturnType<typeof layoutTourCaption>>();
        const captionLayout = (caption: TourCaption, width: number, height: number, measure: ReturnType<typeof canvasMeasurer>) => {
          let laid = captionLayouts.get(caption);
          if (!laid) {
            try {
              laid = layoutTourCaption({ width, height, caption, measure });
            } catch (e) {
              throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
            }
            captionLayouts.set(caption, laid);
          }
          return laid;
        };
        // Country names, as a card's shot asks for them (K5, TS10): refused before anything moves when they cannot be drawn.
        if (options.countryNames !== undefined && typeof options.countryNames !== 'boolean') {
          throw new ClipRecordingError("countryNames is true or false: Natural Earth's country names, by their rank and the picture's zoom, never over a mark.");
        }
        const names = options.countryNames === true;
        // One mark style for every layer, as a card's shot asks (plan H4): refused before anything moves when it is none.
        if (options.markStyle !== undefined && !MARKER_STYLE_VALUES.includes(options.markStyle)) {
          throw new ClipRecordingError(`markStyle is one of ${MARKER_STYLE_VALUES.join(', ')}, got ${String(options.markStyle)}.`);
        }
        const markStyle = options.markStyle ?? null;
        if (names) {
          try {
            await untilCountryNames(CLIP_NAMES_WAIT_MS, 100, 'clip');
          } catch (e) {
            throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
          }
        }

        let clip: Awaited<ReturnType<typeof recordGlobeClip>>;
        /*
         * The footage's frames read as one run (captureSession): the buffer sized at the first frame and put back once
         * they are read, and the live loop's own draws held between them, so each frame is one draw. Ended however
         * the clip ends.
         */
        // Optional call: a globe without globe.gl's composer has no loop draws to hold.
        const footage = captureSession({ holdLive: () => holdLiveDraws(globe.postProcessingComposer?.()) });
        // The globe's look held for the whole clip: the 8K maps, say, never land between two frames (K7).
        const releaseLook = holdForCapture();
        // The frames draw names while the clip holds the look, at its rate, and none once it ends.
        if (names) setClipCountryNames(options.fps ?? DEFAULT_FPS);
        try {
        if (markStyle) {
          setCardMarkStyle(markStyle);
          try {
            await untilMarkStyleDrawn(CLIP_MARK_STYLE_WAIT_MS);
          } catch (e) {
            throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
          }
        }
        /*
         * Every shown layer drawn, its reports read and on the globe, before the camera moves (H3): Mecha Jono's
         * videos opened on a turning planet with the reports arriving near the end of the turn.
         */
        // The quakes drawn from the replay's moment, at the data's time a second of the clip reveals (EQ21).
        if (replay && replay.quakes > 0) {
          const revealS = (REVEAL_SHARE * track.durationMs) / 1000;
          setClipQuakeReplay({ decayS: replayDecayS, msPerSecond: revealS > 0 ? (replay.span.untilMs - replay.span.fromMs) / revealS : 0 });
          setReplayMoment(replayMomentAt(0, replay.times, replay.pace, replay.basis === 'reports' ? undefined : replay.span));
        }
        const ready = await waitUntilReady({ timeoutMs: CLIP_READY_WAIT_MS });
        if (!ready.ready) {
          throw new ClipRecordingError(`${ready.reason}. The clip was not recorded: its camera would have moved over a globe still drawing.`);
        }
        if (sweep) {
          // Every model step the sweep crosses, loaded before the first frame: only forecast layers have steps to load.
          if (sweep.forecasts) for (let t = sweep.fromMs; t < sweep.untilMs; t += SWEEP_WARM_STEP_MS) await showMoment(t, SWEEP_WARM_WAIT_MS);
          await showMoment(sweep.untilMs, SWEEP_WARM_WAIT_MS);
          await showMoment(sweep.fromMs, SWEEP_FRAME_WAIT_MS);
        }
        clip = await recordGlobeClip(track, {
          applyPose: async (pose, settleMs) => {
            // Same rule as setView: through telemetry, so LOD tracks the camera.
            setGlobePointOfView(pov, pose, 0);
            await nextFrame();
            if (settleMs) await waitMs(settleMs);
          },
          // Render-then-read, and its blank-frame refusal, on every frame; and its names as the clip asked.
          captureFrame: (tMs) => {
            // A tour's held item, pinged at its moment of the footage (C34).
            if (tourClip) setTourMarker(markerAt(tourClip.plan, tMs));
            const frame = captureGlobeFrame(target, {
              mimeType: 'image/jpeg',
              quality,
              session: footage,
              ...(captionSurface ? {
                overlay: {
                  surface: captionSurface,
                  draw: (ctx, width, height) => {
                    const c = ctx as unknown as CanvasRenderingContext2D;
                    if (clipComparison) {
                      drawCompareHalves(c, { x: 0, y: 0, width, height }, 0.5, clipComparison.labels?.left ?? labelOfLayer(clipComparison.left), clipComparison.labels?.right ?? labelOfLayer(clipComparison.right), {
                        fontFamily: FONTS.text, px: Math.max(13, Math.round(height / 40)),
                      });
                    }
                    if (storyClip) {
                      const caption = spanAt(storyClip.plan, tMs).caption;
                      if (caption.title.trim()) drawTourCaption(c, captionLayout(caption, width, height, canvasMeasurer(c)));
                      return;
                    }
                    if (!tourClip) return;
                    const measure = canvasMeasurer(c);
                    if (!captionLayouts.size) {
                      for (const caption of [tourClip.plan.opening.caption, ...tourClip.plan.stops.map((stop) => stop.caption)]) captionLayout(caption, width, height, measure);
                    }
                    drawTourCaption(c, captionLayout(captionAt(tourClip.plan, tMs), width, height, measure));
                  },
                },
              } : {}),
            });
            const missed = countryNamesMissedCard('clip');
            if (missed) throw new ClipRecordingError(missed);
            return frame;
          },
          sample: (at) => {
            const world = worldRef.current;
            const view = readView(globeRef);
            return {
              at,
              camera: { lat: view.lat, lon: view.lng, altitude: view.altitude },
              layers: world.layers,
              feeds: world.feeds,
              marks: world.marks,
              build: getBuildIdentity(),
              // Who made the images drawn now, as a still's card names them (clip schema 6; TX10).
              imagery: imageryShown(imageryDrawn().map((id) => IMAGERY[id].source)),
              // Read at sample time: a clip whose subject changes is refused.
              featured: featuredRef.current
                ? { id: featuredRef.current.id, title: featuredRef.current.title, lines: featuredRef.current.lines }
                : null,
              // The moment this frame shows, when the clip sweeps it (clip schema 5).
              ...(sweep && shownMoment !== null ? { moment: new Date(shownMoment) } : {}),
            };
          },
          now: () => performance.now(),
          wallClock: () => new Date(),
          renderEndCard: async (lastFrame, provenance, fps) => {
            // The footage is read: the live globe given back before the card is drawn from its last frame.
            footage.end();
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new ClipRecordingError('The final frame could not be decoded for the end card.'));
              img.src = lastFrame.dataUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = lastFrame.width;
            canvas.height = lastFrame.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new ClipRecordingError(
                'No 2D context for the end card. A clip is not returned without its caveats in it.',
              );
            }
            const layout = layoutEndCard({
              width: lastFrame.width,
              height: lastFrame.height,
              provenance,
              fps,
              measure: canvasMeasurer(ctx),
            });
            return layout.pages.map((page) => {
              drawEndCardPage(ctx, image, lastFrame.width, lastFrame.height, page.lines);
              return {
                frame: {
                  dataUrl: canvas.toDataURL('image/jpeg', quality),
                  width: lastFrame.width,
                  height: lastFrame.height,
                  mimeType: 'image/jpeg',
                },
                holdMs: page.holdMs,
              };
            });
          },
          ...(replay ? {
            applyTime: (tMs: number) => {
              const { times, pace, span, basis } = replay as ReplayPlan;
              // A span from the reports themselves bounds nothing: every report drawn is in it.
              setReplayMoment(replayMomentAt(track.durationMs > 0 ? tMs / track.durationMs : 1, times, pace, basis === 'reports' ? undefined : span));
            },
          } : {}),
          ...(sweep ? {
            // The frame's moment, from the span's start to its end as the footage runs; captured once drawn.
            applyTime: async (tMs: number) => {
              const { fromMs, untilMs, stepMs } = sweep as { fromMs: number; untilMs: number; stepMs: number | null };
              const along = (track.durationMs > 0 ? tMs / track.durationMs : 1) * (untilMs - fromMs);
              // Stepped: the last step reached, held until the next.
              shownMoment = Math.round(fromMs + (stepMs ? Math.min(Math.floor(along / stepMs) * stepMs, untilMs - fromMs) : along));
              await showMoment(shownMoment, SWEEP_FRAME_WAIT_MS);
            },
          } : {}),
          ...(storyClip ? {
            // Each step's world from the start of its span: layers, choices and window, the camera left to the track.
            applyTime: async (tMs: number) => {
              const span = spanAt(storyClip.plan, tMs);
              if (span.index === storyClip.shown) return;
              storyClip.shown = span.index;
              await applyStep(handle, storyClip.story.steps[span.index], { camera: false });
            },
          } : {}),
          ...(storyClip?.stream ? { onFrame: storyClip.stream } : {}),
        }, {
          fps: options.fps,
          settleMs: options.settleMs,
          endCard: options.endCard,
          ...(replay ? {
            replay: {
              fromIso: new Date(replay.span.fromMs).toISOString(),
              toIso: new Date(replay.span.untilMs).toISOString(),
              pace: replay.pace,
              untimed: replay.untimed,
              basis: replay.basis,
              outside: replay.outside,
              ...(replay.quakes > 0 ? { quakes: replay.quakes, quakeDecaySeconds: replayDecayS } : {}),
            },
          } : {}),
          ...(sweep ? {
            sweep: {
              fromIso: new Date(sweep.fromMs).toISOString(), toIso: new Date(sweep.untilMs).toISOString(),
              ...(sweep.stepMs ? { stepSeconds: sweep.stepMs / 1000 } : {}),
            },
          } : {}),
          ...(names ? { countryNames: true } : {}),
          ...(markStyle ? { markStyle } : {}),
          ...(clipComparison ? { compare: { left: clipComparison.left, right: clipComparison.right, ...(clipComparison.labels ? { labels: clipComparison.labels } : {}) } } : {}),
          ...(tourClip ? { tour: tourClip.tour } : {}),
          ...(storyClip ? { story: storyClip.clip, maxFrames: STORY_MAX_FRAMES, ...(storyClip.stream ? { keepFrames: false } : {}) } : {}),
        });
        } finally {
          // First, as a capture on its own puts the live view back straight after its frame, with the clip's look still on.
          footage.end();
          if (names) setClipCountryNames(null);
          // Each layer's own style back on screen, however the clip ends.
          if (markStyle) setCardMarkStyle(null);
          releaseLook();
          // However the clip ends, the globe goes back to showing everything, at the moment it was.
          setReplayMoment(null);
          setClipQuakeReplay(null);
          restoreMoment();
        }

        // A clip streamed to the Story panel's encoder keeps no frames: its size is the footage's.
        const first = clip.frames[0] ?? { mimeType: 'image/jpeg', width: 0, height: 0 };
        return {
          frames: clip.frames.map((f) => f.dataUrl),
          fps: clip.fps,
          mimeType: first.mimeType,
          width: first.width,
          height: first.height,
          provenance: clip.provenance,
          stats: clip.stats,
        };
      },
      recordTour: async (options) => {
        const id = (options ?? {} as { playlist?: unknown }).playlist;
        if (!PLAYLISTS.includes(id as PlaylistId)) {
          throw new ClipRecordingError(`playlist is one of ${PLAYLISTS.join(', ')}: the briefing tour's playlists.`);
        }
        const sources = toursRef.current;
        if (!sources) throw new ClipRecordingError('This page has no briefing tour to record.');
        const fps = options.fps ?? DEFAULT_FPS;
        if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new ClipRecordingError(`fps must be in (0, 60], got ${fps}.`);
        const playlist = id as PlaylistId;
        const view = readView(globeRef);
        // What the page shows before the tour, to know it shows it again after (BP20).
        const shown = () => {
          const layers = controlsRef.current.listLayers();
          const timeline = temporalRef.current;
          return JSON.stringify({
            primary: layers.find((l) => l.primary)?.id ?? null,
            pins: layers.filter((l) => l.pinned).map((l) => l.id).sort(),
            moment: !timeline || timeline.isLive ? 'live' : timeline.currentTime,
          });
        };
        const before = shown();
        const putBack = sources.show(playlist);
        let clip: ShareClipResult;
        try {
          // The layer's read, as the screen tour waits for it; then what arrived (BP21).
          const giveUpAt = Date.now() + (options.timeoutMs ?? TOUR_READ_WAIT_MS);
          let offer = sources.candidatesFor(playlist, Date.now());
          while (!offer?.complete && Date.now() < giveUpAt) {
            await waitMs(250);
            offer = toursRef.current?.candidatesFor(playlist, Date.now()) ?? null;
          }
          const planned = offer ? planPlaylist(playlist, offer.candidates, { partial: !offer.complete }) : null;
          if (!planned) throw new ClipRecordingError(`Nothing to tour on ${PLAYLIST_TITLES[playlist]}: its layer offers no items now.`);
          let plan: TourClipPlan;
          try {
            plan = planTourClip(planned, { fps, maxFrames: MAX_FRAMES });
          } catch (e) {
            throw new ClipRecordingError(e instanceof Error ? e.message : String(e));
          }
          const caption = (c: { progress: string; why: string; lines: readonly string[] }) => ({ progress: c.progress, why: c.why, lines: [...c.lines] });
          touring = {
            plan,
            tour: {
              playlist, title: plan.playlist.title, shown: plan.shown, total: plan.total, partial: plan.partial,
              opening: { why: plan.opening.caption.why, fromMs: plan.opening.fromMs, toMs: plan.opening.toMs },
              stops: plan.stops.map((stop) => ({ id: stop.id, title: stop.title, ...caption(stop.caption), fromMs: stop.fromMs, toMs: stop.toMs })),
            },
          };
          clip = await handle.recordClip({
            keyframes: plan.keyframes, fps,
            ...(options.quality !== undefined ? { quality: options.quality } : {}),
            ...(options.settleMs !== undefined ? { settleMs: options.settleMs } : {}),
            ...(options.endCard !== undefined ? { endCard: options.endCard } : {}),
            ...(options.markStyle !== undefined ? { markStyle: options.markStyle } : {}),
          });
        } finally {
          touring = null;
          setTourMarker(null);
          // However it ends, the layers, the moment and the camera as they were (BP20).
          putBack();
          if (globeRef.current) setGlobePointOfView(globeRef.current as unknown as Parameters<typeof setGlobePointOfView>[0], view, 0);
        }
        // Resolved once the page shows it again, so a caller's next shot never meets the tour's layers or moment.
        await untilRendered(
          () => shown() === before,
          `The clip was recorded, and the layers and moment the tour showed were not put back after ${TIMELINE_WAIT_MS / 1000} s.`,
          TIMELINE_WAIT_MS,
        );
        return clip;
      },
      recordStory: (options) => recordStoryWith(options, null),
      listLayers: () => controlsRef.current.listLayers(),
      setLayer: (layerId, options) => controlsRef.current.setLayer(layerId, options),
      pinLayers: (layerIds) => controlsRef.current.pinLayers(layerIds),
      setMarkerStyle: (layerId, style) => controlsRef.current.setMarkerStyle(layerId, style),

      // Copies, so a caller that edits what it was given cannot edit the next answer.
      listReports: ((options?: { counts?: boolean; area?: unknown }) => {
        const answer = (reports: ShareReportInfo[]) => {
          if (!options?.counts) return reports;
          const counts = reportCountsRef.current;
          if (!counts) return { reports, intelReports: null };
          const { cap } = effectiveReportCap(counts.setting);
          // Cut by the cap: all it allows drawn, and more matched. Fewer than the cap is the priority filter's doing.
          const truncated = cap !== null && counts.shown >= cap && counts.matching > counts.shown;
          return { reports, intelReports: { shown: counts.shown, matching: counts.matching, cap, truncated } };
        };
        const copies = () => shareReportsRef.current.map((r) => ({ ...r, time: r.time ? { ...r.time } : null }));
        if (options?.area === undefined) return answer(copies());
        // Those standing in an area (BA21), once its shape is fetched.
        const code = typeof options.area === 'string' ? areaCodeOf(options.area) : null;
        if (!code) return Promise.reject(new Error(`No area "${String(options.area)}". listAreas() gives every code.`));
        return loadAreaShapes().then((shapes) => {
          const shape = shapes?.get(code);
          if (!shape) throw new Error('The areas\' shapes could not be fetched. Ask again to try once more.');
          return answer(reportsInArea(copies(), shape));
        });
      }) as ShareHandle['listReports'],
      listGroups: () => groupsOfShareReports(shareReportsRef.current),
      listAreas: () => shareAreas(),
      getReportCap: () => capInForce(),
      getReportLook: () => lookInForce(),
      getLayerChoices: (layer) => layerChoicesInForce(String(layer)),
      setLayerChoices: (layer, choices) => {
        const id = String(layer);
        if (choices === null) {
          setPageLayerChoices(id, null);
          return layerChoicesInForce(id);
        }
        const read = readLayerChoices(id, choices);
        if ('refused' in read) throw new Error(read.refused);
        setPageLayerChoices(id, read.choices);
        return layerChoicesInForce(id);
      },
      setReportLook: (look) => {
        if (look === null) {
          setReportLookOverride(undefined);
        } else {
          const read = readReportLook(look);
          if ('refused' in read) throw new Error(read.refused);
          setReportLookOverride(read);
        }
        return lookInForce();
      },
      getWeather: () => weatherInForce(),
      getScale: () => ({ scale: solarScale(), from: solarScaleFrom() }),
      getSky: () => skyLook(),
      setSky: (look) => {
        if (!skyLook()) throw new Error('Sky from a place is not open: setScale("sky") opens it at the point under the view\'s centre (setView first to choose it).');
        const patch: Partial<Pick<SkyLook, 'az' | 'alt' | 'fov'>> = {};
        for (const key of ['az', 'alt', 'fov'] as const) {
          const value = look?.[key];
          if (value === undefined) continue;
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Sky's ${key} is a number of degrees.`);
          patch[key] = value;
        }
        setSkyLook(patch);
        return skyLook()!;
      },
      getCompare: () => ({ comparison: comparisonStated(currentComparison()), compareLayers: comparableLayers().sort() }),
      setCompare: (chosen) => {
        const pins = comparePins({ isLayerActive, pinLayer, unpinLayer });
        if (chosen === null) {
          endComparison(pins);
        } else if (chosen && typeof chosen === 'object' && 'layer' in chosen) {
          // One layer at two moments (D-CM, CM4; v79): so much earlier, or a window held beside the time bar's.
          const { layer, earlier, window: held, ahead } = chosen as { layer?: unknown; earlier?: unknown; window?: { from?: unknown; until?: unknown }; ahead?: unknown };
          if (!(COMPARE_MOMENT_LAYERS as readonly unknown[]).includes(layer)) {
            throw new Error(`Two moments of one layer are drawn for ${COMPARE_MOMENT_LAYERS.join(', ')} today, not ${String(layer)}.`);
          }
          if (!comparableLayers().includes(layer as string)) throw new Error(`${String(layer)} cannot be drawn side by side yet.`);
          // Earth Weather takes a forecast hour ahead (CM5); the quakes another window (CM4).
          if ((layer === 'EarthWeather') !== (ahead !== undefined)) {
            throw new Error(layer === 'EarthWeather'
              ? `EarthWeather takes ahead: one of ${COMPARE_AHEAD_HOURS.join(', ')} hours, its forecast in the right half.`
              : `${String(layer)} takes earlier or window; ahead is EarthWeather's.`);
          }
          if (ahead !== undefined) {
            if (!(COMPARE_AHEAD_HOURS as readonly unknown[]).includes(ahead)) {
              throw new Error(`ahead is one of ${COMPARE_AHEAD_HOURS.join(', ')} hours, the forecast steps.`);
            }
            beginComparison(momentComparison(layer as string, { ahead: ahead as number }), pins);
          } else if (earlier !== undefined) {
            if (!(EARLIER_CHOICES as readonly unknown[]).includes(earlier)) {
              throw new Error(`earlier is one of ${EARLIER_CHOICES.join(', ')}: the same window that much earlier, in the right half.`);
            }
            beginComparison(momentComparison(layer as string, { earlier: earlier as (typeof EARLIER_CHOICES)[number] }), pins);
          } else if (held !== undefined) {
            const { from, until } = (held ?? {}) as { from?: unknown; until?: unknown };
            if (typeof from !== 'number' || typeof until !== 'number' || !Number.isSafeInteger(from) || !Number.isSafeInteger(until)
              || from >= until || from < HISTORY_FLOOR_S) {
              throw new Error(`window is { from, until } in whole unix seconds, from before until, back to ${HISTORY_FLOOR_S} (2150 BC).`);
            }
            beginComparison(momentComparison(layer as string, { held: { from: from * 1000, until: until * 1000 } }), pins);
          } else {
            throw new Error('setCompare({ layer }) takes earlier or window: the other moment.');
          }
        } else {
          const { left, right } = (chosen ?? {}) as { left?: unknown; right?: unknown };
          const can = comparableLayers();
          if (typeof left !== 'string' || typeof right !== 'string' || left === right) {
            throw new Error('setCompare takes { left, right }: two layer ids, not the same, or null to end it.');
          }
          for (const id of [left, right]) {
            if (!can.includes(id)) throw new Error(`${id} cannot be drawn side by side yet: compareLayers names those that can (${can.sort().join(', ')}).`);
          }
          beginComparison({ left, right }, pins);
        }
        return { comparison: comparisonStated(currentComparison()), compareLayers: comparableLayers().sort() };
      },
      setScale: (scale) => {
        if (scale !== null && !isSolarScale(scale)) {
          throw new Error(`The scale is one of ${SOLAR_SCALES.map((s) => `"${s}"`).join(', ')}, or null for the person's.`);
        }
        setPageSolarScale(scale);
        return { scale: solarScale(), from: solarScaleFrom() };
      },
      whatsNew: async (since, options) => whatsNewSince(whatsNewWindow(since, options?.until, Date.now()), WHATS_NEW_FEEDS),
      setWeather: (look) => {
        if (look === null) {
          setWeatherLookOverride(undefined);
        } else {
          const read = readWeatherLook(look);
          if ('refused' in read) throw new Error(read.refused);
          // A part not named stays as it is: as the handle set it before, else the person's.
          setWeatherLookOverride({ ...getWeatherLookOverride(), ...read });
        }
        return weatherInForce();
      },
      setReportCap: (cap) => {
        if (cap === null) {
          setReportCapOverride(undefined);
        } else {
          const read = readReportCap(cap);
          if (isCapRefusal(read)) throw new Error(read.refused);
          setReportCapOverride(read === null ? 'unlimited' : read);
        }
        return capInForce();
      },

      getTimeWindow: () => {
        const chosen = windowSeconds();
        return chosen ? { ...chosen, live: false } : { from: null, until: null, live: true };
      },

      /*
       * The app's shared window, not a private one for the capture: what an agent
       * sets is what the timeline shows and what a person would see, so a card
       * and the screen never disagree about when they show (RW7).
       */
      setTimeWindow: async (chosen) => {
        const timeline = temporalRef.current;
        if (!timeline) throw new Error('This page has no timeline to set a window on.');
        const settled = async (reached: () => boolean) => {
          const giveUpAt = Date.now() + TIMELINE_WAIT_MS;
          while (!reached()) {
            if (Date.now() > giveUpAt) throw new Error(`The window did not take: the timeline had not changed after ${TIMELINE_WAIT_MS / 1000} s.`);
            await nextFrame();
            if (typeof window.requestAnimationFrame !== 'function') await waitMs(16);
          }
          // The marks are rebuilt in effects after the render that moved the window.
          await nextFrame();
          await nextFrame();
        };
        if (chosen === null) {
          timeline.setIsLive(true);
          await settled(() => windowSeconds() === null);
          return { from: null, until: null, live: true };
        }
        const { from, until } = (chosen ?? {}) as { from?: unknown; until?: unknown };
        // Back to the quakes' history, 2150 BC (D-EQ, EQ15): seconds before 1970 are negative.
        if (typeof from !== 'number' || typeof until !== 'number'
          || !Number.isSafeInteger(from) || !Number.isSafeInteger(until) || from < HISTORY_FLOOR_S || from >= until) {
          throw new Error('setTimeWindow takes { from, until } in whole unix seconds (negative before 1970, back to 2150 BC), from before until, or null to return to live.');
        }
        timeline.setTimeWindow(from * 1000, until * 1000);
        await settled(() => {
          const now = windowSeconds();
          return now !== null && now.from === from && now.until === until;
        });
        return { from, until, live: false };
      },

      frameReports: async (ids, options) => {
        if (!Array.isArray(ids) || ids.length === 0) {
          throw new Error('frameReports needs at least one report id. Call listReports() for what is drawn.');
        }
        const listed = new Map(shareReportsRef.current.map((r) => [r.id, r]));
        const unknown = ids.filter((id) => !listed.has(id));
        if (unknown.length > 0) {
          throw new Error(
            `Not on the globe now: ${unknown.join(', ')}. Call listReports() for what is drawn — `
            + 'an RLSH entity is never listed, framed or featured.',
          );
        }
        const preset = options?.preset ?? 'wide';
        if (!(preset in CARD_PRESETS)) {
          throw new Error(`Unknown preset "${preset}". The contract lists ${Object.keys(CARD_PRESETS).join(', ')}.`);
        }
        const view = fitViewFor(preset);
        if (!view) {
          throw new Error('The globe has not finished initialising — the camera cannot be moved yet.');
        }
        const framed = frameForReports(ids.map((id) => listed.get(id) as ShareReportInfo), view);
        if (!framed) {
          throw new Error(
            'These reports have no one side of the planet to look at: they are too far apart '
            + `to show in one card from ${SHARE_ALTITUDE_CEILING} globe radii or closer. Frame fewer at a time.`,
          );
        }
        /*
         * Aimed a hair above the floor: the globe stores altitude as a camera
         * distance and reads it back through floating point, and 1 came back as
         * 0.9999999999999998 — which a caller checking "never below one radius"
         * would rightly refuse.
         */
        const altitude = Math.max(framed.altitude, SHARE_ALTITUDE_FLOOR + 1e-6);
        return moveCamera({ ...framed, altitude }, { transitionMs: options?.transitionMs, settleMs: options?.settleMs });
      },

      frameArea: async (area, options) => {
        const { view, outside } = await areaFrameFor(area, options?.preset ?? 'wide');
        const moved = await moveCamera(view, { transitionMs: options?.transitionMs, settleMs: options?.settleMs });
        return { ...moved, outside };
      },

      planReportTour: (ids, options) => {
        if (!Array.isArray(ids) || ids.length === 0) {
          throw new Error('planReportTour needs at least one report id. Call listReports() for what is drawn.');
        }
        const listed = new Map(shareReportsRef.current.map((r) => [r.id, r]));
        const unknown = ids.filter((id) => !listed.has(id));
        if (unknown.length > 0) {
          throw new Error(`Not on the globe now: ${unknown.join(', ')}. Call listReports() for what is drawn.`);
        }
        const preset = options?.preset ?? 'wide';
        if (!(preset in CARD_PRESETS)) {
          throw new Error(`Unknown preset "${preset}". The contract lists ${Object.keys(CARD_PRESETS).join(', ')}.`);
        }
        const target = resolveTarget(globeRef);
        if (!target) {
          throw new Error('The globe has not finished initialising — a tour cannot be planned yet.');
        }
        const camera = target.camera() as { fov?: number };
        const canvas = target.renderer().domElement as { clientWidth?: number; clientHeight?: number; width: number; height: number };
        const frameAspect = (canvas.clientWidth && canvas.clientHeight)
          ? canvas.clientWidth / canvas.clientHeight
          : canvas.width / canvas.height;
        const plan = planReportTour(
          ids.map((id) => listed.get(id) as ShareReportInfo),
          { fovDeg: camera.fov ?? 50, frameAspect, cardAspect: CARD_PRESETS[preset].globeAspect },
          {
            ...(options?.maxStops !== undefined ? { maxStops: options.maxStops } : {}),
            ...(options?.holdMs !== undefined ? { holdMs: options.holdMs } : {}),
            ...(options?.travelMs !== undefined ? { travelMs: options.travelMs } : {}),
          },
        );
        if (!plan) {
          throw new Error(
            'These reports have no one side of the planet to look at, so no tour can open on all of them. '
            + 'Plan fewer at a time.',
          );
        }
        return plan;
      },

      /*
       * The crop is computed the way compose computes it — the same bounds, pad,
       * aspect and clamp — so "in the picture" means in the card, not merely on
       * the canvas.
       */
      describeView: (options) => {
        const preset = options?.preset ?? 'wide';
        if (!(preset in CARD_PRESETS)) {
          throw new Error(`Unknown preset "${preset}". The contract lists ${Object.keys(CARD_PRESETS).join(', ')}.`);
        }
        // As compose decides it: the view when an item is featured, the whole planet when not (IM9).
        const fit = options?.fit ?? (featuredRef.current ? 'view' : 'planet');
        if (!(CARD_FITS as readonly string[]).includes(fit)) {
          throw new Error(`Unknown fit "${fit}". The contract lists ${CARD_FITS.join(', ')}.`);
        }
        const target = resolveTarget(globeRef);
        if (!target) {
          throw new Error('The globe has not finished initialising — there is nothing to describe yet.');
        }
        const canvas = target.renderer().domElement as { width: number; height: number };
        const frame = { width: canvas.width, height: canvas.height };
        // The window compose renders for this preset and fit, so "in the picture" means in the card:
        // planned as compose plans it, a composed card's picture by what its text leaves (IM6).
        const { window } = planCardPicture(target, inputForRef.current({ preset, fit, ...(options?.qr ? { qr: true } : {}) }), undefined, { key: false });
        // At the card's lift, not the screen's: what a card of this view would show (shellLift.ts).
        const description = readAtLift(target.scene() as unknown as THREE.Scene, cardShellLift(), () => describeScene({
          scene: target.scene() as unknown as THREE.Object3D,
          camera: target.camera(),
          frame,
          crop: window,
          legends: legendsForCard(getLegends()),
          globeRadius: target.getGlobeRadius(),
        }));
        return { preset, fit, ...description };
      },

      focusReport: (id) => {
        if (id === null) {
          setFeaturedReportId(null);
          return { featured: null };
        }
        const info = shareReportsRef.current.find((r) => r.id === id);
        if (!info) {
          throw new Error(
            `"${id}" is not on the globe now. Call listReports() for what is drawn — `
            + 'an RLSH entity is never featured.',
          );
        }
        setFeaturedReportId(id);
        return { featured: { ...info, time: info.time ? { ...info.time } : null } };
      },

      whenReady: (options) => waitUntilReady(options),

      layersFor: (category) => layersFor(category, controlsRef.current.listLayers().filter((l) => l.implemented).map((l) => l.id)),
      planShot: (shot, options) => planShotWith(shot, shotDeps, options),
      renderShot: (shot, options) => renderShotWith(shot, shotDeps, options),
      composeFor: async (address, options) => {
        const card = {
          ...(options?.template !== undefined ? { template: options.template } : {}),
          ...(options?.preset !== undefined ? { preset: options.preset } : {}),
        };
        const result = await renderShotWith({
          subject: { address },
          ...(Object.keys(card).length ? { card } : {}),
          ...(options?.scale !== undefined ? { output: { scale: options.scale } } : {}),
        }, shotDeps, { timeoutMs: options?.timeoutMs });
        if (!result.ok || !result.card) throw new Error(result.reason ?? 'No card was made.');
        return result.card;
      },

      renderBatch: async (requests, options) => {
        if (!Array.isArray(requests)) {
          throw new Error('renderBatch takes a list of shots, or of requests: [{ address, preset?, layers?, window?, template? }].');
        }
        const timeoutMs = options?.timeoutMs ?? 30000;
        const results: ShareBatchResult[] = [];
        try {
          // One at a time: each moves the camera, the layers and the window the next one starts from.
          for (const request of requests) results.push(await renderOne(request, timeoutMs));
        } finally {
          setFeaturedReportId(null);
        }
        return results;
      },
    };
    // Still cards at full detail, whatever the device measured; clips (recordClip, recordTour) at the step measured
    // (the owner, 2026-10-24). renderBatch makes its cards through the same path, so one hold covers a batch.
    const fullDetail = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A): Promise<R> => drawnAtFullDetail(() => call(...args), { hold: holdFullDetail, settled: cloudsSettled });
    handle.compose = fullDetail(handle.compose);
    handle.renderShot = fullDetail(handle.renderShot);
    handle.renderBatch = fullDetail(handle.renderBatch);
    handle.composeFor = fullDetail(handle.composeFor);
    // Installed so a session's use holds the globe's detail steady (shareActivity.ts).
    (window as unknown as Record<string, unknown>)[SHARE_HANDLE] = noticedWhenUsed(handle);
    // The Story panel's mp4 (ST8): the same clip, each frame streamed to its encoder.
    setStoryClipRecorder((story, options, stream) => recordStoryWith({ story, ...options }, stream));
    // The chart panel's card (PW87): the same shot an agent would ask for, through the handle itself.
    setChartCardMaker((shot) => handle.renderShot(shot));
    return () => {
      setStoryClipRecorder(null);
      setChartCardMaker(null);
      delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
    };
    // closeUpRefusalOf, capInForce, lookInForce and weatherInForce read refs only, so they never change: the handle is installed once, as before.
  }, [globeRef, closeUpRefusalOf, capInForce, lookInForce, weatherInForce]);

  /*
   * Poll until the globe can be captured, so the button can be disabled until
   * it means something. react-globe.gl exposes renderer/scene/camera lazily
   * and gives no event when they land, so there is nothing to subscribe to.
   * And until it has drawn a frame: on a slow first load the canvas stands on
   * screen for seconds before the Earth is drawn on it, and a Share pressed
   * then was refused as a blank frame (reproduced 11 Nov at 3 Mbps: the button
   * enabled at 22 s, the frame blank until 25 s).
   */
  useEffect(() => {
    if (ready) return;
    const id = window.setInterval(() => {
      const target = resolveTarget(globeRef);
      if (target && frameIsDrawn(target)) setReady(true);
    }, 500);
    return () => window.clearInterval(id);
  }, [globeRef, ready]);

  const linkTo = (at: { lat: number; lng: number }, noteId: string): string => {
    const view = readView(globeRef);
    const link = viewDeeplink({ lat: at.lat, lng: at.lng, altitude: Math.min(view.altitude, LINK_ALTITUDE) });
    return `${globalThis.location?.origin ?? ''}/${deeplinkSearch(link)}${choicesPart(link)}&${OPEN_PARAM}=${encodeURIComponent(noteId)}`;
  };

  return { shareView, busy, error, ready, linkTo };
};
