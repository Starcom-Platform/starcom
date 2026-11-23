/**
 * Finding the bodies too small to see (decision K6, step 4; bodyLabels.ts): a marker
 * in each body's colour while its disc is too small to see, and its name beside it,
 * names giving way by rank where they would overlap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  BodyLabels, MARKER_FULL_PX, MARKER_GONE_PX, MARKER_PX, POINTER_PX, markerShown, placeNames, pointerAt, pointerInsets,
  radiusOnScreen, type LabelledBody,
} from '../bodyLabels';

const VIEWPORT = new THREE.Vector2(1400, 900);
const cameraAt = (position: THREE.Vector3, target = new THREE.Vector3()) => {
  const camera = new THREE.PerspectiveCamera(50, VIEWPORT.x / VIEWPORT.y, 1, 3e6);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
};
const body = (id: string, rank: number, position: THREE.Vector3, radius: number): LabelledBody =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), rank, colour: 0xffffff, position, radius });
const sprite = (scene: THREE.Scene, name: string) => scene.getObjectByName(name) as THREE.Sprite;
/** How many CSS pixels tall a sprite of non-attenuating size is drawn through `camera`. */
const spritePx = (s: THREE.Sprite, camera: THREE.PerspectiveCamera) => s.scale.y * camera.projectionMatrix.elements[5] * VIEWPORT.y / 2;

describe('radiusOnScreen', () => {
  it('measures a sphere\'s radius on screen, the Earth at the default view near 290 pixels', () => {
    expect(radiusOnScreen(100, 350, 50, 900)).toBeGreaterThan(250);
    expect(radiusOnScreen(100, 350, 50, 900)).toBeLessThan(320);
    expect(radiusOnScreen(1097, 1.7e6, 50, 900)).toBeLessThan(1);
  });

  it('is unbounded from inside the sphere', () => {
    expect(radiusOnScreen(100, 50, 50, 900)).toBe(Infinity);
  });
});

describe('markerShown', () => {
  it('is whole while a body\'s disc is too small to see, and gone once it can be seen', () => {
    expect(markerShown(0.05)).toBe(1);
    expect(markerShown(MARKER_FULL_PX)).toBe(1);
    expect(markerShown(MARKER_GONE_PX)).toBe(0);
    expect(markerShown(40)).toBe(0);
  });

  it('fades between', () => {
    const middle = markerShown((MARKER_FULL_PX + MARKER_GONE_PX) / 2);
    expect(middle).toBeGreaterThan(0.4);
    expect(middle).toBeLessThan(0.6);
  });
});

describe('placeNames', () => {
  const box = (x: number, y: number) => ({ x, y, width: 60, height: 18 });

  it('places every name that overlaps no other', () => {
    expect(placeNames([{ id: 'a', rank: 1, box: box(0, 0) }, { id: 'b', rank: 2, box: box(100, 0) }])).toEqual(new Set(['a', 'b']));
  });

  it('keeps the higher-ranked name where two overlap, whatever order they come in', () => {
    const shown = placeNames([{ id: 'moon', rank: 2, box: box(10, 5) }, { id: 'earth', rank: 1, box: box(0, 0) }]);
    expect(shown).toEqual(new Set(['earth']));
  });
});

describe('pointerAt: where an edge pointer stands (SS5)', () => {
  it('stands in from the edge of the view in the body\'s direction, clear of the app\'s rails and timeline', () => {
    const right = pointerAt(500, 0, 1400, 900);
    expect(right.angle).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(right.x).toBeCloseTo(1400 / 2 - pointerInsets(1400, 900).x, 9);
    // The left rail is 75 pixels wide and the timeline 50 pixels tall over the canvas.
    expect(pointerInsets(1400, 760).x).toBeGreaterThan(75 + POINTER_PX);
    expect(pointerInsets(1400, 760).y).toBeGreaterThan(50 + POINTER_PX);
    expect(pointerInsets(100, 100)).toEqual({ x: 18, y: 18 });
  });

  it('meets whichever edge the direction reaches first', () => {
    // Up and to the left at 45 degrees: the top edge is nearer in a wide view.
    const upLeft = pointerAt(-1, 1, 1400, 900);
    expect(upLeft.y).toBeCloseTo(-upLeft.x, 9);
    expect(upLeft.y).toBeCloseTo(900 / 2 - pointerInsets(1400, 900).y, 9);
  });

  it('points down at a body straight behind the camera', () => {
    const behind = pointerAt(0, 0, 1400, 900);
    expect(behind.angle).toBeCloseTo(-Math.PI / 2, 9);
    expect(behind.y).toBeLessThan(0);
  });
});

describe('BodyLabels', () => {
  let scene: THREE.Scene;
  let labels: BodyLabels;

  beforeEach(() => {
    scene = new THREE.Scene();
    labels = new BodyLabels(scene);
  });

  afterEach(() => labels.dispose());

  const farOut = () => cameraAt(new THREE.Vector3(0, 400_000, 1_200_000));
  const system = () => [
    body('earth', 1, new THREE.Vector3(), 100),
    body('moon', 2, new THREE.Vector3(5_000, 0, 3_000), 27),
    body('jupiter', 3, new THREE.Vector3(250_000, 0, -100_000), 1097),
  ];

  it('marks and names every body too small to see', () => {
    const camera = farOut();
    labels.update(system(), camera, VIEWPORT, 1);
    expect(labels.isDrawn('jupiter', 'marker')).toBe(true);
    expect(labels.isDrawn('jupiter', 'name')).toBe(true);
    expect(sprite(scene, 'jupiter-marker').position.toArray()).toEqual([250_000, 0, -100_000]);
  });

  it('draws the markers and names a fixed size on screen, whatever the distance', () => {
    const camera = farOut();
    labels.update(system(), camera, VIEWPORT, 1);
    expect(spritePx(sprite(scene, 'jupiter-marker'), camera)).toBeCloseTo(MARKER_PX, 6);
    const near = cameraAt(new THREE.Vector3(0, 0, 20_000));
    labels.update(system(), near, VIEWPORT, 1);
    expect(spritePx(sprite(scene, 'jupiter-marker'), near)).toBeCloseTo(MARKER_PX, 6);
  });

  it('is drawn as laid out by the render under way, not the one before: its matrices worked out as it is laid out', () => {
    // Laid out as a render starts, after three.js works out that render's matrices; a capture after a smaller render
    // drew every name at that render's size (25 Oct).
    const camera = farOut();
    labels.update(system(), camera, new THREE.Vector2(VIEWPORT.x / 5, VIEWPORT.y / 5), 1);
    labels.update(system(), camera, VIEWPORT, 1);
    for (const id of ['jupiter-marker', 'jupiter-name']) {
      const drawn = sprite(scene, id);
      expect(new THREE.Vector3().setFromMatrixScale(drawn.matrixWorld).y).toBeCloseTo(drawn.scale.y, 12);
      expect(new THREE.Vector3().setFromMatrixPosition(drawn.matrixWorld).toArray()).toEqual(drawn.position.toArray());
    }
  });

  it('lets a name give way to a higher-ranked one it would overlap: the Moon\'s to the Earth\'s, far out', () => {
    labels.update(system(), farOut(), VIEWPORT, 1);
    expect(labels.isDrawn('earth', 'name')).toBe(true);
    expect(labels.isDrawn('moon', 'name')).toBe(false);
    // The Moon is still marked.
    expect(labels.isDrawn('moon', 'marker')).toBe(true);
  });

  it('drops the marker once a body can be seen for itself, and sets its name beside the disc', () => {
    // From 20,000 units beyond Jupiter, looking back at the Earth: Jupiter about 50 pixels in radius.
    const jupiter = new THREE.Vector3(250_000, 0, -100_000);
    const camera = cameraAt(jupiter.clone().multiplyScalar((jupiter.length() + 20_000) / jupiter.length()));
    labels.update(system(), camera, VIEWPORT, 1);
    expect(labels.isDrawn('jupiter', 'marker')).toBe(false);
    expect(labels.isDrawn('jupiter', 'name')).toBe(true);
    const name = sprite(scene, 'jupiter-name');
    const widthPx = name.scale.x * camera.projectionMatrix.elements[5] * VIEWPORT.y / 2;
    const discPx = radiusOnScreen(1097, 20_000, 50, VIEWPORT.y);
    expect(-name.center.x * widthPx).toBeGreaterThan(discPx);
  });

  it('marks a body behind the camera with no marker or name, but a pointer at the edge on its side (SS5)', () => {
    const camera = cameraAt(new THREE.Vector3(0, 0, 100_000), new THREE.Vector3(0, 0, 0));
    labels.update([body('behind', 5, new THREE.Vector3(80_000, 0, 300_000), 100)], camera, VIEWPORT, 1);
    expect(labels.isDrawn('behind', 'marker')).toBe(false);
    expect(labels.isDrawn('behind', 'name')).toBe(false);
    expect(labels.isDrawn('behind', 'pointer')).toBe(true);
    const pointer = sprite(scene, 'behind-pointer');
    const onScreen = pointer.position.clone().project(camera);
    expect(onScreen.x).toBeCloseTo(1 - pointerInsets(VIEWPORT.x, VIEWPORT.y).x / (VIEWPORT.x / 2), 6);
    expect(onScreen.y).toBeCloseTo(0, 6);
    // The arrow, drawn pointing up, turned to point right.
    expect((pointer.material as THREE.SpriteMaterial).rotation).toBeCloseTo(-Math.PI / 2, 9);
    expect(spritePx(pointer, camera)).toBeCloseTo(POINTER_PX, 6);
  });

  it('points to a body off the side of the view, and to none on screen', () => {
    const camera = farOut();
    const offLeft = body('offleft', 4, new THREE.Vector3(-3_000_000, 0, 0), 1000);
    labels.update([...system(), offLeft], camera, VIEWPORT, 1);
    expect(labels.isDrawn('offleft', 'pointer')).toBe(true);
    expect(sprite(scene, 'offleft-pointer').position.clone().project(camera).x).toBeLessThan(-0.7);
    expect(labels.isDrawn('jupiter', 'pointer')).toBe(false);
  });

  it('lets a pointer give way to a higher-ranked one it would overlap', () => {
    const camera = cameraAt(new THREE.Vector3(0, 0, 100_000), new THREE.Vector3(0, 0, 0));
    labels.update([
      body('first', 1, new THREE.Vector3(80_000, 0, 300_000), 100),
      body('second', 2, new THREE.Vector3(80_000, 1_000, 300_000), 100),
    ], camera, VIEWPORT, 1);
    expect(labels.isDrawn('first', 'pointer')).toBe(true);
    expect(labels.isDrawn('second', 'pointer')).toBe(false);
  });

  it('draws nothing while the solar system is not shown, and fades with it', () => {
    labels.update(system(), farOut(), VIEWPORT, 1);
    labels.update(system(), farOut(), VIEWPORT, 0);
    expect(labels.isDrawn('jupiter', 'marker')).toBe(false);
    expect(scene.getObjectByName('solar-system-labels')?.visible).toBe(false);
    labels.update(system(), farOut(), VIEWPORT, 0.5);
    expect((sprite(scene, 'jupiter-marker').material as THREE.SpriteMaterial).opacity).toBeCloseTo(0.5, 6);
    expect((sprite(scene, 'jupiter-name').material as THREE.SpriteMaterial).opacity).toBeCloseTo(0.5, 6);
  });

  it('draws over everything, never hidden by the globe or a planet', () => {
    labels.update(system(), farOut(), VIEWPORT, 1);
    const material = sprite(scene, 'jupiter-name').material as THREE.SpriteMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.sizeAttenuation).toBe(false);
  });

  it('takes everything it added out of the scene', () => {
    labels.update(system(), farOut(), VIEWPORT, 1);
    labels.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
