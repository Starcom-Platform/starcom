/**
 * Where each body of the solar system is drawn (decision K6; record
 * docs/missions/01-architecture-decisions/solar-system.md).
 *
 * ─── DIRECTION: TRUE, IN THE GLOBE'S FRAME, FOR THE MOMENT SHOWN ───────────
 *
 * The globe is Earth-fixed: react-globe.gl draws it still, and its light turns
 * round it once a day from the real subsolar point (globeLighting.ts). A body is
 * drawn in the same frame: its apparent right ascension and declination for the
 * moment (astronomy-engine, as the planets were already read), turned by the
 * Earth's rotation, `longitude = RA − GMST`, the very angle the light uses
 * (`computeSolarEphemeris(at).gmstDeg`). So each body is where it really is in the
 * Earth's sky, and the drawn Sun is exactly where the daylight comes from.
 *
 * ─── SIZE: TRUE ────────────────────────────────────────────────────────────
 *
 * One scale for every body, the globe's: one Earth radius is 100 units, so the
 * Sun is 10,920 and Jupiter 1,097.
 *
 * ─── DISTANCE: THE SCALE IN FORCE (OR9; solarScale.ts) ─────────────────────
 *
 * The owner chose a selector (1 Nov, OR9): Compact, as below, or True, every distance true, out to Neptune (OR31).
 * What follows is Compact's reasoning, and why it stays the default.
 *
 * ─── COMPACT: THE MOON TRUE, EVERYTHING ELSE AT ONE SCALE (SS1, AMENDED C32) ──
 *
 * True distances cannot be zoomed through: the Sun would sit 2.35 million units
 * away and Neptune 70 million. The Moon is drawn at its true distance. Every other
 * body, and every orbit line, is drawn at one scale about the Earth, DRAWN_UNITS_PER_AU
 * to an astronomical unit: the Sun about 119,000 units out, 1,190 Earth radii, as it
 * stood, and Neptune about 3.6 million. One scale keeps every orbit its true shape, a
 * planet on its line, and every direction exact, so each body is where it really is in
 * the Earth's sky.
 *
 * Until 24 October each distance was drawn as `sqrt(d × dMoon)` (SS1), compact, but it
 * squeezed far points more than near ones, measured from the Earth, so an inner
 * planet's ellipse round the Sun was drawn as an Earth-centred egg: the owner saw
 * Venus's and Mercury's orbits "modulated by Earth" (critique C32) and chose one scale.
 * At 1 AU the two rules agree, so the Sun did not move. With true sizes, the Sun looks
 * about ten degrees across from the Earth instead of half a degree: the price of any
 * scale that fits a screen, stated in the record.
 */
import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { GLOBE_UNITS_PER_AU, kmToGlobeUnits } from './EphemerisService';
import {
  COMPACT_UNITS_PER_AU, DIAGRAM_MOON_UNITS, DIAGRAM_RING_UNITS, MOON_MEAN_DISTANCE_UNITS, diagramRadiusUnits, diagramRing, diagramWeightNow, skyScaleNow,
} from './solarScale';
import { computeSolarEphemeris } from './SolarEphemerisService';
import { subsolarDirectionWorld } from '../globe-engine/globeLighting';

/** The Moon's mean distance, the one distance drawn true at every scale. */
export { MOON_MEAN_DISTANCE_UNITS };

/** Scene units an astronomical unit is drawn as at Compact, for every body but the Moon: where the Sun has always stood. */
export const DRAWN_UNITS_PER_AU = COMPACT_UNITS_PER_AU;
/** A true distance in scene units, times this, is its drawn distance at Compact (C32): about 1 in 19.7. */
export const SKY_SCALE = DRAWN_UNITS_PER_AU / GLOBE_UNITS_PER_AU;

/**
 * A true distance from the Earth, in scene units, as drawn: the Moon's true, every other body's at the scale in force
 * (solarScale.ts; OR9): about 1 in 19.7 at Compact, true at True, gliding between them while the scale is switched.
 */
export function drawnDistance(trueUnits: number, body?: Astronomy.Body, skyScale = skyScaleNow()): number {
  return body === Astronomy.Body.Moon ? trueUnits : trueUnits * skyScale;
}

/** A body's radius as drawn: its true radius on the globe's scale. What its geometry is built at. */
export function drawnRadius(radiusKm: number): number {
  return kmToGlobeUnits(radiusKm);
}

/**
 * How much larger than its true size a body is drawn now: 1 but in Diagram, where each size goes on a log of the
 * body's (D4), and between while gliding to or from it. A mesh built at drawnRadius is scaled by this at each placement.
 */
export function sizeFactorNow(radiusKm: number, weight = diagramWeightNow()): number {
  if (weight <= 0) return 1;
  return 1 + weight * (diagramRadiusUnits(radiusKm) / drawnRadius(radiusKm) - 1);
}

/** A body's radius as drawn now, in scene units: its true radius, or Diagram's, or between. */
export const drawnRadiusNow = (radiusKm: number): number => drawnRadius(radiusKm) * sizeFactorNow(radiusKm);

/** The body astronomy-engine knows by a planet's name, for its ring in Diagram. */
const ringOf = (body: Astronomy.Body | undefined): number => (body === undefined ? 0 : diagramRing(String(body)));

/**
 * Where a point of the heliocentric sky is in Diagram (D4), in J2000 axes, from the Earth: `helioAu` on ring `ring` round
 * the Sun along its true direction from it, less the Earth on its own ring (the third). Ring 0 is the Sun itself.
 */
function diagramFromEarth(helioAu: THREE.Vector3 | null, earthHelioAu: THREE.Vector3, ring: number, out: THREE.Vector3): THREE.Vector3 {
  const earth = scratch.copy(earthHelioAu).normalize().multiplyScalar(diagramRing('earth') * DIAGRAM_RING_UNITS);
  if (!helioAu || ring === 0) return out.copy(earth).negate();
  return out.copy(helioAu).normalize().multiplyScalar(ring * DIAGRAM_RING_UNITS).sub(earth);
}
const scratch = new THREE.Vector3();
const blend = new THREE.Vector3();

/** The Earth from the Sun at `at`, in J2000 axes and AU. */
const earthHelio = (at: Date): THREE.Vector3 => {
  const v = Astronomy.HelioVector(Astronomy.Body.Earth, Astronomy.MakeTime(at));
  return new THREE.Vector3(v.x, v.y, v.z);
};

/**
 * Where a point of an orbit is drawn (D4): `helioAu`, a point of a body's path round the Sun (J2000, AU), with the
 * Earth at `earthHelioAu`, on the body's ring in Diagram; otherwise measured from the Earth and brought to its drawn
 * distance, as drawnPosition does; between while gliding.
 */
export function drawnOrbitPoint(helioAu: THREE.Vector3, earthHelioAu: THREE.Vector3, frame: THREE.Matrix4, ring: number, out = new THREE.Vector3()): THREE.Vector3 {
  const weight = diagramWeightNow();
  if (weight < 1) drawnPosition(blend.subVectors(helioAu, earthHelioAu), frame, out);
  if (weight <= 0) return out;
  const diagram = diagramFromEarth(helioAu, earthHelioAu, ring, scratch2).applyMatrix4(frame);
  return weight >= 1 ? out.copy(diagram) : out.lerp(diagram, weight);
}
const scratch2 = new THREE.Vector3();

/**
 * The turn from astronomy-engine's frame, the J2000 equator (EQJ), into the globe's
 * Earth-fixed frame at `at`: onto the true equator of date, then round the axis by the
 * Earth's rotation, `longitude = RA − GMST`, the very angle the light uses. Every body
 * and every orbit line goes through this one turn.
 */
export function skyFrame(at: Date): THREE.Matrix4 {
  const time = Astronomy.MakeTime(at);
  const toDate = Astronomy.Rotation_EQJ_EQD(time);
  // Where each J2000 axis lands. On the equator of date, the globe's axes are a turn of
  // the equatorial ones: its Y is the pole, its Z the equinox at GMST 0, its X 90° east.
  const axis = (x: number, y: number, z: number) => {
    const v = Astronomy.RotateVector(toDate, new Astronomy.Vector(x, y, z, time));
    return new THREE.Vector3(v.y, v.z, v.x);
  };
  const ofDate = new THREE.Matrix4().makeBasis(axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1));
  const gmst = THREE.MathUtils.degToRad(computeSolarEphemeris(at).gmstDeg);
  return new THREE.Matrix4().makeRotationY(-gmst).multiply(ofDate);
}

/**
 * Where a point is drawn: `geocentricAu`, a position from the Earth's centre in
 * J2000 axes and AU, turned by `frame` (skyFrame) and brought in to its drawn distance.
 */
export function drawnPosition(geocentricAu: THREE.Vector3, frame: THREE.Matrix4, out = new THREE.Vector3(), body?: Astronomy.Body): THREE.Vector3 {
  const trueUnits = geocentricAu.length() * GLOBE_UNITS_PER_AU;
  const length = drawnDistance(trueUnits, body);
  // The Moon's ring in Diagram (OR40): its true direction, five Earth radii out.
  const weight = body === Astronomy.Body.Moon ? diagramWeightNow() : 0;
  return out.copy(geocentricAu).applyMatrix4(frame).setLength(weight > 0 ? length + weight * (DIAGRAM_MOON_UNITS - length) : length);
}

/**
 * Where a body is in the Earth's sky at `at`: a unit vector in the globe's frame,
 * and its true distance from the Earth's centre in scene units. Light-time and
 * aberration corrected, as it is seen.
 */
export function skyDirection(body: Astronomy.Body, at: Date): { direction: THREE.Vector3; trueUnits: number } {
  const v = Astronomy.GeoVector(body, Astronomy.MakeTime(at), true);
  const direction = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(skyFrame(at)).normalize();
  return { direction, trueUnits: v.Length() * GLOBE_UNITS_PER_AU };
}

/**
 * A body's drawn position at `at`: its true direction, at its drawn distance; in Diagram on its ring round the Sun (the
 * Moon on its ring round the Earth), and between while gliding.
 */
export function placeInSky(body: Astronomy.Body, at: Date): THREE.Vector3 {
  const { direction, trueUnits } = skyDirection(body, at);
  const weight = diagramWeightNow();
  if (body === Astronomy.Body.Moon) return direction.multiplyScalar(drawnDistance(trueUnits, body) * (1 - weight) + DIAGRAM_MOON_UNITS * weight);
  const placed = direction.multiplyScalar(drawnDistance(trueUnits, body));
  if (weight <= 0) return placed;
  const v = Astronomy.HelioVector(body, Astronomy.MakeTime(at));
  const diagram = diagramFromEarth(new THREE.Vector3(v.x, v.y, v.z), earthHelio(at), ringOf(body), new THREE.Vector3()).applyMatrix4(skyFrame(at));
  return placed.lerp(diagram, weight);
}

/**
 * The Sun's drawn position at `at`: along the globe light's own direction, so the
 * Sun a person sees and the light on the Earth can never disagree, at its drawn distance.
 */
export function sunInSky(at: Date): THREE.Vector3 {
  const placed = subsolarDirectionWorld(at).multiplyScalar(drawnDistance(skyDirection(Astronomy.Body.Sun, at).trueUnits));
  const weight = diagramWeightNow();
  if (weight <= 0) return placed;
  // In Diagram the Sun is the rings' centre: the Earth's ring out from it, the other way.
  const diagram = diagramFromEarth(null, earthHelio(at), 0, new THREE.Vector3()).applyMatrix4(skyFrame(at));
  return placed.lerp(diagram, weight);
}

/**
 * Where the Sun is, seen from `body` at `at`: a unit vector in the globe's frame, from
 * the body's true place. What lights it (sunlitMaterial.ts).
 */
export function sunDirectionFrom(body: Astronomy.Body, at: Date, frame = skyFrame(at)): THREE.Vector3 {
  const fromSun = Astronomy.HelioVector(body, Astronomy.MakeTime(at));
  return new THREE.Vector3(-fromSun.x, -fromSun.y, -fromSun.z).applyMatrix4(frame).normalize();
}

/**
 * How `body` is turned at `at`: its own pole and the spin of its prime meridian (the IAU
 * model, from astronomy-engine's RotationAxis), as a rotation in the globe's frame of a
 * sphere built the way three.js builds one, its imagery's prime meridian on +X and its
 * north on +Y. So the Moon keeps its near side to the Earth and Saturn's equator, and its
 * rings, lie where they do, not in the Earth's equator.
 */
export function bodyTurn(body: Astronomy.Body, at: Date, frame = skyFrame(at)): THREE.Quaternion {
  const axis = Astronomy.RotationAxis(body, Astronomy.MakeTime(at));
  const north = new THREE.Vector3(axis.north.x, axis.north.y, axis.north.z);
  // W is measured along the body's equator, eastward, from where that equator crosses the
  // J2000 equator going north, which is at right ascension α + 90°.
  const ra = THREE.MathUtils.degToRad(axis.ra * 15);
  const node = new THREE.Vector3(-Math.sin(ra), Math.cos(ra), 0);
  const spin = THREE.MathUtils.degToRad(axis.spin);
  const meridian = node.clone().multiplyScalar(Math.cos(spin)).add(north.clone().cross(node).multiplyScalar(Math.sin(spin)));
  const east = north.clone().cross(meridian);
  // The sphere's axes: +X the prime meridian, +Y north, +Z ninety degrees west.
  const axes = new THREE.Matrix4().makeBasis(meridian, north, east.negate());
  return new THREE.Quaternion().setFromRotationMatrix(frame.clone().multiply(axes));
}

/**
 * How much of an orbit line is drawn, the camera `cameraDistance` from the Earth and the
 * line's farthest point `orbitReach` from it: none until the camera has backed out to half
 * that, all once it is twice that and the whole orbit is in view. Seen from inside, every
 * orbit is an arc along the same band of sky, one over another; from outside, a loop.
 */
export function orbitShown(cameraDistance: number, orbitReach: number): number {
  return THREE.MathUtils.smoothstep(cameraDistance, orbitReach / 2, orbitReach * 2);
}
