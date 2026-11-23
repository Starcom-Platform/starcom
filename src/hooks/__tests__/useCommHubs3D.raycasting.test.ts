/**
 * Unit tests for resolveCommHubHit — the pure pick-priority resolution useCommHubs3D's
 * raycasting logic (pickAt) delegates to. Real pointer-event + camera raycasting through
 * jsdom can't meaningfully be simulated (no precedent anywhere else in this codebase
 * either — see the plan's own note that this is best left to a visual smoke test), so
 * this function is deliberately kept pure and DOM-free to have a direct, real unit test.
 *
 * It returns the INTERSECTION rather than the object: every landing point is one point
 * of a single THREE.Points now, so which one was hit is the intersection's index, and
 * the object alone would identify the layer while losing the mark.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resolveCommHubHit, shouldThrottleHoverRaycast, landingPointAtIndex, pickRadiusUnits } from '../useCommHubs3D';
import { buildScreenPoints } from '../../components/Globe/screenPoints';
import { latLngToGlobeWorld } from '../../utils/globeCoordinates';
import { SURFACE_MARKS } from '../../components/Globe/globeAltitudes';

function makeIntersection(object: THREE.Object3D, distance: number): THREE.Intersection {
  return { object, distance, point: new THREE.Vector3(), face: null } as unknown as THREE.Intersection;
}

describe('resolveCommHubHit', () => {
  it('returns the landing point when only a landing point is hit', () => {
    const point = new THREE.Points();
    const intersection = makeIntersection(point, 5);
    const hit = resolveCommHubHit([intersection], []);
    expect(hit).toBe(intersection);
    expect(hit?.object).toBe(point);
  });

  it('returns the cable when only a cable is hit', () => {
    const cable = new THREE.Line();
    const intersection = makeIntersection(cable, 5);
    const hit = resolveCommHubHit([], [intersection]);
    expect(hit).toBe(intersection);
  });

  it('returns null when nothing is hit', () => {
    expect(resolveCommHubHit([], [])).toBeNull();
  });

  it('prefers the landing point over the cable even when the cable hit is nearer to the camera', () => {
    // Real case: a landing point marker sits at a cable's endpoint, so both are hit at the
    // same pixel. The landing point should win regardless of which intersection distance
    // is smaller — this is a hard category priority, not nearest-hit-wins.
    const point = new THREE.Points();
    const cable = new THREE.Line();
    const hit = resolveCommHubHit([makeIntersection(point, 10)], [makeIntersection(cable, 2)]);
    expect(hit?.object).toBe(point);
  });
});

describe('shouldThrottleHoverRaycast', () => {
  it('throttles a raycast requested less than the threshold after the last one', () => {
    expect(shouldThrottleHoverRaycast(1010, 1000, 16)).toBe(true);
  });

  it('allows a raycast once at least the threshold has elapsed', () => {
    expect(shouldThrottleHoverRaycast(1016, 1000, 16)).toBe(false);
    expect(shouldThrottleHoverRaycast(1050, 1000, 16)).toBe(false);
  });

  it('always allows the very first raycast (lastRaycastTime = 0, a real elapsed-since-epoch gap)', () => {
    expect(shouldThrottleHoverRaycast(performance.now(), 0, 16)).toBe(false);
  });
});

describe('landingPointAtIndex', () => {
  const marks = (ids: string[]) => {
    const object = new THREE.Points();
    object.userData = { landingPoints: ids.map((id) => ({ point: { id, name: id } })) };
    return object;
  };

  it('names the point at the index the raycast reported', () => {
    expect(landingPointAtIndex(marks(['a', 'b', 'c']), 1)?.id).toBe('b');
    expect(landingPointAtIndex(marks(['a', 'b', 'c']), 0)?.id).toBe('a');
  });

  it('refuses rather than guessing when the index names nothing', () => {
    // Opening a popup about whichever point happened to be first would be a claim
    // about a different country's cable dependency.
    expect(landingPointAtIndex(marks(['a']), 7)).toBeNull();
    expect(landingPointAtIndex(marks(['a']), undefined)).toBeNull();
    expect(landingPointAtIndex(new THREE.Points(), 0)).toBeNull();
  });
});

/**
 * A real ray at a real mark.
 *
 * The parts above are pure, and that is the point of them — but between them sits the
 * thing neither covers: whether a pointer aimed at the DOT A PERSON SEES hits it.
 * A THREE.Points intersection is governed by raycaster.params.Points.threshold, in
 * world units, while the mark's size is fixed in pixels — so a constant threshold is
 * right at exactly one zoom, and the layer can draw perfectly, look hoverable, and be
 * unclickable everywhere else, with every other test green.
 *
 * Raycasting is arithmetic, so this runs anywhere. The radius and altitude below are
 * the hook's own (pickRadiusUnits over the largest mark, SURFACE_MARKS).
 */
describe('a pointer aimed at a landing point', () => {
  const GLOBE_RADIUS = 100;
  const VIEWPORT_PX = 900;
  const MARK_CAP_PX = 16;
  const PLACES = [
    { id: 'lp-lisbon', lat: 38.7, lng: -9.1 },
    { id: 'lp-accra', lat: 5.6, lng: -0.2 },
    { id: 'lp-recife', lat: -8.0, lng: -34.9 },
  ];

  const at = (place: { lat: number; lng: number }) =>
    latLngToGlobeWorld(place.lat, place.lng, GLOBE_RADIUS * SURFACE_MARKS);

  const marks = () => buildScreenPoints(PLACES.map((place) => ({
    position: at(place), sizePx: MARK_CAP_PX, color: 0x00c2ff,
  })), { userData: { type: 'commHubLandingPoint', landingPoints: PLACES.map((point) => ({ point })) } });

  /** A camera over the Atlantic at `altitude` globe radii, far enough to see all three. */
  const camera = (altitude: number) => {
    const c = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 5000);
    c.position.copy(latLngToGlobeWorld(10, -20, GLOBE_RADIUS * altitude));
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    return c;
  };

  const rayThrough = (cam: THREE.Camera, world: THREE.Vector3) => {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: pickRadiusUnits(cam, VIEWPORT_PX, MARK_CAP_PX / 2) };
    const ndc = world.clone().project(cam);
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
    return raycaster;
  };

  /** A world point `px` pixels to the side of `world`, as the camera sees it. */
  const offsetByPixels = (cam: THREE.PerspectiveCamera, world: THREE.Vector3, px: number) => {
    const unitsPerPx = pickRadiusUnits(cam, VIEWPORT_PX, 1);
    const toCamera = cam.position.clone().sub(world).normalize();
    const sideways = new THREE.Vector3().crossVectors(toCamera, cam.up).normalize();
    return world.clone().add(sideways.multiplyScalar(px * unitsPerPx));
  };

  it('hits it, and the index names that point and no other', () => {
    const cam = camera(2.4);
    const points = marks();

    PLACES.forEach((place, i) => {
      const hits = rayThrough(cam, at(place)).intersectObject(points, false);

      expect(hits.length).toBeGreaterThan(0);
      expect(landingPointAtIndex(points, hits[0].index)?.id).toBe(place.id);
      expect(hits[0].index).toBe(i);
    });
  });

  it('still hits when the pointer is on the edge of the drawn dot, at either zoom', () => {
    // The property the whole helper exists for. A fixed world threshold passes this at
    // one distance and fails at the other.
    for (const altitude of [1.6, 4.0]) {
      const cam = camera(altitude);
      const points = marks();
      const edge = offsetByPixels(cam, at(PLACES[0]), MARK_CAP_PX / 2 - 1);

      expect(rayThrough(cam, edge).intersectObject(points, false).length).toBeGreaterThan(0);
    }
  });

  it('misses a pointer well outside the dot rather than picking the nearest anything', () => {
    const cam = camera(2.4);
    const points = marks();
    const wellOutside = offsetByPixels(cam, at(PLACES[0]), MARK_CAP_PX * 4);

    expect(rayThrough(cam, wellOutside).intersectObject(points, false)).toHaveLength(0);
  });

  it('scales the radius with the camera, which is why it is not a constant', () => {
    const near = pickRadiusUnits(camera(1.6), VIEWPORT_PX, 8);
    const far = pickRadiusUnits(camera(4.0), VIEWPORT_PX, 8);

    expect(far).toBeGreaterThan(near * 2);
    // A viewport that has not been laid out yet must not produce a zero-radius pick.
    expect(pickRadiusUnits(camera(2.4), 0, 8)).toBe(8);
  });
});
