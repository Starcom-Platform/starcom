// SolarSunManager.ts - The Sun as a body: at its true size, where the globe's light
// comes from, for the moment shown (decision K6; bodyPlacement.ts).
//
// It is drawn, not a light: the light on the Earth is the globe's own rig
// (globeLighting.ts), aimed at the real subsolar point at every distance. The Sun here
// sits along that same direction, so the two cannot disagree.
//
// Its look, a surface, a corona that faces the viewer and a lens flare, is
// sunAppearance.ts; the bloom round it is the globe's (sunBloom.ts). Its first corona
// was a flat shell, which over the page's dark ground read as a grey ring.

import * as THREE from 'three';
import type { Lensflare } from 'three/examples/jsm/objects/Lensflare.js';
import { drawnRadius, sizeFactorNow, sunInSky } from './bodyPlacement';
import {
  createCorona, createSunFlare, createSunSurfaceMaterial, flareStrength, type CoronaMaterial, type SunFlare,
  type SunSurfaceMaterial,
} from './sunAppearance';
import { radiusOnScreen } from './bodyLabels';
import { phaseSeconds, stilledAt } from '../globe-engine/captureClock';

/** The Sun's radius in km (IAU nominal): 10,920 scene units, 109 Earth radii. */
const SUN_RADIUS_KM = 695_700;
/** The flare stands just in front of the surface toward the camera, so the surface does not hide it. */
const FLARE_LIFT = 1.02;

export interface SunState {
  isVisible: boolean;
  currentRadius: number;
  currentPosition: THREE.Vector3;
}

export type SunStateChangeCallback = (state: SunState) => void;

export class SolarSunManager {
  private scene: THREE.Scene;
  private sunMesh: THREE.Mesh | null = null;
  private sunMaterial: SunSurfaceMaterial | null = null;
  private corona: THREE.Mesh<THREE.PlaneGeometry, CoronaMaterial> | null = null;
  private flare: SunFlare | null = null;
  /** The corona's size as built, at the Sun's true radius. */
  private coronaSize = 0;
  private shown = 0;
  private readonly toEye = new THREE.Vector3();
  private currentState: SunState;
  private stateChangeCallback: SunStateChangeCallback | null = null;
  private disposed: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.currentState = {
      isVisible: false,
      currentRadius: drawnRadius(SUN_RADIUS_KM),
      currentPosition: new THREE.Vector3(0, 0, 0)
    };

    this.createSun();
  }

  private createSun(): void {
    const radius = drawnRadius(SUN_RADIUS_KM);
    this.sunMaterial = createSunSurfaceMaterial();
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), this.sunMaterial);
    this.sunMesh.name = 'sun';
    this.sunMesh.visible = false;
    this.scene.add(this.sunMesh);

    this.corona = createCorona(radius);
    this.coronaSize = this.corona.material.uniforms.size.value;
    this.corona.visible = false;
    this.scene.add(this.corona);

    this.flare = createSunFlare();
    this.flare.flare.visible = false;
    this.scene.add(this.flare.flare);
  }

  /** Places the Sun for the moment `at`: along the light's direction, at its drawn distance, at its drawn size. */
  public placeAt(at: Date): void {
    if (this.disposed) return;
    const position = sunInSky(at);
    // Its true size, or Diagram's (D4): the disc, the corona round it, and the radius the flare and names go by.
    const size = sizeFactorNow(SUN_RADIUS_KM);
    this.sunMesh?.position.copy(position);
    this.sunMesh?.scale.setScalar(size);
    this.corona?.position.copy(position);
    if (this.corona) this.corona.material.uniforms.size.value = this.coronaSize * size;
    this.currentState.currentPosition.copy(position);
    this.currentState.currentRadius = drawnRadius(SUN_RADIUS_KM) * size;
  }

  /**
   * How much of the Sun is drawn: 0 not at all, 1 whole, between as it fades in
   * (decision K6, SS3).
   */
  public setShown(shown: number): void {
    if (this.disposed) return;
    const wasVisible = this.currentState.isVisible;
    const visible = shown > 0;
    this.currentState.isVisible = visible;

    this.shown = shown;
    if (this.sunMesh && this.sunMaterial) {
      this.sunMesh.visible = visible;
      this.sunMaterial.uniforms.opacity.value = shown;
      this.sunMaterial.opacity = shown;
    }
    if (this.corona) this.corona.visible = visible;
    if (this.flare) this.flare.flare.visible = visible;

    if (wasVisible !== visible && this.stateChangeCallback) {
      this.stateChangeCallback(this.getCurrentState());
    }
  }

  /**
   * The Sun's look for one render, seen from `eye` through `camera` over a viewport
   * `viewportHeight` CSS pixels tall: its surface and corona moving (held still for a
   * capture, IM23), the corona faded out as the camera comes to the surface, and the
   * flare in front of the disc, as strong as the disc is large on screen.
   */
  /** The Sun's disc, corona and flare: their matrices worked out now, for the render under way (SolarSystemManager.frame). */
  public commitMatrices(): void {
    this.sunMesh?.updateMatrixWorld(true);
    this.corona?.updateMatrixWorld(true);
    this.flare?.flare.updateMatrixWorld(true);
  }

  public view(eye: THREE.Vector3, camera?: THREE.PerspectiveCamera, viewportHeight?: number): void {
    if (this.disposed || !this.currentState.isVisible) return;
    const time = phaseSeconds(stilledAt() ?? Date.now());
    const { currentPosition: centre, currentRadius: radius } = this.currentState;
    if (this.sunMaterial) this.sunMaterial.uniforms.time.value = time;

    const distance = this.toEye.copy(eye).sub(centre).length();
    if (this.corona) {
      this.corona.material.uniforms.time.value = time;
      this.corona.material.uniforms.opacity.value = this.shown * THREE.MathUtils.smoothstep(distance, radius * 1.2, radius * 2);
    }

    if (this.flare) {
      const flare: Lensflare = this.flare.flare;
      flare.position.copy(centre).addScaledVector(this.toEye.normalize(), radius * FLARE_LIFT);
      flare.updateMatrixWorld(true);
      const discPx = camera && viewportHeight ? radiusOnScreen(radius, distance, camera.fov, viewportHeight) : 0;
      this.flare.setStrength(this.shown * (distance > radius * FLARE_LIFT ? flareStrength(discPx) : 0));
    }
  }

  /** How strong the lens flare is now, from 0 to 1. */
  public getFlareStrength(): number {
    return this.flare?.strength() ?? 0;
  }

  /**
   * Get current sun state
   */
  public getCurrentState(): SunState {
    return { ...this.currentState, currentPosition: this.currentState.currentPosition.clone() };
  }

  /**
   * Set state change callback
   */
  public onStateChange(callback: SunStateChangeCallback): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Check if the Sun is drawn
   */
  public isVisible(): boolean {
    return this.currentState.isVisible;
  }

  /**
   * Get sun mesh for direct manipulation (advanced usage)
   */
  public getSunMesh(): THREE.Mesh | null {
    return this.sunMesh;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.disposed) return;

    if (this.sunMesh) {
      this.scene.remove(this.sunMesh);
      this.sunMesh.geometry.dispose();
      this.sunMaterial?.dispose();
      this.sunMesh = null;
    }
    if (this.corona) {
      this.scene.remove(this.corona);
      this.corona.geometry.dispose();
      this.corona.material.dispose();
      this.corona = null;
    }
    if (this.flare) {
      this.scene.remove(this.flare.flare);
      this.flare.flare.dispose();
      this.flare = null;
    }

    this.stateChangeCallback = null;
    this.disposed = true;
  }
}
