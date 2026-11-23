/**
 * The solar system's scale (critique-2026-11-01, OR9, OR31; plan D1, D2): Compact, as it has been since 24 October
 * (sizes and the Moon's distance true, every other distance at one scale about the Earth, about 1 in 19.7), or True
 * (every distance true: the Sun 2.35 million units out, 23,500 Earth radii, and seen from the Earth at its true half a
 * degree; Neptune 70 million). The person's choice is kept in this browser; a page's share handle may draw another for
 * itself (setScale), never changing the person's.
 *
 * Switching glides: an astronomical unit's drawn length moves from one scale's to the other's over a second and a
 * half, on a log scale, so every body slides out or in along its true direction and nothing jumps. The camera's reach
 * glides with it.
 *
 * Or Diagram (D4; the owner's OR39, OR40): not to scale. Each planet on its own ring round the Sun, the rings evenly
 * spaced, along its true direction from the Sun; the Moon on a small ring round the Earth; every size on a log of the
 * body's, against the Earth, which is the globe and keeps its size. Space weather's Sun-bound parts are drawn in the
 * diagram's Sun–Earth gap, a schematic (OR39). A glide to or from it moves each body from one layout to the other.
 */
import { useSyncExternalStore } from 'react';

/*
 * EphemerisService's units (100 to a radius of the Earth), worked out here the same way rather than imported: the rail
 * and the card read the scale, and must not load the ephemeris and three with it. A test holds the two equal.
 */
const kmToGlobeUnits = (km: number): number => (km / 6371) * 100;
/** A true astronomical unit in scene units: EphemerisService.GLOBE_UNITS_PER_AU. */
export const GLOBE_UNITS_PER_AU = (149597870.7 / 6371) * 100;

export const SOLAR_SCALES = ['compact', 'true', 'diagram', 'sky'] as const;
export type SolarScale = (typeof SOLAR_SCALES)[number];
export const isSolarScale = (value: unknown): value is SolarScale => (SOLAR_SCALES as readonly unknown[]).includes(value);

/** The Moon's mean distance, the one distance drawn true at every scale. */
export const MOON_MEAN_DISTANCE_UNITS = kmToGlobeUnits(384_400);
/** Compact's astronomical unit: where the Sun has stood since 24 October (C32), about 119,000 units. */
export const COMPACT_UNITS_PER_AU = Math.sqrt(GLOBE_UNITS_PER_AU * MOON_MEAN_DISTANCE_UNITS);

/** Diagram's rings (D4): this far apart, in scene units (15 Earth radii), Mercury's the first, Neptune's the eighth. */
export const DIAGRAM_RING_UNITS = 1500;
const DIAGRAM_RINGS: Readonly<Record<string, number>> = { mercury: 1, venus: 2, earth: 3, mars: 4, jupiter: 5, saturn: 6, uranus: 7, neptune: 8 };
/** A planet's ring in Diagram, by its name; 0 for anything without one. */
export const diagramRing = (planet: string): number => DIAGRAM_RINGS[planet.toLowerCase()] ?? 0;
/** The Moon's ring round the Earth in Diagram: five Earth radii (OR40). */
export const DIAGRAM_MOON_UNITS = 500;
/**
 * A body's radius in Diagram, in scene units: on a log of its true radius against the Earth's, which keeps its size
 * (the globe): the Sun about twice the Earth, Jupiter one and a half, the Moon and Mercury about three-quarters.
 */
export const diagramRadiusUnits = (radiusKm: number): number => 100 * Math.max(0.6, 1 + 0.5 * Math.log10(radiusKm / 6371));

/** An astronomical unit at each scale: at Diagram, its Sun–Earth gap, in which space weather is drawn (OR39). */
const UNITS_PER_AU: Readonly<Record<SolarScale, number>> = {
  compact: COMPACT_UNITS_PER_AU, true: GLOBE_UNITS_PER_AU, diagram: diagramRing('earth') * DIAGRAM_RING_UNITS,
  // Sky from a place (D5): every distance true, so every size in the sky is.
  sky: GLOBE_UNITS_PER_AU,
};
/**
 * How far the camera may pull out, and how far the scene reaches, at each scale. Compact's are as they were
 * (globeAltitudes.ts); True's take Neptune's orbit, about 30 AU, whole (OR31: out to Neptune); Diagram's its eight rings.
 */
const REACH: Readonly<Record<SolarScale, number>> = { compact: 9_000_000, true: 35 * GLOBE_UNITS_PER_AU, diagram: 40_000, sky: 35 * GLOBE_UNITS_PER_AU };
const EXTENT: Readonly<Record<SolarScale, number>> = { compact: 3_800_000, true: 31 * GLOBE_UNITS_PER_AU, diagram: 20_000, sky: 31 * GLOBE_UNITS_PER_AU };

/** How long a switch of scale glides. */
export const SCALE_GLIDE_MS = 1500;
const KEY = 'starcom:solar-scale';

const read = (): SolarScale => {
  try {
    const kept = localStorage.getItem(KEY);
    return isSolarScale(kept) ? kept : 'compact';
  } catch { return 'compact'; }
};

let chosen: SolarScale | null = null;
let page: SolarScale | null = null;
/** A glide in progress: from one scale to another, on a log scale of the unit, from a moment. */
let glide: { from: SolarScale; to: SolarScale; startMs: number } | null = null;
const listeners = new Set<() => void>();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The person's own scale. */
const personScale = (): SolarScale => (chosen ??= read());
/** The scale drawn: this page's, where its handle set one, else the person's. */
export const solarScale = (): SolarScale => page ?? personScale();
/** Who chose the scale drawn. */
export const solarScaleFrom = (): 'person' | 'handle' => (page ? 'handle' : 'person');

function moveTo(next: SolarScale, from: SolarScale): void {
  if (next !== from) glide = { from, to: next, startMs: now() };
  listeners.forEach((listener) => listener());
}

/** The scale before Sky from a place, to go back to when something moves the camera (D5). */
let beforeSky: SolarScale | null = null;

/** The person's choice, kept in this browser. */
export function setSolarScale(next: SolarScale): void {
  const before = solarScale();
  if (next === 'sky' && before !== 'sky') beforeSky = before;
  chosen = next;
  try { localStorage.setItem(KEY, next); } catch { /* kept for this page only */ }
  moveTo(solarScale(), before);
}

/** This page's scale, set through the share handle and never kept; null gives the person's back. */
export function setPageSolarScale(next: SolarScale | null): void {
  const before = solarScale();
  if (next === 'sky' && before !== 'sky') beforeSky = before;
  page = next;
  moveTo(solarScale(), before);
}

/** How far through a glide, 0 to 1, eased; 1 when there is none. */
function glideFraction(atMs = now()): { from: SolarScale; to: SolarScale; t: number } {
  const scale = solarScale();
  if (!glide) return { from: scale, to: scale, t: 1 };
  const raw = (atMs - glide.startMs) / SCALE_GLIDE_MS;
  if (raw >= 1) { glide = null; return { from: scale, to: scale, t: 1 }; }
  const t = Math.max(0, raw);
  return { from: glide.from, to: glide.to, t: t * t * (3 - 2 * t) };
}

// Exact at either end, so a scale at rest is its own number to the last bit.
const logMix = (a: number, b: number, t: number) => (t >= 1 || a === b ? b : t <= 0 ? a : Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t));

/** Scene units an astronomical unit is drawn as now, gliding between scales. */
export function unitsPerAuNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  return logMix(UNITS_PER_AU[from], UNITS_PER_AU[to], t);
}

/**
 * A true distance in scene units, times this, is its drawn distance now: 1 at True, about 1 in 19.7 at Compact. Diagram
 * places nothing by distance, so a glide to or from it holds the other scale's (bodyPlacement blends the two layouts).
 */
export function skyScaleNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  const a = from === 'diagram' ? to : from;
  const b = to === 'diagram' ? from : to;
  // Diagram on both sides (a glide from Diagram to Diagram never starts): Compact's, never used.
  if (a === 'diagram' || b === 'diagram') return COMPACT_UNITS_PER_AU / GLOBE_UNITS_PER_AU;
  return logMix(UNITS_PER_AU[a], UNITS_PER_AU[b], t) / GLOBE_UNITS_PER_AU;
}

/** How far the camera has come down into Sky from a place: 1 in it, 0 out of it, between while gliding (D5). */
export function skyWeightNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  return (from === 'sky' ? 1 - t : 0) + (to === 'sky' ? t : 0);
}

/**
 * Leaves Sky from a place for the scale before it, as whoever chose Sky (the page's handle or the person): what is done
 * when something else moves the camera (globeCameraMath.setGlobePointOfView).
 */
export function leaveSky(): void {
  if (solarScale() !== 'sky') return;
  const back = beforeSky && beforeSky !== 'sky' ? beforeSky : 'compact';
  if (page === 'sky') setPageSolarScale(back);
  else setSolarScale(back);
}

/** How much of the drawing is Diagram's now: 1 at Diagram, 0 at the others, between while gliding to or from it. */
export function diagramWeightNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  return (from === 'diagram' ? 1 - t : 0) + (to === 'diagram' ? t : 0);
}

/** How far the camera may pull out now, and where the far plane stands. */
export function cameraReachNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  return logMix(REACH[from], REACH[to], t);
}
export function cameraFarNow(atMs = now()): number {
  const { from, to, t } = glideFraction(atMs);
  return logMix(REACH[from], REACH[to], t) + logMix(EXTENT[from], EXTENT[to], t);
}

/** Whether a glide is under way: a card waits for the scale to settle. */
export const scaleGliding = (atMs = now()): boolean => glideFraction(atMs).t < 1;

export function subscribeSolarScale(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useSolarScale = (): SolarScale => useSyncExternalStore(subscribeSolarScale, solarScale, solarScale);

/**
 * How much of the solar system the last render drew, 0 to 1 (SolarSystemManager.frame): the rail's Solar System kit,
 * the key and a card's caveat say the scale only then. Its listeners hear only when it comes into view or leaves.
 */
let shownNow = 0;
const shownListeners = new Set<() => void>();
export function noteSolarSystemShown(shown: number): void {
  const was = shownNow > 0;
  shownNow = shown;
  if (was !== shown > 0) shownListeners.forEach((listener) => listener());
}
export const solarSystemShownNow = (): number => shownNow;
const solarSystemIsShown = (): boolean => shownNow > 0;
export function subscribeSolarSystemShown(listener: () => void): () => void {
  shownListeners.add(listener);
  return () => { shownListeners.delete(listener); };
}
/** Whether any of the solar system is drawn now. */
export const useSolarSystemShown = (): boolean => useSyncExternalStore(subscribeSolarSystemShown, solarSystemIsShown, solarSystemIsShown);

/**
 * Whether a blank frame is the dark sky (OR9): far out at True 1:1 the Earth is under a pixel and the Sun may be out
 * of the frame, so nothing is drawn but the names over it, and nothing will be. At Compact the Sun is always in view.
 */
export const darkSkyPossible = (atMs = now()): boolean => solarScale() === 'true' && shownNow >= 1 && !scaleGliding(atMs);

/** The key's entry for the scale in force: on screen only, as a card's caveat line says it. */
export const SOLAR_SCALE_LEGEND_ID = 'SolarSystem';

/** The key's line for the scale in force (globeLegendStore's distanceMeans). */
export function scaleDistanceMeans(scale = solarScale()): string {
  if (scale === 'diagram') return 'not to scale: the rings evenly spaced, each size on a log of the body’s';
  if (scale === 'sky') return 'every direction and size true; the stars to magnitude 6, the IAU’s figures';
  return scale === 'true'
    ? 'every distance true, as every size is'
    : 'the Moon’s true; every other at about 1 in 19.7, sizes true';
}

/** Test-only: forget the scale read, any glide and what was shown. */
export function resetSolarScaleForTests(): void { chosen = null; page = null; glide = null; shownNow = 0; beforeSky = null; }
