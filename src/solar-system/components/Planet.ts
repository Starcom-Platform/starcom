// Planet.ts - One planet: real imagery, true size, drawn where it is in the Earth's sky
// (decision K6; where and how large: bodyPlacement.ts).

import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { PlanetInstance, PlanetarySystemConfig, PlanetaryState } from '../types/PlanetaryTypes';
import { bodyFromPlanetName, earthFromSun, getHeliocentricDistanceAU, sampleHeliocentricOrbit } from '../EphemerisService';
import { bodyTurn, drawnOrbitPoint, drawnRadius, drawnRadiusNow, placeInSky, sizeFactorNow, skyFrame, sunDirectionFrom } from '../bodyPlacement';
import { diagramRing } from '../solarScale';
import { createSunlitMaterial, setSunDirection, setSunlitMap, setSunlitOpacity, type SunlitMaterial } from '../sunlitMaterial';
import type { LabelledBody } from '../bodyLabels';

const ORBITAL_PATH_SEGMENTS = 128;
const ORBIT_OPACITY = 0.3;
const ATMOSPHERE_OPACITY = 0.2;
const RINGS_OPACITY = 0.85;
/** A ring is built flat across its own +Z; a planet's equator is across its +Y. */
const RINGS_IN_EQUATOR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Real CC BY 4.0 textures (solarsystemscope.com/textures), bundled locally rather than
// fetched live — the same reasoning as the Moon's texture and the Phase 3 plan for
// Earth's own textures: this app's runtime environment has shown live third-party
// fetches can silently fail, and a missing texture should fall back to the flat
// planetData.color, not a broken/blank sphere.
const PLANET_TEXTURE_URLS: Partial<Record<string, string>> = {
  mercury: '/assets/textures/planets/mercury.jpg',
  venus: '/assets/textures/planets/venus.jpg',
  mars: '/assets/textures/planets/mars.jpg',
  jupiter: '/assets/textures/planets/jupiter.jpg',
  saturn: '/assets/textures/planets/saturn.jpg',
  uranus: '/assets/textures/planets/uranus.jpg',
  neptune: '/assets/textures/planets/neptune.jpg',
};
const SATURN_RING_ALPHA_URL = '/assets/textures/planets/saturn_ring_alpha.png';

export class Planet {
  private scene: THREE.Scene;
  private planetData: PlanetInstance;
  private mesh: THREE.Mesh | null = null;
  private material: SunlitMaterial | null = null;
  private atmosphereMesh: THREE.Mesh | null = null;
  private atmosphereMaterial: THREE.MeshBasicMaterial | null = null;
  private ringsMesh: THREE.Mesh | null = null;
  private ringsMaterial: THREE.MeshBasicMaterial | null = null;
  private orbitalPath: THREE.Line | null = null;
  private orbitalPathMaterial: THREE.LineBasicMaterial | null = null;
  /** The path round the Sun, J2000 axes, AU: sampled once, measured from the Earth at each placement. */
  private orbitSamples: THREE.Vector3[] = [];
  /** The farthest point of the drawn orbit line from the Earth, in scene units. */
  private orbitReach = 0;
  private orbitalGroup: THREE.Group = new THREE.Group();
  /** The moment the planet was last placed for. */
  private placedAt = new Date();
  private readonly body: Astronomy.Body;
  private atmospheresEnabled = true;
  private disposed: boolean = false;

  // State tracking
  private state: PlanetaryState;
  private initialized: boolean = false;

  constructor(scene: THREE.Scene, planetData: PlanetInstance) {
    this.scene = scene;
    this.planetData = planetData;

    const body = bodyFromPlanetName(planetData.name);
    if (!body) {
      throw new Error(`Planet "${planetData.name}" has no matching astronomy-engine body`);
    }
    this.body = body;

    // Initialize state
    this.state = {
      name: planetData.name,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      isVisible: false,
      currentPhase: 0,
      distanceFromSun: planetData.orbitRadius,
      illuminationAngle: 0
    };

    this.initialize();
  }

  private initialize(): void {
    if (this.disposed) {
      throw new Error(`Cannot initialize disposed planet: ${this.planetData.name}`);
    }

    this.createPlanetMesh();
    this.createOrbitalPath(ORBITAL_PATH_SEGMENTS);
    this.scene.add(this.orbitalGroup);
    this.updateOrbitalPosition(new Date());

    this.initialized = true;
  }

  private createPlanetMesh(): void {
    // At its true size, on the globe's scale (K6).
    const radius = drawnRadius(this.planetData.radius);
    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    // Lit from where the Sun is, seen from the planet (step 3). Not fetched here: see prefetchTextures.
    this.material = createSunlitMaterial(this.planetData.color);

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = this.planetData.name;
    this.mesh.visible = false;
    this.orbitalGroup.add(this.mesh);

    // Create atmosphere if planet has one
    if (this.planetData.hasAtmosphere) {
      this.createAtmosphere(radius);
    }

    if (this.planetData.hasRings) {
      this.createRings(radius);
    }
  }

  private loadPlanetTexture(): void {
    const url = PLANET_TEXTURE_URLS[this.planetData.name];
    if (!url || !this.material) return;

    const loader = new THREE.TextureLoader();
    loader.load(url, (texture) => {
      if (this.disposed || !this.material) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      setSunlitMap(this.material, texture);
    });
  }

  private createAtmosphere(planetRadius: number): void {
    const atmosphereRadius = planetRadius * 1.1;
    const geometry = new THREE.SphereGeometry(atmosphereRadius, 32, 32);

    this.atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: this.getAtmosphereColor(),
      transparent: true,
      opacity: ATMOSPHERE_OPACITY,
      side: THREE.BackSide
    });

    this.atmosphereMesh = new THREE.Mesh(geometry, this.atmosphereMaterial);
    this.atmosphereMesh.visible = false;
    this.orbitalGroup.add(this.atmosphereMesh);
  }

  private getAtmosphereColor(): number {
    switch (this.planetData.name) {
      case 'venus': return 0xffcc00; // Yellowish
      case 'earth': return 0x87ceeb; // Sky blue
      case 'mars': return 0xcd853f; // Rusty
      default: return 0xffffff; // White
    }
  }

  private createRings(planetRadius: number): void {
    const innerRadius = planetRadius * 1.3;
    const outerRadius = planetRadius * 2.3;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128, 1);

    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      const t = (point.length() - innerRadius) / (outerRadius - innerRadius);
      uvs.setXY(i, t, 1);
    }

    this.ringsMaterial = new THREE.MeshBasicMaterial({
      color: 0xc9b98a,
      transparent: true,
      opacity: RINGS_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // Turned into the planet's equator at each placement.
    this.ringsMesh = new THREE.Mesh(geometry, this.ringsMaterial);
    this.ringsMesh.visible = false;
    this.orbitalGroup.add(this.ringsMesh);
  }

  private loadRingTexture(): void {
    if (!this.ringsMaterial) return;

    const loader = new THREE.TextureLoader();
    loader.load(SATURN_RING_ALPHA_URL, (texture) => {
      if (this.disposed || !this.ringsMaterial) {
        texture.dispose();
        return;
      }
      this.ringsMaterial.alphaMap = texture;
      this.ringsMaterial.needsUpdate = true;
    });
  }

  /**
   * The orbit line: the planet's real path round the Sun, sampled once. Where it is
   * drawn changes with the moment, as the Earth moves and turns, so its points are
   * written at each placement (updateOrbitalPath).
   */
  private createOrbitalPath(segments: number): void {
    this.orbitSamples = sampleHeliocentricOrbit(this.body, this.planetData.orbitPeriod, segments, new Date());

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.orbitSamples.length * 3), 3));
    this.orbitalPathMaterial = new THREE.LineBasicMaterial({
      color: this.planetData.color,
      transparent: true,
      opacity: ORBIT_OPACITY
    });

    this.orbitalPath = new THREE.Line(geometry, this.orbitalPathMaterial);
    this.orbitalPath.visible = false;
    this.scene.add(this.orbitalPath);
  }

  /**
   * Writes where the orbit line is drawn: each point of the path measured from the
   * Earth, turned into the globe's frame and compressed by the same rule as the
   * planet itself, so the planet sits on its line; in Diagram its ring (D4).
   */
  private updateOrbitalPath(frame: THREE.Matrix4, earth: THREE.Vector3): void {
    if (!this.orbitalPath) return;
    const positions = this.orbitalPath.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drawn = new THREE.Vector3();
    const ring = diagramRing(this.planetData.name);
    let reach = 0;
    this.orbitSamples.forEach((sample, i) => {
      drawnOrbitPoint(sample, earth, frame, ring, drawn);
      positions.setXYZ(i, drawn.x, drawn.y, drawn.z);
      reach = Math.max(reach, drawn.length());
    });
    positions.needsUpdate = true;
    this.orbitalPath.geometry.computeBoundingSphere();
    this.orbitReach = reach;
  }

  /**
   * Places the planet, and its orbit line, for the moment `at`: where it really is in
   * the Earth's sky then, at its drawn distance, turned on its own axis, and lit from
   * where the Sun is seen from it (bodyPlacement.ts).
   */
  public updateOrbitalPosition(at: Date): void {
    if (this.disposed || !this.mesh) return;

    const frame = skyFrame(at);
    this.placedAt = at;
    this.state.position.copy(placeInSky(this.body, at));
    this.state.distanceFromSun = getHeliocentricDistanceAU(this.body, at);
    this.state.currentPhase = Astronomy.EclipticLongitude(this.body, at) / 360;

    this.mesh.position.copy(this.state.position);
    // Its true size, or Diagram's (D4): its atmosphere and rings with it.
    const size = sizeFactorNow(this.planetData.radius);
    this.mesh.scale.setScalar(size);
    this.atmosphereMesh?.scale.setScalar(size);
    this.ringsMesh?.scale.setScalar(size);
    this.mesh.quaternion.copy(bodyTurn(this.body, at, frame));
    if (this.material) setSunDirection(this.material, sunDirectionFrom(this.body, at, frame));
    if (this.atmosphereMesh) {
      this.atmosphereMesh.position.copy(this.state.position);
    }
    if (this.ringsMesh) {
      this.ringsMesh.position.copy(this.state.position);
      this.ringsMesh.quaternion.copy(this.mesh.quaternion).multiply(RINGS_IN_EQUATOR);
    }
    this.updateOrbitalPath(frame, earthFromSun(at));
  }

  /** Whether this planet's imagery has been asked for. */
  private texturesRequested = false;

  /**
   * Fetch this planet's imagery. Once; later calls do nothing.
   *
   * It was fetched at construction, and the solar system is built for every globe
   * layer — so every planet's texture downloaded at globe altitude, where no planet
   * is shown. SolarSystemManager calls this as the camera heads out
   * (PREFETCH_DISTANCE), and setShown calls it too, so a planet is never seen without
   * its texture because a prefetch was skipped.
   */
  public prefetchTextures(): void {
    if (this.texturesRequested || this.disposed) return;
    this.texturesRequested = true;
    this.loadPlanetTexture();
    this.loadRingTexture();
  }

  /** Its matrices worked out now, for the render under way (SolarSystemManager.frame). */
  public commitMatrices(): void {
    this.orbitalGroup.updateMatrixWorld(true);
    this.orbitalPath?.updateMatrixWorld(true);
  }

  /**
   * How much of the planet is drawn: 0 not at all, 1 whole, between as it fades in
   * (decision K6, SS3). Its atmosphere and rings fade with it.
   */
  public setShown(shown: number): void {
    const visible = shown > 0;
    if (visible) this.prefetchTextures();
    this.state.isVisible = visible;

    if (this.mesh && this.material) {
      this.mesh.visible = visible;
      setSunlitOpacity(this.material, shown);
    }

    if (this.atmosphereMesh && this.atmosphereMaterial) {
      this.atmosphereMesh.visible = visible && this.planetData.hasAtmosphere && this.atmospheresEnabled;
      this.atmosphereMaterial.opacity = ATMOSPHERE_OPACITY * shown;
    }

    if (this.ringsMesh && this.ringsMaterial) {
      this.ringsMesh.visible = visible && Boolean(this.planetData.hasRings);
      this.ringsMaterial.opacity = RINGS_OPACITY * shown;
    }
  }

  /** How much of the orbit line is drawn: 0 not at all, 1 at full strength. */
  public setOrbitShown(shown: number): void {
    if (!this.orbitalPath || !this.orbitalPathMaterial) return;
    this.orbitalPath.visible = shown > 0;
    this.orbitalPathMaterial.opacity = ORBIT_OPACITY * shown;
  }

  /** The farthest point of the drawn orbit line from the Earth, in scene units. */
  public getOrbitReach(): number {
    return this.orbitReach;
  }

  /**
   * Get orbital path visibility status
   */
  public isOrbitalPathVisible(): boolean {
    return this.orbitalPath ? this.orbitalPath.visible : false;
  }

  /**
   * Check if planet is visible
   */
  public isVisible(): boolean {
    return this.state.isVisible;
  }

  public hasRings(): boolean {
    return Boolean(this.ringsMesh);
  }

  /**
   * Get planet name
   */
  public getName(): string {
    return this.planetData.name;
  }

  /** What its marker and name need (bodyLabels.ts). */
  public getLabelled(): Omit<LabelledBody, 'rank'> {
    const { name, color, radius } = this.planetData;
    return {
      id: name,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      colour: color,
      position: this.getPosition(),
      radius: drawnRadiusNow(radius),
    };
  }

  /**
   * Get current position
   */
  public getPosition(): THREE.Vector3 {
    return this.state.position.clone();
  }

  /**
   * Get current state
   */
  public getCurrentState(): PlanetaryState {
    return { ...this.state };
  }

  /**
   * Get initialization status
   */
  public isInitialized(): boolean {
    return this.initialized && !this.disposed;
  }

  /**
   * Apply performance configuration
   */
  public applyPerformanceConfig(config: Required<PlanetarySystemConfig>): void {
    if (this.disposed) return;

    this.atmospheresEnabled = config.enableAtmospheres;
    if (this.atmosphereMesh) {
      this.atmosphereMesh.visible = config.enableAtmospheres && this.state.isVisible;
    }

    if (this.orbitalPath && config.orbitalPathSegments !== this.orbitSamples.length - 1) {
      this.updateOrbitalPathSegments(config.orbitalPathSegments);
    }
  }

  private updateOrbitalPathSegments(segments: number): void {
    if (!this.orbitalPath) return;

    const { visible } = this.orbitalPath;
    const opacity = this.orbitalPathMaterial?.opacity ?? ORBIT_OPACITY;
    this.scene.remove(this.orbitalPath);
    this.orbitalPath.geometry.dispose();
    this.orbitalPathMaterial?.dispose();

    this.createOrbitalPath(segments);
    this.orbitalPath.visible = visible;
    if (this.orbitalPathMaterial) this.orbitalPathMaterial.opacity = opacity;
    this.updateOrbitalPosition(this.placedAt);
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    if (this.disposed) return;

    this.scene.remove(this.orbitalGroup);

    if (this.orbitalPath) {
      this.scene.remove(this.orbitalPath);
      this.orbitalPath.geometry.dispose();
      this.orbitalPathMaterial?.dispose();
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.uniforms.map.value?.dispose?.();
      this.material.dispose();
    }

    if (this.atmosphereMesh) {
      this.atmosphereMesh.geometry.dispose();
      this.atmosphereMaterial?.dispose();
    }

    if (this.ringsMesh) {
      this.ringsMesh.geometry.dispose();
    }
    if (this.ringsMaterial) {
      this.ringsMaterial.alphaMap?.dispose?.();
      this.ringsMaterial.dispose();
    }

    this.disposed = true;
    this.initialized = false;
  }
}
