// SolarSystemManager.ts - The solar system drawn round the globe: the Sun, the planets and
// the Moon at true sizes, where they are for the moment shown, fading in as the camera
// backs out (decision K6; record docs/missions/01-architecture-decisions/solar-system.md).
//
// It replaces four scale tiers that switched what was drawn, and at what size and
// distance, by the camera's distance, with no transition between them. Now there is one
// scale and one placement (bodyPlacement.ts), and one measure of how much is drawn: none
// while the Earth's marks are whole, all once they have gone (zoomOutFade.ts).

import { skyLook } from './sky/skyLook';
import { aboveHorizon } from './sky/horizon';
import { noteSolarSystemShown, unitsPerAuNow } from './solarScale';
import * as THREE from 'three';
import { SolarSystemManagerConfig } from './types/SolarSystemConfig';
import { SolarSunManager } from './SolarSunManager';
import { SolarActivityIntegration } from './integration/SolarActivityIntegration';
import { PlanetarySystemManager } from './PlanetarySystemManager';
import { BodyLabels, type LabelledBody } from './bodyLabels';
import { drawnRadius } from './bodyPlacement';
import type { SunState } from './SolarSunManager';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'SolarSystemManager' });

/**
 * How far out the camera is before Moon and planet imagery is fetched.
 *
 * All of it — 4.03 MB, measured server-side on 2026-09-25 — was fetched at start,
 * although nothing of the solar system is drawn in any normal view or capture. 700
 * units is altitude 6: past any capture (≤ 450 units at 3.5 radii), and short of where
 * the solar system starts to show in a 900-pixel-tall view (about 810 units, where the
 * Earth's radius is down to 120 pixels), so the imagery has a head start and does not
 * pop in. texturesOnApproach.test.ts holds it between the two. A smaller view starts
 * showing it sooner, and each body fetches its imagery when first shown, regardless.
 */
export const PREFETCH_DISTANCE = 700;

/**
 * A live moment moves on, and the bodies are placed again once it has moved this far.
 * The sky turns round the Earth a quarter of a degree a minute: in a second, the Sun
 * moves nine units of its 119,000.
 */
const PLACE_EVERY_MS = 1000;

/** The Earth, the globe itself, at the scene's origin: labelled with the rest. */
const EARTH_LABEL: LabelledBody = {
  id: 'earth', name: 'Earth', rank: 1, colour: 0x6b93d6, position: new THREE.Vector3(), radius: drawnRadius(6371),
};

export interface SolarSystemManagerDependencies {
  scene: THREE.Scene;
  camera: THREE.Camera;
  globe: {
    scene: () => THREE.Scene;
    camera: () => THREE.Camera;
  }; // Globe.gl reference
}

/** What one render of the solar system needs. */
export interface SolarSystemView {
  /** Where the camera is, in the scene, whose origin is the Earth's centre. */
  eye: THREE.Vector3;
  /** How much of the solar system is drawn, from 0 to 1 (zoomOutFade.ts's solarSystemShownFor). */
  shown: number;
  /** The moment shown, in ms since the epoch. */
  atMs: number;
  /** The camera drawn through and the viewport's size in CSS pixels, for the bodies' markers and names. */
  camera?: THREE.Camera;
  viewport?: THREE.Vector2;
}

export interface SolarSystemState {
  /** How much of the solar system is drawn, from 0 to 1. */
  shown: number;
  cameraDistance: number;
  sunState: SunState | null;
  planetaryInfo?: {
    visiblePlanets: number;
    activePlanets: string[];
    timeAcceleration: number;
  };
}

export type SolarSystemStateCallback = (state: SolarSystemState) => void;

export class SolarSystemManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private config: SolarSystemManagerConfig;
  private stateChangeListeners: SolarSystemStateCallback[] = [];
  private initialized: boolean = false;
  private disposed: boolean = false;
  private shown = 0;
  private lastEye: THREE.Vector3 | null = null;
  /** The moment the bodies were last placed for, or null before the first time. */
  private placedAtMs: number | null = null;
  /** The astronomical unit's drawn length the bodies were last placed at: a new one places them again. */
  private placedPerAu: number | null = null;

  // Solar system components
  private sunManager: SolarSunManager | null = null;
  private solarActivityIntegration: SolarActivityIntegration | null = null;
  private planetarySystemManager: PlanetarySystemManager | null = null;
  private labels: BodyLabels | null = null;

  private readonly defaultConfig: SolarSystemManagerConfig = {
    performanceMode: 'balanced',
    debugMode: false,
    enableSolarActivityIntegration: true
  };

  constructor(
    dependencies: SolarSystemManagerDependencies,
    config?: Partial<SolarSystemManagerConfig>
  ) {
    this.validateDependencies(dependencies);

    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.config = { ...this.defaultConfig, ...config };

    this.initialize();
  }

  private validateDependencies(dependencies: SolarSystemManagerDependencies): void {
    if (!dependencies.scene) {
      throw new Error('Scene is required for SolarSystemManager');
    }
    if (!dependencies.camera) {
      throw new Error('Camera is required for SolarSystemManager');
    }
    if (!dependencies.globe) {
      throw new Error('Globe reference is required for SolarSystemManager');
    }
  }

  private initialize(): void {
    if (this.disposed) {
      throw new Error('Cannot initialize disposed SolarSystemManager');
    }

    if (this.initialized) return;

    this.log('SolarSystemManager initialized', { config: this.config });

    this.sunManager = new SolarSunManager(this.scene);
    // Drives solar activity gating and state broadcasts.
    this.sunManager.onStateChange((state) => {
      this.handleSunStateChange(state);
    });

    this.initializePlanetarySystem();
    this.labels = new BodyLabels(this.scene);

    this.initialized = true;
  }

  private initializeSolarActivity(): void {
    if (!this.config.enableSolarActivityIntegration || this.solarActivityIntegration) {
      return;
    }

    if (!this.sunManager?.isVisible()) {
      this.log('Solar activity initialization deferred until the Sun is drawn');
      return;
    }

    try {
      // Initialize solar activity integration with NOAA data
      this.solarActivityIntegration = new SolarActivityIntegration(this.sunManager, {
        noaaUpdateInterval: 15000, // More frequent updates for real-time feel
        noaaFallbackMode: true,
        enableRealTimeUpdates: true, // Always enable for dynamic effects
        enableActivityScaling: true, // Scale effects with sun size
        enableCrossFade: true, // Smooth transitions
        maxActivityLevel: 'extreme', // Allow all activity levels
        solarActivity: {
          coronaLayers: this.config.performanceMode === 'high' ? 4 : 3, // More layers for richer corona
          enableFlareParticles: true, // Always enable flare particles
          flareParticleCount: this.config.performanceMode === 'high' ? 1500 : 800, // More particles
          enableHighQuality: this.config.performanceMode !== 'low'
        }
      });

      this.log('Solar activity integration initialized - may be deferred if sun mesh not ready');
    } catch (error) {
      log.warn('Solar activity integration initialization deferred:', error);
      // Note: This is now expected behavior when sun mesh isn't ready
    }
  }

  private handleSunStateChange(state: SunState): void {
    if (this.disposed) {
      return;
    }

    if (this.config.enableSolarActivityIntegration) {
      if (state.isVisible) {
        if (!this.solarActivityIntegration) {
          this.initializeSolarActivity();
        } else {
          // A no-op once its visualizer exists; it may not, if the Sun's mesh was not ready.
          this.solarActivityIntegration.retryInitialization().catch(error => {
            log.warn('Failed to retry solar activity initialization:', error);
          });
          this.solarActivityIntegration.resume();
        }
      } else if (this.solarActivityIntegration) {
        this.solarActivityIntegration.pause();
      }
    }

    this.notifyStateChange();
  }

  private initializePlanetarySystem(): void {
    try {
      // Initialize planetary system with performance-appropriate settings
      this.planetarySystemManager = new PlanetarySystemManager(this.scene, {
        timeAcceleration: 1, // Real-time by default
        showOrbitalPaths: this.config.performanceMode !== 'low',
        enableLighting: true,
        performanceMode: this.config.performanceMode,
        maxVisiblePlanets: this.config.performanceMode === 'high' ? 8 : 6,
        orbitalPathSegments: this.config.performanceMode === 'high' ? 128 : 64,
        enableAtmospheres: this.config.performanceMode !== 'low'
      });

      this.log('Planetary system initialized');
    } catch (error) {
      log.error('Failed to initialize planetary system:', error);
    }
  }

  /**
   * One render of the solar system, called at the start of every render of the scene
   * (GlobeSolarSystemIntegration). While nothing is drawn it does nothing more than
   * hide, so close-up work costs nothing. Once something is, the bodies are placed for
   * the moment before they are drawn, and again whenever it moves on.
   */
  public frame(view: SolarSystemView): void {
    if (this.disposed) return;

    const distance = view.eye.length();
    this.lastEye = view.eye;
    // Heading out: fetch the imagery the solar system will need, before it does.
    if (distance >= PREFETCH_DISTANCE) this.planetarySystemManager?.prefetchTextures();

    const shown = Math.max(0, Math.min(1, view.shown));
    noteSolarSystemShown(shown);
    // Again whenever the scale moves (OR9): every frame of a glide, and never while it stands still.
    const perAu = unitsPerAuNow();
    if (shown > 0 && (this.placedAtMs === null || Math.abs(view.atMs - this.placedAtMs) >= PLACE_EVERY_MS || perAu !== this.placedPerAu)) {
      this.placeAt(new Date(view.atMs));
    }
    if (shown === 0 && this.shown === 0) return;

    this.shown = shown;
    this.planetarySystemManager?.setShown(shown, distance);
    const camera = view.camera as THREE.PerspectiveCamera | undefined;
    if (camera?.isPerspectiveCamera && view.viewport) {
      // In Sky from a place, only what stands above the observer's horizon is named, and never the Earth they stand on (D5).
      const named = skyLook() ? aboveHorizon(this.labelledBodies(), view.eye) : this.labelledBodies();
      this.labels?.update(named, camera, view.viewport, shown);
    }
    // Last, so a change in whether the Sun is drawn reports the planets' state with it.
    this.sunManager?.setShown(shown);
    this.sunManager?.view(view.eye, camera?.isPerspectiveCamera ? camera : undefined, view.viewport?.y);
    // This runs in the scene's onBeforeRender, after three.js has worked out the render's matrices, so what was just
    // placed would be drawn a render late. On screen that is a frame; a capture drew the render before's: after a
    // smaller one, every name and marker at that render's size (found 25 Oct, a giant "Venus" across a card).
    this.planetarySystemManager?.commitMatrices();
    this.sunManager?.commitMatrices();
  }

  /** Every body with a marker and a name: the Sun, the Earth, the Moon and the planets. */
  private labelledBodies(): LabelledBody[] {
    const bodies = [EARTH_LABEL, ...(this.planetarySystemManager?.getLabelledBodies() ?? [])];
    const sun = this.sunManager?.getCurrentState();
    if (sun) bodies.push({ id: 'sun', name: 'Sun', rank: 0, colour: 0xffaa00, position: sun.currentPosition, radius: sun.currentRadius });
    return bodies;
  }

  /** Whether a body's marker, name or edge pointer is drawn now. */
  public isLabelDrawn(id: string, part: 'marker' | 'name' | 'pointer'): boolean {
    return this.labels?.isDrawn(id, part) ?? false;
  }

  /** Places the Sun, the planets and the Moon for the moment `at`. */
  public placeAt(at: Date): void {
    if (this.disposed) return;
    this.placedAtMs = at.getTime();
    this.placedPerAu = unitsPerAuNow();
    this.sunManager?.placeAt(at);
    this.planetarySystemManager?.setCurrentTime(at);
  }

  /** How much of the solar system is drawn, from 0 to 1. */
  public getShown(): number {
    return this.shown;
  }

  /**
   * The current state, built on demand.
   *
   * Extracted so a NEW SUBSCRIBER can be handed it immediately — see
   * onStateChange. Every field is read from live state, so there was never a
   * reason a subscriber had to wait for an unrelated change to learn where the
   * camera was.
   */
  private buildState(): SolarSystemState {
    return {
      shown: this.shown,
      cameraDistance: (this.lastEye ?? this.camera.position).length(),
      sunState: this.sunManager?.getCurrentState() || null,
      planetaryInfo: this.planetarySystemManager ? {
        visiblePlanets: this.planetarySystemManager.getVisiblePlanets().length,
        activePlanets: Object.keys(this.planetarySystemManager.getPlanets()),
        timeAcceleration: this.planetarySystemManager.getTimeAcceleration()
      } : undefined
    };
  }

  private notifyStateChange(): void {
    if (this.disposed) return;
    const state = this.buildState();

    this.stateChangeListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        log.warn('Error in state change listener:', error);
      }
    });
  }

  /**
   * Subscribe to solar system state changes: whether the Sun is drawn, as it starts
   * and stops being.
   */
  public onStateChange(callback: SolarSystemStateCallback): void {
    this.stateChangeListeners.push(callback);

    /*
     * A new subscriber is given the CURRENT state at once.
     *
     * Nothing emitted after construction, so a consumer that subscribed and then
     * waited got null until something unrelated happened to change. The state is
     * built on demand from current fields, so there was never a reason to withhold
     * it. RLSHVisualizationService.subscribe() already replays to a new subscriber
     * for the same reason.
     */
    if (this.disposed) return;
    callback(this.buildState());
  }

  /**
   * Unsubscribe from solar system state changes
   */
  public offStateChange(callback: SolarSystemStateCallback): void {
    const index = this.stateChangeListeners.indexOf(callback);
    if (index >= 0) {
      this.stateChangeListeners.splice(index, 1);
    }
  }

  /**
   * Get the current configuration
   */
  public getConfig(): SolarSystemManagerConfig {
    return { ...this.config };
  }

  /**
   * Check if the manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized && !this.disposed;
  }

  /**
   * Dispose of the solar system manager and clean up resources
   */
  public dispose(): void {
    if (this.disposed) return;

    this.log('SolarSystemManager disposed');

    // Dispose sun manager
    if (this.sunManager) {
      this.sunManager.dispose();
      this.sunManager = null;
    }

    // Dispose activity integration
    if (this.solarActivityIntegration) {
      this.solarActivityIntegration.dispose();
      this.solarActivityIntegration = null;
    }

    // Dispose planetary system
    if (this.planetarySystemManager) {
      this.planetarySystemManager.dispose();
      this.planetarySystemManager = null;
    }
    this.labels?.dispose();
    this.labels = null;

    // Clear all listeners
    this.stateChangeListeners.length = 0;

    // Mark as disposed
    this.disposed = true;
    this.initialized = false;
  }

  /**
   * Get current solar activity state (Phase 2)
   */
  public getSolarActivityState() {
    return this.solarActivityIntegration?.getState() || null;
  }

  /**
   * Get current space weather data (Phase 2)
   */
  public async getCurrentSpaceWeather() {
    return this.solarActivityIntegration?.getCurrentSpaceWeather() || null;
  }

  /**
   * Enable or disable real-time solar activity updates (Phase 2)
   */
  public setSolarActivityUpdates(enabled: boolean): void {
    this.solarActivityIntegration?.setRealTimeUpdates(enabled);
  }

  /**
   * Force update solar activity data (Phase 2)
   */
  public async updateSolarActivity(): Promise<void> {
    await this.solarActivityIntegration?.forceUpdate();
  }

  private log(message: unknown, ...args: unknown[]): void {
    if (this.config.debugMode) {
      log.debug(message, ...args);
    }
  }
}
