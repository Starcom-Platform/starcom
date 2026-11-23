// EarthOrbit.ts - The Earth's own path round the Sun (owner, 1 Nov: "Earth doesn't have its own orbit ring").
//
// The scene stands on the real globe at its centre, so there is no Earth planet whose orbit line could be drawn: each
// planet's line is its heliocentric path measured from the Earth (Planet.updateOrbitalPath). The Earth's own path,
// measured the same way, passes through the globe and rings the Sun, at the same one true scale as the planets'
// (bodyPlacement.drawnPosition). Shown as theirs are: once the camera has backed out far enough to see it whole.

import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { earthFromSun, sampleHeliocentricOrbit } from '../EphemerisService';
import { drawnOrbitPoint, skyFrame } from '../bodyPlacement';
import { diagramRing } from '../solarScale';

const SEGMENTS = 256;
const YEAR_DAYS = 365.256;
const OPACITY = 0.3;
/** The globe's own ocean-blue, as the Earth's mark beside the planets' colours. */
const COLOR = 0x4a90d9;

export class EarthOrbit {
  private readonly samples: THREE.Vector3[];
  private readonly line: THREE.Line;
  private readonly material: THREE.LineBasicMaterial;
  private reach = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.samples = sampleHeliocentricOrbit(Astronomy.Body.Earth, YEAR_DAYS, SEGMENTS, new Date());
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.samples.length * 3), 3));
    this.material = new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: OPACITY });
    this.line = new THREE.Line(geometry, this.material);
    this.line.name = 'earth-orbit';
    this.line.visible = false;
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  /** The path for the moment `at`, measured from where the Earth is then, in the globe's frame. */
  update(at: Date): void {
    const frame = skyFrame(at);
    const earth = earthFromSun(at);
    const positions = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drawn = new THREE.Vector3();
    // In Diagram, the Earth's own ring round the Sun (D4).
    const ring = diagramRing('earth');
    let reach = 0;
    this.samples.forEach((sample, i) => {
      drawnOrbitPoint(sample, earth, frame, ring, drawn);
      positions.setXYZ(i, drawn.x, drawn.y, drawn.z);
      reach = Math.max(reach, drawn.length());
    });
    positions.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    this.reach = reach;
  }

  /** The farthest point of the drawn line from the Earth, in scene units. */
  getOrbitReach(): number {
    return this.reach;
  }

  setOrbitShown(shown: number): void {
    this.line.visible = shown > 0;
    this.material.opacity = OPACITY * shown;
  }

  dispose(): void {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.material.dispose();
  }
}
