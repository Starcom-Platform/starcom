// GlobeEngine.ts
// AI-NOTE: See globe-engine-architecture.artifact and globe-engine-api.artifact for design and API rationale.

/**
 * GlobeEngine: Central class for creating and managing globe instances (main, tiny, etc.)
 * - Handles mode, overlays, shaders, textures, and integration with Starcom context.
 * - See globe-engine-api.artifact for API and integration details.
 */

import { GlobeModeMapping } from './GlobeModeMapping';
import { GlobeTextureLoader } from './GlobeTextureLoader';
import { GlobeMaterialManager, SKIN_TEXTURES } from './GlobeMaterialManager';
import type { GlobeSkin } from '../services/globe/globeAppearance';
import * as THREE from 'three';
import { fetchWeatherData } from '../services/WeatherDataService';
import { fetchAlerts } from '../services/AlertsService';
import { fetchNaturalEvents } from '../services/GeoEventsService';
import { fetchSpaceAssets } from '../services/SpaceAssetsService';
import { fetchLatestElectricFieldData, transformNOAAToIntelMarkers } from '../services/noaaSpaceWeather';
import { pollerRegistry } from '../services/pollerRegistry';
import { combineScopes, makeInstanceScope, makeModeScope, makeRouteScope } from '../services/pollerScopes';
import {
  buildAuroralPayload,
  buildBowShockPayload,
  buildGeomagneticIndexPayload,
  buildMagnetopausePayload,
  KP_STALE_MS,
  SOLAR_WIND_STALE_MS,
  type AuroraPayload,
  type BowShockPayload,
  type GeomagneticIndexPayload,
  type MagnetopausePayload,
  type SolarWindSnapshot,
} from '../services/SpaceWeatherModeling';
import type { BoundaryWind } from '../services/spaceWeather/boundaryWind';
import { fetchLiveKpSnapshot, fetchLiveSolarWindSnapshot } from '../services/SpaceWeatherLive';
import {
  createAuroraBlackoutMesh,
  createAuroraLines,
  createBowShockContours,
  createGeomagneticIndexMesh,
  createMagnetopauseContours,
  disposeObject,
  logVertexCount,
} from './SpaceWeatherGeometry';
import { createLogger } from '@utils/logger';
import { assetUrl } from '../utils/assetUrl';
const log = createLogger({ prefix: 'GlobeEngine' });

export type GlobeEvent = { type: string; payload?: unknown };

/**
 * How one texture of the globe's surface stands (plan item 8.3c). A texture
 * that failed or took too long was replaced by a one-pixel colour and the
 * surface called ready; now the loader can say which, and Retry can ask again.
 */
export interface TextureState {
  name: string;
  /** What it shows, in words. */
  label: string;
  state: 'waiting' | 'loading' | 'ready' | 'failed' | 'timeout';
  /** How long it took, for one that loaded. */
  ms?: number;
}

const TEXTURE_LABELS: Record<string, string> = {
  earthDay: 'Daylight surface',
  earthNight: 'City lights',
  blueMarble: 'Blue Marble photograph',
  earthDark: 'Dark surface',
  earthTopology: 'Relief',
  earthWater: 'Oceans',
};

/** How long a texture may take before it is drawn without. */
const TEXTURE_TIMEOUT_MS = 10_000;

class TextureTimeout extends Error {}

export interface GlobeEngineConfig {
  /**
   * Initial globe mode (see globe-modes.artifact)
   */
  mode: string;
  /**
   * Initial overlays (see globe-overlays.artifact)
   */
  overlays?: string[];
  /**
   * Event callback (see globe-engine-api.artifact)
   */
  onEvent?: (event: GlobeEvent) => void;
}

export class GlobeEngine {
  private static instanceCounter = 0;
  private mode: string;
  private overlays: string[];
  private material: THREE.Material | null = null;
  /** Kept so a skin change does not refetch anything (GlobeTextureLoader caches too). */
  private textures: Record<string, THREE.Texture> = {};
  private textureStates: Record<string, TextureState> = {};
  /** Start-up failed, so a texture never asked for will not arrive either. */
  private initFailed = false;
  /** The viewer's choice, or 'auto' for the mode's own skin. */
  private skin: GlobeSkin | 'auto' = 'auto';
  private eventHandlers: Record<string, ((event: GlobeEvent) => void)[]> = {};
  private overlayData: Record<string, unknown> = {};
  // Overlay data cache (see globe-overlays.artifact, UI/UX guidelines)
  private overlayDataCache: Record<string, unknown> = {};
  // Optional overlay objects (THREE) for renderers that consume ready-made meshes
  private overlayObjects: Record<string, THREE.Object3D | undefined> = {};
  // Checksums to debounce redundant space weather geometry rebuilds
  private spaceWeatherChecksums: Record<string, string> = {};
  private readonly instanceId: string;
  private pollerScopes: string[];
  private readonly spaceAssetsPollerKey: string;
  private readonly spaceWeatherPollerKey: string;
  /** Set by dispose(); checked by the async paths that could otherwise outlive it. */
  private disposed = false;

  constructor(config: GlobeEngineConfig) {
    this.instanceId = `globe-${++GlobeEngine.instanceCounter}`;
    this.pollerScopes = this.computePollerScopes(config.mode);
    this.spaceAssetsPollerKey = `${this.instanceId}-space-assets`;
    this.spaceWeatherPollerKey = `${this.instanceId}-space-weather`;
    this.mode = config.mode;
    this.overlays = config.overlays || [];
    if (config.onEvent) {
      // Register the event handler for all event types
      this.on('overlayDataLoading', config.onEvent);
      this.on('overlayDataUpdated', config.onEvent);
      this.on('overlayDataError', config.onEvent);
      this.on('overlayAdded', config.onEvent);
      this.on('overlayRemoved', config.onEvent);
    }
    // Async init
    this.init();
  }

  private async init() {
    try {
      // AI-NOTE: See globe-mode-mapping-reference.artifact, globe-modes.artifact, globe-shaders.artifact, globe-textures.artifact
      /*
       * Only the textures this skin samples (SKIN_TEXTURES).
       *
       * This fetched all seven Earth textures and the clouds on every visit;
       * the default view drew three of them — 2.04 MB of an 8.55 MB first visit
       * spent on nothing, measured server-side on 2026-09-25. The clouds were
       * never read at all: the cloud layer loads its own.
       *
       * Looped because the skin can change while the fetch is in flight, and
       * building the new skin's material from the old skin's textures would
       * leave slots empty. Each pass fetches only what is still missing.
       */
      let skin = this.resolvedSkin();
      await this.ensureTextures(SKIN_TEXTURES[skin]);
      while (!this.disposed && skin !== this.resolvedSkin()) {
        skin = this.resolvedSkin();
        await this.ensureTextures(SKIN_TEXTURES[skin]);
      }
      const textures: Record<string, THREE.Texture> = this.textures;
      // Disposed while the textures loaded — Globe.tsx replaced this engine before
      // it finished starting. Building a material now would hand one to a
      // component that has already moved on, and starting pollers would register
      // keys nothing can stop.
      if (this.disposed) return;
      this.material = GlobeMaterialManager.getMaterialForSkin(this.resolvedSkin(), textures);
      
      // Initialize overlays
      if (this.overlays.includes('spaceAssets')) {
        this.startSpaceAssetsUpdates();
      } else {
        this.stopSpaceAssetsUpdates();
      }
      
      // Start space weather updates if any space weather overlays are active
      if (this.overlays.some(o => o.startsWith('spaceWeather'))) {
        this.startSpaceWeatherUpdates();
      } else {
        this.stopSpaceWeatherUpdates();
      }
    } catch (error) {
      log.error('GlobeEngine initialization failed:', error);
      // From what is known here only: this path must not throw on its own.
      this.initFailed = true;
      for (const t of Object.values(this.textureStates)) {
        if (t.state !== 'ready') this.setTextureState(t.name, 'failed');
      }
      // Create a basic fallback material
      this.material = new THREE.MeshBasicMaterial({ color: 0x4444ff });
    }
  }

  /**
   * Fetch any of these textures not yet held. A texture that fails or times
   * out gets a one-pixel stand-in, as init always did, so a skin never builds
   * with an empty slot.
   */
  private async ensureTextures(names: readonly string[]): Promise<void> {
    const missing = names.filter((name) => !this.textures[`${name}Texture`]);
    await Promise.all(missing.map(async (name) => {
      const started = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      this.setTextureState(name, 'loading');
      try {
        this.textures[`${name}Texture`] = await Promise.race([
          GlobeTextureLoader.loadTexture(name),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new TextureTimeout(`Texture loading timeout for ${name}`)), TEXTURE_TIMEOUT_MS);
          }),
        ]);
        this.setTextureState(name, 'ready', Date.now() - started);
      } catch (error) {
        this.setTextureState(name, error instanceof TextureTimeout ? 'timeout' : 'failed');
        log.warn(`Failed to load texture ${name}:`, error);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = name === 'earthDark' ? '#002244' : '#4477cc';
          ctx.fillRect(0, 0, 1, 1);
        }
        this.textures[`${name}Texture`] = new THREE.CanvasTexture(canvas);
      } finally {
        clearTimeout(timer);
      }
    }));
  }

  private setTextureState(name: string, state: TextureState['state'], ms?: number): void {
    this.textureStates[name] = { name, label: TEXTURE_LABELS[name] ?? name, state, ms };
    this.emit('texturesChanged', { name, state });
  }

  /** How each texture the current skin draws stands, in the skin's order. */
  getTextureStates(): TextureState[] {
    return SKIN_TEXTURES[this.resolvedSkin()].map((name) =>
      this.textureStates[name] ?? { name, label: TEXTURE_LABELS[name] ?? name, state: this.initFailed ? 'failed' : 'waiting' });
  }

  /**
   * Ask again for the textures that failed or timed out, and rebuild the
   * surface with whatever arrives. A texture that fails again keeps its
   * stand-in and says so.
   */
  async retryTextures(): Promise<void> {
    const again = Object.values(this.textureStates)
      .filter((t) => t.state === 'failed' || t.state === 'timeout')
      .map((t) => t.name);
    if (again.length === 0 || this.disposed) return;
    for (const name of again) delete this.textures[`${name}Texture`];
    await this.ensureTextures(again);
    if (this.disposed || !this.material) return;
    const skin = this.resolvedSkin();
    const previous = this.material;
    this.material = GlobeMaterialManager.getMaterialForSkin(skin, this.textures);
    GlobeMaterialManager.disposeMaterial(previous);
    this.emit('materialChanged', { skin });
  }

  private computePollerScopes(mode: string) {
    return combineScopes(makeModeScope(mode), makeRouteScope('cybercommand'), makeInstanceScope(this.instanceId));
  }

  private startSpaceAssetsUpdates() {
    this.stopSpaceAssetsUpdates();
    pollerRegistry.register(this.spaceAssetsPollerKey, (signal) => this.fetchAndUpdateSpaceAssets(signal), {
      intervalMs: 60_000,
      minIntervalMs: 60_000,
      jitterMs: 2_000,
      immediate: true,
      scope: this.pollerScopes,
    });
  }

  private stopSpaceAssetsUpdates() {
    pollerRegistry.stop(this.spaceAssetsPollerKey);
  }

  private async fetchAndUpdateSpaceAssets(signal?: AbortSignal) {
    if (signal?.aborted) return;
    this.emit('overlayDataLoading', { overlay: 'spaceAssets' });
    try {
      const data = await fetchSpaceAssets();
      if (signal?.aborted) return;
      this.overlayDataCache['spaceAssets'] = data;
      this.setOverlayData('spaceAssets', data);
    } catch (err) {
      if (signal?.aborted) return;
      this.emit('overlayDataError', { overlay: 'spaceAssets', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // AI-NOTE: Space weather periodic update methods
  private startSpaceWeatherUpdates() {
    /*
     * Start means "make sure it is running", not "restart it".
     *
     * This stopped and re-registered unconditionally, and registration polls
     * immediately. Harmless while the overlays only ever arrived in the
     * constructor; once they were added to a living engine one at a time, one
     * layer selection polled six times at once — measured, 6 NOAA requests
     * across a sweep that had made 1.
     */
    if (pollerRegistry.isActive(this.spaceWeatherPollerKey)) return;
    pollerRegistry.register(this.spaceWeatherPollerKey, (signal) => this.fetchAndUpdateSpaceWeather(signal), {
      intervalMs: 5 * 60 * 1000,
      minIntervalMs: 5 * 60 * 1000,
      jitterMs: 5_000,
      immediate: true,
      scope: this.pollerScopes,
    });
  }

  private stopSpaceWeatherUpdates() {
    pollerRegistry.stop(this.spaceWeatherPollerKey);
  }

  // This used to also fetch InterMag/US-Canada electric-field data here (independently of
  // the identical fetch the React-side SpaceWeatherContext/useSpaceWeatherData pipeline
  // already makes) and store it under the plain 'spaceWeather' overlay key — but nothing
  // ever read that key's data. The visible electric-field points are rendered entirely
  // through Globe.tsx's own React state (built from SpaceWeatherContext's
  // visualizationVectors), not from GlobeEngine.overlayData. Globe.tsx's own
  // 'overlayDataUpdated' listener explicitly filters to the four boundary overlay keys
  // (spaceWeatherMagnetopause/BowShock/Aurora/GeomagneticIndex) and ignores plain
  // 'spaceWeather' — confirmed via a full-codebase grep for every reader of
  // overlayData['spaceWeather']/overlayDataCache['spaceWeather'] before removing this: only
  // this write site existed, nothing downstream ever consumed it. Removing it cuts this
  // poller's real NOAA request volume roughly in half every 5-minute cycle with zero
  // behavior change to anything actually rendered.
  private async fetchAndUpdateSpaceWeather(signal?: AbortSignal) {
    if (signal?.aborted) return;
    await this.fetchAndUpdateSpaceWeatherBoundaries(signal);
  }

  // AI-NOTE: Modeled boundaries for MVP until live endpoints are wired
  /**
   * The boundary refresh already under way, shared by every caller that asks
   * before it lands.
   *
   * One refresh computes all four shells — magnetopause, bow shock, aurora,
   * geomagnetic index — but addOverlay called it once per shell when nothing
   * was cached yet, and the cache fills only after the refresh resolves. So a
   * layer selection adding the four shells in one go refreshed four times over,
   * on top of the poller's own immediate run.
   */
  private boundaryRefreshInFlight: Promise<void> | null = null;

  private fetchAndUpdateSpaceWeatherBoundaries(signal?: AbortSignal): Promise<void> {
    if (this.boundaryRefreshInFlight) return this.boundaryRefreshInFlight;
    this.boundaryRefreshInFlight = this.refreshSpaceWeatherBoundaries(signal)
      .finally(() => { this.boundaryRefreshInFlight = null; });
    return this.boundaryRefreshInFlight;
  }

  /** The latest wind the engine read, for the boundaries while live. */
  private liveSolarWind: { snapshot: SolarWindSnapshot; quality: 'live' | 'fallback' } | null = null;
  /**
   * The wind at the bow shock for the moment the timeline is paused at, which the magnetopause and bow shock
   * then stand off from (SW30, the owner's pick: they follow the moment, D-E); null while live.
   */
  private boundaryWind: BoundaryWind | null = null;

  /** The magnetopause and the bow shock: for the moment's wind when one is set, else the latest read. */
  private standoffPayloads(): { magnetopause: MagnetopausePayload; bowShock: BowShockPayload } | null {
    const moment = this.boundaryWind;
    if (moment) {
      // Measured, however long ago, for the moment shown; drawn fainter where it is a stand-in or a model.
      const quality = moment.pushedBy || moment.kind === 'earliest-measured' ? 'fallback' : 'live';
      const magnetopause = buildMagnetopausePayload(moment.snapshot, quality);
      const bowShock = buildBowShockPayload(moment.snapshot, magnetopause.standoffRe, quality);
      const meta = { stale: false, ageMs: 0, wind: { kind: moment.kind, measuredAt: moment.measuredAt, pushedBy: moment.pushedBy } };
      magnetopause.meta = { ...(magnetopause.meta || {}), ...meta };
      bowShock.meta = { ...(bowShock.meta || {}), ...meta };
      return { magnetopause, bowShock };
    }
    const live = this.liveSolarWind;
    if (!live) return null;
    const solarWindAgeMs = Math.max(0, Date.now() - Date.parse(live.snapshot.timestamp));
    const solarWindStale = solarWindAgeMs > SOLAR_WIND_STALE_MS;
    const magnetopause: MagnetopausePayload = buildMagnetopausePayload(live.snapshot, live.quality);
    const bowShock: BowShockPayload = buildBowShockPayload(live.snapshot, magnetopause.standoffRe, live.quality);
    const qualityForSolarWind = solarWindStale ? 'stale' : live.quality;
    magnetopause.quality = qualityForSolarWind;
    bowShock.quality = qualityForSolarWind;
    magnetopause.meta = { ...(magnetopause.meta || {}), stale: solarWindStale, ageMs: solarWindAgeMs };
    bowShock.meta = { ...(bowShock.meta || {}), stale: solarWindStale, ageMs: solarWindAgeMs };
    return { magnetopause, bowShock };
  }

  /** Drawn where switched on, kept for the rest (D-SW, step 3). */
  private showBoundaries(boundaries: Record<string, unknown>) {
    for (const [overlay, data] of Object.entries(boundaries)) {
      this.overlayDataCache[overlay] = data;
      if (this.overlays.includes(overlay)) this.setOverlayData(overlay, data);
    }
  }

  /**
   * The wind for the moment the timeline is paused at, or null to go back to the latest read: the magnetopause
   * and bow shock are drawn again for it at once.
   */
  setBoundaryWind(wind: BoundaryWind | null): void {
    this.boundaryWind = wind;
    const standoffs = this.standoffPayloads();
    if (standoffs) this.showBoundaries({ spaceWeatherMagnetopause: standoffs.magnetopause, spaceWeatherBowShock: standoffs.bowShock });
    else void this.fetchAndUpdateSpaceWeatherBoundaries();
  }

  private async refreshSpaceWeatherBoundaries(signal?: AbortSignal) {
    if (signal?.aborted) return;
    try {
      const { snapshot: solarWind, quality: solarWindQuality } = await fetchLiveSolarWindSnapshot();
      const { snapshot: kp, quality: kpQuality } = await fetchLiveKpSnapshot();

      if (signal?.aborted) return;

      this.liveSolarWind = { snapshot: solarWind, quality: solarWindQuality };
      const now = Date.now();
      const kpAgeMs = Math.max(0, now - Date.parse(kp.timestamp));
      const kpStale = kpAgeMs > KP_STALE_MS;

      const { magnetopause, bowShock } = this.standoffPayloads()!;
      const aurora: AuroraPayload = buildAuroralPayload(kp, kpQuality);
      // Reuses the same kp/kpQuality fetch already made above for aurora —
      // no additional network call for this overlay.
      const geomagneticIndex: GeomagneticIndexPayload = buildGeomagneticIndexPayload(kp, kpQuality);

      const qualityForKp = kpStale ? 'stale' : kpQuality;
      aurora.quality = qualityForKp;
      aurora.meta = { ...(aurora.meta || {}), stale: kpStale, ageMs: kpAgeMs };
      geomagneticIndex.quality = qualityForKp;
      geomagneticIndex.meta = { ...(geomagneticIndex.meta || {}), stale: kpStale, ageMs: kpAgeMs };

      // Drawn and announced only where switched on; kept for the rest, so switching one on draws it at
      // once. Built for all four, the globe attached all four, toggles off or not (D-SW, step 3).
      this.showBoundaries({
        spaceWeatherMagnetopause: magnetopause,
        spaceWeatherBowShock: bowShock,
        spaceWeatherAurora: aurora,
        spaceWeatherGeomagneticIndex: geomagneticIndex,
      });
    } catch (error) {
      if (signal?.aborted) return;
      this.emit('overlayDataError', { overlay: 'spaceWeatherBoundaries', error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Add overlay (see globe-overlays.artifact)
   */
  addOverlay(overlay: string) {
    if (!this.overlays.includes(overlay)) {
      this.overlays.push(overlay);
      // Overlay data caching (see globe-overlays.artifact)
      if (this.overlayDataCache[overlay]) {
        this.setOverlayData(overlay, this.overlayDataCache[overlay]);
        this.emit('overlayAdded', overlay);
        // Start/stop periodic updates for spaceAssets and spaceWeather
        if (overlay === 'spaceAssets') this.startSpaceAssetsUpdates();
        if (overlay === 'spaceWeather') this.startSpaceWeatherUpdates();
        return;
      }
      // AI-NOTE: See globe-overlays.artifact for overlay logic and data sources.
      if (overlay === 'alerts') {
        // Fetch alerts from real API (artifact-driven)
        fetchAlerts().then((data) => {
          this.overlayDataCache['alerts'] = data;
          this.setOverlayData('alerts', data);
        });
      }
      if (overlay === 'weather') {
        // Fetch weather for key locations (artifact-driven, see globe-overlays.artifact)
        // Example: fetch for several major cities (can be replaced with dynamic locations)
        const locations = [
          { lat: 35, lng: 139 }, // Tokyo
          { lat: -33, lng: 151 }, // Sydney
          { lat: 40.7, lng: -74 }, // New York
          { lat: 51.5, lng: -0.1 }, // London
        ];
        Promise.all(locations.map(loc => fetchWeatherData(loc.lat, loc.lng)))
          .then((results) => {
            const data = results.map((weather, i) => ({
              id: i + 1,
              lat: locations[i].lat,
              lng: locations[i].lng,
              type: 'weather',
              ...weather,
            }));
            this.overlayDataCache['weather'] = data;
            this.setOverlayData('weather', data);
          });
      }
      if (overlay === 'borders') {
        // Fetch borders from static geojson
        fetch(assetUrl('borders.geojson'))
          .then(res => res.json())
          .then((geojson: { features: Array<{ properties?: { name?: string }, geometry: { type: string, coordinates: number[][] } }> }) => {
            // Parse LineString features into arrays of lat/lng
            const lines = (geojson.features || [])
              .filter((f) => f.geometry.type === 'LineString')
              .map((f) => ({
                id: f.properties?.name || 'border',
                coordinates: f.geometry.coordinates // [lng, lat] pairs
              }));
            this.overlayDataCache['borders'] = lines;
            this.setOverlayData('borders', lines);
          });
      }
      if (overlay === 'territories') {
        // Fetch territories from static geojson
        fetch(assetUrl('territories.geojson'))
          .then(res => res.json())
          .then((geojson: { features: Array<{ properties?: { name?: string }, geometry: { type: string, coordinates: number[][][] } }> }) => {
            // Parse Polygon features into arrays of lat/lng
            const polygons = (geojson.features || [])
              .filter((f) => f.geometry.type === 'Polygon')
              .map((f) => ({
                id: f.properties?.name || 'territory',
                coordinates: f.geometry.coordinates // array of rings: [ [ [lng, lat], ... ] ]
              }));
            this.overlayDataCache['territories'] = polygons;
            this.setOverlayData('territories', polygons);
          });
      }
      if (overlay === 'naturalEvents') {
        // Fetch natural events from real API (artifact-driven)
        fetchNaturalEvents().then((data) => {
          this.overlayDataCache['naturalEvents'] = data;
          this.setOverlayData('naturalEvents', data);
        });
      }
      if (overlay === 'spaceAssets') {
        this.startSpaceAssetsUpdates();
        return;
      }
      if (overlay === 'spaceWeather') {
        // Starts the poller that fetches the real NOAA boundary data (solar wind, Kp) the
        // magnetopause/bow-shock/aurora/geomagnetic-index shells need — NOT electric-field
        // data, which this engine no longer fetches itself (see fetchAndUpdateSpaceWeather).
        this.startSpaceWeatherUpdates();
        return;
      }

      // Modeled space weather boundary overlays (magnetopause, bow shock, aurora, geomagnetic index)
      if (overlay === 'spaceWeatherMagnetopause' || overlay === 'spaceWeatherBowShock' || overlay === 'spaceWeatherAurora' || overlay === 'spaceWeatherGeomagneticIndex') {
        // Start periodic updates if not already running
        if (!pollerRegistry.isActive(this.spaceWeatherPollerKey)) {
          this.startSpaceWeatherUpdates();
        }
        // If cached data exists, emit immediately; otherwise compute fallback once
        const cached = this.overlayDataCache[overlay];
        if (cached) {
          this.setOverlayData(overlay, cached);
          this.emit('overlayAdded', overlay);
          return;
        }
        this.fetchAndUpdateSpaceWeatherBoundaries();
        this.emit('overlayAdded', overlay);
        return;
      }
      
      // AI-NOTE: Space weather overlays integration (see NOAA-TDD-Implementation-Summary.md)
      if (overlay === 'spaceWeatherInterMag') {
        this.emit('overlayDataLoading', { overlay: 'spaceWeatherInterMag' });
        fetchLatestElectricFieldData('InterMag')
          .then((data) => {
            // Transform to intelligence markers for visualization
            const markers = transformNOAAToIntelMarkers(data, 'electric-field-intermag');
            this.overlayDataCache['spaceWeatherInterMag'] = markers;
            this.setOverlayData('spaceWeatherInterMag', markers);
          })
          .catch((err) => {
            this.emit('overlayDataError', { 
              overlay: 'spaceWeatherInterMag', 
              error: err?.message || String(err) 
            });
          });
        // Start space weather updates if not already running
        if (!pollerRegistry.isActive(this.spaceWeatherPollerKey)) {
          this.startSpaceWeatherUpdates();
        }
        return;
      }
      
      if (overlay === 'spaceWeatherUSCanada') {
        this.emit('overlayDataLoading', { overlay: 'spaceWeatherUSCanada' });
        fetchLatestElectricFieldData('US-Canada')  
          .then((data) => {
            // Transform to intelligence markers for visualization
            const markers = transformNOAAToIntelMarkers(data, 'electric-field-us-canada');
            this.overlayDataCache['spaceWeatherUSCanada'] = markers;
            this.setOverlayData('spaceWeatherUSCanada', markers);
          })
          .catch((err) => {
            this.emit('overlayDataError', { 
              overlay: 'spaceWeatherUSCanada', 
              error: err?.message || String(err) 
            });
          });
        // Start space weather updates if not already running
        if (!pollerRegistry.isActive(this.spaceWeatherPollerKey)) {
          this.startSpaceWeatherUpdates();
        }
        return;
      }
      
      this.emit('overlayAdded', overlay);
    }
  }

  /**
   * Remove overlay (see globe-overlays.artifact)
   */
  removeOverlay(overlay: string): void {
    this.overlays = this.overlays.filter(o => o !== overlay);
    // Optionally clear overlay data (but keep cache for efficiency)
    this.setOverlayData(overlay, undefined);
    this.emit('overlayRemoved', overlay);
    
    // Stop periodic updates for spaceAssets and spaceWeather
    if (overlay === 'spaceAssets') {
      this.stopSpaceAssetsUpdates();
    }
    if (overlay === 'spaceWeather') {
      this.stopSpaceWeatherUpdates();
    }
    // Stop space weather polling when no spaceWeather overlays remain
    if (!this.overlays.some(o => o.startsWith('spaceWeather'))) {
      this.stopSpaceWeatherUpdates();
    }
  }

  /**
   * Update space weather visualization with settings-based processing
   * Called by Globe component when settings change
   */
  updateSpaceWeatherVisualization(processedData: unknown, allowedBoundaryOverlays?: string[]): void {
    if (!this.overlays.includes('spaceWeather')) {
      this.addOverlay('spaceWeather');
    }
    const boundaryList = allowedBoundaryOverlays ?? ['spaceWeatherMagnetopause', 'spaceWeatherBowShock', 'spaceWeatherAurora', 'spaceWeatherGeomagneticIndex'];
    // Only add boundary overlays that the caller allows (respects user toggles)
    boundaryList.forEach((overlay) => {
      if (!this.overlays.includes(overlay)) {
        this.addOverlay(overlay);
      }
    });
    this.setOverlayData('spaceWeather', processedData);
  }

  /**
   * Get current overlays
   */
  getOverlays(): string[] {
    return this.overlays;
  }

  /**
   * Get overlay data (see globe-overlays.artifact)
   */
  getOverlayData(overlay: string): unknown {
    // AI-NOTE: Overlay data structure and update mechanism should be defined in globe-overlays.artifact
    return this.overlayData[overlay];
  }

  private computeSpaceWeatherChecksum(
    overlay: string,
    payload: MagnetopausePayload | BowShockPayload | AuroraPayload | GeomagneticIndexPayload
  ): string {
    const deformationSignature = (deformation?: {
      modelVersion?: string;
      noseRe?: number;
      flankRe?: number;
      tailRe?: number;
      alpha?: number;
      aberrationDeg?: number;
      dawnDuskSkew?: number;
      northSouthSkew?: number;
      confidence?: number;
    }) => {
      if (!deformation) return 'none';
      return [
        deformation.modelVersion || 'unknown',
        (deformation.noseRe ?? 0).toFixed(3),
        (deformation.flankRe ?? 0).toFixed(3),
        (deformation.tailRe ?? 0).toFixed(3),
        (deformation.alpha ?? 0).toFixed(4),
        (deformation.aberrationDeg ?? 0).toFixed(3),
        (deformation.dawnDuskSkew ?? 0).toFixed(4),
        (deformation.northSouthSkew ?? 0).toFixed(4),
        (deformation.confidence ?? 0).toFixed(3)
      ].join(':');
    };

    if (overlay === 'spaceWeatherMagnetopause') {
      const p = payload as MagnetopausePayload;
      const pressure = typeof (p.meta as Record<string, unknown> | undefined)?.pressureNPa === 'number'
        ? (p.meta as { pressureNPa: number }).pressureNPa
        : 0;
      return [
        'mp',
        JSON.stringify((p.meta as Record<string, unknown> | undefined)?.wind ?? null),
        p.quality,
        p.standoffRe.toFixed(3),
        p.clamped ? '1' : '0',
        pressure.toFixed(3),
        deformationSignature(p.deformation)
      ].join('|');
    }
    if (overlay === 'spaceWeatherBowShock') {
      const p = payload as BowShockPayload;
      const pressure = typeof (p.meta as Record<string, unknown> | undefined)?.pressureNPa === 'number'
        ? (p.meta as { pressureNPa: number }).pressureNPa
        : 0;
      return [
        'bs',
        JSON.stringify((p.meta as Record<string, unknown> | undefined)?.wind ?? null),
        p.quality,
        p.radiusRe.toFixed(3),
        p.clamped ? '1' : '0',
        pressure.toFixed(3),
        deformationSignature(p.deformation)
      ].join('|');
    }
    if (overlay === 'spaceWeatherAurora') {
      const p = payload as AuroraPayload;
      const gradient = p.blackout?.gradient || { inner: 0, outer: 0 };
      const pulse = (p.meta as Record<string, unknown> | undefined)?.pulse ? '1' : '0';
      return [
        'aurora',
        p.quality,
        p.kp.toFixed(2),
        gradient.inner.toFixed(3),
        gradient.outer.toFixed(3),
        pulse
      ].join('|');
    }
    if (overlay === 'spaceWeatherGeomagneticIndex') {
      const p = payload as GeomagneticIndexPayload;
      return ['geomagneticIndex', p.quality, p.kp.toFixed(2)].join('|');
    }
    return `${overlay}|${JSON.stringify(payload)}`;
  }

  /**
   * Set overlay data (see globe-overlays.artifact)
   */
  setOverlayData(overlay: string, data: unknown): void {
    // AI-NOTE: Overlay data update mechanism should be defined in globe-overlays.artifact
    const isSpaceWeatherBoundary =
      overlay === 'spaceWeatherMagnetopause' ||
      overlay === 'spaceWeatherBowShock' ||
      overlay === 'spaceWeatherAurora' ||
      overlay === 'spaceWeatherGeomagneticIndex';

    if (isSpaceWeatherBoundary && (data === undefined || data === null)) {
      // Clear stored THREE objects and checksums on teardown
      if (overlay === 'spaceWeatherAurora') {
        disposeObject(this.overlayObjects['spaceWeatherAuroraLinesNorth']);
        disposeObject(this.overlayObjects['spaceWeatherAuroraLinesSouth']);
        disposeObject(this.overlayObjects['spaceWeatherAuroraBlackout']);
        this.overlayObjects['spaceWeatherAuroraLinesNorth'] = undefined;
        this.overlayObjects['spaceWeatherAuroraLinesSouth'] = undefined;
        this.overlayObjects['spaceWeatherAuroraBlackout'] = undefined;
      }
      disposeObject(this.overlayObjects[overlay]);
      this.overlayObjects[overlay] = undefined;
      delete this.spaceWeatherChecksums[overlay];
    }

    if (isSpaceWeatherBoundary && data && typeof data === 'object') {
      const checksum = this.computeSpaceWeatherChecksum(
        overlay,
        data as MagnetopausePayload | BowShockPayload | AuroraPayload | GeomagneticIndexPayload
      );
      const previousChecksum = this.spaceWeatherChecksums[overlay];
      // Keep caches in sync even when we debounce rebuilds
      this.overlayDataCache[overlay] = data;
      this.overlayData[overlay] = data;
      if (previousChecksum === checksum) {
        this.emit('overlayDataUpdated', { overlay, data, unchanged: true });
        return;
      }
      this.spaceWeatherChecksums[overlay] = checksum;
    } else {
      this.overlayData[overlay] = data;
    }

    // Build THREE objects for space weather boundary overlays so consumers can attach them
    if (overlay === 'spaceWeatherMagnetopause' && data && typeof data === 'object') {
      const payload = data as MagnetopausePayload;
      disposeObject(this.overlayObjects[overlay]);
      this.overlayObjects[overlay] = createMagnetopauseContours(payload);
      logVertexCount('Magnetopause shell', this.overlayObjects[overlay]!);
    }
    if (overlay === 'spaceWeatherBowShock' && data && typeof data === 'object') {
      const payload = data as BowShockPayload;
      disposeObject(this.overlayObjects[overlay]);
      this.overlayObjects[overlay] = createBowShockContours(payload);
      logVertexCount('Bow shock shell', this.overlayObjects[overlay]!);
    }
    if (overlay === 'spaceWeatherAurora' && data && typeof data === 'object') {
      const payload = data as AuroraPayload;
      disposeObject(this.overlayObjects['spaceWeatherAuroraLinesNorth']);
      disposeObject(this.overlayObjects['spaceWeatherAuroraLinesSouth']);
      disposeObject(this.overlayObjects['spaceWeatherAuroraBlackout']);
      const lines = createAuroraLines(payload);
      this.overlayObjects['spaceWeatherAuroraLinesNorth'] = lines.north;
      this.overlayObjects['spaceWeatherAuroraLinesSouth'] = lines.south;
      this.overlayObjects['spaceWeatherAuroraBlackout'] = createAuroraBlackoutMesh(payload);
      logVertexCount('Aurora lines north', lines.north);
      logVertexCount('Aurora lines south', lines.south);
      logVertexCount('Aurora blackout band', this.overlayObjects['spaceWeatherAuroraBlackout']!);
    }
    if (overlay === 'spaceWeatherGeomagneticIndex' && data && typeof data === 'object') {
      const payload = data as GeomagneticIndexPayload;
      disposeObject(this.overlayObjects[overlay]);
      this.overlayObjects[overlay] = createGeomagneticIndexMesh(payload);
      logVertexCount('Geomagnetic index shell', this.overlayObjects[overlay]!);
    }

    this.emit('overlayDataUpdated', { overlay, data });
  }

  /**
   * Retrieve overlay THREE object(s) if available
   */
  getOverlayObject(overlay: string): THREE.Object3D | undefined {
    return this.overlayObjects[overlay];
  }

  /**
   * Register event handler (see globe-engine-api.artifact)
   */
  on(event: string, handler: (event: GlobeEvent) => void): void {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  /** Take a handler off. There was no way to: a listener lived as long as the engine. */
  off(event: string, handler: (event: GlobeEvent) => void): void {
    this.eventHandlers[event] = (this.eventHandlers[event] || []).filter((fn) => fn !== handler);
  }

  /**
   * Emit event (see globe-engine-api.artifact)
   */
  emit(event: string, payload: unknown): void {
    (this.eventHandlers[event] || []).forEach(fn => fn({ type: event, payload }));
  }

  /**
   * Stop everything this engine started, and release what it owns.
   *
   * It did not exist. Globe.tsx rebuilt the engine on every layer switch and its
   * effect cleanup never touched the engine it had made — measured, twenty-one
   * switches constructed twenty-four engines. Pollers are registered under a key
   * unique to the instance, so only the instance can stop them; the mode-change
   * sweep in VisualizationModeContext caught them eventually, but a switch
   * within one mode left the old engine's space-weather poller, material and
   * overlay objects alive until the mode changed.
   *
   * Idempotent, because React may run a cleanup and an unmount for the same
   * engine.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopSpaceWeatherUpdates();
    this.stopSpaceAssetsUpdates();
    if (this.material) {
      GlobeMaterialManager.disposeMaterial(this.material);
      this.material = null;
    }
    for (const key of Object.keys(this.overlayObjects)) {
      disposeObject(this.overlayObjects[key]);
    }
    this.overlayObjects = {};
    this.overlays = [];
    this.eventHandlers = {};
  }

  /** The skin actually in use: the viewer's choice, or this mode's own. */
  getSkin(): GlobeSkin {
    return this.resolvedSkin();
  }

  private resolvedSkin(): GlobeSkin {
    return this.skin === 'auto' ? GlobeModeMapping.getRenderConfigForMode(this.mode).shader : this.skin;
  }

  /**
   * Change the planet's look. Rebuilds the material from the textures already loaded
   * and disposes the old one; emits so whoever handed it to react-globe.gl swaps it.
   */
  setSkin(skin: GlobeSkin | 'auto'): void {
    if (skin === this.skin) return;
    this.skin = skin;
    // init() has not built the first material yet; it re-reads the skin after
    // every download round, so it will build this one.
    if (!this.material) return;
    /*
     * The new skin may need textures this engine never fetched — it fetches
     * only its own skin's now. Fetch them, then rebuild. The request number
     * drops a result a later setSkin has overtaken.
     */
    const wanted = this.resolvedSkin();
    const request = ++this.skinRequest;
    void this.ensureTextures(SKIN_TEXTURES[wanted]).then(() => {
      if (this.disposed || request !== this.skinRequest) return;
      const previous = this.material;
      this.material = GlobeMaterialManager.getMaterialForSkin(wanted, this.textures);
      if (previous) GlobeMaterialManager.disposeMaterial(previous);
      this.emit('materialChanged', { skin: wanted });
    });
  }

  /** Incremented per setSkin, so a slow fetch cannot apply a superseded skin. */
  private skinRequest = 0;

  /** The mode this engine was built for: a mode change builds another engine. */
  getMode(): string {
    return this.mode;
  }

  /**
   * Get current globe material (see globe-shaders.artifact)
   */
  getMaterial(): THREE.Material | null {
    return this.material;
  }
  // ...other API methods as defined in globe-engine-api.artifact
}
// Artifact references:
// - Overlay logic and periodic updates: globe-overlays.artifact
// - API/events: globe-engine-api.artifact
