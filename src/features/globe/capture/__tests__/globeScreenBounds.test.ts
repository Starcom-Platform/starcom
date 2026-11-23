/**
 * Framing, against a real three.js camera.
 *
 * Not a stubbed projection — a real PerspectiveCamera positioned like the
 * globe's. The claim being tested is geometric ("these bounds contain the
 * sphere"), and a stub that returns coordinates I chose would test my
 * arithmetic against itself.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeGlobeScreenBounds,
  expandToAspect,
  padBounds,
  GlobeBoundsError,
} from '../globeScreenBounds';

const RADIUS = 100;
const FRAME = { width: 1400, height: 708 };

/** A camera looking at the origin from `altitude` globe-radii above the surface. */
function target(opts: { altitude?: number; lat?: number; lon?: number; fov?: number } = {}) {
  const altitude = opts.altitude ?? 2.5;
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 50, FRAME.width / FRAME.height, 0.1, 10000);
  const distance = RADIUS * (1 + altitude);
  const phi = THREE.MathUtils.degToRad(90 - (opts.lat ?? 0));
  const theta = THREE.MathUtils.degToRad(opts.lon ?? 0);
  camera.position.setFromSphericalCoords(distance, phi, theta);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { camera: () => camera, getGlobeRadius: () => RADIUS };
}

/** Project a point the same way the module does, to check containment. */
function projectPoint(camera: THREE.Camera, v: THREE.Vector3) {
  const ndc = v.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * FRAME.width,
    y: (ndc.y * -0.5 + 0.5) * FRAME.height,
  };
}

describe('the bounds contain the globe', () => {
  /**
   * The property that matters. A tighter box would be prettier and a mistake
   * in it crops the Earth — which nobody reports as a bug, they just think the
   * app looks broken.
   */
  it.each([1.2, 2.5, 4, 8])('contains 200 surface points at altitude %s', (altitude) => {
    const t = target({ altitude });
    const bounds = computeGlobeScreenBounds(t, FRAME);
    const camera = t.camera();

    for (let i = 0; i < 200; i++) {
      // Fibonacci sphere — even coverage rather than clustered at the poles.
      const y = 1 - (i / 199) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const p = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r)
        .multiplyScalar(RADIUS);
      // Only points on the camera-facing hemisphere are visible; the far side
      // projects to coordinates that are geometrically valid but hidden.
      if (p.clone().sub(camera.position).dot(p) > 0) continue;
      const s = projectPoint(camera, p);
      expect(s.x).toBeGreaterThanOrEqual(bounds.minX - 0.01);
      expect(s.x).toBeLessThanOrEqual(bounds.maxX + 0.01);
      expect(s.y).toBeGreaterThanOrEqual(bounds.minY - 0.01);
      expect(s.y).toBeLessThanOrEqual(bounds.maxY + 0.01);
    }
  });

  it('holds when the camera is off the equator and prime meridian', () => {
    const t = target({ lat: 45, lon: -70 });
    const bounds = computeGlobeScreenBounds(t, FRAME);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    const centre = projectPoint(t.camera(), new THREE.Vector3(0, 0, 0));
    expect(centre.x).toBeGreaterThan(bounds.minX);
    expect(centre.x).toBeLessThan(bounds.maxX);
  });
});

describe('the y axis is inverted, and a centred globe cannot prove it', () => {
  /*
   * ─── A MUTATION SURVIVED THIS SUITE, AND THIS IS WHY ─────────────────────
   *
   * Flipping the module's NDC-to-pixel y sign — `ndc.y * -0.5` to
   * `ndc.y * 0.5`, the classic projection error — passed all 67 tests.
   *
   * The reason is geometric, not sloppiness in the assertions: the globe's
   * camera always lookAt()s the origin, so the globe is vertically CENTRED in
   * every frame. Mirroring a centred subject about the frame's midline returns
   * the same bounds. The containment property is simply blind to it.
   *
   * It is not harmless, because react-globe.gl supports `globeOffset`, and an
   * offset globe with an inverted axis crops the wrong half.
   *
   * So this case looks off-centre on purpose. It is the only test here that
   * can tell the sign apart.
   */
  function offCentreTarget() {
    const camera = new THREE.PerspectiveCamera(50, FRAME.width / FRAME.height, 0.1, 10000);
    camera.position.set(0, 0, RADIUS * 3.5);
    // Aim above the globe so it sits low in the frame.
    camera.lookAt(0, RADIUS * 1.5, 0);
    camera.updateMatrixWorld();
    return { camera: () => camera, getGlobeRadius: () => RADIUS };
  }

  it('places a globe below the aim point in the LOWER half of the frame', () => {
    const t = offCentreTarget();
    const bounds = computeGlobeScreenBounds(t, FRAME);
    const centreY = (bounds.minY + bounds.maxY) / 2;

    // Aiming above the globe puts the globe below the frame centre. With the
    // y sign flipped this lands in the upper half instead.
    expect(centreY).toBeGreaterThan(FRAME.height / 2);
  });

  it('agrees with a directly-projected surface point on which half it is in', () => {
    const t = offCentreTarget();
    const bounds = computeGlobeScreenBounds(t, FRAME);
    // The point on the globe nearest the camera, projected independently.
    const near = projectPoint(t.camera(), new THREE.Vector3(0, 0, RADIUS));
    expect(near.y).toBeGreaterThanOrEqual(bounds.minY - 0.01);
    expect(near.y).toBeLessThanOrEqual(bounds.maxY + 0.01);
    expect(near.y > FRAME.height / 2).toBe((bounds.minY + bounds.maxY) / 2 > FRAME.height / 2);
  });
});

describe('the box shrinks as the camera pulls back', () => {
  /** The measurement that would catch a sign error or a units mix-up. */
  it('is monotonic in altitude', () => {
    const widths = [1.2, 2, 3, 5, 8].map(
      (altitude) => computeGlobeScreenBounds(target({ altitude }), FRAME).width,
    );
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });

  /**
   * ─── CONTAINMENT IS NOT ENOUGH, AND THIS IS THE TEST THAT SAYS SO ────────
   *
   * The bounding-cube version of this module passed every containment test in
   * this file while reporting a box 34% wider than the globe. Containment is a
   * one-sided property: an enormous box satisfies it perfectly.
   *
   * That slack was not free. Padded and expanded to the card's aspect it
   * exceeded the capture frame, so the crop clamped to the whole frame and the
   * published card showed the globe filling a third of its width.
   *
   * So this measures the globe's real screen extent by brute force — 20,000
   * points on the sphere, projected by the test's own projection, keeping the
   * ones facing the camera — and requires the module to be close to it. It is
   * an independent measure: no tangent-circle arithmetic, just points on a
   * sphere.
   */
  it('is tight against the globe, not merely containing it', () => {
    const t = target({ altitude: 2.5 });
    const camera = t.camera();
    const bounds = computeGlobeScreenBounds(t, FRAME);

    const N = 20000;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const p = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r)
        .multiplyScalar(RADIUS);
      if (p.clone().sub(camera.position).dot(p) > 0) continue;
      const s = projectPoint(camera, p);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const observedWidth = maxX - minX;
    const observedHeight = maxY - minY;

    // Still contains it — the sampled points are all inside the reported box.
    expect(bounds.minX).toBeLessThanOrEqual(minX + 0.01);
    expect(bounds.maxX).toBeGreaterThanOrEqual(maxX - 0.01);

    // And is not padded out by a third. The cube version came in at ~1.34.
    expect(bounds.width / observedWidth).toBeLessThan(1.03);
    expect(bounds.height / observedHeight).toBeLessThan(1.03);
  });

  /**
   * The Phase 1 observation, as a number. At the default altitude the globe
   * occupies well under half the frame — which is why cropping exists.
   */
  it('confirms the globe occupies a minority of a 1400x708 frame', () => {
    const bounds = computeGlobeScreenBounds(target({ altitude: 2.5 }), FRAME);
    expect(bounds.width / FRAME.width).toBeLessThan(0.6);
    expect(bounds.width / FRAME.width).toBeGreaterThan(0.15);
  });
});

describe('it refuses rather than returning a plausible wrong box', () => {
  it('refuses with no camera', () => {
    expect(() => computeGlobeScreenBounds({ camera: () => undefined, getGlobeRadius: () => RADIUS } as never, FRAME))
      .toThrow(/has not initialised/);
  });

  it.each([0, -5, NaN, undefined])('refuses a radius of %s', (radius) => {
    expect(() => computeGlobeScreenBounds(
      { camera: () => target().camera(), getGlobeRadius: () => radius } as never, FRAME))
      .toThrow(GlobeBoundsError);
  });

  it('refuses a zero-area frame', () => {
    expect(() => computeGlobeScreenBounds(target(), { width: 0, height: 100 }))
      .toThrow(/meaningless/);
  });

  /**
   * From inside the globe every corner is behind the near plane, where the
   * perspective divide flips sign. Folding those in produces bounds mirrored
   * across the frame — a plausible-looking box that is not one — so it refuses.
   */
  it('refuses when the camera is inside the globe', () => {
    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 10000);
    camera.position.set(0, 0, 0);
    camera.updateMatrixWorld();
    expect(() => computeGlobeScreenBounds(
      { camera: () => camera, getGlobeRadius: () => RADIUS }, FRAME))
      .toThrow(/camera is inside the globe|outside the view frustum/);
  });
});

describe('expandToAspect grows, never crops', () => {
  const b = { minX: 100, minY: 100, maxX: 300, maxY: 300, width: 200, height: 200 };

  it('widens a square box for a wide card', () => {
    const out = expandToAspect(b, 1200 / 630);
    expect(out.width / out.height).toBeCloseTo(1200 / 630);
    expect(out.width).toBeGreaterThan(b.width);
    expect(out.height).toBe(b.height);
  });

  it('heightens a square box for a tall card', () => {
    const out = expandToAspect(b, 0.5);
    expect(out.width / out.height).toBeCloseTo(0.5);
    expect(out.height).toBeGreaterThan(b.height);
    expect(out.width).toBe(b.width);
  });

  /** The whole point of grow-only: nothing already inside leaves. */
  it('always contains the original box', () => {
    for (const aspect of [0.25, 0.8, 1, 1.91, 4]) {
      const out = expandToAspect(b, aspect);
      expect(out.minX).toBeLessThanOrEqual(b.minX);
      expect(out.maxX).toBeGreaterThanOrEqual(b.maxX);
      expect(out.minY).toBeLessThanOrEqual(b.minY);
      expect(out.maxY).toBeGreaterThanOrEqual(b.maxY);
    }
  });

  it('keeps the centre where it was', () => {
    const out = expandToAspect(b, 3);
    expect((out.minX + out.maxX) / 2).toBeCloseTo(200);
    expect((out.minY + out.maxY) / 2).toBeCloseTo(200);
  });

  it.each([0, -1, NaN])('refuses aspect %s', (aspect) => {
    expect(() => expandToAspect(b, aspect)).toThrow(/positive finite/);
  });
});

describe('padBounds', () => {
  const b = { minX: 100, minY: 100, maxX: 300, maxY: 200, width: 200, height: 100 };

  it('adds a proportional margin on each side', () => {
    const out = padBounds(b, 0.1);
    expect(out.minX).toBeCloseTo(80);
    expect(out.maxX).toBeCloseTo(320);
    expect(out.minY).toBeCloseTo(90);
    expect(out.maxY).toBeCloseTo(210);
    expect(out.width).toBeCloseTo(240);
  });

  it('is a no-op at zero', () => {
    expect(padBounds(b, 0)).toMatchObject({ minX: 100, maxX: 300, width: 200 });
  });

  it('refuses a negative fraction, which would crop', () => {
    expect(() => padBounds(b, -0.1)).toThrow(/>= 0/);
  });
});
