// src/components/Globe/Globe.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useGlobeLoading } from '../../context/GlobeLoadingContext';
import { useGlobeContext } from '../../context/GlobeContext';
import {
  formatEcoDisasterLabel,
  formatEcoDisasterTooltip,
  colorForSeverity,
  colorForHazardType,
  HAZARD_TYPE_LEGEND,
  sizeForSeverity,
  sizeForWildfireAcreage,
  ringRadiusForSeverity,
  alertRingVisualsFor,
  altitudeForEcoEvent
} from '../EcoNatural/formatters';
import { GlobeEngine } from '../../globe-engine/GlobeEngine';
import { subsolarDirectionWorld, createGlobeLightRig, aimGlobeLightRig, sunMomentFor, sunStillHook } from '../../globe-engine/globeLighting';
import { onStill } from '../../globe-engine/captureClock';
import { useGlobeEField } from './Hooks/useGlobeEField';
import { auroraNotes, useGlobeAurora } from './Hooks/useGlobeAurora';
import { useGlobeFieldLines } from './Hooks/useGlobeFieldLines';
import { useGlobeVanAllenBelts } from './Hooks/useGlobeVanAllenBelts';
import { useGlobeCusps } from './Hooks/useGlobeCusps';
import { useGlobeTailSheet } from './Hooks/useGlobeTailSheet';
import { useGlobeHeliosphere } from './Hooks/useGlobeHeliosphere';
import { useGlobeNearEarthFlow } from './Hooks/useGlobeNearEarthFlow';
import { useGlobeEnlil } from './Hooks/useGlobeEnlil';
import { useGlobeCmes } from './Hooks/useGlobeCmes';
import { useGlobeBoundaryMoment } from './Hooks/useGlobeBoundaryMoment';
import { useGlobeHeroWatch } from './Hooks/useGlobeHeroWatch';
import { useGlobeAiWatch } from './Hooks/useGlobeAiWatch';
import { useGlobePsiLines } from './Hooks/useGlobePsiLines';
import { useGlobePsiZones } from './Hooks/useGlobePsiZones';
import { useGlobePsiEchoes } from './Hooks/useGlobePsiEchoes';
import { useGlobePsiFinder } from './Hooks/useGlobePsiFinder';
import { useGlobePsiCalls } from './Hooks/useGlobePsiCalls';
import { useGlobePsiObserver } from './Hooks/useGlobePsiObserver';
import { useGlobeMagneticShield } from './Hooks/useGlobeMagneticShield';
import { useGlobePsiModel } from './Hooks/useGlobePsiModel';
import { useGlobeCivilUnrest } from './Hooks/useGlobeCivilUnrest';
import { useGlobeMissions } from './Hooks/useGlobeMissions';
import { spaceWeatherFeeds } from './spaceWeatherFeeds';
import { refreshMinutesOf } from '../SpaceWeather/settings/eFieldChoices';
import { engineOverlaysFor, ENGINE_MANAGED_OVERLAYS, kpAuroraStandsIn as kpStandsIn, SPACE_WEATHER_BOUNDARIES, spaceWeatherBoundaryOn } from './engineOverlays';
import { useGlobeEcoKindMarks } from './Hooks/useGlobeEcoKindMarks';
import { useGlobeQuakePlates } from './Hooks/useGlobeQuakePlates';
import { bandsChosenWords, quakeInBands } from '../../features/globe/marks/quakeFlags';
import { QUAKE_DEPTH_BANDS, QUAKE_MAGNITUDE_BANDS } from '../../features/globe/rail/railSpecs';
import { DATA_SCALES } from '../../styles/tokens';
import { cameraReachNow } from '../../solar-system/solarScale';
import { useGlobeEcoDisasterMarks, type EcoDisasterMarkInput } from './Hooks/useGlobeEcoDisasterMarks';
import { ecoDisasterNoteSet } from '../../features/globe/noteDetail/ecoDisasterNote';
import { getGlobeAppearance, subscribeGlobeAppearance, setResolvedGlobeSkin } from '../../services/globe/globeAppearance';
import { cardMarkStyle, noteMarkStyleDrawn, subscribeCardMarkStyle, withCardMarkStyle } from '../../services/globe/cardMarkStyle';
import type { GlobeEvent } from '../../globe-engine/GlobeEngine';
import { GlobeMaterialManager } from '../../globe-engine/GlobeMaterialManager';
import { useGlobeIntelMarkers, useGlobeIntelMarkPoints } from './Hooks/useGlobeIntelMarkers';
import { GlobeMarkStyleControls } from './GlobeMarkStyleControls';
import { GlobeDebrisLapseControl } from './GlobeDebrisLapseControl';
import { useGlobeTourPing } from './Hooks/useGlobeTourPing';
import { GlobeNavHint } from './GlobeNavHint';
import { GlobeLegend } from './GlobeLegend';
import { earlierSessionSummary } from './earlierSession';
import { useGlobeIntelSprites } from './Hooks/useGlobeIntelSprites';
import { featuredReportFor, listShareReports, withGroupLine } from '../../features/globe/capture/shareReports';
import { useFeaturedReportId } from '../../features/globe/capture/featuredReportStore';
import GlobeIntelStatus from './GlobeIntelStatus';
import { GlobeShownRecord } from './GlobeShownRecord';
import { useShownRecord } from './Hooks/useShownRecord';
import { useAimAtArrivingRecord } from './Hooks/useAimAtArrivingRecord';
import GlobePublishedClaimsPublisher from '../../services/intel/globe/GlobePublishedClaimsPublisher';
import { useSpaceWeatherContext } from '../../context/SpaceWeatherContext';
import GlobeLoadingManager from './GlobeLoadingManager';
import { useEngineTextures } from './Hooks/useEngineTextures';
import { surfaceReadiness } from './globeSurface';
import { useCyberAttacks3D } from '../../hooks/useCyberAttacks3D';
import { getLastFetchHealth } from '../../services/CyberAttacks/RealBlocklistService';
import { THREAT_SOURCES } from '../../services/CyberAttacks/threatSources';
import { CREDITS, threatListCredits, type SourceCredit } from '../../features/globe/capture/sourceCredits';
import { sourceAllowed } from '../../legal/buildProfile';
import { GDELT_MACHINE_CODED_NOTE } from '../../services/geopolitical/gdeltSnapshot';
import { SATELLITE_PREDICTED_NOTE } from '../../services/Satellites/SatelliteDataManager';
import { CABLE_SNAPSHOT_NOTE } from '../../services/comm-hubs/SubmarineCableService';

import { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
// One definition, owned by the hook that produces these. See its comment.
import { Enhanced3DGlobeInteractivity } from './Enhanced3DGlobeInteractivity';
import { useGlobeSolarSystemIntegration } from './GlobeSolarSystemIntegration';
import { useGlobeCloudLayer } from './Hooks/useGlobeCloudLayer';
import { useGlobeQualityGovernor } from './Hooks/useGlobeQualityGovernor';
import { useGlobeCameraNear } from './Hooks/useGlobeCameraNear';
import { useGlobeSky } from './Hooks/useGlobeSky';
import { useSkyLook } from '../../solar-system/sky/skyLook';
import { useSolarScaleKey } from '../../solar-system/useSolarScaleKey';
import { useGlobeSunBloom } from './Hooks/useGlobeSunBloom';
import { useGlobeSharpMaps } from './Hooks/useGlobeSharpMaps';
import { setSurfaceImagery } from '../../globe-engine/imagery';
import { SURFACE_LINES, SURFACE_MARKS } from './globeAltitudes';
import { ridesShell } from '../../globe-engine/shellLift';
import type { SolarSystemState } from '../../solar-system/SolarSystemManager';
import useEcoNaturalSettings from '../../hooks/useEcoNaturalSettings';
import useGeoEvents from '../../hooks/useGeoEvents';
import { visualizationResourceMonitor } from '../../services/visualization/VisualizationResourceMonitor';
import { memoryBudgetConfig } from '../../config/memoryBudgets';
// GeoPolitical + territories integration
import { useGeoPoliticalSettings } from '../../hooks/useGeoPoliticalSettings';
import { useNationalTerritories3D } from '../../geopolitical/hooks/useNationalTerritories3D';
import { useResourceZones3D } from '../../geopolitical/hooks/useResourceZones3D';
import { useDiplomaticEvents3D } from '../../geopolitical/hooks/useDiplomaticEvents3D';
import { useConflictZones3D } from '../../geopolitical/hooks/useConflictZones3D';
import { useZones3D } from '../../geopolitical/hooks/useZones3D';
import { useSpheres3D } from '../../geopolitical/hooks/useSpheres3D';
import { useSpheresValue } from '../../features/globe/spheres/spheresStore';
import { useOrganisations3D } from '../../geopolitical/hooks/useOrganisations3D';
import { useOrganisationsValue } from '../../features/globe/organisations/organisationsStore';
import { useZonesValue } from '../../features/globe/zones/zonesStore';
import { useCountryInfoOverlay } from '../../geopolitical/hooks/useCountryInfoOverlay';
import { CountryInfoTooltip } from '../ui/CountryInfoTooltip/CountryInfoTooltip';
import { CommHubTooltip } from '../ui/CommHubTooltip/CommHubTooltip';
import { useVisualizationOverlay } from '../../hooks/useVisualizationOverlay';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { useGlobeLayerControl } from './Hooks/useGlobeLayerControl';
import { useGlobeShareCard, SHARE_HANDLE, type TheatreLens } from './Hooks/useGlobeShareCard';
import { useStoryPlayer } from '../../features/story/useStoryPlayer';
import { useStoryFromLink, useStoryPaletteSource } from '../../features/story/useStoryWiring';
import type { StoryHandle } from '../../features/story/story';
import { StoryPanel } from '../Story/StoryPanel';
import { RlshPanel } from '../Rlsh/RlshPanel';
import { EventChartPanel } from '../PsiWatch/EventChartPanel';
import { PsiListsPanel } from '../PsiWatch/PsiListsPanel';
import { PsiLabPanel } from '../PsiWatch/PsiLabPanel';
import { StoryButton, StoryCaption } from '../Story/StoryControls';
import { Docked } from '../Dock/Docked';
import type { FeedProvenance } from '../../features/globe/capture/shareCardProvenance';
import { analysisMarksForCard } from '../../features/globe/capture/analysisMarksForCard';
import { dataUrlToBlob } from '../../features/globe/capture/dataUrlToBlob';
import type { GlobeLayerId } from './Hooks/useGlobeLayerControl';
import { useGlobeSatellites } from './Hooks/useGlobeSatellites';
import { useGlobeNavHint } from './Hooks/useGlobeNavHint';
import { useGlobeDebugApi, useGlobeSnapshotTool, useGlobeDebugMarkers } from './Hooks/useGlobeDebugTools';
import { useGlobeIntelReportPipeline } from './Hooks/useGlobeIntelReportPipeline';
import { useTurnToFirstIntel } from './Hooks/useTurnToFirstIntel';
import { useMarkGlobeEngaged } from './Hooks/useMarkGlobeEngaged';
import { GlobeReportNotes } from './GlobeReportNotes';
import { focusAltitude, SHOW_ON_GLOBE_MOVE } from './showOnGlobeMove';
import { GlobeLitArea } from './GlobeLitArea';
import { GlobeZoneHover, GlobeZonePanel } from './GlobeZonePanel';
import { GlobeNotePanel } from './GlobeNotePanel';
import { setInspectorActions } from '../../features/globe/inspector/inspectorActions';
import { useOpenFromLink } from '../../features/globe/inspector/openFromLink';
import { OperationsGlobeLink } from './OperationsGlobeLink';
import { useGlobeRosterOps } from './Hooks/useGlobeRosterOps';
import { GlobeLoadStatus, type SweepBounds } from './GlobeLoadStatus';
import { useIntelReportsFeed } from './Hooks/useIntelReportsFeed';
import { computeGlobeScreenBounds } from '../../features/globe/capture/globeScreenBounds';
import { GlobeSphereHover, GlobeSpherePanel } from './GlobeSpherePanel';
import { GlobeOrganisationHover, GlobeOrganisationPanel } from './GlobeOrganisationPanel';
import { useGlobeRLSH } from './Hooks/useGlobeRLSH';
import { useCommHubs3D } from '../../hooks/useCommHubs3D';
import { useGlobeEarthWeather } from './Hooks/useGlobeEarthWeather';
import { useGlobeHeatMap } from './Hooks/useGlobeHeatMap';
import { useGlobeWindFlow, WIND_STREAK_NOTE, WIND_STREAK_NOTE_SHORT } from './Hooks/useGlobeWindFlow';
import { useGlobeRealClouds, CLOUD_NOTE, CLOUD_NOTE_SHORT, CLOUD_MODEL_NOTE, CLOUD_MODEL_NOTE_SHORT } from './Hooks/useGlobeRealClouds';
import { useGlobeRain, RAIN_NOTE, RAIN_NOTE_SHORT, RAIN_MODEL_NOTE, RAIN_MODEL_NOTE_SHORT } from './Hooks/useGlobeRain';
import { effectiveWeatherLook, getWeatherLookOverride, subscribeWeatherLook, weatherDrawn, weatherFromSettings } from '../../services/weather/weatherLook';
import { useGlobeWaterGauges, waterGaugeFeeds } from './Hooks/useGlobeWaterGauges';
import { useGlobeIntelOutlines } from './Hooks/useGlobeIntelOutlines';
import { LiveCoveragePanel } from './LiveCoveragePanel';
import RaverWatchPanel from './RaverWatchPanel';
import HeroWatchPanel from './HeroWatchPanel';
import AiWatchPanel from './AiWatchPanel';
import PsiWatchPanel from '../PsiWatch/PsiWatchPanel';
import PsiSplitNow from '../PsiWatch/PsiSplitNow';
import { useSplit } from '../../services/psiWatch/timestream/split';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import MissionsGlobePanel from './MissionsGlobePanel';
import SafetyWindowsPanel from './SafetyWindowsPanel';
import { useGlobeSafetyWindows } from './Hooks/useGlobeSafetyWindows';
import { useSafetyWindows } from '../../services/rlsh/recurrence/useSafetyWindows';
import DiplomacyPanel from './DiplomacyPanel';
import { whyNotDrawnOf } from '../../features/globe/capture/whyNotDrawn';
import { useCoverage } from './Hooks/useCoverage';
import { useTerritories } from './Hooks/useTerritories';
import { useGlobeRegionMarks, useRegionSubjectReports } from './Hooks/useGlobeRegionMarks';
import { useGlobeWarConflict, TIER_COLOR } from './Hooks/useGlobeWarConflict';
import { briefCalendarDays, publishBriefCalendar } from '../../services/warConflict/briefCalendar';
import { WarConflictBriefPanel } from './WarConflictBriefPanel';
import { briefDayWindow } from '../../services/warConflict/warConflictBrief';
import { escapeHtml } from '../../utils/escapeHtml';
import { isWarConflictNote } from '../../services/warConflict/warConflictView';
import { useGlobeRaverWatch } from './Hooks/useGlobeRaverWatch';
import { useApplyDeeplink, type LinkDriver } from './Hooks/useApplyDeeplink';
import { useGlobeGdacsGeometry } from './Hooks/useGlobeGdacsGeometry';
import { useGlobeVolcanoCatalog } from './Hooks/useGlobeVolcanoCatalog';
import { useGlobeVolcanoPlumes } from './Hooks/useGlobeVolcanoPlumes';
import { useEcoHistoryPlayback } from '../../hooks/useEcoHistoryPlayback';
import { useQuakeWindow } from '../../hooks/useQuakeWindow';
import { QUAKE_FEEDS, quakeWindowFor, quakeWindowWords, replayQuakeWindow, type QuakeWindow } from '../../services/quakes/quakeWindow';
import { useClipQuakeReplay, usePlayShape, useReplayDecayS } from '../../features/globe/timebar/playClock';
import { useGlobeQuakePings } from './Hooks/useGlobeQuakePings';
import { useGlobeWatchPings } from './Hooks/useGlobeWatchPings';
import { installComparison, registerLayerFinder, registerLayerRoot, setComparisonLabels, useComparison } from '../../globe-engine/compareLayers';
import { quakeKindInputs, thenQuakeWindow } from '../../features/globe/compare/quakeMoments';
import { formatUtcWindow } from '../../utils/utcTime';
import { weatherHalfLabels, weatherHours } from '../../features/globe/compare/weatherMoments';
import CompareBar from '../Compare/CompareBar';
import { useTimebarRange } from '../../features/globe/timebar/timebarRange';
import { publishEcoHistory } from '../../features/globe/timebar/ecoHistoryOnBar';
import EcoNoSnapshotNote, { showsNoEcoSnapshot } from './EcoNoSnapshotNote';
import { isRecentEarthquake } from './ecoTime';
import { useGlobePointTooltips } from './Hooks/useGlobePointTooltips';
import { useGlobeArcClicks } from '../../features/globe/interaction/useGlobeArcClicks';
import SimplePointTooltip from './SimplePointTooltip';
import { useHoverOwned } from './hoverOwners';
import { useWarConflictOverlay } from '../../services/globe/warConflictOverlay';
import { layerChoice, useLayerChoices } from '../../features/globe/rail/layerChoices';
import { useCyberCommandSettings } from '../../hooks/useCyberCommandSettings';
import { effectiveReportCap, getReportCapOverride, subscribeReportCap } from '../../services/intel/reportCap';
import { effectiveReportLook, emblemsChosen, getReportLookOverride, subscribeReportLook } from '../../services/intel/reportLook';
import { passesLensChoice, readLensChoice } from '../../services/intel/bigThreeLenses';
import { applyZoomFactor, setGlobePointOfView } from '../../utils/globeCameraMath';
import { globeCameraTelemetry, type GlobeCameraOrientation } from '../../services/globe/GlobeCameraTelemetry';
import { RLSH_MARKER_CAPS } from '../../services/RLSHVisualizationService';
import { combineActiveIntelLikeReports } from './activeIntelLikeReports';
import { createLogger } from '@utils/logger';
import { useGlobeRenderGate } from './Hooks/useGlobeRenderGate';
import { useEngineMaterial } from './Hooks/useEngineMaterial';
import { formatCount } from '@utils/formatCount';
import { useBriefingTour, type BriefingTourDeps } from '../../features/globe/tour/useBriefingTour';
import { showPlaylist } from '../../features/globe/tour/tourStage';
import type { PlaylistId } from '../../features/globe/tour/briefingPlaylist';
import { BriefingTourButton, BriefingTourCaption } from '../../features/globe/tour/BriefingTour';
import { prefersReducedMotion } from '../../geopolitical/hooks/useSimpleGeoOverlayLayer';
const log = createLogger({ prefix: 'Globe' });

// Drawn while a shown Case or Mission is still being read: nothing, not every report under its name.
const NO_INTEL_REPORTS: IntelReportOverlayMarker[] = [];
/** No quakes at another moment: no moment compared (D-CM). */
const NO_QUAKE_INPUTS: ReturnType<typeof quakeKindInputs> = [];

/**
 * The most individually-animated 3D markers the globe will carry at once.
 *
 * Set to RLSH_MARKER_CAPS.global rather than a new number: 300 is already this
 * repository's stated ceiling for that marker pipeline, and inventing a second
 * figure here would mean two budgets that drift. The per-layer caps stay as
 * they are — this only bounds the SUM, which no layer could previously exceed
 * because only one of them ever reached the globe.
 */
const COMBINED_MARKER_CEILING = RLSH_MARKER_CAPS.global;

// TS shim for process env in browser build (debug flags) - safe no-op in prod bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;



const DEFAULT_POV = { lat: 0, lng: 0, altitude: 2.5 };
// The Sun moves 0.25° a minute; a minute's granularity is finer than the terminator's softness.
const SUN_DIRECTION_REFRESH_MS = 60_000;
const MIN_ALTITUDE = 0.5;
/** How close the inspector's "Fly to it" brings the camera, in Earth radii above the ground. */
const INSPECTOR_FLY_ALTITUDE = 0.8;
/** The UTC day the inspector's "Show around its time" opens round an item. */
const DAY_MS = 86_400_000;
// react-globe.gl's altitude is in globe radii above the surface (distance from center =
// radius * (1 + altitude); this app's globeRadius is 100). The zoom buttons may back out
// as far as the controls can: the scale's reach, where the whole solar system is in view
// (decision K6; globeAltitudes.ts), out past Neptune at True (OR9, OR31; solarScale.ts).
const maxAltitude = () => cameraReachNow() / 100 - 1;

const cameraControlButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#00ffff',
  border: '1px solid rgba(0, 255, 255, 0.4)',
  borderRadius: '4px',
  fontSize: '16px',
  lineHeight: '1',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const GlobeView: React.FC = () => {
  // Analysis results published by the IntelAnalyzer across the tree boundary —
  // what the correlation engine concluded, as opposed to what was fetched.
  const { markers: intelMarkers, arcs: intelArcs, layers: intelLayers } = useGlobeIntelMarkers();
  /*
   * Eco-disaster events, for useGlobeEcoDisasterMarks to draw. They used to go into
   * react-globe.gl's shared pointsData, which no data layer uses any more: sized in
   * fractions of the globe's radius they were a median of 3 px² on a share card, in a
   * group the country fills painted over.
   */
  const [ecoMarkEvents, setEcoMarkEvents] = useState<EcoDisasterMarkInput[]>([]);
  // Impact-radius rings for eco-disaster markers — a separate react-globe.gl prop
  // from the marks, so it needs its own state (see the "Show Impact
  // Radius" presentation option wiring in the eco-disaster effect below).
  const [ecoRingsData, setEcoRingsData] = useState<object[]>([]);
  const globeRef = useRef<GlobeMethods>();
  const { visualizationMode, setVisualizationMode } = useVisualizationMode();
  const { focusRequest, consumeFocusRequest, shownOnGlobe, clearShownOnGlobe, setFocusLocation } = useGlobeContext();
  const { hasGlobeLoadedBefore, markGlobeAsLoaded, setGlobeInitialized } = useGlobeLoading();
  /*
   * Read, not depended on, by the effect that builds the engine. It was a
   * dependency, so marking a first visit loaded tore down the engine that had
   * just loaded and built a second, which fetched its textures again (plan item
   * 8.3c): every first visit built the globe twice.
   */
  const loadedBeforeRef = useRef(hasGlobeLoadedBefore);
  loadedBeforeRef.current = hasGlobeLoadedBefore;
  const temporalState = useTemporalStateOptional();
  const { isLayerActive, activeLayers, layers: layerCatalogue, pinLayer, unpinLayer } = useGlobeLayerControl();
  // The shown layers, and their names, for the loading status (D-LS).
  const shownLayerIds = useMemo(() => [...activeLayers], [activeLayers]);
  const layerLabel = useCallback((id: string) => layerCatalogue.find((l) => l.id === id)?.label ?? id, [layerCatalogue]);
  const [globeEngine, setGlobeEngine] = useState<GlobeEngine | null>(null);
  const [material, setMaterial] = useState<THREE.Material | null>(null);
  
  // Intel Report 3D markers state
  const intelMarkerGroupRef = useRef<THREE.Group>(ridesShell(new THREE.Group()));
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null); // Track hovered model
  const { config: cyberCommandConfig, updateMarkerStyle, updateIntelReports } = useCyberCommandSettings();
  // The report cap in force (BA4–BA7): the person's, or this page's share handle's, re-read when the handle sets it.
  useSyncExternalStore(subscribeReportCap, getReportCapOverride, getReportCapOverride);
  // How the glyphs look: the person's, or this page's handle's (BA15).
  useSyncExternalStore(subscribeReportLook, getReportLookOverride, getReportLookOverride);
  const glyphLook = effectiveReportLook({ emblems: emblemsChosen(cyberCommandConfig.intelReports) });
  const reportCap = effectiveReportCap(cyberCommandConfig.intelReports.maxReports);
  // The marks in the style a card or clip asks for while it runs, else in the person's (plan H4).
  const cardMarks = useSyncExternalStore(subscribeCardMarkStyle, cardMarkStyle, cardMarkStyle);
  const markerStyles = useMemo(
    () => withCardMarkStyle(cyberCommandConfig.markerStyles, cardMarks),
    [cyberCommandConfig.markerStyles, cardMarks],
  );
  // Fetch, filter, dedupe, and backpressured persistence-flush for Intel
  // Report markers — extracted to useGlobeIntelReportPipeline.ts.
  const { intelReports: everyIntelReport, intelTotalMatching, intelHiddenByPriority, intelHiddenByLens, intelJudgedByWindow, intelPlacedByWritten, intelUntimed, intelClearedNotice, intelListening } = useGlobeIntelReportPipeline({
    isLayerActive,
    visualizationMode,
    temporalState,
    settings: cyberCommandConfig.intelReports
  });
  // A Case or Mission shown from its own screen replaces every report with its
  // own pins (case-location-semantics.md, option C). They come from the same
  // live reading as the panel that counts them, so the panel cannot count a pin
  // the globe did not draw.
  const shownRecord = useShownRecord(isLayerActive('IntelReports') ? shownOnGlobe : null);
  // A package's reports arrive after the click, so it is aimed at when they do (plan item 9.14).
  useAimAtArrivingRecord(shownRecord, setFocusLocation);
  const intelReports = useMemo(() => {
    if (shownRecord.status === 'none') return everyIntelReport;
    return shownRecord.status === 'ready' ? shownRecord.placement.markers : NO_INTEL_REPORTS;
  }, [shownRecord, everyIntelReport]);

  // ── Extracted domain hooks ────────────────────────────────────────────────
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android|Mobile|webOS/i.test(navigator.userAgent);
  }, []);

  const satellites = useGlobeSatellites({ globeRef, isLayerActive, markerStyles });
  const rlsh = useGlobeRLSH({ isLayerActive, isMobileDevice });

  const rlshPlaceholderReports = rlsh.reports;
  const rlshDataLoading = rlsh.loading;

  // Debug: Prime meridian/equator marker(s)
  const primeMeridianMarkerRef = useRef<THREE.Group>(new THREE.Group());
  const boundaryObjectsRef = useRef<Record<string, THREE.Object3D | undefined>>({});
  const boundaryOverlays = ['spaceWeatherMagnetopause', 'spaceWeatherBowShock', 'spaceWeatherAurora', 'spaceWeatherGeomagneticIndex'];
  const [spaceWeatherBoundaryStatus, setSpaceWeatherBoundaryStatus] = useState({
    magnetopause: { enabled: false, attached: false },
    bowShock: { enabled: false, attached: false },
    aurora: { enabled: false, attached: false },
    geomagneticIndex: { enabled: false, attached: false }
  });
  const boundaryDiagnosticsRef = useRef({
    signature: '',
    lastLogAt: 0
  });
  
  // Space weather integration via context
  const {
    visualizationVectors,
    // Every sample of both of NOAA's models, for the e-field's colour field (D-SW, SW1).
    interMagData,
    usCanadaData,
    // Read for the share card's provenance. These three were commented out as
    // unused; a caveat about a stale or unreachable NOAA feed has to be derived
    // from the state the app is actually holding, so they are read now.
    isLoading: spaceWeatherLoading,
    error: spaceWeatherError,
    lastUpdated: spaceWeatherLastUpdated
  } = useSpaceWeatherContext();
  const { settings: spaceWeatherSettings } = useSpaceWeatherContext();
  const logBoundaryAttachmentDiagnostics = useCallback((reason: string) => {
    if (!isDevelopment) return;

    const scene = globeRef.current?.scene?.();
    const now = Date.now();
    const details = [
      {
        id: 'magnetopause',
        enabled: spaceWeatherSettings?.showMagnetopause === true,
        key: 'spaceWeatherMagnetopause'
      },
      {
        id: 'bowShock',
        enabled: spaceWeatherSettings?.showSolarWind === true,
        key: 'spaceWeatherBowShock'
      },
      {
        id: 'aurora',
        enabled: spaceWeatherSettings?.showAuroralOval === true,
        key: 'spaceWeatherAuroraLinesNorth'
      },
      {
        id: 'geomagneticIndex',
        enabled: spaceWeatherSettings?.showGeomagneticIndex === true,
        key: 'spaceWeatherGeomagneticIndex'
      }
    ].map((entry) => {
      const objectKey = entry.key;
      const objectRef = boundaryObjectsRef.current[objectKey] ?? globeEngine?.getOverlayObject(objectKey);
      const attached = Boolean(scene && objectRef && scene.children.includes(objectRef));

      let boundsRadius: number | null = null;
      let worldDistance: number | null = null;
      if (objectRef) {
        const box = new THREE.Box3().setFromObject(objectRef);
        if (box.isEmpty() === false) {
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          boundsRadius = Number(sphere.radius.toFixed(3));
          worldDistance = Number(sphere.center.length().toFixed(3));
        }
      }

      return {
        id: entry.id,
        enabled: entry.enabled,
        attached,
        hasObject: Boolean(objectRef),
        objectKey,
        boundsRadius,
        worldDistance
      };
    });

    const enabledMissing = details.filter((entry) => entry.enabled && !entry.attached);
    if (enabledMissing.length === 0) return;

    const signature = JSON.stringify({
      reason,
      missing: enabledMissing.map((entry) => ({ id: entry.id, hasObject: entry.hasObject, attached: entry.attached }))
    });

    if (boundaryDiagnosticsRef.current.signature === signature && now - boundaryDiagnosticsRef.current.lastLogAt < 5000) {
      return;
    }

    boundaryDiagnosticsRef.current.signature = signature;
    boundaryDiagnosticsRef.current.lastLogAt = now;

    log.warn('[SpaceWeather][BoundaryDiagnostics] enabled overlay missing from scene', {
      reason,
      sceneReady: Boolean(scene),
      overlaysActive: globeEngine?.getOverlays(),
      details
    });
  }, [
    globeEngine,
    isDevelopment,
    spaceWeatherSettings?.showAuroralOval,
    spaceWeatherSettings?.showGeomagneticIndex,
    spaceWeatherSettings?.showMagnetopause,
    spaceWeatherSettings?.showSolarWind
  ]);
  const refreshBoundaryStatus = useCallback(() => {
    const scene = globeRef.current?.scene?.();
    const isAttached = (key: string) => {
      const objectRef = boundaryObjectsRef.current[key] ?? globeEngine?.getOverlayObject(key);
      return Boolean(scene && objectRef && scene.children.includes(objectRef));
    };

    setSpaceWeatherBoundaryStatus({
      magnetopause: {
        enabled: spaceWeatherSettings?.showMagnetopause === true,
        attached: isAttached('spaceWeatherMagnetopause')
      },
      bowShock: {
        enabled: spaceWeatherSettings?.showSolarWind === true,
        attached: isAttached('spaceWeatherBowShock')
      },
      aurora: {
        enabled: spaceWeatherSettings?.showAuroralOval === true,
        attached:
          isAttached('spaceWeatherAuroraLinesNorth') &&
          isAttached('spaceWeatherAuroraLinesSouth') &&
          isAttached('spaceWeatherAuroraBlackout')
      },
      geomagneticIndex: {
        enabled: spaceWeatherSettings?.showGeomagneticIndex === true,
        attached: isAttached('spaceWeatherGeomagneticIndex')
      }
    });
    logBoundaryAttachmentDiagnostics('refreshBoundaryStatus');
  }, [
    logBoundaryAttachmentDiagnostics,
    globeEngine,
    spaceWeatherSettings?.showAuroralOval,
    spaceWeatherSettings?.showGeomagneticIndex,
    spaceWeatherSettings?.showMagnetopause,
    spaceWeatherSettings?.showSolarWind
  ]);
  const { config: ecoSettings } = useEcoNaturalSettings();
  const ecoResourceBudgetSet = useRef(false);

  /*
   * What Earth Weather draws (decision D-W): the ground's colour, wind and
   * clouds, as the person chose them, or as the share handle set them for this
   * page only (WX9, setWeather; never saved). The ground is NOAA GFS
   * temperature (WX1), or rain, radar where it reaches and the model elsewhere
   * (WX4, WX8), or the stations' air quality, or nothing; the wind is GFS
   * streaks (WX3); the clouds are the satellites' (WX2). The old wind cones
   * and the decorative cloud picture never draw within Earth Weather: wind or
   * clouds off means none.
   */
  const weatherPage = useSyncExternalStore(subscribeWeatherLook, getWeatherLookOverride, getWeatherLookOverride);
  const weatherPerson = useMemo(() => weatherFromSettings(ecoSettings.earthWeather), [ecoSettings.earthWeather]);
  const weather = useMemo(() => effectiveWeatherLook(weatherPerson, weatherPage), [weatherPerson, weatherPage]);
  const earthWeatherOn = isLayerActive('EarthWeather');
  const { heatMap: heatMapOn, rain: rainOn, stations: stationDotsOn, wind: windOn, clouds: realCloudsOn } = weatherDrawn(weather, earthWeatherOn);
  // Earth Weather's moment (step 5a): the shared cursor's while paused, as the sun's light follows it; null while live, for now.
  const weatherMoment = temporalState && !temporalState.isLive ? temporalState.currentTime : null;
  const heatMap = useGlobeHeatMap({ globeRef, active: heatMapOn, unit: ecoSettings.earthWeather.temperatureUnit, moment: weatherMoment });
  const rain = useGlobeRain({ globeRef, active: rainOn, moment: weatherMoment });
  const windFlow = useGlobeWindFlow({ globeRef, active: windOn, unit: ecoSettings.earthWeather.windUnit, moment: weatherMoment });
  const realClouds = useGlobeRealClouds({ globeRef, active: realCloudsOn, moment: weatherMoment });
  // Earth Weather now beside a forecast hour (D-CM, CM5): a copy of each field, set so many hours ahead of the moment
  // shown (to the hour while live, so it stays put), drawn in the right half.
  const weatherComparison = useComparison();
  const weatherAhead = weatherComparison?.moment?.layer === 'EarthWeather' && 'ahead' in weatherComparison.moment.pick
    ? weatherComparison.moment.pick.ahead : null;
  const weatherHoursDrawn = weatherAhead !== null ? weatherHours(weatherMoment, weatherAhead, Date.now()) : null;
  const weatherThenAt = weatherHoursDrawn?.thenAt ?? null;
  useGlobeHeatMap({ globeRef, active: heatMapOn && weatherThenAt !== null, unit: ecoSettings.earthWeather.temperatureUnit, moment: weatherThenAt, instance: 'then' });
  useGlobeRain({ globeRef, active: rainOn && weatherThenAt !== null, moment: weatherThenAt, instance: 'then' });
  useGlobeWindFlow({ globeRef, active: windOn && weatherThenAt !== null, unit: ecoSettings.earthWeather.windUnit, moment: weatherThenAt, instance: 'then' });
  useGlobeRealClouds({ globeRef, active: realCloudsOn && weatherThenAt !== null, moment: weatherThenAt, instance: 'then' });
  const weatherShownAt = weatherHoursDrawn?.shownAt ?? null;
  useEffect(() => {
    if (weatherShownAt === null || weatherThenAt === null) return;
    setComparisonLabels(weatherHalfLabels(weatherMoment, { shownAt: weatherShownAt, thenAt: weatherThenAt }, Date.now()));
  }, [weatherMoment, weatherShownAt, weatherThenAt]);

  // Return value unused — the hook manages its own scene attach/detach internally,
  // unlike satellites above whose groupRef is (nominally) captured.
  const earthWeather = useGlobeEarthWeather({
    globeRef,
    isLayerActive,
    weatherLayers: ecoSettings.earthWeather.weatherLayers,
    temperatureUnit: ecoSettings.earthWeather.temperatureUnit,
    windUnit: ecoSettings.earthWeather.windUnit,
    colorMode: weather.colour === 'airQuality' ? 'airQuality' : 'temperature',
    markerStyles,
    stationDots: stationDotsOn,
    windCones: false,
    rainParticles: !rainOn
  });

  // Real NOAA CO-OPS tide gauges + USGS Water Data API streamflow gauges — a new
  // real data source, gated by the same weatherLayers toggle convention as every
  // other EarthWeather layer.
  const waterGauges = useGlobeWaterGauges({
    globeRef,
    isLayerActive,
    enabled: ecoSettings.earthWeather.weatherLayers.waterGauges,
    markerStyles
  });

  const ecoDisastersEnabled = isLayerActive('EcologicalDisasters');

  const {
    filtered: liveEcoEvents,
    error: ecoEventsError,
    stale: ecoEventsStale,
    // Same reason as the space-weather fields above: the share card states a
    // feed's recency, and it can only state what the app knows.
    loading: ecoEventsLoading,
    lastUpdated: ecoEventsLastUpdated,
    // 'idle' is distinct from failed: see the GDACS entry in shareFeeds.
    status: ecoEventsStatus,
    refetch: refetchEcoEvents
  } = useGeoEvents({
    enabled: ecoDisastersEnabled,
    refreshMinutes: 1,
    timeRangeDays: ecoSettings.ecologicalDisasters.timeRange,
    disasterTypes: ecoSettings.ecologicalDisasters.disasterTypes,
    severity: ecoSettings.ecologicalDisasters.severity
  });

  // Real captured-snapshot playback (EcoHistoryStore, started in Phase 1 of this
  // build specifically to feed this) — when scrubbed to a historical point, the
  // ENTIRE eco-disaster rendering pipeline below (markers, GDACS geometry, volcano
  // plumes) switches to that real snapshot's events instead of the live feed, via
  // this one derived `ecoEvents`. Live health (error/stale) below intentionally
  // keeps reading the live fetch state regardless of playback, since that's about
  // connection health, not what's currently displayed.
  const ecoHistoryPlayback = useEcoHistoryPlayback({ enabled: ecoDisastersEnabled });
  const ecoEventsFed = ecoHistoryPlayback.scrubTime !== null ? ecoHistoryPlayback.currentEvents : liveEcoEvents;
  // The quakes for the window shown, from USGS and EMSC (D-EQ, EQ1, EQ2, EQ14): the last day while live, the time
  // bar's 7 d or 30 d, or the paused window, in place of the feed's day; the other hazards as fed.
  const timebarRangeId = useTimebarRange();
  const pausedWindowStart = temporalState && !temporalState.isLive ? temporalState.timeWindow?.start.getTime() ?? null : null;
  const pausedWindowEnd = temporalState && !temporalState.isLive ? temporalState.timeWindow?.end.getTime() ?? null : null;
  // While the time bar plays, the quakes are read for the play, not each step's window, and drawn from its clock
  // (D-EQ, EQ7, EQ17): each one rises and bursts at its moment and fades over the decay.
  const playShape = usePlayShape();
  const replayDecayS = useReplayDecayS();
  // A clip replaying them (EQ21): drawn from the clip's moment, over the window the shot set.
  const clipQuakeReplay = useClipQuakeReplay();
  const quakesReplaying = ecoDisastersEnabled && playShape.playing && pausedWindowEnd !== null;
  const quakeWindow = useMemo(() => {
    if (!ecoDisastersEnabled) return null;
    if (playShape.playing && pausedWindowEnd !== null) {
      return replayQuakeWindow({
        startMs: playShape.startMs, atMs: pausedWindowEnd, decayMs: replayDecayS * playShape.msPerSecond,
        msPerSecond: playShape.msPerSecond, now: playShape.startedWallMs,
      });
    }
    return quakeWindowFor({
      range: timebarRangeId,
      paused: pausedWindowStart !== null && pausedWindowEnd !== null ? { start: pausedWindowStart, end: pausedWindowEnd } : null,
      now: Date.now(),
    });
  }, [ecoDisastersEnabled, timebarRangeId, pausedWindowStart, pausedWindowEnd, playShape, replayDecayS]);
  const windowQuakes = useQuakeWindow({
    enabled: ecoDisastersEnabled,
    window: quakeWindow,
    earthquakesOn: ecoSettings.ecologicalDisasters.disasterTypes.earthquakes !== false,
    severity: ecoSettings.ecologicalDisasters.severity,
    keepWhileReading: quakesReplaying,
  });
  // One layer at two moments (D-CM, CM4): the other moment's window, read beside the window shown, its own read.
  const comparison = useComparison();
  const quakeMomentPick = comparison?.moment?.layer === 'EcologicalDisasters' && !('ahead' in comparison.moment.pick) ? comparison.moment.pick : null;
  const thenQuakeWindowShown = useMemo(
    () => (quakeMomentPick && quakeWindow ? thenQuakeWindow(quakeMomentPick, quakeWindow, Date.now()) : null),
    [quakeMomentPick, quakeWindow],
  );
  const thenQuakes = useQuakeWindow({
    enabled: ecoDisastersEnabled && thenQuakeWindowShown !== null,
    window: thenQuakeWindowShown,
    earthquakesOn: ecoSettings.ecologicalDisasters.disasterTypes.earthquakes !== false,
    severity: ecoSettings.ecologicalDisasters.severity,
    slot: 'then',
  });
  // Each half named by its window, as the windows move.
  useEffect(() => {
    if (!quakeMomentPick || !quakeWindow || !thenQuakeWindowShown) return;
    // Its window, and the least magnitude it reads where that is not every quake: the halves may differ (the month's
    // feed is M2.5 and over, the history M5), and a half that draws fewer must not be read as a quieter time.
    const named = (w: QuakeWindow) => {
      const floor = w.feed === 'history' ? 5 : QUAKE_FEEDS[w.feed].minMagnitude;
      return `Eco Disasters, ${formatUtcWindow(w.from, w.until)}${floor > 0 ? `, M${floor}+` : ''}`;
    };
    const shown = named(quakeWindow);
    const then = named(thenQuakeWindowShown);
    setComparisonLabels('held' in quakeMomentPick ? { left: then, right: shown } : { left: shown, right: then });
  }, [quakeMomentPick, quakeWindow, thenQuakeWindowShown]);
  const ecoEvents = useMemo(() => (windowQuakes.quakes
    ? [...ecoEventsFed.filter((event) => event.type !== 'earthquake'), ...windowQuakes.quakes]
    : ecoEventsFed), [ecoEventsFed, windowQuakes.quakes]);
  // Eco's captured history rides on the one time bar (OR4; plan C2): its snapshots as ticks, a step each way.
  const { snapshotTimes: ecoTimes, historySpanLabel: ecoSpan, stepToPrevious: ecoPrev, stepToNext: ecoNext } = ecoHistoryPlayback;
  const ecoStepsRef = useRef({ ecoPrev, ecoNext });
  ecoStepsRef.current = { ecoPrev, ecoNext };
  useEffect(() => {
    publishEcoHistory(ecoDisastersEnabled && ecoTimes.length ? {
      times: ecoTimes,
      spanLabel: ecoSpan,
      stepToPrevious: () => ecoStepsRef.current.ecoPrev(),
      stepToNext: () => ecoStepsRef.current.ecoNext(),
    } : null);
  }, [ecoDisastersEnabled, ecoTimes, ecoSpan]);
  useEffect(() => () => publishEcoHistory(null), []);


  // Real GDACS flood/drought affected-area polygons and cyclone tracks/wind-bands/
  // cone-of-uncertainty for the Orange/Red-severity events already in ecoEvents — a
  // second, on-demand per-event fetch (see useGlobeGdacsGeometry.ts), not a new point
  // source. Manages its own scene attach/detach, same as useGlobeEarthWeather above.
  useGlobeGdacsGeometry({ globeRef, isLayerActive, events: ecoEvents });

  // Real Smithsonian GVP volcano catalog (1,214 volcanoes, baked at build time —
  // dim always-visible context dots underneath EONET's active-eruption markers,
  // thinned by camera-altitude detail tier at global zoom.
  // Eco Disasters' rail choices: the marks below, and here the quake kit's Volcanoes and Plates (D-EQ, EQ8).
  const ecoChoices = useLayerChoices('EcologicalDisasters');
  const ecoVolcanoes = useMemo(() => layerChoice<boolean>('EcologicalDisasters', 'eco:volcanoes', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]);
  const ecoPlates = useMemo(() => layerChoice<boolean>('EcologicalDisasters', 'eco:plates', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]);
  // Not in the commercial build until the Smithsonian's terms are confirmed for it (source register, 'gvp'; CS13).
  useGlobeVolcanoCatalog({ globeRef, isLayerActive, markerStyles, shown: ecoVolcanoes && sourceAllowed('gvp') });
  const quakePlates = useGlobeQuakePlates({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: ecoDisastersEnabled && ecoPlates,
  });

  // Real ash-plume particles for currently-active EONET eruption events (a handful
  // at most) — separate from the static catalog dots above.
  useGlobeVolcanoPlumes({ globeRef, isLayerActive, events: ecoEvents });

  const ecoRefetchTriggered = useRef(false);

  useEffect(() => {
    if (!ecoDisastersEnabled) {
      ecoRefetchTriggered.current = false;
      return;
    }
    if (!globeEngine) return;
    if (ecoRefetchTriggered.current) return;
    ecoRefetchTriggered.current = true;
    refetchEcoEvents().catch((err) => log.warn('EcoNatural refetch failed after engine init', err));
  }, [ecoDisastersEnabled, globeEngine, refetchEcoEvents]);

  useEffect(() => {
    if (ecoResourceBudgetSet.current) return;
    visualizationResourceMonitor.setBudgets('EcoNatural.EcologicalDisasters', {
      maxVectors: 900,
      maxPipelineVectors: 1800,
      maxHeapBytes: memoryBudgetConfig.ecoHeapBudgetBytes,
      // Real GDACS polygon/track geometry (useGlobeGdacsGeometry.ts) previously had no
      // GPU budget at all — a bad multi-cyclone day (a dozen+ severe events, each
      // ~10-15 triangulated polygons/segments) had zero guardrail.
      maxGpuBytes: 24_000_000
    });
    ecoResourceBudgetSet.current = true;
  }, []);

  useEffect(() => {
    if (!ecoDisastersEnabled) return;
    const off = visualizationResourceMonitor.onWarning((snapshot) => {
      if (snapshot.mode !== 'EcoNatural.EcologicalDisasters') return;
      log.warn('[EcoDisasters][resource-budget]', snapshot.warnings, {
        vectors: snapshot.vectors,
        pipelineVectors: snapshot.pipelineVectors,
        heap: snapshot.heap
      });
    });
    // Braced so the cleanup returns void. `off()` yields a boolean (a Set
    // delete), and React types a cleanup as void | Destructor — returning the
    // boolean is harmless at runtime and wrong to the typechecker, which is
    // the kind of thing @ts-nocheck was hiding.
    return () => { off(); };
  }, [ecoDisastersEnabled]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  // The globe's disc in the container, for the sweep while a layer loads (D-LS, LS3); null before there is one.
  const loadSweepBounds = useCallback<SweepBounds>(() => {
    const globe = globeRef.current;
    const canvas = globe?.renderer?.()?.domElement;
    const container = containerRef.current;
    if (!globe || !canvas || !container || !canvas.clientWidth || !canvas.clientHeight) return null;
    try {
      const b = computeGlobeScreenBounds(globe, { width: canvas.clientWidth, height: canvas.clientHeight });
      const offset = canvas.getBoundingClientRect();
      const origin = container.getBoundingClientRect();
      const size = Math.max(b.width, b.height);
      return { x: offset.left - origin.left + b.minX, y: offset.top - origin.top + b.minY, size };
    } catch {
      return null;
    }
  }, []);
  const loadSweep = useMemo(() => ({ container: containerRef, bounds: loadSweepBounds }), [loadSweepBounds]);

  // Keep it mounted, but stop shading it when nobody can see it.
  useGlobeRenderGate(globeRef, containerRef);
  const [isInitializing, setIsInitializing] = useState(!hasGlobeLoadedBefore);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const snapDoneRef = useRef(false);
  const rendererConfig = useMemo(() => ({
    // On for every device. Antialiasing is fixed when the renderer is created, so it
    // cannot be a step taken back later; a device that cannot carry it sheds pixel
    // ratio instead (services/globe/globeQuality.ts). It was off on phones, by guess.
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
    powerPreference: isMobileDevice ? 'low-power' as const : 'high-performance' as const
  }), [isMobileDevice]);
  // GeoPolitical settings (used for dev-only geoSnap toggles)
  const { config: geoPoliticalConfig, updateNationalTerritories, setLayerError, territoryLooks } = useGeoPoliticalSettings();
  const { nationalTerritoriesOverlayEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled } = useVisualizationOverlay();

  // Real, always-on cloud layer (unlike solar system integration, not mode-gated —
  // clouds read as a natural part of the globe itself under every material mode).
  useGlobeCloudLayer({ globeRef, suppressed: earthWeatherOn });

  // How much detail this device draws: measured, stepped down only when it cannot keep
  // up, and overridable in Globe Appearance. See services/globe/globeQuality.ts.
  const qualityStep = useGlobeQualityGovernor(globeRef);

  // Near plane raised so the depth-tested fills resolve above the surface; see CAMERA_NEAR.
  useGlobeCameraNear(globeRef);
  // The solar system's scale in the key, while it is drawn (OR9).
  useSolarScaleKey();

  // Real hover tooltips for the InstancedMesh point layers registered via
  // pointTooltipRegistry.ts (weather grid/sea-ice/wind arrows, volcano catalog,
  // water gauges) — see useGlobePointTooltips.ts for why this is a second,
  // independent hover system rather than a change to Enhanced3DGlobeInteractivity.
  const hoveredPointTooltip = useGlobePointTooltips({ globeRef, containerRef });
  // One hover card at a time: a report's card, an arc's label or a hub's card says more than the point or country
  // tooltip under it, which wait while one shows (hoverOwners.ts; owner, 1 Nov).
  const hoverOwned = useHoverOwned();
  // A War & Conflict arc opens its force's notes, and takes the click from the country under it (W3).
  const arcClicks = useGlobeArcClicks();

  // Dev-only QA tooling — extracted to useGlobeDebugTools.ts (Hooks/), the
  // second cut of pulling Globe.tsx apart. All three (this API, the scripted
  // snapshot tool below, and the debug marker overlay further down) are
  // conditionally gated behind NODE_ENV==='development', so extracting them
  // changed zero production behavior.
  useGlobeDebugApi(globeRef, containerRef);

  /*
   * Where the Sun actually is, in the scene's frame, recomputed as it moves.
   *
   * This used to read the solar-system integration's sun position, which is only
   * updated in the scale tiers where the Sun is drawn as a body — never in the tier
   * a person looks at the globe from. So it was null or stale here, the day/night
   * shader kept its initial (1, 0, 0), and the magnetopause and bow shock were
   * oriented off a direction nothing had set. See globeLighting.ts.
   */
  const [solarDirection, setSolarDirection] = useState<THREE.Vector3>(() => subsolarDirectionWorld(sunMomentFor(temporalState, Date.now())));
  // Lit for the paused moment while the timeline is paused, as a shot's time.at pauses it (IM20): one cursor.
  const sunPausedAt = temporalState && !temporalState.isLive ? temporalState.currentTime : null;

  /*
   * The solar system round the globe, in every mode (decision K6, SS3): the Sun, the
   * planets and the Moon at true sizes, placed for the moment the globe is lit for. None
   * of it is drawn while the Earth's marks are whole, so close-up work costs nothing.
   */
  const handleSolarSystemStateChange = useCallback((state: SolarSystemState) => {
    if (process.env.NODE_ENV === 'development') {
      log.debug(`Solar system ${state.sunState?.isVisible ? 'drawn' : 'hidden'}:`, state);
    }
  }, []);
  const { sunVisible } = useGlobeSolarSystemIntegration({
    globeRef,
    pausedAt: sunPausedAt,
    debugMode: false, // Disabled debug mode to reduce console noise
    onStateChange: handleSolarSystemStateChange
  });
  // The glow round the Sun, while it is drawn and the quality step keeps it (K6, SS2).
  useGlobeSunBloom(globeRef, qualityStep.bloom, sunVisible);
  // Sky from a place, chosen on the Solar System kit (D5): the camera on the ground, the stars over it.
  useGlobeSky(globeRef, sunPausedAt);
  const skyOpen = useSkyLook() !== null;
  // The Earth's 8K maps, once a person zooms in closer than the default view at a step that keeps them (K7).
  useGlobeSharpMaps(globeRef, material, !isInitializing);
  useEffect(() => {
    const paused = sunPausedAt === null ? null : { isLive: false, currentTime: sunPausedAt };
    const tick = () => setSolarDirection(subsolarDirectionWorld(sunMomentFor(paused, Date.now())));
    tick();
    if (paused) return undefined;
    // The subsolar point moves a quarter of a degree a minute.
    const timer = setInterval(tick, SUN_DIRECTION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [sunPausedAt]);

  /*
   * The aurora from NOAA's OVATION forecast (space-weather-visualization.md, SW3): a glowing band by
   * the chance, both hemispheres, and a curtain of light on the night side unless the panel asks for
   * the band alone. The near-circle modelled from Kp alone stands in only while the forecast cannot be
   * read. Psi Watch's magnetic shield draws it too (D-PW, PW7), only while the timeline is live: the forecast is now's.
   */
  const shieldAuroraOn = isLayerActive('MagneticShield') && psiKitOn() && (temporalState?.isLive ?? true);
  const auroraOn = (isLayerActive('SpaceWeather') && spaceWeatherSettings.showAuroralOval === true) || shieldAuroraOn;
  const auroraCurtain = spaceWeatherSettings.auroraCurtain !== false;
  const aurora = useGlobeAurora({
    globeRef,
    active: auroraOn,
    sunDirection: solarDirection,
    refreshMinutes: refreshMinutesOf(spaceWeatherSettings),
    curtain: auroraCurtain,
    compareLayer: isLayerActive('SpaceWeather') && spaceWeatherSettings.showAuroralOval === true ? 'SpaceWeather' : null,
  });
  const kpAuroraStandsIn = kpStandsIn(spaceWeatherSettings.showAuroralOval === true, aurora);
  /*
   * The magnetosphere's field lines (space-weather-visualization.md, SW4): Tsyganenko's T96 and IGRF,
   * driven by the measured solar wind, traced in a worker for the moment the globe shows, to the
   * quarter hour; closed lines and open lines in two colours.
   */
  const fieldLinesOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showFieldLines !== false;
  const fieldLines = useGlobeFieldLines({
    globeRef,
    active: fieldLinesOn,
    atMs: sunPausedAt ?? Date.now(),
    density: spaceWeatherSettings.fieldLineDensity === 'few' ? 'few' : 'many',
    refreshMinutes: refreshMinutesOf(spaceWeatherSettings),
  });
  /*
   * The Van Allen belts (SW5): a dipole's drift shells round the magnetic axis, the outer brightened by
   * the electrons GOES measures; faded in as the camera draws back. Fewer steps marched a pixel as the
   * quality governor steps down (SW10).
   */
  /*
   * The polar cusps and the day side's reconnection (SW5): traced from T96 with the field lines' drivers,
   * bursts at the magnetopause's nose while the measured IMF points south.
   */
  const cuspsOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showCusps !== false;
  const cusps = useGlobeCusps({ globeRef, active: cuspsOn, atMs: sunPausedAt ?? Date.now(), reading: fieldLines.reading });
  // The magnetotail's current sheet (SW5): T96's place for it, with the field lines' drivers.
  const tailSheetOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showTailSheet !== false;
  const tailSheet = useGlobeTailSheet({ globeRef, active: tailSheetOn, atMs: sunPausedAt ?? Date.now(), reading: fieldLines.reading });
  /*
   * The solar wind from the Sun to the Earth (SW6, SW7, SW16): a hindcast from NOAA's 7 days of measured
   * wind, streaming along the spiral in the solar system's compressed space, aligned to the drawn Sun.
   */
  // The solar wind streaming past the magnetosphere, now (SW6, SW17): the field lines' wind, a modelled flow.
  const nearEarthFlowOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showNearEarthFlow !== false;
  const nearEarthFlow = useGlobeNearEarthFlow({ globeRef, active: nearEarthFlowOn, atMs: sunPausedAt ?? Date.now(), reading: fieldLines.reading });
  const heliosphereOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showHeliosphere !== false;
  const heliosphere = useGlobeHeliosphere({
    globeRef,
    active: heliosphereOn,
    atMs: sunPausedAt ?? Date.now(),
    sunDirection: solarDirection,
    refreshMinutes: refreshMinutesOf(spaceWeatherSettings),
  });
  // NOAA's ENLIL model (SW6, SW9, SW18): its frames for the moment shown, a glowing disc round the drawn Sun.
  const enlilOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showEnlil !== false;
  const enlilQuantity = spaceWeatherSettings.enlilQuantity ?? 'density';
  const enlil = useGlobeEnlil({ globeRef, active: enlilOn, moment: sunPausedAt, sunDirection: solarDirection, quantity: enlilQuantity });
  // NASA DONKI's CMEs (SW8, SW20–SW23): those in flight at the moment shown, shells at their drag-based fronts.
  const cmesOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showCmes !== false;
  const cmes = useGlobeCmes({ globeRef, active: cmesOn, moment: sunPausedAt, sunDirection: solarDirection });
  const vanAllenOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.showVanAllen !== false;
  const vanAllen = useGlobeVanAllenBelts({
    globeRef,
    active: vanAllenOn,
    atMs: sunPausedAt ?? Date.now(),
    steps: qualityStep.bloom ? 48 : qualityStep.atmosphere ? 32 : 16,
    refreshMinutes: refreshMinutesOf(spaceWeatherSettings),
  });
  // Of Space Weather's boundaries, those switched on: the engine is asked for these and no others (engineOverlays.ts).
  const { showMagnetopause, showSolarWind, showGeomagneticIndex } = spaceWeatherSettings;
  const boundaryOn = useMemo(
    () => spaceWeatherBoundaryOn({ showMagnetopause, showSolarWind, showGeomagneticIndex }, kpAuroraStandsIn),
    [showMagnetopause, showSolarWind, showGeomagneticIndex, kpAuroraStandsIn],
  );
  const boundaryOnRef = useRef(boundaryOn);
  boundaryOnRef.current = boundaryOn;
  // The magnetopause and bow shock for the moment shown (SW30): measured within NOAA's 7 days, a CME's sheath modelled past them.
  const boundaryMomentOn = isLayerActive('SpaceWeather') && (boundaryOn('spaceWeatherMagnetopause') || boundaryOn('spaceWeatherBowShock'));
  const boundaryMoment = useGlobeBoundaryMoment({ engine: globeEngine, active: boundaryMomentOn, moment: sunPausedAt });

  // What the viewer chose: the planet's look, where its light comes from, and how much
  // of the night side still reads. See services/globe/globeAppearance.ts.
  const appearance = useSyncExternalStore(subscribeGlobeAppearance, getGlobeAppearance, getGlobeAppearance);

  /*
   * The direction the globe is lit from. In 'sun' it is the real subsolar point; in
   * 'headlamp' it is wherever the camera is, so nothing is in shadow; in 'flat' the
   * direction stops mattering — the rig drops the directional light and the shader
   * skins are told to skip their terminator.
   */
  const [headlampDirection, setHeadlampDirection] = useState<THREE.Vector3 | null>(null);
  useEffect(() => {
    if (appearance.lightMode !== 'headlamp') {
      setHeadlampDirection(null);
      return;
    }
    let frame = 0;
    const follow = () => {
      const camera = (globeRef.current as unknown as { camera?: () => THREE.Camera } | undefined)?.camera?.();
      if (camera) {
        const next = camera.position.clone().normalize();
        // Only re-render when the camera has actually moved appreciably.
        setHeadlampDirection((previous) => (previous && previous.angleTo(next) < 0.01 ? previous : next));
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [appearance.lightMode]);

  const lightDirection = appearance.lightMode === 'headlamp'
    ? (headlampDirection ?? solarDirection)
    : solarDirection;

  useEffect(() => {
    if (!material) return;
    GlobeMaterialManager.applyLighting(material, {
      direction: lightDirection,
      nightFill: appearance.nightFill,
      flat: appearance.lightMode === 'flat',
    });
  }, [material, lightDirection, appearance.nightFill, appearance.lightMode]);

  // A material the engine rebuilds later: a skin whose textures had to be fetched.
  useEngineMaterial(globeEngine, setMaterial);

  // The viewer's skin choice, rebuilt from the textures already loaded.
  useEffect(() => {
    if (!globeEngine) return;
    globeEngine.setSkin(appearance.skin);
    // Report the skin actually drawn, so a card can name it rather than say 'auto'.
    setResolvedGlobeSkin(globeEngine.getSkin());
    const next = globeEngine.getMaterial();
    if (next) setMaterial(next);
  }, [globeEngine, appearance.skin, visualizationMode.mode]);

  /*
   * The globe's own lights, aimed at the Sun.
   *
   * react-globe.gl ships an ambient and a directional light fixed at (0, 1, 0) —
   * straight above the north pole — and those were what lit the Earth and its clouds
   * in every mode, whatever the shader did. Replacing them (the `lights` method) means
   * one light source for every material: the Phong modes get a real terminator, and
   * the day/night shader's own is the same direction.
   */
  const lightRigRef = useRef(createGlobeLightRig());
  useEffect(() => {
    const globe = globeRef.current as unknown as { lights?: (l: THREE.Light[]) => void } | undefined;
    if (!globe?.lights) return;
    aimGlobeLightRig(lightRigRef.current, lightDirection, appearance.nightFill, appearance.lightMode === 'flat');
    globe.lights(lightRigRef.current.lights);
  }, [lightDirection, appearance.nightFill, appearance.lightMode, globeEngine]);

  // A capture is lit for its still moment at once, for its render only (IM20, IM23).
  const lightingRef = useRef({ material, lightDirection, appearance });
  lightingRef.current = { material, lightDirection, appearance };
  useEffect(() => onStill(sunStillHook(
    () => ({ lightMode: lightingRef.current.appearance.lightMode, direction: lightingRef.current.lightDirection }),
    (direction) => {
      const { material: lit, appearance: look } = lightingRef.current;
      if (lit) GlobeMaterialManager.applyLighting(lit, { direction, nightFill: look.nightFill, flat: false });
      aimGlobeLightRig(lightRigRef.current, direction, look.nightFill, false);
    },
  )), []);

  useEffect(() => {
    // No wait before building the engine. A first visit waited 800 ms here, for
    // nothing (plan item 8.3); the loader shows what is actually loading.
    let materialCheckTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let createdEngine: GlobeEngine | null = null;
    
    const initTimer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      // The overlays the engine starts with. Later changes to which layers are
      // active are applied to THIS engine by the overlay-sync effect below,
      // rather than by building another one.
      const engine = new GlobeEngine({ mode: visualizationMode.mode, overlays: engineOverlaysFor(isLayerActive, boundaryOnRef.current) });
      createdEngine = engine;
      setGlobeEngine(engine);

      /*
       * Initialised when the surface exists, and not before (plan item 8.3c).
       * A failsafe called the globe initialised, and loaded, 5 s in (1.5 s on a
       * return), surface or not. None is needed: a texture that does not arrive
       * in 10 s is drawn with a stand-in, and the loader says which.
       */
      // Check for material with appropriate timing
      const loadedBefore = loadedBeforeRef.current;
      const materialCheckInterval = loadedBefore ? 10 : 100; // Faster checks for subsequent loads
      materialCheckTimer = setInterval(() => {
        if (cancelled) {
          if (materialCheckTimer) {
            clearInterval(materialCheckTimer);
            materialCheckTimer = null;
          }
          return;
        }
        const mat = engine.getMaterial();
        if (mat) {
          setMaterial(mat);
          // Ready for rendering, now: a first visit waited 100 ms more here.
          setIsInitializing(false);
          setGlobeInitialized(true);
          if (!loadedBefore) {
            markGlobeAsLoaded(); // Mark as loaded only on first successful initialization
          }
          if (materialCheckTimer) {
            clearInterval(materialCheckTimer);
            materialCheckTimer = null;
          }
        }
      }, materialCheckInterval);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      if (materialCheckTimer) {
        clearInterval(materialCheckTimer);
      }
      // The engine this run made. Its pollers are keyed to its own instance, so
      // nothing else can stop them — this cleanup used to leave every replaced
      // engine running.
      createdEngine?.dispose();
    };
    /*
     * Keyed on the MODE, not the layer.
     *
     * This listed `visualizationMode.subMode` too, so every layer switch tore down
     * and rebuilt the whole engine and its material — twenty-one switches built
     * twenty-four engines, measured on 2026-09-25 — although the skin depends
     * only on the mode (GlobeModeMapping). A globe mid-rebuild is also what a
     * capture could catch, which is the likeliest source of a compose refusing as
     * blank just after the share handle's setLayer.
     *
     * The subMode was only there because the engine's overlays depend on which
     * layers are active. That now lives in its own effect, which updates the
     * engine in place — and also catches PINNED layers, which this effect never
     * could: isLayerActive was not in its dependency list, so pinning Space
     * Weather without changing the primary layer left its overlays off.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isLayerActive is read once for the starting overlays; changes flow through the sync effect
  }, [visualizationMode.mode, markGlobeAsLoaded, setGlobeInitialized]);

  /*
   * Which engine overlays the active layers call for, applied to the living
   * engine — so a layer switch changes a couple of overlays instead of
   * rebuilding the engine.
   */
  const spaceWeatherActive = isLayerActive('SpaceWeather');
  const ecoDisastersActive = isLayerActive('EcologicalDisasters');
  useEffect(() => {
    if (!globeEngine) return;
    const wanted = new Set(engineOverlaysFor((id) => (
      (id === 'SpaceWeather' && spaceWeatherActive) || (id === 'EcologicalDisasters' && ecoDisastersActive)
    ), boundaryOn));
    const present = new Set(globeEngine.getOverlays());
    for (const overlay of ENGINE_MANAGED_OVERLAYS) {
      if (wanted.has(overlay) && !present.has(overlay)) globeEngine.addOverlay(overlay);
      if (!wanted.has(overlay) && present.has(overlay)) globeEngine.removeOverlay(overlay);
    }
    refreshBoundaryStatus();
  }, [globeEngine, spaceWeatherActive, ecoDisastersActive, boundaryOn, refreshBoundaryStatus]);

  // Track container size for responsive Globe
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Use the full available space, only enforce minimum for very small screens
        setContainerSize({ 
          width: Math.max(rect.width, 200), 
          height: Math.max(rect.height, 200) 
        });
      }
    };

    // Initial size
    updateSize();

    // Create ResizeObserver to watch container size changes
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    // Also listen to window resize as backup
    window.addEventListener('resize', updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Ecological disasters data -> globe markers
  useEffect(() => {
    if (!ecoDisastersEnabled) {
      visualizationResourceMonitor.clearMode('EcoNatural.EcologicalDisasters');
      setEcoMarkEvents([]);
      setEcoRingsData([]);
      log.info('[Globe][Eco] Cleared eco-disaster markers (mode disabled)');
      return;
    }

    // "Color By" presentation option: severity (default — minor/major/catastrophic)
    // or hazard type (distinguish the 6 real categories from each other).
    const byHazardType = ecoSettings.ecologicalDisasters.colorMode === 'hazardType';
    const colorForEvent = byHazardType
      ? (event: typeof ecoEvents[number]) => colorForHazardType(event.type)
      : (event: typeof ecoEvents[number]) => colorForSeverity(event.severityBucket);
    /*
     * What that colour STANDS FOR, carried on the mark itself so the legend is
     * built from the events actually drawn rather than from a table beside the
     * card that nothing would fail if it drifted.
     *
     * This used to claim HAZARD_TYPE_LEGEND was "the same source the in-app
     * legend reads". There was no in-app legend when that was written — the
     * store had one consumer, composeShareCard — and the constant is read here
     * and nowhere else. GlobeLegend now renders the same store, so the card and
     * the app show one key; the label still travels on the mark, which is what
     * keeps either of them from drifting.
     */
    const hazardLabel = new Map(HAZARD_TYPE_LEGEND.map((h) => [h.type, h.label]));
    const categoryForEvent = byHazardType
      ? (event: typeof ecoEvents[number]) => hazardLabel.get(event.type) ?? event.type
      : (event: typeof ecoEvents[number]) => event.severityBucket ?? 'minor';

    const formatLabel = (event: typeof ecoEvents[number]) => formatEcoDisasterLabel(event);

    const validEvents = ecoEvents.filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng));
    const invalidCount = ecoEvents.length - validEvents.length;
    if (invalidCount > 0) {
      log.warn(`Dropping ${invalidCount} eco-disaster events with invalid coordinates`);
    }

    // Wildfires have no real magnitude field, so severityBucket always defaults to
    // the same bucket regardless of fire size — every fire previously rendered at one
    // identical size. Real acreage (event.intensity) drives a real, distinct radius
    // instead, for this hazard type only; everything else keeps the severity-based size.
    const sizeForEvent = (event: typeof ecoEvents[number]) =>
      event.type === 'wildfire' ? sizeForWildfireAcreage(event.intensity) : sizeForSeverity(event.severityBucket);

    // See altitudeForEcoEvent's own comment (formatters.ts) for why this can't
    // just reuse `size` — pointAltitude and pointRadius are very different
    // scales, and conflating them previously made every marker a giant spike.
    const altitudeForEvent = (event: typeof ecoEvents[number]) => altitudeForEcoEvent(event.type, event.depthKm);

    // A quake is recent within the hour before the time the globe shows: the paused
    // moment, or now while live (ecoTime.ts). It was always the real clock.
    const shownAt = ecoHistoryPlayback.scrubTime ?? Date.now();

    const markers = validEvents.map(event => {
      const size = sizeForEvent(event);
      return {
        id: String(event.id),
        lat: event.lat,
        lng: event.lng,
        size,
        altitude: altitudeForEvent(event),
        acres: event.type === 'wildfire' && typeof event.intensity === 'number' ? event.intensity : null,
        depthKm: typeof event.depthKm === 'number' ? event.depthKm : null,
        color: colorForEvent(event),
        category: categoryForEvent(event),
        label: formatLabel(event),
        tooltip: formatEcoDisasterTooltip(event),
        magnitude: event.magnitude,
        type: 'eco-disaster',
        hazardType: event.type,
        severityBucket: event.severityBucket,
        timestamp: event.timestamp,
        source: event.source || 'geo-events',
        tsunami: event.tsunami === true,
        ...(event.shakeMapDetailUrl ? { shakeMapDetailUrl: event.shakeMapDetailUrl } : {}),
        ...(event.atlas ? { atlas: event.atlas } : {}),
        recentEarthquake: isRecentEarthquake(event, shownAt),
        // A click opens the event as its feed states it, with its page (critique C5).
        opens: ecoDisasterNoteSet(event)
      };
    });

    setEcoMarkEvents(markers);

    // "Show Impact Radius" presentation option: a stylized, severity-scaled pulse
    // ring around each marker (see ringRadiusForSeverity's comment — not a claim
    // about any event's real physical impact area, since no such dataset exists here).
    // While the quakes replay, their rings are the replay's own bursts (EQ18): a ring for every quake read would
    // stand for quakes play has not reached.
    const ringed = quakesReplaying ? markers.filter((m) => m.hazardType !== 'earthquake') : markers;
    const impactRadiusRings = ecoSettings.ecologicalDisasters.showImpactRadius
      ? ringed.map(m => ({
          lat: m.lat,
          lng: m.lng,
          maxR: ringRadiusForSeverity(m.severityBucket),
          color: m.color,
          opacity: ecoSettings.ecologicalDisasters.radiusOpacity / 100,
          kind: 'impact' as const
        }))
      : [];

    // Alert rings — always shown regardless of the "Show Impact Radius" setting,
    // since both are safety-relevant, time-sensitive signals rather than a stylized
    // presentation option: a tsunami-warning ring (real USGS tsunami flag) and a
    // shockwave pulse for quakes under an hour old (real timestamp comparison).
    // Split into distinct 'tsunami'/'shockwave' kinds (not one shared 'alert'
    // bucket) — a shared white ring made a tsunami warning and a routine
    // earthquake shockwave visually indistinguishable except by radius; each kind
    // now gets its own color AND pulse timing (ringPropagationSpeed/ringRepeatPeriod
    // below), a real non-color-only distinction. A quake that's both tsunami and
    // recent renders as 'tsunami' — the more urgent, broader warning wins.
    const alertRings = ringed
      .filter(m => m.tsunami || m.recentEarthquake)
      .map(m => {
        const visuals = alertRingVisualsFor(m.tsunami);
        return { lat: m.lat, lng: m.lng, maxR: visuals.maxR, color: visuals.color, opacity: 0.8, kind: visuals.kind };
      });

    setEcoRingsData([...impactRadiusRings, ...alertRings]);

    const volcanoCount = markers.filter(m => m.hazardType === 'volcano').length;
    log.info('[Globe][Eco] Applied eco-disaster markers', {
      markers: markers.length,
      volcanoes: volcanoCount,
      earthquakes: markers.filter(m => m.hazardType === 'earthquake').length,
      wildfires: markers.filter(m => m.hazardType === 'wildfire').length,
      floods: markers.filter(m => m.hazardType === 'flood').length,
      droughts: markers.filter(m => m.hazardType === 'drought').length,
      hurricanes: markers.filter(m => m.hazardType === 'hurricane').length,
      stale: ecoEventsStale,
      error: Boolean(ecoEventsError)
    });

    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as unknown as { __ecoDisastersDebug?: unknown }).__ecoDisastersDebug = {
        getMarkers: () => markers,
        getColorMode: () => ecoSettings.ecologicalDisasters.colorMode,
        getShowImpactRadius: () => ecoSettings.ecologicalDisasters.showImpactRadius
      };
    }

    visualizationResourceMonitor.recordPipelineVectors('EcoNatural.EcologicalDisasters', {
      count: ecoEvents.length,
      approxBytes: ecoEvents.length * 128
    });

    visualizationResourceMonitor.recordVectors('EcoNatural.EcologicalDisasters', {
      count: markers.length,
      approxBytes: markers.length * 128
    });

    if (typeof performance !== 'undefined' && 'memory' in performance && (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = (performance as Performance & { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      visualizationResourceMonitor.recordHeap('EcoNatural.EcologicalDisasters', usedJSHeapSize, jsHeapSizeLimit);
    }

    if (ecoEventsError) {
      log.error('Ecological disasters data error:', ecoEventsError);
    }
    if (ecoEventsStale) {
      log.warn('Ecological disasters data stale');
    }
  }, [
    ecoDisastersEnabled,
    ecoEvents,
    ecoHistoryPlayback.scrubTime,
    ecoEventsError,
    ecoEventsStale,
    ecoSettings.ecologicalDisasters.colorMode,
    ecoSettings.ecologicalDisasters.showImpactRadius,
    ecoSettings.ecologicalDisasters.radiusOpacity,
    quakesReplaying
  ]);

  // Attach space weather boundary meshes from GlobeEngine into the scene
  useEffect(() => {
    if (!globeEngine) return;
    let disposed = false;
    // Space Weather's, side by side (D-CM): each boundary object tagged while it is in the scene.
    const tags: Record<string, () => void> = {};
    const tagBoundary = (key: string, obj: THREE.Object3D | undefined) => {
      tags[key]?.();
      delete tags[key];
      if (obj) tags[key] = registerLayerRoot('SpaceWeather', obj);
    };

    const getScene = () => globeRef.current?.scene?.();

    const attachObjects = (overlay: string) => {
      const scene = getScene();
      if (!scene) return false;

      const applySolarAlignment = (obj: THREE.Object3D | undefined, overlayName: string) => {
        if (!obj || !solarDirection) return;
        if (overlayName !== 'spaceWeatherMagnetopause' && overlayName !== 'spaceWeatherBowShock') return;
        const target = solarDirection.clone().normalize();
        const reference = new THREE.Vector3(1, 0, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(reference, target);
        obj.quaternion.copy(q);
      };

      if (overlay === 'spaceWeatherAurora') {
        const keys = ['spaceWeatherAuroraLinesNorth', 'spaceWeatherAuroraLinesSouth', 'spaceWeatherAuroraBlackout'];
        keys.forEach((key) => {
          const obj = globeEngine.getOverlayObject(key);
          const prev = boundaryObjectsRef.current[key];
          if (prev && scene.children.includes(prev)) scene.remove(prev);
          if (obj) {
            // The aurora stands about 2% of a radius up, under a raised territories shell:
            // it rides it, and every rebuild hands over a new object, so it is marked here.
            scene.add(ridesShell(obj));
            boundaryObjectsRef.current[key] = obj; tagBoundary(key, obj);
          } else {
            boundaryObjectsRef.current[key] = undefined; tagBoundary(key, undefined);
          }
        });
        return true;
      }

      const obj = globeEngine.getOverlayObject(overlay);
      const prev = boundaryObjectsRef.current[overlay];
      if (prev && scene.children.includes(prev)) scene.remove(prev);
      if (obj) {
        applySolarAlignment(obj, overlay);
        scene.add(obj);
        boundaryObjectsRef.current[overlay] = obj; tagBoundary(overlay, obj);
      } else {
        boundaryObjectsRef.current[overlay] = undefined; tagBoundary(overlay, undefined);
      }
      return true;
    };

    const attachAllWhenSceneReady = (attempt = 0) => {
      if (disposed) return;
      const scene = getScene();
      if (!scene) {
        if (attempt < 120) {
          requestAnimationFrame(() => attachAllWhenSceneReady(attempt + 1));
        }
        logBoundaryAttachmentDiagnostics('scene-not-ready');
        return;
      }
      boundaryOverlays.forEach(attachObjects);
      refreshBoundaryStatus();
      logBoundaryAttachmentDiagnostics('attach-all');
    };

    const handler = ({ type, payload }: GlobeEvent) => {
      if (type === 'overlayDataUpdated' && payload && typeof payload === 'object') {
        const p = payload as { overlay?: string; unchanged?: boolean };
        if (p.unchanged) return;
        if (p.overlay && boundaryOverlays.includes(p.overlay)) {
          attachObjects(p.overlay);
          refreshBoundaryStatus();
          logBoundaryAttachmentDiagnostics(`overlay-updated:${p.overlay}`);
        }
      }
      if (type === 'overlayRemoved' && typeof payload === 'string') {
        if (boundaryOverlays.includes(payload)) {
          const scene = getScene();
          const keys = payload === 'spaceWeatherAurora'
            ? ['spaceWeatherAuroraLinesNorth', 'spaceWeatherAuroraLinesSouth', 'spaceWeatherAuroraBlackout']
            : [payload];
          keys.forEach((key) => {
            const prev = boundaryObjectsRef.current[key];
            if (scene && prev && scene.children.includes(prev)) scene.remove(prev);
            boundaryObjectsRef.current[key] = undefined; tagBoundary(key, undefined);
          });
          refreshBoundaryStatus();
          logBoundaryAttachmentDiagnostics(`overlay-removed:${payload}`);
        }
      }
    };

    globeEngine.on('overlayDataUpdated', handler);
    globeEngine.on('overlayRemoved', handler as unknown as (event: GlobeEvent) => void);

    // Attach existing cached objects once scene is available
    attachAllWhenSceneReady();

    return () => {
      disposed = true;
      const scene = getScene();
      ['spaceWeatherMagnetopause', 'spaceWeatherBowShock', 'spaceWeatherAuroraLinesNorth', 'spaceWeatherAuroraLinesSouth', 'spaceWeatherAuroraBlackout', 'spaceWeatherGeomagneticIndex'].forEach((key) => {
        const prev = boundaryObjectsRef.current[key];
        if (scene && prev && scene.children.includes(prev)) scene.remove(prev);
        boundaryObjectsRef.current[key] = undefined; tagBoundary(key, undefined);
      });
      refreshBoundaryStatus();
    };
  }, [globeEngine, logBoundaryAttachmentDiagnostics, refreshBoundaryStatus, solarDirection]);

  // Scripted camera snapshots (?geoSnap=) — extracted to useGlobeDebugTools.ts.
  useGlobeSnapshotTool(globeRef, containerRef, snapDoneRef, updateNationalTerritories, geoPoliticalConfig);

  // Fly the camera to a location requested from elsewhere in the app (e.g. the
  // "View on Globe" action on an intel report) via GlobeContext.
  //
  // Keyed on focusRequest, not focusLocation: this globe unmounts on every app
  // switch, so keying on the durable focus value re-flew the camera to a stale
  // target on every single return here. The request is consumed once and the
  // focus value is left alone for the widgets that still read it.
  useEffect(() => {
    if (!focusRequest || isInitializing || !globeRef.current) return;
    const g = globeRef.current as unknown as GlobeMethods;
    setGlobePointOfView(g, { lat: focusRequest.lat, lng: focusRequest.lng, altitude: focusAltitude(focusRequest) }, SHOW_ON_GLOBE_MOVE.transitionMs);
    consumeFocusRequest();
  }, [focusRequest, isInitializing, consumeFocusRequest]);

  // Debug prime-meridian/equator markers (?geoDebugOverlay=markers|audit) —
  // extracted to useGlobeDebugTools.ts.
  useGlobeDebugMarkers(globeRef, isInitializing, primeMeridianMarkerRef);

  // Merge analysis markers into the point set. Keyed by type so a recompute
  // replaces the previous analysis layer wholesale rather than accumulating
  // stale conclusions alongside current ones.
  //
  // Gated on the SAME layer as intel reports. Analysis of intel belongs where
  // intel is shown: ungated, corroboration and contradiction marks rendered on
  // top of Space Weather or submarine cables, where they read as part of THAT
  // layer — a correlation finding indistinguishable from a geomagnetic reading.
  // The report path has always checked isLayerActive('IntelReports'); this one
  // never did, which was invisible only because the layer is behind a flag that
  // has never been on.
  const intelLayerActive = isLayerActive('IntelReports');

  /*
   * The shapes reports were published as, drawn beside their pins.
   *
   * A line or a polygon has always been reduced to one coordinate; D-F 17 put
   * that coordinate in the right place and the shape was still thrown away.
   * The report now carries a bounded outline and this draws it. The pin is
   * unchanged and still does the placing — see useGlobeIntelOutlines.
   */
  useGlobeIntelOutlines(globeRef, intelReports, intelLayerActive);

  /*
   * How much of the network, the work and the planet this node can see.
   *
   * Beside the intel status rather than inside it: that panel describes THIS
   * GLOBE's layers, and coverage describes the whole corpus, including axes
   * with nothing to do with the map.
   */
  const coverageAxes = useCoverage();

  /*
   * Reports whose subject is a territory rather than a point, drawn as that
   * territory's boundary. They carry no coordinate by design — the publisher
   * named a jurisdiction, not a place — so nothing else on this globe can show
   * them at all.
   */
  const territories = useTerritories();
  /*
   * War & Conflict's notes carry `t=starcom_intel` too. While that layer is on it
   * draws them, and Intel Reports leaves them out, so each is drawn once (WC2).
   */
  // Its own section, or over any mode from the right rail's overlay toggle (owner, 1 Nov).
  const warConflictOverlay = useWarConflictOverlay();
  const warConflictOn = isLayerActive('WarConflict') || warConflictOverlay;
  // The brief's day (null, the newest) and the theatre picked in it, which the layer lights up (WC3).
  const [briefDay, setBriefDay] = useState<string | null>(null);
  const [briefTheatre, setBriefTheatre] = useState<string | null>(null);
  /*
   * A card's own lens (theatre-lens.md, TL3, TL15), over the person's pick while a card
   * is made: none, one theatre, or a front page's four. Null: the person's pick shows.
   */
  const [cardLens, setCardLens] = useState<readonly string[] | null>(null);
  const lensTheatres = useMemo(() => cardLens ?? (briefTheatre ? [briefTheatre] : []), [cardLens, briefTheatre]);
  /*
   * Stepping the brief's day shows that day on the globe too (theatre-lens.md, TL4):
   * a past UTC day as the window, the newest (null) live. Before, the panel read a
   * past day's brief beside today's marks.
   */
  const chooseBriefDay = useCallback((day: string | null) => {
    setBriefDay(day);
    if (!temporalState) return;
    const window = day === null ? null : briefDayWindow(day);
    if (window) temporalState.setTimeWindow(window.start, window.end);
    else temporalState.setIsLive(true);
  }, [temporalState]);
  const everyTerritorySubject = useRegionSubjectReports();
  // The big-three lens choice holds for reports about a territory too (D-CT, CT5).
  const lensKey = readLensChoice(cyberCommandConfig.intelReports.lenses).join(',');
  const territorySubjects = useMemo(() => {
    const lenses = readLensChoice(lensKey ? lensKey.split(',') : []);
    return everyTerritorySubject.filter((r) => (!warConflictOn || !isWarConflictNote(r.hashtags)) && passesLensChoice(r.hashtags, lenses));
  }, [warConflictOn, everyTerritorySubject, lensKey]);
  // The report chosen to feature (featuredReportStore), read here: a report about a
  // territory is featured as its territory, its outline lit (BA3).
  const featuredReportId = useFeaturedReportId();
  const regionMarks = useGlobeRegionMarks(globeRef, territorySubjects, territories, intelLayerActive, featuredReportId);

  // A first visit's reports arrive after load, far from where the globe faces: turn to
  // them until the person moves it (decision D-F, step 1). See useTurnToFirstIntel.
  /*
   * Set when the share handle chooses the view, so the first-visit turn below
   * does not override a pose an agent asked for. See useTurnToFirstIntel.
   */
  const viewChosenRef = useRef(false);
  useTurnToFirstIntel({
    globeRef: globeRef as unknown as Parameters<typeof useTurnToFirstIntel>[0]['globeRef'],
    ready: !isInitializing && intelLayerActive,
    reports: intelReports,
    showingRecord: shownRecord.status !== 'none',
    viewChosenRef,
  });
  // The support ask waits until the person has used the globe (decision D-F, step 3).
  useMarkGlobeEngaged({
    globeRef: globeRef as unknown as Parameters<typeof useMarkGlobeEngaged>[0]['globeRef'],
    ready: !isInitializing,
  });
  const networkReportCount = useMemo(
    () => intelReports.filter((report) => report.tags?.includes('nostr')).length,
    [intelReports],
  );
  useGlobeIntelMarkPoints({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    markers: intelMarkers,
    layerActive: intelLayerActive,
    markerStyles,
  });

  // Add Intel Report 3D markers to the Globe scene - respect visualization mode
  useEffect(() => {
    if (!globeRef.current) return;

    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const intelGroup = intelMarkerGroupRef.current;

    if (scene && intelGroup) {
      const isIntelLikeMode = isLayerActive('IntelReports') || isLayerActive('RLSH');
      const intelLikeCount = isLayerActive('RLSH')
        ? rlshPlaceholderReports.length
        : intelReports.length;

      // Only add to scene if we're in the correct visualization mode and have reports
      if (isIntelLikeMode &&
          intelLikeCount > 0 &&
          !scene.children.includes(intelGroup)) {
        scene.add(intelGroup);
        if (process.env.NODE_ENV === 'development') {
          log.debug('Intel-like 3D marker group added to Globe scene');
        }
      } else if (scene.children.includes(intelGroup)) {
        // Remove from scene if mode changed or no reports
        scene.remove(intelGroup);
        if (process.env.NODE_ENV === 'development') {
          log.debug('Intel-like 3D marker group removed from Globe scene');
        }
      }
    }
  }, [globeRef, intelReports, rlshPlaceholderReports.length, visualizationMode.mode, visualizationMode.subMode, isLayerActive]);

  useEffect(() => {
    return () => {
      const globeObj = globeRef.current as unknown as { scene?: () => THREE.Scene } | undefined;
      const scene = globeObj?.scene?.();
      const intelGroup = intelMarkerGroupRef.current;
      if (scene && intelGroup && scene.children.includes(intelGroup)) {
        scene.remove(intelGroup);
      }
    };
  }, []);

  /**
   * Every ACTIVE intel-like layer, not the first one that has data.
   *
   * This was an exclusive chain: if IntelReports was active and non-empty it
   * returned intel and stopped, so RLSH never reached the globe. Which defeated
   * the whole point of useGlobeLayerControl — its header says it exists so an
   * operator can PIN a layer and keep it visible across mode switches, and
   * every DATA renderer honours pins. This selector quietly undid that for the
   * two layers that share one marker pipeline: a pinned RLSH layer was not
   * merely un-clickable, it was never drawn.
   *
   * Safe to concatenate because markers carry their own `kind`: the glyph layer
   * draws a person for RLSH and a document for a report, and the interaction
   * layer tells them apart once they arrive together.
   *
   * The caps do NOT compose, which is the part worth stating. Intel allows 500
   * cached markers and RLSH 120 at high detail, so a naive concatenation could
   * put 620 marks on the globe — and 120 was the figure TUNED for the cost of
   * the 3D models that drew them then, not an arbitrary one. So the total is bounded
   * here, and a truncation says so rather than silently showing a subset: a
   * globe quietly displaying 300 of 620 markers is a map that lies about how
   * much it is showing.
   */
  const activeIntelLikeReports = useMemo(() => {
    const { reports, dropped, requested } = combineActiveIntelLikeReports(
      [
        { active: isLayerActive('IntelReports'), reports: warConflictOn ? intelReports.filter((r) => !isWarConflictNote(r.tags)) : intelReports },
        { active: isLayerActive('RLSH'), reports: rlshPlaceholderReports },
      ],
      COMBINED_MARKER_CEILING,
    );
    if (dropped > 0) {
      log.warn(
        `Globe is showing ${reports.length} of ${requested} intel-like markers — `
        + `the combined ceiling was reached and ${dropped} are NOT on the globe.`,
      );
    } else if (process.env.NODE_ENV === 'development' && reports.length > 0) {
      const kinds = reports.reduce<Record<string, number>>((acc, r) => {
        const k = r.kind ?? 'intel';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      log.debug(`Globe intel-like markers: ${reports.length} (${JSON.stringify(kinds)})`);
    }
    return reports;
  }, [intelReports, rlshPlaceholderReports, isLayerActive, warConflictOn]);

  /*
   * Raver Watch, Mecha Jono's safety notes for people at dance events (globe
   * record, section 19): read from The Record while one of its layers is on,
   * and each item drawn while it applies at the moment the timeline shows.
   * Its feeds join the others below, so the key and a card say what it drew;
   * its items join the handle's reports, and a featured one its card (v8).
   */
  const raverWatch = useGlobeRaverWatch({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: {
      DrugCheckAlerts: isLayerActive('DrugCheckAlerts'),
      SceneIncidents: isLayerActive('SceneIncidents'),
      SceneEvents: isLayerActive('SceneEvents'),
      HeatRisk: isLayerActive('HeatRisk'),
    },
    harmReductionSites: isLayerActive('HarmReductionSites'),
    territories,
    window: temporalState?.timeWindow
      ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
      : null,
    // The moment it is paused at, which flares and fades are measured from (RN5): never the end of the step around it.
    moment: temporalState && !temporalState.isLive ? temporalState.currentTime : null,
    featuredId: featuredReportId,
  });
  // Hero Watch (decision D-HW): who is responding, and where; its lifeboats, relief and field missions (steps 3-5).
  const heroWatch = useGlobeHeroWatch({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: {
      Lifeboats: isLayerActive('Lifeboats'), Relief: isLayerActive('Relief'), FieldMissions: isLayerActive('FieldMissions'),
      // Raver Watch's Raver missions: the harm-reduction field missions (HW8).
      RaverMissions: isLayerActive('RaverMissions'),
    },
    territories,
    window: temporalState?.timeWindow
      ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
      : null,
    moment: temporalState && !temporalState.isLive ? temporalState.currentTime : null,
    // The item a card is about, when it is a Hero Watch item (step 7).
    featuredId: featuredReportId,
  });
  // AI Watch (decision D-AW): Mecha Jono's Terminator Watch notes by area, at their point or country.
  const aiWatchActive = useMemo(() => ({
    AiIncidents: isLayerActive('AiIncidents'), AiFrontier: isLayerActive('AiFrontier'), AiWar: isLayerActive('AiWar'), AiSafety: isLayerActive('AiSafety'),
  }), [isLayerActive]);
  const aiWatch = useGlobeAiWatch({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: aiWatchActive,
    territories,
    window: temporalState?.timeWindow
      ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
      : null,
    moment: temporalState && !temporalState.isLive ? temporalState.currentTime : null,
  });
  // Side by side (D-PW, PW73): the Psi layers at now in the left half, at the cursor in the right (PsiSplitNow).
  const psiSplit = useSplit() && visualizationMode.mode === 'PsiWatch' && psiKitOn();
  // Planet lines (D-PW, step 4): the open sky event's bodies, at exact or at the cursor inside its window.
  useGlobePsiLines({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: isLayerActive('PsiLines'),
    cursorMs: temporalState?.currentTime ?? Date.now(),
    split: psiSplit ? 'cursor' : null,
  });
  // Psi Watch's places (D-PW, step 5, PW32–PW33, PW66): Psi Alerts and Tested places in violet, Windows in aqua.
  const psiZonesActive = useMemo(() => ({
    PsiRifts: isLayerActive('PsiRifts'), PsiWindows: isLayerActive('PsiWindows'), PsiZones: isLayerActive('PsiZones'),
  }), [isLayerActive]);
  useGlobePsiZones({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: psiZonesActive,
    cursorMs: temporalState?.currentTime ?? Date.now(),
    split: psiSplit ? 'cursor' : null,
  });
  // An Echo's events (D-PW, PW47, PW54, PW69): every return's gathering at once, in the look the Echoes card chose.
  useGlobePsiEchoes({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: visualizationMode.mode === 'PsiWatch',
  });
  // The Finder's place control (D-PW, PW61, PW70): the Zones filled by their resonance with a plate boundary.
  useGlobePsiFinder({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: visualizationMode.mode === 'PsiWatch',
  });
  // Calls (D-PW, PW40, PW72, PW76): the operative's own, a Zone's outline waiting faint, bright while its window is
  // open; a teammate's once revealed, lit inside its window.
  useGlobePsiCalls({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: visualizationMode.mode === 'PsiWatch',
    cursorMs: temporalState?.currentTime ?? Date.now(),
    split: psiSplit ? 'cursor' : null,
  });
  // Earth's magnetic shield (D-PW, PW7, PW58): IGRF-14 at the cursor's year, the South Atlantic Anomaly, the dip
  // equator, and both dip poles' tracks since 1900 with a bright dot where each stands.
  useGlobeMagneticShield({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: isLayerActive('MagneticShield'),
    cursorMs: temporalState?.currentTime ?? Date.now(),
    split: psiSplit ? 'cursor' : null,
  });
  // The ψ field (D-PW, PW57, PW78–PW80): the experiment's steady state at the cursor's minute, in the panel's looks.
  useGlobePsiModel({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: isLayerActive('PsiModel'),
    cursorMs: temporalState?.currentTime ?? Date.now(),
    split: psiSplit ? 'cursor' : null,
  });
  // The Timestream's observer, where its angles are cast (D-PW, PW43, PW65): a crosshair, dotted once pinned.
  useGlobePsiObserver({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: visualizationMode.mode === 'PsiWatch',
  });
  // Civil Unrest beside War & Conflict (D-CU): days of unrest by city and country, and protest surges apart (CU4).
  // One layer with two looks (critique-2026-11-01, OR5; plan B4): its rail turns the days, the surges and the tint
  // on or off; ProtestSurges, the handle's and the links' id, still shows the surges alone.
  const unrestChoices = useLayerChoices('CivilUnrest');
  const civilUnrestActive = useMemo(() => {
    const unrestOn = isLayerActive('CivilUnrest');
    return {
      CivilUnrest: unrestOn && layerChoice('CivilUnrest', 'unrest:events', true),
      ProtestSurges: isLayerActive('ProtestSurges') || (unrestOn && layerChoice('CivilUnrest', 'unrest:surges', true)),
    };
    // unrestChoices stands for the choices read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLayerActive, unrestChoices]);
  const unrestTint = useMemo(() => layerChoice('CivilUnrest', 'unrest:tint', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unrestChoices]);
  const civilUnrest = useGlobeCivilUnrest({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: civilUnrestActive,
    territories,
    window: temporalState?.timeWindow
      ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
      : null,
    moment: temporalState && !temporalState.isLive ? temporalState.currentTime : null,
    featuredId: featuredReportId,
    tint: unrestTint,
  });
  // Campaigns and Operations beside them (D-RS, RS25): each running or coming one at its places, a click opening it.
  const rosterOps = useGlobeRosterOps({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: isLayerActive('CampaignsOperations'),
    territories,
  });
  // Missions (decision D-MF, step 5): the missions open to take, at their places, the rest done from anywhere.
  const missionsMode = useGlobeMissions({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: isLayerActive('OpenMissions'),
    territories,
  });
  // Safety windows (decision D-RR, RR1): recurring nights' windows in a city, at the cursor; their calendar beside them.
  const safetyWindowsOn = isLayerActive('SafetyWindows');
  const safetyWindows = useSafetyWindows(safetyWindowsOn);
  useGlobeSafetyWindows({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: safetyWindowsOn,
    windows: safetyWindows.windows,
    cursorS: safetyWindows.cursorS,
  });
  /*
   * War & Conflict, Mecha Jono's parsed war news over the world's wars shaded by
   * tier (decisions WC1-WC4): read from The Record while its layer is on. Its
   * feeds join the others below, and its items the handle's reports (v10).
   */
  // What the second left rail chose to draw of War & Conflict (critique-2026-11-01, OR1; plan B1).
  const warChoices = useLayerChoices('WarConflict');
  const warShow = useMemo(() => ({
    items: layerChoice('WarConflict', 'war:items', true),
    arcs: layerChoice('WarConflict', 'war:arcs', true),
    deaths: layerChoice('WarConflict', 'war:deaths', true),
    map: layerChoice('WarConflict', 'war:map', true),
    // warChoices stands for the choices read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [warChoices]);
  const warConflict = useGlobeWarConflict({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: warConflictOn,
    territories,
    window: temporalState?.timeWindow
      ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
      : null,
    featuredId: featuredReportId,
    theatres: lensTheatres,
    // Given up first on a weak device, with the glow; every capture draws it (theatre-lens.md, TL5).
    hatching: qualityStep.hatching,
    show: warShow,
  });
  const warBrief = useMemo(() => warConflict.briefOf(briefDay ?? undefined), [warConflict, briefDay]);
  const shareBriefOf = useCallback((day?: string) => warConflict.briefOf(day, { capture: true }), [warConflict]);
  // Two layers side by side (D-CM, CM1): the frame drawn twice, each half without the other's layer.
  const comparing = comparison !== null;
  useEffect(() => {
    if (!comparing) return undefined;
    const globe = globeRef.current as unknown as { renderer?: () => THREE.WebGLRenderer; scene?: () => THREE.Scene } | null;
    const renderer = globe?.renderer?.();
    const scene = globe?.scene?.();
    return renderer && scene ? installComparison(renderer, scene) : undefined;
  }, [comparing]);
  const globeArcs = useMemo(() => [...intelArcs, ...warConflict.arcs], [intelArcs, warConflict.arcs]);
  // Each arc is an object of its own holding its datum (three-globe's arcs layer): a half hides the other layer's, found
  // as it is drawn, since the arcs layer makes them afresh whenever the arcs change.
  const arcsOfRef = useRef({ intel: new Set<object>(), war: new Set<object>() });
  arcsOfRef.current = { intel: new Set<object>(intelArcs), war: new Set<object>(warConflict.arcs) };
  useEffect(() => {
    const arcsWhere = (which: 'intel' | 'war') => (): THREE.Object3D[] => {
      const scene = (globeRef.current as unknown as { scene?: () => THREE.Scene } | null)?.scene?.();
      const found: THREE.Object3D[] = [];
      const set = arcsOfRef.current[which];
      if (!scene || !set.size) return found;
      scene.traverse((o) => {
        const arc = o as THREE.Object3D & { __globeObjType?: string; __data?: object };
        if (arc.__globeObjType === 'arc' && arc.__data && set.has(arc.__data)) found.push(arc);
      });
      return found;
    };
    const intel = registerLayerFinder('IntelReports', arcsWhere('intel'));
    const war = registerLayerFinder('WarConflict', arcsWhere('war'));
    return () => { intel(); war(); };
  }, []);
  const theatres = useMemo<TheatreLens>(() => ({
    facts: warConflict.theatreFacts, slugs: warConflict.theatreSlugs, lit: warConflict.theatreLit, lens: setCardLens,
  }), [warConflict]);
  const warBriefItems = useMemo(() => warConflict.itemsByIds(warBrief?.ids ?? []), [warConflict, warBrief]);
  /*
   * The brief's days on the timeline (theatre-lens.md, TL8), while War & Conflict is on:
   * a click there picks the day as the panel's arrows do, the newest going back to live (TL4).
   */
  useEffect(() => {
    const days = warConflict.briefDays;
    if (!warConflictOn || days.length === 0) {
      publishBriefCalendar(null);
      return undefined;
    }
    publishBriefCalendar({
      days: briefCalendarDays(days, warConflict.briefOf, (tier) => TIER_COLOR[tier]),
      chosen: briefDay ?? days[0],
      pick: (picked) => chooseBriefDay(picked === days[0] ? null : picked),
    });
    return () => publishBriefCalendar(null);
  }, [warConflictOn, warConflict, briefDay, chooseBriefDay]);
  // Each theatre's items a day up to the brief's day, for its chip's sparkline (theatre-lens.md, TL7).
  const warBriefSeries = useMemo(() => (warBrief ? warConflict.theatreDaysTo(warBrief.day) : undefined), [warConflict, warBrief]);
  /*
   * The Intel Report marks themselves: one batched sprite layer, four variants
   * by shape, colour and motion (decision D-F, step 6, part 4). This replaced
   * one GLB model per report — 182 triangles each, but a mesh, a raycast target
   * and a draw call each too.
   *
   * Called BEFORE the models on purpose: `ready` decides whether they still
   * render. If the atlas cannot bake, the models draw as they always did rather
   * than a report having no mark at all.
   */
  const intelSprites = useGlobeIntelSprites({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    enabled: activeIntelLikeReports.length > 0,
    reports: activeIntelLikeReports,
    animate: cyberCommandConfig.globalSettings.enableAnimations,
    hoveredReportId,
    markerStyles,
    featuredReportId,
    // A report about a territory, featured as its territory lit: the glyphs dim around it (BA3).
    featuredElsewhere: regionMarks.featured !== null,
    // Each glyph wears its category's emblem unless turned off, for the person or this page (BA14, BA15).
    categoryEmblems: glyphLook.emblems,
  });

  /*
   * What the interaction layer hovers, clicks and places popups over: the glyph
   * layer's marks, drawn as glyphs or, where no artwork could be baked, as plain
   * shapes. 3D models drew them in that case before; they were retired on 2026-10-08.
   */
  const interactiveIntelMarks = intelSprites.marks;


  /*
   * NOAA's geoelectric field (space-weather-visualization.md, SW1, SW2): every sample of both
   * models as a continuous colour field by strength, its direction as streaks drifting along it.
   * It replaces the 500 strongest samples drawn as dots, which showed no direction.
   */
  const eFieldDatasets = spaceWeatherSettings.enabledDatasets;
  // Both of NOAA's grids switched off in the settings (SW2): no field, rather than one the person turned off.
  const eFieldGridsOff = eFieldDatasets?.intermag === false && eFieldDatasets?.usCanada === false;
  const eFieldOn = isLayerActive('SpaceWeather') && spaceWeatherSettings.activeLayer === 'electricFields'
    && spaceWeatherSettings.showElectricFields && !eFieldGridsOff;
  useGlobeEField({
    globeRef,
    active: eFieldOn,
    loading: spaceWeatherLoading,
    interMag: interMagData,
    usCanada: usCanadaData,
    grids: eFieldDatasets?.intermag === false ? 'usCanada' : eFieldDatasets?.usCanada === false ? 'interMag' : 'both',
    look: spaceWeatherSettings.eFieldLook ?? 'streaks',
    scale: spaceWeatherSettings.eFieldScale ?? 'absolute',
    opacity: Math.min(Math.max((spaceWeatherSettings.vectorOpacity ?? 80) / 100, 0.1), 1),
    flowSpeed: spaceWeatherSettings.eFieldFlowSpeed ?? 1,
    flowDensity: spaceWeatherSettings.eFieldFlowDensity ?? 1,
  });

  /*
   * Earthquakes, wildfires, floods and the rest, on the same substrate and for the same
   * reason: as pointsData they were a median of 3 px² on a share card. The effect above
   * decides which events there are and how big each one is; this draws them.
   */
  // Eco Disasters' marks, as its rail chose (critique-2026-11-01, O7, OR2, OR29; plan B2): Dot keeps the screen
  // points and their colour modes; Icon, Pin (the default) and Spike are kind marks, with each quake's depth.
  const ecoMark = useMemo(() => layerChoice<string>('EcologicalDisasters', 'eco:mark', 'pin'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]) as 'icon' | 'dot' | 'pin' | 'spike';
  const ecoDepth = useMemo(() => layerChoice('EcologicalDisasters', 'eco:depth', true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]);
  // With pins, quakes coloured by magnitude or by depth (D-EQ, EQ5).
  const ecoColour = useMemo(() => layerChoice<string>('EcologicalDisasters', 'eco:colour', 'magnitude'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]) === 'depth' ? 'depth' : 'magnitude';
  // Only the quakes in the magnitudes and depths the rail chose (D-EQ, EQ6), on every style; the other hazards all.
  const ecoMagnitudes = useMemo(() => layerChoice<readonly string[]>('EcologicalDisasters', 'eco:magnitudes', QUAKE_MAGNITUDE_BANDS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]);
  const ecoDepths = useMemo(() => layerChoice<readonly string[]>('EcologicalDisasters', 'eco:depths', QUAKE_DEPTH_BANDS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ecoChoices]);
  // While the quakes replay with pins, the flags take every quake read and show each from its moment (EQ7); drawn any
  // other way, the quakes are those of the window the bar has reached, cut from the play's read, never read again.
  const replayCutFrom = quakesReplaying && ecoMark !== 'pin' ? pausedWindowStart : null;
  const replayCutUntil = quakesReplaying && ecoMark !== 'pin' ? pausedWindowEnd : null;
  const ecoShownEvents = useMemo(() => ecoMarkEvents.filter((e) => {
    if ((e.hazardType ?? 'earthquake') !== 'earthquake') return true;
    if (!quakeInBands(e.magnitude, e.depthKm, ecoMagnitudes, ecoDepths)) return false;
    if (replayCutFrom === null || replayCutUntil === null) return true;
    const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
    return Number.isFinite(t) && t >= replayCutFrom && t <= replayCutUntil;
  }), [ecoMarkEvents, ecoMagnitudes, ecoDepths, replayCutFrom, replayCutUntil]);
  const quakeBandsWords = useMemo(() => [
    bandsChosenWords(ecoMagnitudes, DATA_SCALES.quakeMagnitude),
    bandsChosenWords(ecoDepths, DATA_SCALES.quakeDepthKm, ' km'),
  ], [ecoMagnitudes, ecoDepths]);
  const ecoKindEvents = useMemo(() => ecoShownEvents.map((e) => ({ ...e, id: e.id ?? `${e.lat},${e.lng}`, hazardType: e.hazardType ?? 'earthquake' })), [ecoShownEvents]);
  useGlobeEcoKindMarks({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: ecoDisastersEnabled && ecoMark !== 'dot',
    events: ecoKindEvents,
    style: ecoMark === 'dot' ? 'pin' : ecoMark,
    depth: ecoDepth,
    colourBy: ecoColour,
    bandsWords: quakeBandsWords,
    replay: ecoMark !== 'pin' ? null
      : clipQuakeReplay ? { ...clipQuakeReplay, by: 'clip' as const }
        : quakesReplaying ? { decayS: replayDecayS, msPerSecond: playShape.playing ? playShape.msPerSecond : 0 } : null,
    windowWords: windowQuakes.window
      ? `${quakeWindowWords(windowQuakes.window)}${windowQuakes.window.feed === 'history' ? '' : `, from USGS${windowQuakes.emscRead ? ' and EMSC' : ''}`}`
      : null,
  });
  // The quakes at the comparison's other moment (D-CM, CM4): a copy of their own, drawn in their half.
  const thenQuakeEvents = useMemo(
    () => (thenQuakes.quakes ? quakeKindInputs(thenQuakes.quakes, { magnitudes: ecoMagnitudes, depths: ecoDepths }) : NO_QUAKE_INPUTS),
    [thenQuakes.quakes, ecoMagnitudes, ecoDepths],
  );
  useGlobeEcoKindMarks({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    active: ecoDisastersEnabled && ecoMark === 'pin' && thenQuakeWindowShown !== null,
    events: thenQuakeEvents,
    style: 'pin',
    depth: false,
    colourBy: ecoColour,
    bandsWords: quakeBandsWords,
    instance: 'then',
  });
  // Pings on new strong quakes, whenever the globe is open (D-EQ, EQ9, EQ19, EQ20): a ping's own flag where Eco
  // Disasters draws none for it.
  const drawnQuakeIds = useMemo(() => new Set(ecoDisastersEnabled && ecoMark === 'pin'
    ? ecoKindEvents.filter((e) => e.hazardType === 'earthquake').map((e) => String(e.id))
    : []), [ecoDisastersEnabled, ecoMark, ecoKindEvents]);
  const replayedQuakeTimes = useMemo(() => (ecoDisastersEnabled && ecoMark === 'pin'
    ? ecoKindEvents.filter((e) => e.hazardType === 'earthquake').map((e) => (e.timestamp ? Date.parse(e.timestamp) : NaN)).filter(Number.isFinite)
    : []), [ecoDisastersEnabled, ecoMark, ecoKindEvents]);
  useGlobeQuakePings({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    drawnQuakeIds,
  });
  // What lands in a watched place (D-WL): read while the watches count it, drawn and told as the quake pings are.
  useGlobeWatchPings({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    drawnQuakeIds,
  });
  useGlobeEcoDisasterMarks({
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    enabled: ecoDisastersEnabled && ecoMark === 'dot',
    events: ecoShownEvents,
    colorMeans: ecoSettings.ecologicalDisasters.colorMode === 'hazardType' ? 'hazard type' : 'severity',
    markerStyles,
  });

  // Initialize CyberThreats 3D visualization (real attack indicators + layers)
  const cyberAttacks = useCyberAttacks3D(
    isLayerActive('CyberThreats'),
    globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    {
      globeRadius: 100,
      // A re-check, not a stream: the indicators are a snapshot built with the deploy,
      // re-read every 30 minutes (RealBlocklistService). This was 2 seconds.
      updateInterval: 60_000,
      debugMode: process.env.NODE_ENV === 'development',
      layerTypes: cyberCommandConfig.cyberThreats.layerTypes,
      markerStyles
    }
  );

  // The globe's own canvas, for layers that measure the pointer against it. Not the
  // page's first canvas, which is TinyGlobe's inset.
  const globeCanvas = useCallback((): HTMLCanvasElement | null => globeRef.current?.renderer()?.domElement ?? null, []);

  // Initialize CommHubs 3D visualization (real submarine cable infrastructure)
  const commHubs = useCommHubs3D(
    isLayerActive('CommHubs'),
    globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    {
      globeRadius: 100,
      debugMode: process.env.NODE_ENV === 'development',
      layerTypes: cyberCommandConfig.commHubs.layerTypes,
      getCanvas: globeCanvas,
      markerStyles,
      showPlannedCables: cyberCommandConfig.commHubs.showPlannedCables,
      // Historical cable-growth playback: only filter when the operator is actively
      // scrubbing (isLive === false) — same "no context = show everything" default the
      // IntelReports temporal filter above already uses for temporalState?.timeWindow.
      historicalYearCutoff: temporalState && !temporalState.isLive
        ? new Date(temporalState.currentTime).getFullYear()
        : null
    }
  );

  useEffect(() => {
    if (commHubs.error) log.error('📡 CommHubs Hook Error:', commHubs.error);
  }, [commHubs.error]);

  // NOTE: this file previously wired up useGlobe3DInputManager here — a 6-mode
  // (Navigation/Intel Creation/Intel Inspection/Measurement/Annotation/Simulation)
  // input system with global n/i/e/m/a/s keyboard shortcuts and no on-screen mode
  // indicator. Removed because: Intel Creation/Inspection duplicated the already-real
  // Enhanced3DGlobeInteractivity hover/click handling and the context menu's working
  // "Create Intel Report" action; Annotation only ever called a native prompt() whose
  // result was discarded (onAnnotationCreate was never supplied); Measurement had no
  // actual distance/visual-line implementation ("Implement measurement logic here");
  // Simulation had no defined behavior at all. Net effect in production was silently
  // hijacking single-letter keystrokes for modes that mostly did nothing. The
  // underlying system (systems/interaction/{Globe3DInputManager,InteractionModeSystem,
  // AdvancedInputSystem}.ts) and its unmounted UI (components/ui/InteractionModeSelector)
  // are left in place, not deleted, in case Measurement is worth building out for real
  // later — but none of it should run silently in production half-finished.

  // Derive loading state from the active 3D hooks
  const cyberDataLoading = cyberAttacks.isLoading;

  useEffect(() => {
    if (cyberAttacks.error) log.error('⚡ CyberAttacks Hook Error:', cyberAttacks.error);
  }, [cyberAttacks.error]);

  // GeoPolitical settings (declared earlier for dev geoSnap too)
  /*
   * ─── TWO SWITCHES, ONE RENDERER ───────────────────────────────────────────
   *
   * Each GeoPolitical renderer was driven ONLY by its overlay toggle in the
   * Geopolitical Layers popup, which defaults off. The layer switch — picking
   * Diplomacy, Resources or Conflict Zones as the mode, or pinning one — drove
   * nothing at all: nothing anywhere read isLayerActive for these three. So a
   * person who chose Conflict Zones got a globe with no conflict on it, and no
   * word of why. The catalog papered over two of them as "not implemented";
   * both renderers exist and draw real data.
   *
   * Either switch now turns a layer on. The overlay toggle keeps its own
   * meaning — on regardless of mode — and the layer switch gains one.
   */
  const conflictZonesOn = conflictZonesOverlayEnabled || isLayerActive('ConflictZones');
  const diplomaticEventsOn = diplomaticEventsOverlayEnabled || isLayerActive('DiplomaticEvents');
  const resourceZonesOn = resourceZonesOverlayEnabled || isLayerActive('ResourceZones');
  const countryInfoOverlay = useCountryInfoOverlay({ resourceZonesOn, diplomaticEventsOn });
  const nationalTerritories = useNationalTerritories3D({
    enabled: nationalTerritoriesOverlayEnabled,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    camera: globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    config: geoPoliticalConfig.nationalTerritories,
    // Every style's look, so a card can be drawn in its shot's style (decision K5).
    looks: territoryLooks,
    solarDirection,
    onHoverChange: countryInfoOverlay.onHoverChange,
    onSelectChange: countryInfoOverlay.onSelectChange,
    getCanvas: globeCanvas
  });
  useEffect(() => {
    if (nationalTerritories.error) log.error('NationalTerritories error:', nationalTerritories.error);
    setLayerError('nationalTerritories', nationalTerritories.error ?? null);
  }, [nationalTerritories.error, setLayerError]);
  const resourceZones = useResourceZones3D({
    enabled: resourceZonesOn,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    config: geoPoliticalConfig.resourceZones
  });
  useEffect(() => {
    if (resourceZones.error) log.error('ResourceZones error:', resourceZones.error);
    setLayerError('resourceZones', resourceZones.error ?? null);
  }, [resourceZones.error, setLayerError]);
  const diplomaticEvents = useDiplomaticEvents3D({
    enabled: diplomaticEventsOn,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    config: geoPoliticalConfig.diplomaticEvents,
    markerStyles,
    camera: globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    getCanvas: globeCanvas
  });
  useEffect(() => {
    if (diplomaticEvents.error) log.error('DiplomaticEvents error:', diplomaticEvents.error);
    setLayerError('diplomaticEvents', diplomaticEvents.error ?? null);
  }, [diplomaticEvents.error, setLayerError]);
  // After every layer that takes a mark style has restyled in its own effects: a shot frames once this says so.
  useEffect(() => { noteMarkStyleDrawn(cardMarks); }, [markerStyles, cardMarks]);
  // The rail's view and mark for Conflict Zones (critique-2026-11-01, O12, OR2; plan B1).
  useLayerChoices('ConflictZones');
  const conflictView = layerChoice<string>('ConflictZones', 'conflict:view', 'events') === 'countries' ? 'countries' as const : 'events' as const;
  const conflictMark = layerChoice<string>('ConflictZones', 'conflict:mark', 'icon') as 'icon' | 'dot' | 'pin' | 'spike';
  const conflictZones = useConflictZones3D({
    enabled: conflictZonesOn,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    config: geoPoliticalConfig.conflictZones,
    view: conflictView,
    markStyle: conflictMark,
  });
  useEffect(() => {
    if (conflictZones.error) log.error('ConflictZones error:', conflictZones.error);
    setLayerError('conflictZones', conflictZones.error ?? null);
  }, [conflictZones.error, setLayerError]);
  // Zones, with Sectors inside the Zones (ZSP 1.0), on their own switch in the rail.
  const zonesOn = useZonesValue((s) => s.on);
  const zones = useZones3D({
    enabled: zonesOn,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    camera: globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    getCanvas: globeCanvas,
    solarDirection,
    simpleSectorLines: qualityStep.simpleSectorLines,
  });
  useEffect(() => {
    if (zones.error) log.error('Zones error:', zones.error);
    setLayerError('zones', zones.error ?? null);
  }, [zones.error, setLayerError]);
  // Spheres of language and influence (areaRegistry.ts, kind "sphere"), on their own switch in the rail.
  const spheresOn = useSpheresValue((s) => s.on);
  const spheres = useSpheres3D({
    enabled: spheresOn,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    camera: globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    getCanvas: globeCanvas,
    solarDirection
  });
  useEffect(() => {
    if (spheres.error) log.error('Spheres error:', spheres.error);
    setLayerError('spheres', spheres.error ?? null);
  }, [spheres.error, setLayerError]);
  // One Organisation at a time, its members filled (D-ZR, ZR10), chosen in the rail's picker.
  const organisationsOn = useOrganisationsValue((s) => s.on);
  const organisationShown = useOrganisationsValue((s) => s.shown);
  const organisations = useOrganisations3D({
    enabled: organisationsOn,
    code: organisationShown,
    scene: globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null,
    camera: globeRef.current ? (globeRef.current as unknown as { camera: () => THREE.Camera }).camera() : null,
    getCanvas: globeCanvas,
    solarDirection
  });
  useEffect(() => {
    if (organisations.error) log.error('Organisations error:', organisations.error);
    setLayerError('organisations', organisations.error ?? null);
  }, [organisations.error, setLayerError]);

  /*
   * ─── WHAT THE SHARE CARD IS ALLOWED TO SAY ABOUT THE DATA ────────────────
   *
   * A feed appears here ONLY while its layer is active, and that is a rule
   * rather than an optimisation.
   *
   * The caveats exist to stop a viewer over-reading an absence. "NOAA was
   * unreachable — nothing from it appears here, and that is not an all-clear"
   * is true and worth saying when space weather is meant to be on screen. With
   * the layer off, nothing from NOAA is missing from the image: it was never
   * asked for. Saying it was unreachable would invent a gap the picture does
   * not have, and a card that discloses imaginary gaps teaches a reader to
   * skim the real ones.
   *
   * ─── EVERY ACTIVE LAYER, NOT TWO ─────────────────────────────────────────
   *
   * This covered two feeds, NOAA and GDACS, because those were the two the
   * globe held fetch state for. Every other layer's sources were simply
   * absent from the card — so when CelesTrak's certificate expired on
   * 2026-04-12 and the Satellites layer drew nothing for five months, its card
   * said "Layers shown: Satellites" and not one word about the data never
   * arriving. Silence about a source read as a clean source.
   *
   * Now each active layer contributes what its own hook reports:
   *
   *   reports error, loading and a time   the full treatment
   *   reports error but no time           `timestamped: false` — a working
   *                                       layer is not captioned "never loaded"
   *   reports nothing usable              `unreported` — the card says it
   *                                       cannot tell empty from failed
   *
   * The last is the honest default for a layer whose hook exposes nothing, and
   * it is meant to be uncomfortable: each one is a layer whose pass should
   * give it a real health report.
   *
   * The GeoPolitical entries are keyed on the same flag their RENDERER runs
   * on (overlay toggle OR layer switch — see conflictZonesOn): reporting the
   * health of a renderer that is not running would describe a layer the
   * picture does not contain, and omitting one that is would hide it.
   *
   * Intel reports are still absent: the pipeline reports what it hid and why
   * (the reduction notice below) but carries no time, and the analysis marks
   * it feeds are disclosed separately by MarkProvenance.
   */
  const intelReportsFeed = useIntelReportsFeed(isLayerActive('IntelReports'));
  const shareFeeds = useMemo<FeedProvenance[]>(() => {
    const feeds: FeedProvenance[] = [];
    // Each feed under the layer it feeds (decision D-LS): what the loading status reads it by. A block says
    // its layer as it starts; the Watch, Missions and War & Conflict hooks tag their own.
    const ranges: Array<[number, string]> = [];
    const under = (layer: string) => { ranges.push([feeds.length, layer]); };
    // Intel Reports, read from the relays: how many have answered (D-LS, LS6).
    if (intelReportsFeed) feeds.push(intelReportsFeed);
    // Space Weather's sources, and the notes that say what is drawn from them (spaceWeatherFeeds.ts, SW11).
    if (isLayerActive('SpaceWeather')) {
      under('SpaceWeather');
      feeds.push(...spaceWeatherFeeds({
        noaa: { lastUpdated: spaceWeatherLastUpdated ? spaceWeatherLastUpdated.toISOString() : null, error: spaceWeatherError ?? null, loading: spaceWeatherLoading },
        eField: { on: eFieldOn, look: spaceWeatherSettings.eFieldLook ?? 'streaks' },
        aurora: { on: auroraOn, drawn: aurora.drawn, observed: aurora.observed, error: aurora.error, loading: aurora.loading, curtain: auroraCurtain, kpStandsIn: kpAuroraStandsIn },
        fieldLines: { on: fieldLinesOn, drawn: fieldLines.drawn, reading: fieldLines.reading, error: fieldLines.error, loading: fieldLines.loading },
        vanAllen: { on: vanAllenOn, drawn: vanAllen.drawn, electrons: vanAllen.electrons, error: vanAllen.error, loading: vanAllen.loading },
        cusps: { on: cuspsOn, drawn: cusps.drawn, reading: fieldLines.reading },
        tailSheet: { on: tailSheetOn, drawn: tailSheet.drawn },
        nearEarthFlow: { on: nearEarthFlowOn, drawn: nearEarthFlow.drawn, reading: fieldLines.reading },
        heliosphere: { on: heliosphereOn, drawn: heliosphere.drawn, moment: heliosphere.moment, lastArrival: heliosphere.lastArrival, error: heliosphere.error, loading: heliosphere.loading },
        enlil: { on: enlilOn, drawn: enlil.drawn, at: enlil.at, quantity: enlilQuantity, forecast: enlil.forecast, error: enlil.error, loading: enlil.loading },
        cmes: { on: cmesOn, drawn: cmes.drawn, at: cmes.at, inFlight: cmes.inFlight, error: cmes.error, loading: cmes.loading },
        boundaries: { on: boundaryMomentOn && sunPausedAt !== null, wind: boundaryMoment.wind, error: boundaryMoment.error, loading: boundaryMoment.loading },
      }));
    }
    if (isLayerActive('EcologicalDisasters')) {
      under('EcologicalDisasters');
      feeds.push({
        name: 'GDACS disaster events',
        lastUpdated: ecoEventsLastUpdated ? new Date(ecoEventsLastUpdated).toISOString() : null,
        error: ecoEventsError ? ecoEventsError.message : null,
        /*
         * Loading until the fetch has SETTLED, whatever the flag says.
         *
         * useGeoEvents can report loading: false for data that has not
         * arrived. An in-flight fetch that is aborted returns early from its
         * catch, and its `finally` still clears `loading` — leaving status
         * stuck at 'loading' with nothing loaded. This card read that as
         * "had never loaded", a failure, when the fetch had simply not landed:
         * measured, it completes ~30 s after the globe is capturable. Until
         * status is 'success' or 'error', the accurate caption is that the
         * image may predate its first data. The hook's own inconsistency is
         * for the Eco Disasters pass.
         */
        loading: ecoEventsLoading || (ecoEventsStatus !== 'success' && ecoEventsStatus !== 'error'),
        // The layer merges three sources (GeoEventsService): earthquakes, GDACS's hazards, NASA's events; and PB2002
        // while the plate boundaries are drawn beside the quakes (D-EQ, EQ8).
        credits: [
          CREDITS.usgs, ...(windowQuakes.emscRead && windowQuakes.quakes?.length ? [CREDITS.emsc] : []),
          ...(windowQuakes.atlasCount > 0 ? [CREDITS.ncei] : []),
          CREDITS.gdacs, CREDITS.nasaEonet, ...(quakePlates.drawn ? [CREDITS.pb2002] : []),
          // The Smithsonian's volcanoes, drawn as context under the eruptions whenever they are shown.
          ...(ecoVolcanoes && sourceAllowed('gvp') ? [CREDITS.gvp] : []),
        ],
      });
    }
    if (isLayerActive('Satellites')) {
      under('Satellites');
      feeds.push({
        name: 'CelesTrak satellite catalogue',
        // When CelesTrak served the elements (step 13 kept this); the note says
        // the positions drawn from them are predicted, not observed.
        lastUpdated: satellites.lastLoadedAt ? new Date(satellites.lastLoadedAt).toISOString() : null,
        error: satellites.error,
        loading: satellites.loading,
        note: SATELLITE_PREDICTED_NOTE,
        credits: [CREDITS.celestrak],
      });
    }
    if (isLayerActive('CyberThreats')) {
      under('CyberThreats');
      /*
       * From the threat snapshot built with the deploy (see threatSnapshot.ts), dated by
       * its OLDEST list — a merge of lists of different ages is as old as its oldest
       * part. This used the hook's fetch time, which called a merge of lists up to 21
       * months old "just updated". The name says the map is a sample, and of how many:
       * a picture of 150 addresses reads as the whole unless it says otherwise.
       */
      const health = cyberAttacks.attacks.length > 0 ? getLastFetchHealth() : null;
      feeds.push({
        name: health
          ? `Threat blocklists (${cyberAttacks.attacks.length} of ${formatCount(health.listedIps)} listed IPs, sampled evenly)`
          : 'Threat blocklists',
        lastUpdated: health ? health.asOf.toISOString() : null,
        error: cyberAttacks.error,
        loading: cyberAttacks.isLoading,
        // The lists the snapshot drew from: a list that failed has its own line below, and no credit.
        credits: health
          ? [
            ...threatListCredits(THREAT_SOURCES.filter((list) => !health.failedSources.some((f) => f.startsWith(`${list.label} — `)))),
            ...(cyberAttacks.otxDrawn ? [CREDITS.otx] : []),
            ...(cyberAttacks.mitreDrawn ? [CREDITS.mitreAttack] : []),
          ]
          : [],
      });
      // A list the build did not draw from, and why — stale, undated or unreachable.
      for (const notDrawn of health?.failedSources ?? []) {
        const [label, ...why] = notDrawn.split(' — ');
        feeds.push({ name: label, lastUpdated: null, error: why.join(' — ') || 'not drawn' });
      }
    }
    if (isLayerActive('CommHubs')) {
      under('CommHubs');
      /*
       * Not fetchedAt as the data's time (D-F step 12). The map is a community
       * snapshot on GitHub (SubmarineCableService's BASE_URL) and says nothing
       * about when it was made: no Last-Modified header, no date in the data —
       * checked 2026-09-19. Stamping the fetch made a snapshot of unknown age
       * read "0m ago". Once it has loaded it is untimed — "the source does not
       * say when" — which is the true statement; before that, it has not loaded.
       */
      feeds.push({
        name: 'Submarine cable map',
        credits: [CREDITS.cables],
        note: CABLE_SNAPSHOT_NOTE,
        noteShort: 'TeleGeography\'s cable map as of late 2022; later cables are missing.',
        lastUpdated: null,
        timestamped: commHubs.fetchedAt === null,
        error: commHubs.error,
        loading: commHubs.isLoading
      });
    }
    if (isLayerActive('RLSH')) {
      under('RLSH');
      /*
       * This was `unreported` — useGlobeRLSH returned only { reports, loading },
       * swallowed its failures, and "could not tell empty from failed". It
       * reports now (D-F step 12), and its time is when the drawn records were
       * VERIFIED, not when the app read them. The profiles are the heroes' own,
       * submitted through NavCom; Starcom ships and fetches no scraped data (RS49).
       *
       * Feed names are singular nouns: a card prints them into sentences such as
       * "<name> was last updated 7h before this capture" (shareCardProvenance.ts).
       */
      feeds.push({
        name: 'RLSH profile list, as heroes submit it through NavCom',
        lastUpdated: rlsh.lastLoadedAt ? new Date(rlsh.lastLoadedAt).toISOString() : null,
        error: rlsh.error,
        loading: rlsh.loading,
        timestamped: !rlsh.untimed,
      });
    }
    if (isLayerActive('EarthWeather')) {
      under('EarthWeather');
      /*
       * This was `unreported: true` — "useGlobeEarthWeather returns only its
       * group". It fetches the weather itself and now says when it was OBSERVED
       * (the source's clock, not the fetch), so the card and the key can state
       * its age like any other source (D-F step 11).
       */
      feeds.push({
        name: 'Open-Meteo weather',
        // With the sea ice it draws from NASA's events.
        credits: [CREDITS.openMeteo, CREDITS.nasaEonet],
        lastUpdated: earthWeather.lastLoadedAt ? new Date(earthWeather.lastLoadedAt).toISOString() : null,
        error: earthWeather.error,
        loading: earthWeather.loading,
        timestamped: !earthWeather.untimed,
      });
      // The gauges, when drawn: each network credited, with when it last reported (record D-L).
      if (ecoSettings.earthWeather.weatherLayers.waterGauges) feeds.push(...waterGaugeFeeds(waterGauges.tide, waterGauges.rivers));
    }
    /*
     * The heat map's source, by the hour the model's values hold for (its event
     * time, decision D-E), with the credit NOAA asks for (D-W, WX5).
     */
    if (heatMapOn) {
      under('EarthWeather');
      feeds.push({
        name: heatMap.field?.source === 'pacioos'
          ? 'NOAA GFS temperature, via PacIOOS ERDDAP'
          : 'NOAA GFS temperature, via NOAA Open Data Dissemination',
        shortName: 'NOAA GFS',
        credits: [heatMap.field?.source === 'pacioos' ? CREDITS.noaaGfsPacioos : CREDITS.noaaGfs],
        // The moment drawn: a blend of the model's two steps around it (WX10).
        lastUpdated: heatMap.field ? heatMap.field.at.toISOString() : null,
        error: heatMap.error,
        loading: heatMap.loading,
        note: 'Temperature is a weather model\'s value for each 1° cell, about 110 km across, at the hour stated. It is not a station\'s reading.',
        noteShort: 'A weather model\'s value per 1° cell, not a station reading.',
      });
    }
    if (rainOn) {
      under('EarthWeather');
      // Two sources, each with its own time and credit: the model everywhere, radar where it reaches.
      feeds.push({
        name: rain.model?.source === 'pacioos'
          ? 'NOAA GFS mean rain, via PacIOOS ERDDAP'
          : 'NOAA GFS mean rain, via NOAA Open Data Dissemination',
        shortName: 'NOAA GFS rain',
        credits: [rain.model?.source === 'pacioos' ? CREDITS.noaaGfsPacioos : CREDITS.noaaGfs],
        lastUpdated: rain.model ? rain.model.at.toISOString() : null,
        error: rain.error,
        loading: rain.loading,
        note: rain.radarNotForMoment ? RAIN_MODEL_NOTE : RAIN_NOTE,
        noteShort: rain.radarNotForMoment ? RAIN_MODEL_NOTE_SHORT : RAIN_NOTE_SHORT,
      });
      // Radar is a source only when it may be drawn: at a moment far from its newest frame the model's note says why it is not.
      if (!rain.radarNotForMoment) {
        feeds.push({
          name: 'Radar rain from RainViewer',
          shortName: 'RainViewer radar',
          credits: [CREDITS.rainViewer],
          lastUpdated: rain.radarTime ? rain.radarTime.toISOString() : null,
          error: rain.radarError,
          loading: rain.loading,
        });
      }
    }
    if (windOn) {
      under('EarthWeather');
      feeds.push({
        name: windFlow.field?.source === 'pacioos'
          ? 'NOAA GFS wind at 10 m, via PacIOOS ERDDAP'
          : 'NOAA GFS wind at 10 m, via NOAA Open Data Dissemination',
        shortName: 'NOAA GFS wind',
        credits: [windFlow.field?.source === 'pacioos' ? CREDITS.noaaGfsPacioos : CREDITS.noaaGfs],
        lastUpdated: windFlow.field ? windFlow.field.at.toISOString() : null,
        error: windFlow.error,
        loading: windFlow.loading,
        note: WIND_STREAK_NOTE,
        noteShort: WIND_STREAK_NOTE_SHORT,
      });
    }
    if (realCloudsOn) {
      under('EarthWeather');
      feeds.push(realClouds.forecast
        // An hour the satellites have not seen: the model's cover everywhere, and no satellite credited (WX11).
        ? {
          name: 'Cloud cover, the NOAA GFS model\'s forecast',
          shortName: 'NOAA GFS cloud cover',
          credits: [CREDITS.noaaGfs],
          lastUpdated: realClouds.cover ? realClouds.cover.at.toISOString() : null,
          error: realClouds.error,
          loading: realClouds.loading,
          note: CLOUD_MODEL_NOTE,
          noteShort: CLOUD_MODEL_NOTE_SHORT,
        }
        : {
          name: 'Clouds from EUMETSAT\'s Geostationary Ring infrared, with GFS cloud cover at the poles',
          shortName: 'The satellite cloud image',
          credits: [CREDITS.eumetsatGeoRing, CREDITS.noaaGfs],
          lastUpdated: realClouds.slot ? realClouds.slot.toISOString() : null,
          error: realClouds.error,
          loading: realClouds.loading,
          note: CLOUD_NOTE,
          noteShort: CLOUD_NOTE_SHORT,
        });
    }
    /*
     * GDELT is a snapshot built with the deploy, so its time is the snapshot's own
     * (asOf) — which is what makes the card say how old it is. Conflict Zones' two
     * sources are reported separately: one line for both could only carry one time,
     * and one of them failing would have been stated as both.
     */
    if (conflictZonesOn && geoPoliticalConfig.conflictZones.layerTypes.warEvents) {
      under('ConflictZones');
      feeds.push({
        name: 'Conflict events (GDELT snapshot)',
        credits: [CREDITS.gdelt],
        lastUpdated: conflictZones.warEventsAsOf ? new Date(conflictZones.warEventsAsOf).toISOString() : null,
        error: conflictZones.warEventsError ?? null,
        loading: conflictZones.warEventsLoading,
        note: GDELT_MACHINE_CODED_NOTE,
      });
    }
    if (conflictZonesOn && geoPoliticalConfig.conflictZones.layerTypes.humanitarianCrisis) {
      under('ConflictZones');
      // UNHCR publishes yearly totals; the fetch time would say nothing true about them.
      feeds.push({ name: 'Displacement (UNHCR)', lastUpdated: null, timestamped: false, error: conflictZones.displacementError ?? null, loading: conflictZones.displacementLoading, credits: [CREDITS.unhcr] });
    }
    if (diplomaticEventsOn) {
      under('DiplomaticEvents');
      feeds.push({
        name: 'Diplomatic events (GDELT snapshot)',
        credits: [CREDITS.gdelt],
        lastUpdated: diplomaticEvents.asOf ? new Date(diplomaticEvents.asOf).toISOString() : null,
        error: diplomaticEvents.error ?? null,
        loading: diplomaticEvents.dataLoading,
        note: GDELT_MACHINE_CODED_NOTE,
      });
    }
    if (resourceZonesOn) {
      under('ResourceZones');
      // One line per source, for the resource types that are on — see useResourceZones3D.
      // Yearly statistics: the fetch time would say nothing true about them.
      const types = geoPoliticalConfig.resourceZones.resourceTypes;
      const source = (name: string, error: string | null, credit: SourceCredit) =>
        feeds.push({ name, lastUpdated: null, timestamped: false, error: resourceZones.error ?? error, loading: resourceZones.dataLoading, credits: [credit] });
      if (types.oil || types.gas || types.renewable) source('Oil, gas and renewables (EIA)', resourceZones.sourceErrors.eia, CREDITS.eia);
      if (types.water) source('Water resources (World Bank)', resourceZones.sourceErrors.water, CREDITS.worldBank);
      if (types.minerals) source('Minerals (USGS)', resourceZones.sourceErrors.minerals, CREDITS.usgs);
    }
    // Psi Watch (D-PW, PW62): the sky as drawn and the field, credited as their sources ask, with the switch on.
    if (psiKitOn()) {
      if (isLayerActive('PsiLines')) {
        under('PsiLines');
        feeds.push({ name: 'Planet lines, computed in this browser', lastUpdated: null, timestamped: false, credits: [CREDITS.astronomyEngine] });
      }
      if (isLayerActive('PsiLines') || isLayerActive('PsiWindows')) {
        under(isLayerActive('PsiWindows') ? 'PsiWindows' : 'PsiLines');
        feeds.push({ name: 'Sky events and their windows', lastUpdated: null, timestamped: false, credits: [CREDITS.jplDe440s] });
      }
      if (isLayerActive('PsiField')) {
        under('PsiField');
        feeds.push({ name: 'Field readings', lastUpdated: null, timestamped: false, credits: [CREDITS.gfzKp, CREDITS.noaaSwpc, CREDITS.nistBeacon] });
      }
      if (isLayerActive('PsiModel')) {
        under('PsiModel');
        feeds.push({
          name: 'The ψ field, computed in this browser', lastUpdated: null, timestamped: false,
          credits: [CREDITS.egm96, CREDITS.pb2002, CREDITS.naturalEarth, CREDITS.igrf14, CREDITS.astronomyEngine],
        });
      }
      if (isLayerActive('MagneticShield')) {
        under('MagneticShield');
        feeds.push({ name: 'The magnetic shield, computed in this browser from IGRF-14', lastUpdated: null, timestamped: false, credits: [CREDITS.igrf14] });
        if (shieldAuroraOn && !isLayerActive('SpaceWeather')) {
          feeds.push({
            name: 'NOAA SWPC OVATION aurora forecast', shortName: 'OVATION', lastUpdated: aurora.observed, error: aurora.error,
            loading: aurora.loading, credits: [CREDITS.noaaSwpc], ...(aurora.drawn ? auroraNotes(auroraCurtain) : {}),
          });
        }
      }
    }
    ranges.forEach(([from, layer], i) => {
      const to = i + 1 < ranges.length ? ranges[i + 1][0] : feeds.length;
      for (let at = from; at < to; at++) feeds[at] = { ...feeds[at], layer };
    });
    feeds.push(...raverWatch.feeds);
    feeds.push(...heroWatch.feeds);
    feeds.push(...aiWatch.feeds);
    feeds.push(...civilUnrest.feeds);
    feeds.push(...missionsMode.feeds);
    feeds.push(...rosterOps.feeds);
    feeds.push(...warConflict.feeds);
    return feeds;
  }, [
    intelReportsFeed,
    raverWatch.feeds,
    heroWatch.feeds,
    aiWatch.feeds,
    civilUnrest.feeds,
    missionsMode.feeds,
    rosterOps.feeds,
    warConflict.feeds,
    isLayerActive,
    spaceWeatherLastUpdated, spaceWeatherError, spaceWeatherLoading, eFieldOn, spaceWeatherSettings.eFieldLook,
    auroraOn, shieldAuroraOn, auroraCurtain, aurora.drawn, aurora.observed, aurora.error, aurora.loading, kpAuroraStandsIn,
    fieldLinesOn, fieldLines.drawn, fieldLines.reading, fieldLines.error, fieldLines.loading,
    vanAllenOn, vanAllen.drawn, vanAllen.electrons, vanAllen.error, vanAllen.loading,
    cuspsOn, cusps.drawn, tailSheetOn, tailSheet.drawn,
    nearEarthFlowOn, nearEarthFlow.drawn,
    heliosphereOn, heliosphere.drawn, heliosphere.moment, heliosphere.lastArrival, heliosphere.error, heliosphere.loading,
    enlilOn, enlil.drawn, enlil.at, enlilQuantity, enlil.forecast, enlil.error, enlil.loading,
    cmesOn, cmes.drawn, cmes.at, cmes.inFlight, cmes.error, cmes.loading,
    boundaryMomentOn, sunPausedAt, boundaryMoment.wind, boundaryMoment.error, boundaryMoment.loading,
    ecoEventsLastUpdated, ecoEventsError, ecoEventsLoading, ecoEventsStatus, quakePlates.drawn, ecoVolcanoes,
    windowQuakes.emscRead, windowQuakes.quakes, windowQuakes.atlasCount,
    satellites.lastLoadedAt, satellites.error, satellites.loading,
    earthWeather.lastLoadedAt, earthWeather.error, earthWeather.loading, earthWeather.untimed,
    ecoSettings.earthWeather.weatherLayers.waterGauges, waterGauges.tide, waterGauges.rivers,
    heatMapOn, heatMap.field, heatMap.error, heatMap.loading,
    windOn, windFlow.field, windFlow.error, windFlow.loading,
    rainOn, rain.model, rain.radarTime, rain.radarNotForMoment, rain.error, rain.radarError, rain.loading,
    realCloudsOn, realClouds.slot, realClouds.cover, realClouds.forecast, realClouds.error, realClouds.loading,
    cyberAttacks.attacks.length, cyberAttacks.lastUpdate, cyberAttacks.error, cyberAttacks.isLoading,
    commHubs.fetchedAt, commHubs.error, commHubs.isLoading,
    rlsh.loading, rlsh.error, rlsh.lastLoadedAt, rlsh.untimed,
    conflictZonesOn, geoPoliticalConfig.conflictZones.layerTypes,
    conflictZones.warEventsAsOf, conflictZones.warEventsError, conflictZones.warEventsLoading,
    conflictZones.displacementError, conflictZones.displacementLoading,
    diplomaticEventsOn, diplomaticEvents.error, diplomaticEvents.dataLoading, diplomaticEvents.asOf,
    resourceZonesOn, resourceZones.error, resourceZones.dataLoading, resourceZones.sourceErrors,
    geoPoliticalConfig.resourceZones.resourceTypes
  ]);

  // The analysis marks a card states: none unless the Intel Reports layer is drawing
  // them, so a card of another layer carries no analysis caveats (decision D-F, step 2).
  const shareMarks = useMemo(
    () => analysisMarksForCard({ layerDrawn: intelLayerActive, markers: intelMarkers, layers: intelLayers }),
    [intelLayerActive, intelMarkers, intelLayers],
  );

  // Makes captureGlobeFrame reachable — from the button below, and from
  // window.__starcomShareCard for the agent. See the hook's header.
  // GeoPolitical layers their overlay toggles are drawing — see conflictZonesOn.
  const overlayDrawnLayers = useMemo<GlobeLayerId[]>(() => [
    ...(conflictZonesOverlayEnabled ? ['ConflictZones' as const] : []),
    ...(diplomaticEventsOverlayEnabled ? ['DiplomaticEvents' as const] : []),
    ...(resourceZonesOverlayEnabled ? ['ResourceZones' as const] : []),
    ...(warConflictOverlay ? ['WarConflict' as const] : []),
  ], [conflictZonesOverlayEnabled, diplomaticEventsOverlayEnabled, resourceZonesOverlayEnabled, warConflictOverlay]);
  const markViewChosen = useCallback(() => { viewChosenRef.current = true; }, []);
  const shareLicensed = useMemo(() => [...raverWatch.licensed, ...civilUnrest.licensed], [raverWatch.licensed, civilUnrest.licensed]);
  /*
   * What an agent can feature (decision D-F, section 18, item 2): the reports the
   * glyph layer is drawing, and the chosen one as a card states it. Both derived
   * from the places the glyphs were drawn from, so the list, the emphasis on the
   * globe and the card's featured block describe one picture.
   */
  const shareReports = useMemo(
    // Reports about a territory as a whole too, placed at its middle (BA3).
    () => [...listShareReports(intelSprites.places), ...regionMarks.reports, ...raverWatch.reports, ...warConflict.reports, ...heroWatch.reports, ...civilUnrest.reports],
    [intelSprites.places, regionMarks.reports, raverWatch.reports, warConflict.reports, heroWatch.reports, civilUnrest.reports],
  );
  // Each layer answers for its own addresses (whyNotDrawn.ts).
  const layersWhyNotDrawn = useMemo(() => whyNotDrawnOf(raverWatch.whyNotDrawn, heroWatch.whyNotDrawn), [raverWatch.whyNotDrawn, heroWatch.whyNotDrawn]);
  const featuredForCard = useMemo(() => {
    if (featuredReportId === null) return null;
    // An Intel Report, at its place or about a territory, says which of its group it is (BA10).
    for (const place of intelSprites.places) {
      const found = place.reports.find((r) => r.pubkey === featuredReportId);
      const featured = found ? featuredReportFor(found) : null;
      if (featured) return withGroupLine(featured, shareReports);
    }
    if (regionMarks.featured) return withGroupLine(regionMarks.featured, shareReports);
    // Or a Raver Watch, War & Conflict, Hero Watch or Civil Unrest item, which its layer describes for the card.
    return raverWatch.featured ?? warConflict.featured ?? heroWatch.featured ?? civilUnrest.featured;
  }, [featuredReportId, intelSprites.places, regionMarks.featured, raverWatch.featured, warConflict.featured, heroWatch.featured, civilUnrest.featured, shareReports]);

  /*
   * A link's layer is chosen as the app starts; the rest of it (pins, camera,
   * window, featured report) is applied once the globe is ready, through the
   * share handle below, as an agent would (deeplink v1; RW8).
   */
  useApplyDeeplink({ handle: () => (window as unknown as Record<string, LinkDriver | undefined>)[SHARE_HANDLE] });

  // Whether the planet is drawn as its skin yet: a card is not made before (whenReady).
  const surfaceTextures = useEngineTextures(globeEngine);
  /*
   * The material drawn must be the engine's own for its skin, and the engine the one
   * for the mode shown: a mode switch disposes the old engine and builds a new one a
   * moment later, and in between the old one's material still drew.
   */
  const surface = useMemo(
    () => surfaceReadiness(
      material,
      surfaceTextures,
      globeEngine && globeEngine.getMode() === visualizationMode.mode ? globeEngine.getMaterial() : null,
    ),
    [material, surfaceTextures, globeEngine, visualizationMode.mode],
  );
  // The surface's maps that arrived and are drawn, for a card's imagery credit (TX8): a stand-in is not credited.
  useEffect(() => {
    setSurfaceImagery(material ? surfaceTextures.filter((t) => t.state === 'ready').map((t) => t.name) : []);
  }, [material, surfaceTextures]);
  useEffect(() => () => setSurfaceImagery([]), []);
  /*
   * What a briefing tour reads and shows (briefing-playlists.md, BP5, BP9): the Tour
   * button's, and the handle's for a playlist as a clip (BP16, contract v39).
   */
  const tourSources = {
    candidatesFor: (id: PlaylistId, nowMs: number) => (id === 'war' ? warConflict.tourCandidates()
      : id === 'heroes' ? heroWatch.tourCandidates() : raverWatch.tourCandidates(id, nowMs)),
    show: (id: PlaylistId) => showPlaylist(id, {
      layers: layerCatalogue, visualizationMode, setVisualizationMode, pinLayer, unpinLayer,
      temporal: temporalState, nowMs: Date.now(),
    }),
  };
  const shareCard = useGlobeShareCard({
    globeRef, feeds: shareFeeds, marks: shareMarks, alsoDrawn: overlayDrawnLayers, onViewChosen: markViewChosen,
    // The brief as a card prints it: never quoting a note that names a person (D-NP, NP2).
    shareReports, featured: featuredForCard, briefOf: shareBriefOf, surface,
    // The quakes drawn as flags, by their times: a clip's replay replays them (D-EQ, EQ21).
    quakeTimes: replayedQuakeTimes,
    // Close-ups of Raver Watch's public venues and heat towns, the only items that may have one (IM2, IM36).
    closeUp: raverWatch.closeUp, closeUpRefusal: raverWatch.closeUpRefusal,
    // Why an address a layer holds is not drawn (Mecha Jono's ask D): Raver Watch's, or Hero Watch's.
    whyNotDrawn: layersWhyNotDrawn,
    // Tonight from a moment, for tonight's card (raver-nights.md, RN3).
    tonightOf: raverWatch.tonightFrom,
    // The licences Raver Watch's and Civil Unrest's drawn notes carry, credited where they are in a card's picture (Interchange 3.25).
    licensed: shareLicensed,
    // Hero Watch's week as drawn, for the week's card (hero-watch.md, HW10).
    weekOf: heroWatch.weekOf,
    // A briefing playlist as a clip (briefing-playlists.md, BP16).
    tours: tourSources,
    // What the "Showing N of M" notice states, for listReports({ counts: true }) (BA1).
    reportCounts: { shown: intelReports.length, matching: intelTotalMatching, setting: cyberCommandConfig.intelReports.maxReports },
    reportLookSetting: { emblems: emblemsChosen(cyberCommandConfig.intelReports) },
    // What the person's settings have Earth Weather draw, for getWeather (WX9).
    weatherSetting: weatherPerson,
    // A card about a War & Conflict theatre (TL3): its lens is the brief panel's.
    theatres,
  });

  /*
   * The briefing tour (block G, item 6.1; briefing-playlists.md): one brief at a
   * time, worst first, by region, with a caption saying why each stop is shown. A
   * touch pauses it; Esc ends it; it puts back the layers, the moment and the
   * camera it found.
   */
  // The item a tour's stop holds, pinged (critique C34).
  useGlobeTourPing(globeRef);
  const briefingTour = useBriefingTour({
    globeRef: globeRef as unknown as BriefingTourDeps['globeRef'],
    candidatesFor: tourSources.candidatesFor,
    show: tourSources.show,
    reducedMotion: prefersReducedMotion() || !!geoPoliticalConfig.nationalTerritories.reducedMotion,
    onViewChosen: markViewChosen,
  });

  /*
   * Stories (D-ST, E4): views in an order of the person's own, each with a caption, played as a tour is. One player at
   * a time: a story ends a running tour, and a tour ends a running story. Set through the share handle, as a link is.
   */
  const storyHandle = useCallback(() => (window as unknown as Record<string, StoryHandle | undefined>)[SHARE_HANDLE] ?? null, []);
  const briefingTourEndRef = useRef(briefingTour.end);
  briefingTourEndRef.current = briefingTour.end;
  const storyPlayer = useStoryPlayer({
    handle: storyHandle,
    controls: () => (globeRef.current as unknown as BriefingTourDeps['globeRef']['current'])?.controls(),
    reducedMotion: prefersReducedMotion() || !!geoPoliticalConfig.nationalTerritories.reducedMotion,
    onStart: () => briefingTourEndRef.current(),
  });
  useStoryPaletteSource(storyPlayer);
  useStoryFromLink(storyPlayer, storyHandle);
  const storyEndRef = useRef(storyPlayer.end);
  storyEndRef.current = storyPlayer.end;
  const tourBesideStory = useMemo(() => ({
    ...briefingTour,
    start: (id: Parameters<typeof briefingTour.start>[0]) => { storyEndRef.current(); briefingTour.start(id); },
  }), [briefingTour]);

  /*
   * Hand the composed card to the person who asked for it.
   *
   * A blob URL rather than the data URL directly: Chrome refuses to navigate
   * to a data: URL over a couple of megabytes, and a card with a 4x globe in
   * it clears that easily — the download would simply not happen, with no
   * error anywhere.
   *
   * Decoded rather than fetched: fetch(dataUrl) counts as a connection for the
   * Content-Security-Policy, and connect-src has no data:, so with the policy
   * enforced the download silently did not happen. See dataUrlToBlob.ts.
   */
  const handleShareView = useCallback(async () => {
    try {
      const card = await shareCard.shareView({ scale: 2 });
      const blob = dataUrlToBlob(card.dataUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `starcom-globe-${card.provenance.capturedAt.replace(/[:.]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // shareCard.error already holds the pipeline's own words, and the notice
      // below renders them. Re-throwing here would only reach the console.
    }
  }, [shareCard]);

  /*
   * The inspector's actions (critique-2026-11-01, OR23; plan A5): make a card, copy a link, fly to it, show around
   * its time. Lent through refs while this globe is mounted, so the clock's tick does not lend them again.
   */
  const inspectorRef = useRef({ handleShareView, shareCard, temporalState });
  inspectorRef.current = { handleShareView, shareCard, temporalState };
  useEffect(() => {
    const globe = () => globeRef.current as unknown as GlobeMethods | undefined;
    setInspectorActions({
      makeCard: () => inspectorRef.current.handleShareView(),
      flyTo: (at) => {
        const g = globe();
        if (g) setGlobePointOfView(g, { lat: at.lat, lng: at.lng, altitude: Math.max(MIN_ALTITUDE, Math.min(g.pointOfView().altitude, INSPECTOR_FLY_ALTITUDE)) }, 800);
      },
      linkTo: (at, noteId) => inspectorRef.current.shareCard.linkTo(at, noteId),
      altitude: () => globe()?.pointOfView().altitude ?? 1.5,
      centre: () => {
        const view = globe()?.pointOfView();
        return view && Number.isFinite(view.lat) && Number.isFinite(view.lng) ? { lat: view.lat, lng: view.lng } : null;
      },
      window: () => {
        const t = inspectorRef.current.temporalState;
        return t && !t.isLive && t.timeWindow ? { start: t.timeWindow.start.getTime(), end: t.timeWindow.end.getTime() } : null;
      },
      showAround: (timeMs) => {
        const start = Math.floor(timeMs / DAY_MS) * DAY_MS;
        inspectorRef.current.temporalState?.setTimeWindow(start, start + DAY_MS, timeMs);
      },
    });
    return () => setInspectorActions(null);
  }, [globeRef]);
  useOpenFromLink();

  // Add debounce utility for resize handling (fixes recursive resize event dispatch)
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleResize() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (globeRef.current) {
          const globeInstance = globeRef.current as unknown as { controls?: { update: () => void } };
          globeInstance.controls?.update?.();
        }
      }, 100);
    }
    function handleVisibilityChange() {
      if (!document.hidden) setTimeout(handleResize, 100);
    }
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    setTimeout(handleResize, 50);
    setTimeout(handleResize, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Space weather data visualization effect - only show when SpaceWeather layer is active
  useEffect(() => {
    if (!globeEngine) return;
    const shouldShowSpaceWeather = (
      isLayerActive('SpaceWeather') &&
      visualizationVectors.length > 0
    );
    if (!shouldShowSpaceWeather) return;
    // Same fix as the eco-disaster markers above: these never set their own
    // `altitude`, so pointAltitude's fallback chain used to read `size`
    // (0.1-2.0, meant as a RADIUS value) as the altitude — 10-200 world-unit
    // spikes. A small fixed altitude keeps them just above the surface; `size`
    // now only drives pointRadius, as intended.
    const spaceWeatherMarkers = visualizationVectors.map(vector => ({
      lat: vector.latitude,
      lng: vector.longitude,
      size: vector.size,
      altitude: 0.01,
      color: vector.color,
      label: `E-Field: ${vector.magnitude.toFixed(2)} mV/km`,
      magnitude: vector.magnitude,
      direction: vector.direction,
      quality: vector.quality,
      type: 'space-weather'
    }));
    globeEngine.updateSpaceWeatherVisualization(spaceWeatherMarkers, SPACE_WEATHER_BOUNDARIES.filter(boundaryOn));
    log.debug(`Updated space weather visualization with ${spaceWeatherMarkers.length} markers for EcoNatural/SpaceWeather mode`);
  }, [
    globeEngine,
    spaceWeatherSettings,
    visualizationVectors,
    isLayerActive,
    boundaryOn
  ]);


  // Cleanup intel marker group on unmount
  useEffect(() => {
    return () => {
      const group = intelMarkerGroupRef.current;
      if (group) {
        group.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            }
          }
        });
        group.clear();
      }
      log.debug('🧹 Globe cleanup completed');
    };
  }, []);

  // Camera controls — the globe previously had zero navigation affordances:
  // no zoom/reset buttons, and drag-to-orbit/scroll-to-zoom had no on-screen
  // hint anywhere. handleZoom adjusts pointOfView's altitude (react-globe.gl's
  // zoom axis); resetView returns to a fixed default framing.
  const handleZoom = useCallback((factor: number) => {
    const g = globeRef.current as unknown as GlobeMethods | undefined;
    if (!g) return;
    const current = g.pointOfView();
    const nextAltitude = applyZoomFactor(current.altitude, factor, MIN_ALTITUDE, maxAltitude());
    setGlobePointOfView(g, { lat: current.lat, lng: current.lng, altitude: nextAltitude }, 300);
  }, [globeRef]);

  const handleResetView = useCallback(() => {
    const g = globeRef.current as unknown as GlobeMethods | undefined;
    if (!g) return;
    setGlobePointOfView(g, DEFAULT_POV, 600);
  }, [globeRef]);

  // Publishes this globe's camera orientation for TinyGlobe's orientation marker
  // (see GlobeCameraTelemetry.ts for why this isn't GlobeContext.focusLocation).
  // react-globe.gl's onZoom fires on every pointOfView change (rotate + zoom), which
  // during a drag is far more often than needed — rAF-coalesce to at most once/frame.
  const pendingOrientationRef = useRef<GlobeCameraOrientation | null>(null);
  const orientationFrameRef = useRef<number | null>(null);
  const handleCameraOrientationChange = useCallback((pov: GlobeCameraOrientation) => {
    pendingOrientationRef.current = pov;
    if (orientationFrameRef.current !== null) return;
    orientationFrameRef.current = requestAnimationFrame(() => {
      orientationFrameRef.current = null;
      if (pendingOrientationRef.current) {
        globeCameraTelemetry.publish(pendingOrientationRef.current);
      }
    });
  }, []);
  useEffect(() => {
    return () => {
      if (orientationFrameRef.current !== null) {
        cancelAnimationFrame(orientationFrameRef.current);
      }
    };
  }, []);

  // Navigation hint: shown until the user's first drag/scroll on the globe,
  // or after a timeout, whichever comes first — never a persistent nag.
  // Extracted to useGlobeNavHint.ts (Hooks/), the first piece pulled out of
  // this file with a test behind it.
  const { showNavHint } = useGlobeNavHint(containerRef);

  return (
    <div ref={containerRef} style={{ 
      position: 'relative',
      width: '100%', 
      height: '100%', 
      overflow: 'hidden',
      opacity: isInitializing ? 0 : 1,
      transition: 'opacity 0.5s ease-in-out',
      // Remove centering from main container to let Globe fill space
      minWidth: '100%',
      minHeight: '100%'
    }}>
      {/* Two layers side by side (D-CM): the line where the halves meet and the bar naming them, in the globe's box. */}
      {comparing && <CompareBar />}
  <GlobeLoadingManager 
        material={material} 
        globeEngine={globeEngine}
      >        {/* Globe render with full space utilization */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%'
        }}>
          <Globe
          ref={globeRef}
          width={containerSize.width}
          height={containerSize.height}
          /*
           * No pointsData. Every data layer that rode on react-globe.gl's shared point
           * set has its own group of screen-space marks now — space weather, eco
           * disasters, the analysis layer — because a point sized in fractions of the
           * globe's radius is about a pixel on a share card, and they all shared one
           * group the country fills painted over. See screenPoints.ts.
           */
          // Eco-disaster "Show Impact Radius" presentation option — a pulsing ring
          // around each marker, scaled and colored to match its point (see
          // ecoRingsData construction in the eco-disaster effect above).
          // Contradiction links — the two places one entity was claimed to be.
          // react-globe.gl interpolates along a great circle, so the line takes
          // the short path across the antimeridian rather than wrapping 358
          // degrees around the planet.
          // And War & Conflict's state forces, from their country to where an item happened (theatre-lens.md, TL6).
          arcsData={globeArcs}
          arcStartLat={(d: { startLat: number }) => d.startLat}
          arcStartLng={(d: { startLng: number }) => d.startLng}
          arcEndLat={(d: { endLat: number }) => d.endLat}
          arcEndLng={(d: { endLng: number }) => d.endLng}
          arcColor={(d: { color: [string, string] }) => d.color}
          // Set as HTML by the globe's tooltip (float-tooltip), and quoting what others wrote: escaped.
          arcLabel={(d: { label: string }) => escapeHtml(d.label)}
          onArcHover={arcClicks.onArcHover}
          onArcClick={arcClicks.onArcClick}
          arcStroke={(d: { strength?: number; stroke?: number }) => d.stroke ?? 0.3 + (d.strength ?? 0) * 0.7}
          arcAltitude={(d: { altitude?: number }) => d.altitude ?? 0.15}
          // Drawn whole at once: an arc growing in over a second could be caught half-grown by a card.
          arcsTransitionDuration={0}
          // The feet and the rings on the surface lines' and marks' bands, not three-globe's
          // ground (0 and 0.0015): under the base map, where no lift could carry them over a
          // raised territories shell (globe-engine/shellLift.ts, which lifts both layers).
          arcStartAltitude={SURFACE_LINES - 1}
          arcEndAltitude={SURFACE_LINES - 1}
          ringsData={ecoRingsData}
          ringAltitude={SURFACE_MARKS - 1}
          ringLat={(d: { lat: number }) => d.lat}
          ringLng={(d: { lng: number }) => d.lng}
          ringMaxRadius={(d: { maxR: number }) => d.maxR}
          ringColor={(d: { color: string; opacity: number }) => {
            // rgba(), not an 8-digit hex-with-alpha string — three-globe's ring color
            // parsing goes through d3-color, which reliably handles rgba() but not
            // every browser/library agrees on hex-alpha parsing.
            const hex = d.color.replace('#', '');
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return (t: number) => `rgba(${r},${g},${b},${Math.max(0, (1 - t) * d.opacity)})`;
          }}
          // Alert rings (tsunami warnings, earthquake shockwaves) pulse faster and
          // repeat more often than the gentler "Show Impact Radius" rings, so they
          // read as urgent/time-sensitive rather than a slow ambient presentation.
          // Tsunami vs. shockwave get distinct timing too, not just color: a
          // shockwave is one sharp, fast-expanding jolt with a long gap between
          // pulses; a tsunami is a slower, continuously-rolling wave (short repeat
          // period so pulses overlap) — a real non-color pulse-pattern distinction.
          ringPropagationSpeed={(d: { kind?: string }) => {
            if (d.kind === 'shockwave') return 10;
            if (d.kind === 'tsunami') return 3;
            return 2;
          }}
          ringRepeatPeriod={(d: { kind?: string }) => {
            if (d.kind === 'shockwave') return 1500;
            if (d.kind === 'tsunami') return 500;
            return 2400;
          }}
          globeMaterial={material ?? undefined}
          // three-globe's built-in atmosphere (a real Fresnel-rim GlowMesh shell,
          // independent of globeMaterial so it renders correctly under every mode's
          // custom material) — explicit rather than relying on the library defaults,
          // so the look is a deliberate choice rather than an implicit fallback.
          // Dropped only at the lowest quality step (globeQuality.ts).
          // Not in Sky from a place: from inside it the glow tints the whole sky (D5).
          showAtmosphere={qualityStep.atmosphere && !skyOpen}
          atmosphereColor="#4db8ff"
          atmosphereAltitude={0.15}
          // Configure renderer for optimal space usage
          rendererConfig={rendererConfig}
          // Disable automatic camera positioning that might constrain view
          enablePointerInteraction={true}
          onZoom={handleCameraOrientationChange}
          // ...existing Globe props...
        />
        </div>
        
        {/* Enhanced 3D Globe Interactivity - hover, click and popups for the Intel Report and RLSH marks */}
        <Enhanced3DGlobeInteractivity 
          globeRef={globeRef}
          intelReports={intelReports}
          visualizationMode={visualizationMode}
          models={interactiveIntelMarks}
          pickLayer={intelSprites.pickLayer}
          reportAt={intelSprites.reportAt}
          // A click inside an outlined territory opens the reports about it (BA9).
          territoryGroupsAt={regionMarks.groupsAt}
          // The menu at the click wears the categories' emblems as the glyphs do (BA15).
          categoryEmblems={glyphLook.emblems}
          onHoverChange={setHoveredReportId}
          containerRef={containerRef}
        />
        {/* What the intel layer is NOT showing — truncation, unplaceable
            findings, staleness, source outages, time-window hiding. All of it
            was already computed and all of it was being discarded here: this
            component reads the same hook and renders nothing when there is
            nothing to disclose. */}
        {/* The second source layer — our own standing public claims. Proof
            that the layer contract admits a source unrelated to correlation;
            see publishedClaimsLayer. */}
        <GlobePublishedClaimsPublisher />
        {/* Speaks only when the analysis layer is actually being drawn. It
            discloses what THAT layer is withholding, so in a mode where the
            layer is not rendered at all its notes describe nothing on screen. */}
        {intelLayerActive && <GlobeIntelStatus reportMarkers={intelReports} unmatchedTerritories={regionMarks.unmatched} />}
        {intelLayerActive && <LiveCoveragePanel axes={coverageAxes} />}
        {raverWatch.anyOn && temporalState && (
          <RaverWatchPanel
            unplaced={raverWatch.listed.unplaced}
            news={raverWatch.listed.news}
            sceneNews={raverWatch.listed.sceneNews}
            isLive={temporalState.isLive}
            windowMs={temporalState.timeWindow
              ? { start: temporalState.timeWindow.start.getTime(), end: temporalState.timeWindow.end.getTime() }
              : null}
            onWindow={({ start, end }) => temporalState.setTimeWindow(start, end)}
            onLive={() => temporalState.setIsLive(true)}
          />
        )}
        {/* Hero Watch's panel (D-HW, step 6): the week, relief by country, and what it cannot draw. */}
        {heroWatch.sectionsOn && (
          <HeroWatchPanel
            summary={heroWatch.summary}
            relief={heroWatch.relief}
            listed={heroWatch.listed}
            showRelief={isLayerActive('Relief')}
            showMissions={isLayerActive('FieldMissions')}
          />
        )}
        {/* Diplomacy's drawer (D-DP, DP8): the place clicked, its events and the primer. */}
        {diplomaticEventsOn && (diplomaticEvents.placesShown || diplomaticEvents.selectedCountry) && (
          <DiplomacyPanel
            place={diplomaticEvents.selectedPlace}
            countryNames={diplomaticEvents.countryNames}
            onClose={diplomaticEvents.clearSelection}
            relatedReports={diplomaticEvents.relatedReports}
            country={diplomaticEvents.selectedCountry ? {
              ...diplomaticEvents.selectedCountry,
              relations: diplomaticEvents.relations,
              events: diplomaticEvents.countryEvents,
              onClose: diplomaticEvents.clearCountry,
            } : null}
          />
        )}
        {/* AI Watch's panel (D-AW, AW3): every note by area, the ones naming no place among them. */}
        {aiWatch.anyOn && (
          <AiWatchPanel notes={aiWatch.notes} active={aiWatchActive} drawnAt={aiWatch.drawnAt} status={aiWatch.status} />
        )}
        {/* Psi Watch's panel (D-PW, step 3): only in its mode, and only with its switch on (PW19). */}
        {visualizationMode.mode === 'PsiWatch' && psiKitOn() && <PsiWatchPanel />}
        {/* Side by side (D-PW, PW73): the Psi layers at now in the left half, and the divider naming each half. */}
        {psiSplit && (
          <PsiSplitNow
            scene={globeRef.current ? (globeRef.current as unknown as { scene: () => THREE.Scene }).scene() : null}
            cursorMs={temporalState?.currentTime ?? Date.now()}
            lines={isLayerActive('PsiLines')}
            places={psiZonesActive}
            shield={isLayerActive('MagneticShield')}
            psiModel={isLayerActive('PsiModel')}
          />
        )}
        {/* Missions' panel (D-MF, MF16–MF17): those done from anywhere, or a clicked place's, each to take. */}
        {missionsMode.anyOn && (
          <MissionsGlobePanel places={missionsMode.places} anywhere={missionsMode.anywhere} reading={missionsMode.reading} />
        )}
        {/* The Safety windows' calendar (D-RR, RR1; kit 5.1). */}
        {safetyWindowsOn && <SafetyWindowsPanel windows={safetyWindows.windows} cursorS={safetyWindows.cursorS} />}
        {warConflictOn && (
          <WarConflictBriefPanel
            brief={warBrief}
            items={warBriefItems}
            days={warConflict.briefDays}
            day={briefDay}
            onDay={chooseBriefDay}
            theatre={briefTheatre}
            onTheatre={setBriefTheatre}
            series={warBriefSeries}
            regionName={(code) => (territories?.byCode(code) as { name?: string } | null | undefined)?.name ?? null}
          />
        )}
        <GlobeShownRecord shown={shownRecord} onShowAll={clearShownOnGlobe} />
        {/* The area outlined with no report naming it, and the way to clear it (BA24). */}
        <GlobeLitArea />
        {/* A note opened by a click on its mark, with its sources (D-CT, CT3). */}
        <GlobeNotePanel />
        {/* A campaign or an operation clicked on the globe opens in Operations (D-RS, RS25). */}
        <OperationsGlobeLink />
        {/* A Zone or a Sector opened on the globe (ZSP 1.0). */}
        <GlobeZonePanel />
        {/* A Sphere opened on the globe. */}
        <GlobeSpherePanel />
        {/* The Organisation shown, opened. */}
        <GlobeOrganisationPanel />

  {/* Space Weather Telemetry HUD removed: telemetry now provided in sidebars */}
        
        {/* Cyber Data Loading Indicator */}
        {cyberDataLoading && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#00ffff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000
          }}>
            ⚡ Loading Attacks...
          </div>
        )}

        {/* What the report layer is showing, and what it did not draw: see GlobeReportNotes.
            Not while a Case or Mission is shown: these numbers count every report, and
            the globe is drawing only that record's own. */}
        {isLayerActive('IntelReports') && shownRecord.status === 'none' && (
          <GlobeReportNotes
            fromEarlierSession={earlierSessionSummary(intelReports)}
            networkShown={networkReportCount}
            totalMatching={intelTotalMatching}
            shown={intelReports.length}
            hiddenByPriority={intelHiddenByPriority}
            hiddenByLens={intelHiddenByLens}
            onClearLens={() => updateIntelReports({ lenses: [] })}
            placedByWritten={intelPlacedByWritten}
            judgedByWindow={intelJudgedByWindow}
            untimed={intelUntimed}
            listening={intelListening}
            cap={reportCap}
            onChooseCap={(next) => updateIntelReports({ maxReports: next })}
          />
        )}

        {/* Camera controls — previously there were zero navigation affordances
            on the globe at all: no zoom/reset buttons, drag-to-orbit had no
            on-screen hint.

            Docked rather than absolutely positioned: at `bottom: 20px;
            left: 20px` this shared a corner and a gutter with the bottom-left
            dock, and the bottom-most button was unclickable underneath
            GlobeIntelStatus. z-index could not fix it — the dock is fixed at
            5000 near the app root while this sits inside a stacking context at
            1, so no local number reaches it. See dockOrder.ts. */}
        {/* How the layer in front draws its marks (decision D-F, step 6). It
            renders nothing on a layer that does not read a style, so it is
            absent on ResourceZones permanently and on the un-wired layers for
            now — a click that leaves the globe unchanged reads as a broken
            control. The sub-mode names the layer, the same cast the layer
            provider makes. */}
        <GlobeMarkStyleControls
          layerId={visualizationMode.subMode as GlobeLayerId}
          styles={cyberCommandConfig.markerStyles}
          onPick={updateMarkerStyle}
        />
        {/* The debris clouds' spread since each breakup, modelled (D-GV GV2, step 6): only while Satellites draws
            debris. */}
        <GlobeDebrisLapseControl />
        {/* What the marks on the globe mean, from every layer currently drawing
            (decision D-F). It renders nothing when no layer is drawing, and it
            decides nothing: each layer states its own encoding as it draws, and
            this shows what they said. Until now globeLegendStore was read only
            by the share card, so the key existed only in exported images.
            The same holds for the feeds (step 11): shareFeeds is what the card
            is built from, and handing the key the SAME array is what keeps the
            two from disagreeing about how old a layer's data is. */}
        <GlobeLegend feeds={shareFeeds} />
        {/* What the shown layers wait on, and an outcome that drew nothing (D-LS). */}
        <GlobeLoadStatus shown={shownLayerIds} feeds={shareFeeds} layerName={layerLabel} sweep={loadSweep} />
        <BriefingTourCaption tour={briefingTour} />
        <StoryCaption player={storyPlayer} />
        <StoryPanel player={storyPlayer} handle={storyHandle} />
        <RlshPanel />
        <EventChartPanel />
        <PsiListsPanel />
        <PsiLabPanel />
        <Docked slot="globeCameraControls">
        {/* One row that wraps (BD4): as a column the four buttons took 124px of a
            left column that ran over the clock at 1280×720. The share error takes
            a row of its own. */}
        <div
          data-testid="globe-camera-controls"
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: '4px',
            maxWidth: '360px'
          }}
        >
          <button
            type="button"
            onClick={() => handleZoom(0.8)}
            title="Zoom in"
            aria-label="Zoom in"
            style={cameraControlButtonStyle}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.25)}
            title="Zoom out"
            aria-label="Zoom out"
            style={cameraControlButtonStyle}
          >
            −
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Reset view"
            aria-label="Reset view"
            style={cameraControlButtonStyle}
          >
            ⌂
          </button>
          {/* The affordance that makes the capture path reachable at all.
              Disabled until the globe can actually be captured — react-globe.gl
              populates renderer/scene/camera lazily, and a button that throws
              at someone who clicked a second early is worse than one that
              waits. */}
          <button
            type="button"
            data-testid="globe-share-view"
            onClick={handleShareView}
            disabled={!shareCard.ready || shareCard.busy}
            title={shareCard.ready
              ? 'Save this view as a share card, with its own caveats attached'
              : 'The globe is still initialising'}
            aria-label="Save this view as a share card"
            style={{
              ...cameraControlButtonStyle,
              opacity: shareCard.ready && !shareCard.busy ? 1 : 0.4,
              cursor: shareCard.ready && !shareCard.busy ? 'pointer' : 'default'
            }}
          >
            {shareCard.busy ? '…' : '⎙'}
          </button>
          <BriefingTourButton tour={tourBesideStory} ready={shareCard.ready} />
          <StoryButton ready={shareCard.ready} />
          {/* The pipeline's own words, verbatim. Every refusal in it explains
              what went wrong and why it refused rather than returning a blank
              image; replacing that with "capture failed" would discard the only
              part that helps. Inside the docked column so it cannot land on top
              of the buttons it is describing. */}
          {shareCard.error && (
            <div
              data-testid="globe-share-error"
              style={{
                flexBasis: '100%',
                maxWidth: '360px',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: '#ffaa00',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                lineHeight: 1.45
              }}
            >
              {shareCard.error}
            </div>
          )}
        </div>
        </Docked>

        {/* Paused before the first eco snapshot, eco draws nothing, and this says so (decision D-E). */}
        {ecoDisastersEnabled && showsNoEcoSnapshot(ecoHistoryPlayback) && (
          <Docked slot="globeEcoNotes">
            <EcoNoSnapshotNote playback={ecoHistoryPlayback} quakesDrawn={(windowQuakes.quakes?.length ?? 0) > 0} />
          </Docked>
        )}
        <SimplePointTooltip tooltip={hoverOwned || commHubs.tooltip.visible ? null : hoveredPointTooltip} />

        <GlobeNavHint visible={showNavHint} />

        {/* Brief, real explanation for why markers just disappeared on a mode
            switch, instead of the previous silent vanish. */}
        {intelClearedNotice && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#ffaa00',
            padding: '8px 14px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000
          }}>
            {intelClearedNotice}
          </div>
        )}

        {(visualizationMode.mode === 'HeroWatch' && visualizationMode.subMode === 'RLSH') && (rlshDataLoading || rlshPlaceholderReports.length === 0) && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#00ffff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            zIndex: 1000
          }}>
            {rlshDataLoading ? '🦸 Loading RLSH entities...' : '🦸 No RLSH entities available'}
          </div>
        )}

        {/*
          * The engine's boundary diagnostics, in development only (D-SW, step 4): on the live site it sat over
          * the corner's clock, called a layer switched off "missing", and called the aurora missing while
          * OVATION's was drawn, counting only the Kp ring it stands in for. The key says what is drawn.
          */}
        {process.env.NODE_ENV === 'development' && (visualizationMode.mode === 'EcoNatural' && visualizationMode.subMode === 'SpaceWeather') && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#00ffff',
            padding: '8px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            zIndex: 1000,
            lineHeight: 1.3
          }}>
            <div>Space Weather Layers</div>
            <div>Magnetopause: {spaceWeatherBoundaryStatus.magnetopause.enabled ? 'on' : 'off'} / {spaceWeatherBoundaryStatus.magnetopause.attached ? 'attached' : 'missing'}</div>
            <div>Bow Shock: {spaceWeatherBoundaryStatus.bowShock.enabled ? 'on' : 'off'} / {spaceWeatherBoundaryStatus.bowShock.attached ? 'attached' : 'missing'}</div>
            <div>Aurora: {spaceWeatherBoundaryStatus.aurora.enabled ? 'on' : 'off'} / {spaceWeatherBoundaryStatus.aurora.attached ? 'attached' : 'missing'}</div>
          </div>
        )}
        
        
        {/* Geopolitical Layers settings moved to GeopoliticalLayersPopup, reachable globally
            from CyberCommandRightSideRail's ⚙️ button — this used to be inline JSX here,
            gated by `visualizationMode.mode === 'GeoPolitical'`, even though the layers
            themselves render regardless of mode. */}
        {/* Borders and territories overlays attached in scene via hook */}
      </GlobeLoadingManager>
      {/* A mark's own hover says more than the country's: the country's waits while one shows (D-HW). */}
      <CountryInfoTooltip {...countryInfoOverlay.tooltip} visible={countryInfoOverlay.tooltip.visible && !hoveredPointTooltip && !hoverOwned && !commHubs.tooltip.visible} />
      <GlobeZoneHover />
      <GlobeSphereHover />
      <GlobeOrganisationHover />
      <CommHubTooltip {...commHubs.tooltip} />
    </div>
  );
};

export default React.memo(GlobeView);
// AI-NOTE: Refactored to use GlobeEngine. See globe-engine-api.artifact for integration details.
// Artifact references:
// - Overlay UI/UX: globe-overlays.artifact (UI/UX Guidelines)
// - Overlay logic: globe-engine-api.artifact, globe-modes.artifact