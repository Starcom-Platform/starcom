/**
 * Country names on the globe (decision K5, step 4).
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COUNTRY_NAMES_NAME, COUNTRY_NAMES_ORDER, CountryNames } from '../countryNames';
import type { NameAtlas, AtlasCell } from '../countryNameAtlas';
import { TERRITORY_LABELS } from '../../theme/territoryLabels';
import { BASE_MAP } from '../../../components/Globe/globeAltitudes';
import { SCREEN_POINTS_RENDER_ORDER } from '../../../components/Globe/screenPoints';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { isShellRider, liftForHeight, liftRiders, resetShellLiftForTest } from '../../../globe-engine/shellLift';
import { holdForCapture, releaseMotion, stillMotion } from '../../../globe-engine/captureClock';
import {
  countryNamesInLastCapture,
  resetCountryNamesLookForTest,
  setCardCountryNames,
  setClipCountryNames,
  setScreenCountryNames,
} from '../../../globe-engine/countryNamesLook';

afterEach(() => {
  releaseMotion();
  resetCountryNamesLookForTest();
  resetShellLiftForTest();
});

/** An atlas of plain cells, 60 by 16 CSS px a name, at ratio 1. */
function fakeAtlas(): NameAtlas {
  const cells = new Map<string, AtlasCell>();
  TERRITORY_LABELS.forEach((l, i) => cells.set(l.code, { x: (i % 16) * 64, y: Math.floor(i / 16) * 20, width: 64, height: 20, boxWidth: 60, boxHeight: 16 }));
  return { ratio: 1, width: 1024, height: 320, data: new Uint8Array(1024 * 320 * 2), cells, pad: 2 };
}

const renderer = { getSize: (v: THREE.Vector2) => v.set(1200, 900), getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;

/** The default view's distance (altitude 2.5) over a point, looking at the Earth's centre. */
function cameraOver(lat: number, lng: number, altitude = 2.5) {
  const camera = new THREE.PerspectiveCamera(50, 1200 / 900, 1, 100_000);
  camera.position.copy(latLngToGlobeWorld(lat, lng, 100 * (1 + altitude)));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function setup() {
  const scene = new THREE.Scene();
  const names = new CountryNames(TERRITORY_LABELS);
  names.useAtlas(fakeAtlas());
  scene.add(names.root);
  const mesh = names.root.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  const alphaOf = (code: string) => (mesh.geometry.getAttribute('aAlpha').array as Float32Array)[TERRITORY_LABELS.findIndex((l) => l.code === code)];
  return { scene, names, mesh, alphaOf };
}

describe('where the names are drawn', () => {
  it('is a group of their own that rides the shell, over the fills and under every mark', () => {
    const { names } = setup();
    expect(names.root).toBeInstanceOf(THREE.Group);
    expect(names.root.name).toBe(COUNTRY_NAMES_NAME);
    expect(isShellRider(names.root)).toBe(true);
    expect(COUNTRY_NAMES_ORDER).toBeGreaterThan(120);
    expect(COUNTRY_NAMES_ORDER + 20).toBeLessThan(190);
    expect(names.root.renderOrder).toBe(COUNTRY_NAMES_ORDER);
    expect(SCREEN_POINTS_RENDER_ORDER).toBeGreaterThan(COUNTRY_NAMES_ORDER);
  });

  it('takes no clicks, tests no depth and is never culled', () => {
    const { names, mesh } = setup();
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 500), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(names.root, true)).toEqual([]);
    expect(mesh.material.depthTest).toBe(false);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
  });

  it('stands each name on Natural Earth\'s label point, on the base map, and on the raised shell when it rides it', () => {
    const { scene, names, mesh } = setup();
    const i = TERRITORY_LABELS.findIndex((l) => l.code === 'FRA');
    const fra = TERRITORY_LABELS[i];
    const anchor = new THREE.Vector3().fromArray(mesh.geometry.getAttribute('aAnchor').array as Float32Array, i * 3);
    expect(anchor.distanceTo(latLngToGlobeWorld(fra.lat, fra.lng, 100 * BASE_MAP))).toBeLessThan(1e-4);
    liftRiders(scene, liftForHeight(3.5));
    names.root.updateMatrixWorld(true);
    expect(anchor.clone().applyMatrix4(names.root.matrixWorld).length()).toBeCloseTo(103.5, 4);
    liftRiders(scene, 1);
    expect(anchor.clone().applyMatrix4(names.root.matrixWorld).length()).toBeCloseTo(100.2, 4);
  });
});

describe('which names, render by render', () => {
  it('names the countries in view on screen, the giants among them', () => {
    const { scene, names, alphaOf } = setup();
    const camera = cameraOver(48, 10);
    names.update(renderer, camera, scene, 1_000);
    names.update(renderer, camera, scene, 2_000);
    expect(names.root.visible).toBe(true);
    expect(alphaOf('FRA')).toBe(1);
    // The far side of the planet is never named.
    expect(alphaOf('AUS')).toBe(0);
  });

  it('draws none in a capture whose shot does not ask, and puts the screen\'s back after', () => {
    const { scene, names, alphaOf } = setup();
    const camera = cameraOver(48, 10);
    names.update(renderer, camera, scene, 1_000);
    names.update(renderer, camera, scene, 2_000);
    stillMotion(3_000);
    names.update(renderer, camera, scene, 3_000);
    expect(names.root.visible).toBe(false);
    releaseMotion();
    names.update(renderer, camera, scene, 3_016);
    expect(names.root.visible).toBe(true);
    expect(alphaOf('FRA')).toBe(1);
  });

  it('draws Natural Earth\'s own choice in a capture that asks, whole at once, and notes what it placed', () => {
    const { scene, names, alphaOf } = setup();
    setScreenCountryNames(1);
    setCardCountryNames(true);
    const camera = cameraOver(48, 10);
    stillMotion(1_000);
    names.update(renderer, camera, scene, 1_000);
    releaseMotion();
    expect(alphaOf('FRA')).toBe(1);
    expect(countryNamesInLastCapture().codes).toContain('FRA');
  });

  it('draws none at a slider of 0', () => {
    const { scene, names } = setup();
    setScreenCountryNames(0);
    names.update(renderer, cameraOver(48, 10), scene, 1_000);
    expect(names.root.visible).toBe(false);
  });

  it('uploads nothing while the camera is still and every fade has ended', () => {
    const { scene, names, mesh } = setup();
    const camera = cameraOver(48, 10);
    for (const t of [1_000, 1_300, 1_600, 1_900]) names.update(renderer, camera, scene, t);
    const alpha = mesh.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
    const version = alpha.version;
    names.update(renderer, camera, scene, 2_200);
    names.update(renderer, camera, scene, 2_500);
    expect(alpha.version).toBe(version);
  });
});

describe('names in a clip', () => {
  /**
   * A clip panning from the Atlantic to Asia, frame by frame, with `between` live
   * renders (another camera, another moment) before each frame: each frame's alphas.
   */
  function record(t: ReturnType<typeof setup>, fps: number, between: number) {
    const alphas = t.mesh.geometry.getAttribute('aAlpha').array as Float32Array;
    const frames: number[][] = [];
    setClipCountryNames(fps);
    const release = holdForCapture();
    try {
      for (let i = 0; i < 14; i++) {
        for (let k = 0; k < between; k++) t.names.update(renderer, cameraOver(35, -50 + i * 9 + k * 3), t.scene, 5_000 + i * 50 + k);
        stillMotion(1_000);
        // A busy page renders a frame more than once: counted once.
        for (let r = 0; r <= Math.min(between, 1); r++) t.names.update(renderer, cameraOver(35, -60 + i * 9, 1.6), t.scene, 9_000 + i * 7 * (between + 1) + r);
        frames.push(Array.from(alphas));
        releaseMotion();
      }
    } finally {
      release();
      setClipCountryNames(null);
    }
    return frames;
  }

  it('draws the same names in each frame of the same clip, however many renders fall between its frames, and starts each clip afresh', () => {
    const t = setup();
    const quiet = record(t, 30, 0);
    const busy = record(t, 30, 3);
    expect(busy).toEqual(quiet);
    expect(quiet[0].some((a) => a === 1)).toBe(true);
  });

  it('draws its first frame whole, and fades a name over a fifth of a second of footage, counted in frames', () => {
    const t = setup();
    const ten = record(t, 10, 0);
    expect(ten[0].every((a) => a === 0 || a === 1)).toBe(true);
    // At 10 fps, two frames: every alpha a half step.
    expect(ten.flat().every((a) => a === 0 || a === 0.5 || a === 1)).toBe(true);
    expect(ten.flat().some((a) => a === 0.5)).toBe(true);
    // At 30, six.
    const thirty = record(t, 30, 0).flat();
    expect(thirty.every((a) => Math.abs(a * 6 - Math.round(a * 6)) < 1e-6)).toBe(true);
    expect(thirty.some((a) => a > 0 && a < 1)).toBe(true);
  });

  it('keeps a name a little past its zoom while it still fits, as the screen does, where a card would drop it', () => {
    // Pulling out over Europe, a step a frame.
    const views = Array.from({ length: 40 }, (_, i) => cameraOver(48, 12, 0.8 + i * 0.06));
    const t = setup();
    setClipCountryNames(30);
    const release = holdForCapture();
    const inClip = views.map((camera, i) => {
      stillMotion(1_000);
      t.names.update(renderer, camera, t.scene, 1_000 + i);
      const codes = countryNamesInLastCapture().codes;
      releaseMotion();
      return codes;
    });
    release();
    setClipCountryNames(null);
    // The same views as single cards: no memory.
    const card = setup();
    setCardCountryNames(true);
    const onCards = views.map((camera, i) => {
      stillMotion(1_000);
      card.names.update(renderer, camera, card.scene, 1_000 + i);
      const codes = countryNamesInLastCapture().codes;
      releaseMotion();
      return codes;
    });
    setCardCountryNames(false);
    const kept = inClip.flatMap((codes, i) => codes.filter((code) => !onCards[i].includes(code)));
    expect(kept.length).toBeGreaterThan(0);
  });

  it('leaves the clip\'s names as its last frame drew them in a live render between frames', () => {
    const t = setup();
    const alphas = t.mesh.geometry.getAttribute('aAlpha').array as Float32Array;
    setClipCountryNames(30);
    const release = holdForCapture();
    stillMotion(1_000);
    t.names.update(renderer, cameraOver(48, 10), t.scene, 1_000);
    releaseMotion();
    const drawn = Array.from(alphas);
    expect(countryNamesInLastCapture().codes).toContain('FRA');
    t.names.update(renderer, cameraOver(-20, 140), t.scene, 1_016);
    expect(Array.from(alphas)).toEqual(drawn);
    release();
    setClipCountryNames(null);
  });
});

