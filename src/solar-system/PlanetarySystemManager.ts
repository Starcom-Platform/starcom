// PlanetarySystemManager.ts - Core manager for planetary system rendering and dynamics

import * as THREE from 'three';
import { PlanetarySystemConfig, PlanetaryPerformanceMetrics } from './types/PlanetaryTypes';
import { Planet } from './components/Planet';
import { Moon } from './components/Moon';
import { EarthOrbit } from './components/EarthOrbit';
import { orbitShown } from './bodyPlacement';
import type { LabelledBody } from './bodyLabels';

/**
 * Whose name keeps its place where names would overlap, after the Sun's (0) and the
 * Earth's (1): the Moon, then by how much each stands out in the night sky.
 */
const LABEL_RANK: Record<string, number> = {
  moon: 2, jupiter: 3, saturn: 4, venus: 5, mars: 6, mercury: 7, uranus: 8, neptune: 9,
};

export class PlanetarySystemManager {
  private scene: THREE.Scene;
  private config: Required<PlanetarySystemConfig>;
  private planets: Map<string, Planet> = new Map();
  // The Moon orbits the real interactive Globe (already at the world origin), not a
  // duplicate "Earth" Planet instance — see the note in createPlanets() below.
  private moon: Moon | null = null;
  /** The Earth's own path round the Sun: there is no Earth planet to draw it (EarthOrbit.ts). */
  private earthOrbit: EarthOrbit | null = null;
  private initialized: boolean = false;
  private paused: boolean = false;
  private disposed: boolean = false;

  // Time management
  private currentTime: Date = new Date();
  private timeAcceleration: number = 1;
  private lastUpdateTime: number = 0;

  // Performance tracking
  private performanceMetrics: PlanetaryPerformanceMetrics = {
    frameTime: 0,
    activePlanets: 0,
    visiblePlanets: 0,
    memoryUsage: 0
  };

  // Default configuration
  private readonly defaultConfig: Required<PlanetarySystemConfig> = {
    timeAcceleration: 1,
    showOrbitalPaths: true,
    enableLighting: true,
    performanceMode: 'balanced',
    maxVisiblePlanets: 8,
    orbitalPathSegments: 64,
    enableAtmospheres: true,
    enableMagnetospheres: false // Will be enabled in later weeks
  };

  constructor(scene: THREE.Scene, config: Partial<PlanetarySystemConfig> = {}) {
    this.scene = scene;
    this.config = { ...this.defaultConfig, ...config };
    this.timeAcceleration = this.config.timeAcceleration;
    
    this.initialize();
  }

  private initialize(): void {
    if (this.disposed) {
      throw new Error('Cannot initialize disposed PlanetarySystemManager');
    }

    this.createPlanets();
    this.moon = new Moon(this.scene);
    this.earthOrbit = new EarthOrbit(this.scene);
    this.earthOrbit.update(this.currentTime);
    this.setupLighting();
    this.initialized = true;
    this.lastUpdateTime = Date.now();
  }

  private createPlanets(): void {
    // All 8 planets except Earth: the real interactive Globe already renders Earth
    // (with all its real data layers) at the world origin, and every position here is
    // computed geocentrically (relative to Earth) — a separate "Earth" Planet instance
    // would trivially sit at (0,0,0) forever, overlapping the real globe. The Moon
    // orbits the real globe directly (see the Moon class) instead of hanging off a
    // duplicate Earth. Real physical constants (radius, semi-major axis, sidereal
    // period); actual positions come from real ephemeris (EphemerisService), not these
    // orbitRadius/orbitPeriod fields directly — they're kept accurate anyway since
    // orbitPeriod drives orbital-path sampling and distanceFromSun's initial value.
    const planetData = [
      {
        name: 'mercury',
        radius: 2439.7, // km
        orbitRadius: 0.387, // AU
        orbitPeriod: 87.97, // days
        color: 0x8c7853,
        hasAtmosphere: false
      },
      {
        name: 'venus',
        radius: 6051.8, // km
        orbitRadius: 0.723, // AU
        orbitPeriod: 224.7, // days
        color: 0xffc649,
        hasAtmosphere: true
      },
      {
        name: 'mars',
        radius: 3389.5, // km
        orbitRadius: 1.524, // AU
        orbitPeriod: 686.98, // days
        color: 0xcd5c5c,
        hasAtmosphere: true
      },
      {
        name: 'jupiter',
        radius: 69911, // km
        orbitRadius: 5.203, // AU
        orbitPeriod: 4332.59, // days (~11.86 years)
        color: 0xd8ca9d,
        hasAtmosphere: true
      },
      {
        name: 'saturn',
        radius: 58232, // km
        orbitRadius: 9.537, // AU
        orbitPeriod: 10759.22, // days (~29.46 years)
        color: 0xead6b8,
        hasAtmosphere: true,
        hasRings: true
      },
      {
        name: 'uranus',
        radius: 25362, // km
        orbitRadius: 19.191, // AU
        orbitPeriod: 30688.5, // days (~84.01 years)
        color: 0xd1e7e7,
        hasAtmosphere: true
      },
      {
        name: 'neptune',
        radius: 24622, // km
        orbitRadius: 30.069, // AU
        orbitPeriod: 60182, // days (~164.8 years)
        color: 0x5b5ddf,
        hasAtmosphere: true
      }
    ];

    for (const data of planetData) {
      const planet = new Planet(this.scene, data);
      this.planets.set(data.name, planet);
    }

    this.performanceMetrics.activePlanets = this.planets.size;
  }

  private setupLighting(): void {
    if (!this.config.enableLighting) return;

    // Lighting will be handled by SolarSunManager
    // This is a placeholder for planet-specific lighting setup
  }

  /**
   * Get initialization status
   */
  public isInitialized(): boolean {
    return this.initialized && !this.disposed;
  }

  /**
   * Get current time acceleration factor
   */
  public getTimeAcceleration(): number {
    return this.timeAcceleration;
  }

  /**
   * Set time acceleration factor
   */
  public setTimeAcceleration(acceleration: number): void {
    this.timeAcceleration = Math.max(0, acceleration);
  }

  /**
   * Get current configuration
   */
  public getConfig(): Required<PlanetarySystemConfig> {
    return { ...this.config };
  }

  /**
   * Get all planets
   */
  public getPlanets(): Record<string, Planet> {
    const result: Record<string, Planet> = {};
    for (const [name, planet] of this.planets) {
      result[name] = planet;
    }
    return result;
  }

  /**
   * Get specific planet by name
   */
  public getPlanet(name: string): Planet | null {
    return this.planets.get(name) || null;
  }

  /**
   * Get all planet positions
   */
  public getAllPlanetPositions(): Record<string, THREE.Vector3> {
    const positions: Record<string, THREE.Vector3> = {};
    for (const [name, planet] of this.planets) {
      positions[name] = planet.getPosition().clone();
    }
    return positions;
  }

  /**
   * Get the Moon's current position (geocentric, relative to the real Globe)
   */
  public getMoonPosition(): THREE.Vector3 | null {
    return this.moon ? this.moon.getPosition() : null;
  }

  public isMoonVisible(): boolean {
    return this.moon ? this.moon.isVisible() : false;
  }

  /** The Moon and the planets, as their markers and names need them (bodyLabels.ts). */
  public getLabelledBodies(): LabelledBody[] {
    const bodies = [...this.planets.values()].map((planet) => planet.getLabelled());
    if (this.moon) bodies.push(this.moon.getLabelled());
    return bodies.map((body) => ({ ...body, rank: LABEL_RANK[body.id] ?? 10 }));
  }

  /** The planets drawn now. */
  public getVisiblePlanets(): Planet[] {
    return [...this.planets.values()].filter((planet) => planet.isVisible());
  }

  /**
   * Advance time by specified seconds
   */
  public advanceTime(deltaSeconds: number): void {
    if (this.paused || this.disposed) return;

    const acceleratedDelta = deltaSeconds * this.timeAcceleration;
    this.currentTime = new Date(this.currentTime.getTime() + (acceleratedDelta * 1000));

    // Update all planets
    for (const planet of this.planets.values()) {
      planet.updateOrbitalPosition(this.currentTime);
    }
    this.moon?.updatePosition(this.currentTime);
    this.earthOrbit?.update(this.currentTime);

    this.lastUpdateTime = Date.now();
  }

  /**
   * Pause orbital motion
   */
  public pause(): void {
    this.paused = true;
  }

  /**
   * Resume orbital motion
   */
  public resume(): void {
    this.paused = false;
  }

  /**
   * Get pause status
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Set current time
   */
  public setCurrentTime(time: Date): void {
    this.currentTime = new Date(time.getTime());

    // Update all planets to new time
    for (const planet of this.planets.values()) {
      planet.updateOrbitalPosition(this.currentTime);
    }
    this.moon?.updatePosition(this.currentTime);
    this.earthOrbit?.update(this.currentTime);
  }

  /**
   * Get current time
   */
  public getCurrentTime(): Date {
    return new Date(this.currentTime.getTime());
  }

  /**
   * Fetch every planet's imagery and the Moon's. Each fetches at most once.
   * Called as the camera heads out; see SolarSystemManager.PREFETCH_DISTANCE.
   */
  public prefetchTextures(): void {
    if (this.disposed) return;
    for (const planet of this.planets.values()) planet.prefetchTextures();
    this.moon?.prefetchTextures();
  }

  /** The planets' and the Moon's matrices worked out now, for the render under way (SolarSystemManager.frame). */
  public commitMatrices(): void {
    if (this.disposed) return;
    for (const planet of this.planets.values()) planet.commitMatrices();
    this.moon?.commitMatrices();
  }

  /**
   * How much of the planets and the Moon is drawn, the camera `cameraDistance` from
   * the Earth (decision K6, SS3): every body by `shown`, and each orbit line by `shown`
   * and by whether the camera has backed out far enough to see the orbit whole.
   */
  public setShown(shown: number, cameraDistance: number): void {
    if (this.disposed) return;

    const showPaths = shown > 0 && this.config.showOrbitalPaths;
    for (const planet of this.planets.values()) {
      planet.setShown(shown);
      planet.setOrbitShown(showPaths ? shown * orbitShown(cameraDistance, planet.getOrbitReach()) : 0);
    }
    this.moon?.setShown(shown);
    this.moon?.setOrbitShown(showPaths && this.moon ? shown * orbitShown(cameraDistance, this.moon.getOrbitReach()) : 0);
    this.earthOrbit?.setOrbitShown(showPaths && this.earthOrbit ? shown * orbitShown(cameraDistance, this.earthOrbit.getOrbitReach()) : 0);

    this.performanceMetrics.visiblePlanets = shown > 0 ? this.planets.size : 0;
  }

  /** Whether any planet's orbit line is drawn. */
  public areOrbitalPathsVisible(): boolean {
    return [...this.planets.values()].some((planet) => planet.isOrbitalPathVisible());
  }

  /**
   * Report frame time for performance tracking
   */
  public reportFrameTime(frameTime: number): void {
    this.performanceMetrics.frameTime = frameTime;
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PlanetaryPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Optimize performance based on current metrics
   */
  public optimizePerformance(): void {
    const frameTime = this.performanceMetrics.frameTime;
    
    if (frameTime > 33) { // Less than 30 FPS
      this.config.performanceMode = 'low';
      this.config.orbitalPathSegments = 32;
      this.config.enableAtmospheres = false;
    } else if (frameTime < 16) { // More than 60 FPS
      this.config.performanceMode = 'high';
      this.config.orbitalPathSegments = 128;
      this.config.enableAtmospheres = true;
    } else { // 30-60 FPS
      this.config.performanceMode = 'balanced';
      this.config.orbitalPathSegments = 64;
      this.config.enableAtmospheres = true;
    }

    // Apply optimizations to all planets
    for (const planet of this.planets.values()) {
      planet.applyPerformanceConfig(this.config);
    }
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    if (this.disposed) return;

    this.paused = true;

    // Dispose all planets
    for (const planet of this.planets.values()) {
      planet.dispose();
    }
    this.planets.clear();

    this.moon?.dispose();
    this.moon = null;
    this.earthOrbit?.dispose();
    this.earthOrbit = null;

    this.initialized = false;
    this.disposed = true;
  }
}
