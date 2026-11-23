// Moon.ts - Earth's Moon: real texture, true size, drawn where it is in the Earth's sky.
//
// Unlike the planets' orbits, the Moon's is not round a duplicate "Earth" object: it is
// placed round the real interactive Globe, which sits at the world origin. Like every
// body it is drawn at its true size and in its true direction for the moment shown, and
// its distance is the one the compression keeps (decision K6, SS1; bodyPlacement.ts):
// its mean distance is drawn true, about 60 Earth radii.

import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { sampleGeocentricOrbit } from '../EphemerisService';
import { bodyTurn, drawnPosition, drawnRadius, drawnRadiusNow, placeInSky, sizeFactorNow, skyFrame, sunDirectionFrom } from '../bodyPlacement';
import { createSunlitMaterial, setSunDirection, setSunlitMap, setSunlitOpacity, type SunlitMaterial } from '../sunlitMaterial';
import type { LabelledBody } from '../bodyLabels';

const MOON_RADIUS_KM = 1737.4;
const MOON_ORBIT_PERIOD_DAYS = 27.321661; // sidereal month
const MOON_COLOR = 0xb0b5bb;
const SURFACE_TEXTURE_URL = '/assets/textures/moon/lunar_surface_2k.jpg'; // real NASA LRO/LROC imagery
const ORBIT_PATH_SEGMENTS = 96;
const ORBIT_OPACITY = 0.25;
/**
 * How far the moment may move from the one the orbit line was sampled for before it is
 * sampled again. The orbit itself turns about a tenth of a degree a day, so a line a day
 * old still passes within a few units of the Moon.
 */
const RESAMPLE_AFTER_MS = 86_400_000;

export class Moon {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: SunlitMaterial;
  private orbitalPath: THREE.Line | null = null;
  private orbitalPathMaterial: THREE.LineBasicMaterial | null = null;
  /** The path from the Earth, J2000 axes, AU, for a month from `sampledAt`. */
  private orbitSamples: THREE.Vector3[] = [];
  private sampledAt: number | null = null;
  /** The farthest point of the drawn orbit line from the Earth, in scene units. */
  private orbitReach = 0;
  private visible = false;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geometry = new THREE.SphereGeometry(drawnRadius(MOON_RADIUS_KM), 48, 48);
    // Lit from where the Sun is, seen from the Moon, so it shows its phase (step 3).
    this.material = createSunlitMaterial(MOON_COLOR);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'moon';
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    // Not fetched here: see prefetchTextures.
    this.createOrbitalPath();
    this.updatePosition(new Date());
  }

  private texturesRequested = false;

  /**
   * Fetch the lunar imagery. Once; later calls do nothing.
   *
   * It was fetched at construction — 0.67 MB for a Moon that is not shown in any
   * normal view or any capture. Called as the camera heads out, and by setShown as a
   * safety net. The bump map it once fetched too is not: the Moon is never more than a
   * few dozen pixels across, where relief does not show.
   */
  public prefetchTextures(): void {
    if (this.texturesRequested || this.disposed) return;
    this.texturesRequested = true;
    this.loadTextures();
  }

  private loadTextures(): void {
    new THREE.TextureLoader().load(SURFACE_TEXTURE_URL, (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      setSunlitMap(this.material, texture);
    });
  }

  private createOrbitalPath(): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ORBIT_PATH_SEGMENTS + 1) * 3), 3));
    this.orbitalPathMaterial = new THREE.LineBasicMaterial({ color: MOON_COLOR, transparent: true, opacity: ORBIT_OPACITY });
    this.orbitalPath = new THREE.Line(geometry, this.orbitalPathMaterial);
    this.orbitalPath.visible = false;
    this.scene.add(this.orbitalPath);
  }

  /** Writes where the orbit line is drawn for the moment `at`, sampling the path again if it is too old. */
  private updateOrbitalPath(at: Date, frame: THREE.Matrix4): void {
    if (!this.orbitalPath) return;
    if (this.sampledAt === null || Math.abs(at.getTime() - this.sampledAt) > RESAMPLE_AFTER_MS) {
      this.orbitSamples = sampleGeocentricOrbit(Astronomy.Body.Moon, MOON_ORBIT_PERIOD_DAYS, ORBIT_PATH_SEGMENTS, at);
      this.sampledAt = at.getTime();
    }
    const positions = this.orbitalPath.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drawn = new THREE.Vector3();
    let reach = 0;
    this.orbitSamples.forEach((sample, i) => {
      drawnPosition(sample, frame, drawn, Astronomy.Body.Moon);
      positions.setXYZ(i, drawn.x, drawn.y, drawn.z);
      reach = Math.max(reach, drawn.length());
    });
    positions.needsUpdate = true;
    this.orbitalPath.geometry.computeBoundingSphere();
    this.orbitReach = reach;
  }

  /**
   * Places the Moon, and its orbit line, for the moment `at` (bodyPlacement.ts): turned
   * so its near side faces the Earth, and lit from where the Sun is seen from it.
   */
  public updatePosition(at: Date): void {
    if (this.disposed) return;
    const frame = skyFrame(at);
    this.mesh.position.copy(placeInSky(Astronomy.Body.Moon, at));
    // Its true size, or Diagram's (D4).
    this.mesh.scale.setScalar(sizeFactorNow(MOON_RADIUS_KM));
    this.mesh.quaternion.copy(bodyTurn(Astronomy.Body.Moon, at, frame));
    setSunDirection(this.material, sunDirectionFrom(Astronomy.Body.Moon, at, frame));
    this.updateOrbitalPath(at, frame);
  }

  /** Its matrices worked out now, for the render under way (SolarSystemManager.frame). */
  public commitMatrices(): void {
    this.mesh.updateMatrixWorld(true);
    this.orbitalPath?.updateMatrixWorld(true);
  }

  /** How much of the Moon is drawn: 0 not at all, 1 whole, between as it fades in. */
  public setShown(shown: number): void {
    this.visible = shown > 0;
    if (this.visible) this.prefetchTextures();
    this.mesh.visible = this.visible;
    setSunlitOpacity(this.material, shown);
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

  public isVisible(): boolean {
    return this.visible;
  }

  public isOrbitalPathVisible(): boolean {
    return this.orbitalPath ? this.orbitalPath.visible : false;
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  /** What its marker and name need (bodyLabels.ts). */
  public getLabelled(): Omit<LabelledBody, 'rank'> {
    return { id: 'moon', name: 'Moon', colour: MOON_COLOR, position: this.getPosition(), radius: drawnRadiusNow(MOON_RADIUS_KM) };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.uniforms.map.value?.dispose?.();
    this.material.dispose();

    if (this.orbitalPath) {
      this.scene.remove(this.orbitalPath);
      this.orbitalPath.geometry.dispose();
      this.orbitalPathMaterial?.dispose();
    }
  }
}
