/**
 * Marks fade as the Earth shrinks on screen (block G, item 1; critique audit
 * section 1.3). Every mark is a fixed number of pixels, so zoomed out the
 * Earth's markers outgrew the Earth.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  GLOBE_RADIUS, ZOOM_FADE_FULL_PX, ZOOM_FADE_GONE_PX, earthRadiusOnScreen, fadedOut, solarSystemShownFor, zoomOutFade,
  zoomOutFadeFor,
} from '../zoomOutFade';

/** The camera globe.gl places at `altitude` Earth radii above the surface, looking at its centre. */
const cameraAt = (altitude: number, fov = 50) => {
  const camera = new THREE.PerspectiveCamera(fov, 1400 / 900, 1, 125000);
  camera.position.set(0, 0, GLOBE_RADIUS * (1 + altitude));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
};
const renderer = { getSize: (v: THREE.Vector2) => v.set(1400, 900) } as unknown as THREE.WebGLRenderer;
const markAtCentre = () => {
  const object = new THREE.Object3D();
  object.updateMatrixWorld(true);
  return object;
};

describe('earthRadiusOnScreen', () => {
  it('measures the Earth at the default view (altitude 2.5) as most of the screen\'s height', () => {
    const px = earthRadiusOnScreen(GLOBE_RADIUS * 3.5, 50, 900);
    expect(px).toBeGreaterThan(250);
    expect(px).toBeLessThan(320);
  });

  it('shrinks as the camera moves away', () => {
    expect(earthRadiusOnScreen(1000, 50, 900)).toBeGreaterThan(earthRadiusOnScreen(2000, 50, 900));
  });

  it('is unbounded from inside the globe', () => {
    expect(earthRadiusOnScreen(GLOBE_RADIUS * 0.5, 50, 900)).toBe(Infinity);
  });
});

describe('zoomOutFade', () => {
  it('draws marks whole while the Earth is large on screen', () => {
    expect(zoomOutFade(ZOOM_FADE_FULL_PX)).toBe(1);
    expect(zoomOutFade(600)).toBe(1);
  });

  it('draws nothing once the Earth is small', () => {
    expect(zoomOutFade(ZOOM_FADE_GONE_PX)).toBe(0);
    expect(zoomOutFade(5)).toBe(0);
  });

  it('fades smoothly between, half way at the middle', () => {
    expect(zoomOutFade((ZOOM_FADE_FULL_PX + ZOOM_FADE_GONE_PX) / 2)).toBeCloseTo(0.5, 5);
    expect(zoomOutFade(ZOOM_FADE_GONE_PX + 10)).toBeLessThan(zoomOutFade(ZOOM_FADE_FULL_PX - 10));
  });
});

describe('zoomOutFadeFor: the fade for marks drawn through a camera', () => {
  it('draws marks whole at the default view and at a card\'s closest', () => {
    expect(zoomOutFadeFor(renderer, cameraAt(2.5), markAtCentre())).toBe(1);
    expect(zoomOutFadeFor(renderer, cameraAt(1), markAtCentre())).toBe(1);
  });

  it('fades them part way zoomed out, and away when the Earth is a dot', () => {
    const partway = zoomOutFadeFor(renderer, cameraAt(10), markAtCentre());
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(1);
    expect(zoomOutFadeFor(renderer, cameraAt(40), markAtCentre())).toBe(0);
  });

  it('measures from the marks\' own centre, so a moved group still fades by its Earth', () => {
    const group = new THREE.Group();
    // Far enough that measured from the world's origin the marks would be gone.
    group.position.set(5000, 0, 0);
    const object = new THREE.Object3D();
    group.add(object);
    group.updateMatrixWorld(true);
    const camera = cameraAt(2.5);
    camera.position.x += 5000;
    camera.updateMatrixWorld(true);
    expect(zoomOutFadeFor(renderer, camera, object)).toBe(1);
  });

  it('leaves marks whole from inside the globe, where the Earth fills the view', () => {
    const camera = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 125000);
    camera.position.set(0, 0, GLOBE_RADIUS * 0.5);
    camera.updateMatrixWorld(true);
    expect(zoomOutFadeFor(renderer, camera, markAtCentre())).toBe(1);
  });

  it('leaves marks whole through a camera that is not a perspective one', () => {
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    expect(zoomOutFadeFor(renderer, ortho, markAtCentre())).toBe(1);
  });
});

describe('solarSystemShownFor: the solar system takes over as the marks go (K6, SS3)', () => {
  it('draws none of it at the default view or a card\'s closest, so close-up work costs nothing', () => {
    expect(solarSystemShownFor(renderer, cameraAt(2.5))).toBe(0);
    expect(solarSystemShownFor(renderer, cameraAt(1))).toBe(0);
    expect(solarSystemShownFor(renderer, cameraAt(0.5))).toBe(0);
  });

  it('draws all of it once the Earth is a dot', () => {
    expect(solarSystemShownFor(renderer, cameraAt(40))).toBe(1);
    expect(solarSystemShownFor(renderer, cameraAt(10_000))).toBe(1);
  });

  it('fades in exactly as the marks fade out', () => {
    for (const altitude of [5, 8, 10, 12, 15, 20]) {
      const camera = cameraAt(altitude);
      expect(solarSystemShownFor(renderer, camera) + zoomOutFadeFor(renderer, camera, markAtCentre())).toBeCloseTo(1, 9);
    }
    expect(solarSystemShownFor(renderer, cameraAt(10))).toBeGreaterThan(0);
    expect(solarSystemShownFor(renderer, cameraAt(10))).toBeLessThan(1);
  });

  it('draws none from inside the globe, or through a camera that is not a perspective one', () => {
    const inside = new THREE.PerspectiveCamera(50, 1400 / 900, 1, 125000);
    inside.position.set(0, 0, GLOBE_RADIUS * 0.5);
    inside.updateMatrixWorld(true);
    expect(solarSystemShownFor(renderer, inside)).toBe(0);
    expect(solarSystemShownFor(renderer, new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000))).toBe(0);
  });
});

describe('fadedOut: what may still answer a hover', () => {
  const marked = (zoomFade?: number) => new THREE.Points(new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({ uniforms: zoomFade === undefined ? {} : { zoomFade: { value: zoomFade } } }));

  it('is a mark faded all but away', () => {
    expect(fadedOut(marked(0))).toBe(true);
    expect(fadedOut(marked(0.04))).toBe(true);
  });

  it('is not a mark still visibly drawn, or one that does not fade', () => {
    expect(fadedOut(marked(0.5))).toBe(false);
    expect(fadedOut(marked())).toBe(false);
  });
});
