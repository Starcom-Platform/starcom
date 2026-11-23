/**
 * Earth's magnetic shield on the globe (decision D-PW, PW7, PW58), from IGRF-14 at the cursor's year: the field's
 * strength every 5,000 nT, faint; the South Atlantic Anomaly, the field under 30,000 nT, in Psi Watch's ground violet,
 * dashed, the levels inside it solid; the dip equator in its aqua; both dip poles' tracks from 1900 to 2030 with a
 * tick each decade, and a bright dot where each stands at the cursor. The grid's lines are found once a year (the
 * field moves slowly); the poles move with the cursor. The aurora stays Space Weather's. Shared with the panel through
 * useShield.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { splitGroup, type SplitSide } from '../../../globe-engine/splitView';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { fill, numbered, useMessages } from '../../../i18n/app/i18n';
import { ANOMALY_NT, type PoleTrack } from '../../../services/psiWatch/shield/shield';
import { useShield, type ShieldAtCursor } from '../../../services/psiWatch/shield/useShield';
import type { Segment } from '../../../services/psiWatch/shield/isolines';
import { toScene } from './useGlobePsiLines';

/** How this layer's group is found by a probe or a test. */
export const MAGNETIC_SHIELD_TYPE = 'magneticShield';

const hex = (color: string) => parseInt(color.slice(1), 16);
const STRENGTH = GUNMETAL[300];
const ANOMALY = DATA_SCALES.psiGround;
const EQUATOR = DATA_SCALES.psiWatch;
const TRACK = GUNMETAL[200];
const POLE = GUNMETAL[100];
/** Under the tracks and round the dots: they stay legible over ice and cloud as well as over the sea. */
const CASING = GUNMETAL[950];
const LOOK = (opacity: number, linewidth: number, dashed: boolean, renderOrder: number): LineLook => ({
  opacity, linewidth, dashed, dashSize: 0.8, gapSize: 0.8, dashScale: 1, renderOrder,
});
export const SHIELD_LOOKS = {
  strength: LOOK(0.6, 1.2, false, 110),
  anomaly: LOOK(1, 2.5, true, 112),
  /** The field's levels inside the anomaly, solid in its violet: where it deepens. */
  anomalyCore: LOOK(0.85, 1.5, false, 111),
  equator: LOOK(0.95, 2, false, 112),
  casing: LOOK(0.7, 3.4, false, 112),
  track: LOOK(0.9, 1.4, false, 113),
  pole: LOOK(1, 2, false, 115),
};
/** A pole's dot, degrees of arc in radius; a decade tick, degrees long. */
const POLE_DOT_DEG = 0.9;
const TICK_DEG = 0.8;

/** A place to a tenth of a degree, as the panel and the tooltips say it. */
export const shieldPlace = (lat: number, lon: number): string =>
  `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`;
const positionsOf = (points: Array<[number, number]>) => {
  const out: number[] = [];
  for (const [lat, lon] of points) { const v = toScene(lat, lon); out.push(v.x, v.y, v.z); }
  return out;
};
const segmentPositions = (s: Segment) => positionsOf([s[0], s[1]]);

/** A ring about a place, as a path on the lines' shell: 33 points, the first repeated last. */
function ringAt(lat: number, lon: number, deg: number): number[] {
  const points: Array<[number, number]> = [];
  const stretch = 1 / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    points.push([Math.max(-89.9, Math.min(89.9, lat + deg * Math.sin(a))), lon + deg * stretch * Math.cos(a)]);
  }
  return positionsOf(points);
}

/** A filled dot on the lines' shell: a fan from its middle to its ring, drawn as the lines are (PW58's bright dot). */
function dotAt(lat: number, lon: number, deg: number, color: string): THREE.Mesh {
  const ring = ringAt(lat, lon, deg);
  const middle = toScene(lat, lon);
  const positions: number[] = [];
  for (let i = 0; i + 5 < ring.length; i += 3) positions.push(middle.x, middle.y, middle.z, ring[i], ring[i + 1], ring[i + 2], ring[i + 3], ring[i + 4], ring[i + 5]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const dot = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  // Under its edge.
  dot.renderOrder = SHIELD_LOOKS.pole.renderOrder - 1;
  return dot;
}

/** A track as paths, split where it crosses the antimeridian, and a short tick across it each decade. */
function trackPaths(track: PoleTrack): { paths: number[][]; ticks: Array<{ year: number; positions: number[] }> } {
  const paths: number[][] = [];
  let run: Array<[number, number]> = [];
  track.forEach(([, lat, lon], i) => {
    if (i && Math.abs(lon - track[i - 1][2]) > 180) { paths.push(positionsOf(run)); run = []; }
    run.push([lat, lon]);
  });
  if (run.length > 1) paths.push(positionsOf(run));
  const ticks = track.filter(([year], i) => year % 10 === 0 && i > 0 && i < track.length - 1).map(([year, lat, lon]) => {
    const i = track.findIndex(([y]) => y === year);
    const [, la0, lo0] = track[i - 1];
    const [, la1, lo1] = track[i + 1];
    const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    // Across the track: its direction turned a quarter.
    const dLat = la1 - la0;
    const dLon = ((((lo1 - lo0 + 540) % 360) - 180) * cos);
    const length = Math.hypot(dLat, dLon) || 1;
    const nLat = (-dLon / length) * TICK_DEG;
    const nLon = ((dLat / length) * TICK_DEG) / cos;
    return { year, positions: positionsOf([[lat - nLat, lon - nLon], [lat + nLat, lon + nLon]]) };
  });
  return { paths, ticks };
}

function clear(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  object.clear();
}

export interface UseGlobeMagneticShieldOptions {
  scene: THREE.Scene | null;
  active: boolean;
  /** The shared cursor, ms. */
  cursorMs: number;
  /** Side by side (PW73): the half this copy draws in; absent or null, the whole globe. */
  split?: SplitSide | null;
}

/** The year as the legend and a card print it: forecast past IGRF-14's last epoch. */
export const shieldWhen = (at: ShieldAtCursor, words: { whenForecast: string }): string =>
  (at.forecast ? fill(words.whenForecast, { year: at.wholeYear }) : `${at.wholeYear}`);

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the shield: false while it is on and IGRF-14 has not been drawn. */
export function shieldReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export function useGlobeMagneticShield({ scene, active, cursorMs, split }: UseGlobeMagneticShieldOptions): ShieldAtCursor | null {
  const { m } = useMessages();
  const words = m.psiWatch.shield;
  const { at, failed } = useShield(active, cursorMs);
  // The cursor's copy answers for the layer; a failed read is ready, with nothing to wait for.
  const waiting = active && !at && !failed && split !== 'now';
  useEffect(() => {
    if (split === 'now') return undefined;
    readiness = waiting ? { ready: false, why: 'IGRF-14 was still loading for the magnetic shield' } : { ready: true };
    return () => { readiness = { ready: true }; };
  }, [waiting, split]);
  const shield = at?.shield ?? null;
  const wholeYear = at?.wholeYear ?? null;
  const poles = at?.poles ?? null;

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: MAGNETIC_SHIELD_TYPE };
    return group;
  })());
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  // Side by side (PW73): drawn in its half while the globe is split.
  useEffect(() => splitGroup(groupRef.current, split ?? null), [split]);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  // The field's lines, once a year: it changes by a few nanotesla a year, under a pixel's worth.
  useEffect(() => {
    const group = groupRef.current;
    if (!shield || wholeYear === null) return undefined;
    const nt = (n: number) => numbered(n);
    const field = buildLineBatches([
      ...shield.strength.flatMap(({ level, segments }) => segments.map((s, i) => ({
        id: `shield:strength:${level}:${i}`, positions: segmentPositions(s),
        ...(level < ANOMALY_NT ? { color: hex(ANOMALY), look: SHIELD_LOOKS.anomalyCore } : { color: hex(STRENGTH), look: SHIELD_LOOKS.strength }),
        tooltip: fill(words.strength, { nt: nt(level), year: wholeYear }),
      }))),
      ...shield.anomaly.map((s, i) => ({
        id: `shield:anomaly:${i}`, positions: segmentPositions(s), color: hex(ANOMALY), look: SHIELD_LOOKS.anomaly,
        tooltip: fill(words.anomaly, {
          year: wholeYear, nt: nt(ANOMALY_NT), weakest: nt(shield.weakest.total), place: shieldPlace(shield.weakest.lat, shield.weakest.lon),
        }),
      })),
      ...shield.dipEquator.map((s, i) => ({
        id: `shield:equator:${i}`, positions: segmentPositions(s), color: hex(EQUATOR), look: SHIELD_LOOKS.equator,
        tooltip: fill(words.equator, { year: wholeYear }),
      })),
      ...(['north', 'south'] as const).flatMap((which) => {
        const { paths, ticks } = trackPaths(shield.tracks[which]);
        const cased = [...paths, ...ticks.map((tick) => tick.positions)];
        return [
          ...cased.map((positions, i) => ({ id: `shield:casing:${which}:${i}`, positions, color: hex(CASING), look: SHIELD_LOOKS.casing })),
          ...paths.map((positions, i) => ({
            id: `shield:track:${which}:${i}`, positions, color: hex(TRACK), look: SHIELD_LOOKS.track, tooltip: words.track[which],
          })),
          ...ticks.map(({ year: tick, positions }) => ({
            id: `shield:tick:${which}:${tick}`, positions, color: hex(TRACK), look: SHIELD_LOOKS.track, tooltip: fill(words.tick[which], { year: tick }),
          })),
        ];
      }),
    ]);
    group.add(field);
    return () => { group.remove(field); clear(field); };
  }, [shield, wholeYear, words]);

  // The poles with the cursor, between their yearly points.
  useEffect(() => {
    const group = groupRef.current;
    if (!poles || !at) return undefined;
    // Each a bright dot, its dark edge drawn as a line so it reads crisp on ice or sea and answers a hover.
    const dots = buildLineBatches((['north', 'south'] as const).map((which) => ({
      id: `shield:pole:${which}`, positions: ringAt(poles[which].lat, poles[which].lon, POLE_DOT_DEG), color: hex(CASING), look: SHIELD_LOOKS.pole,
      tooltip: fill(words.pole[which], { year: Math.floor(at.year), place: shieldPlace(poles[which].lat, poles[which].lon) }),
    })));
    dots.add(dotAt(poles.north.lat, poles.north.lon, POLE_DOT_DEG, POLE), dotAt(poles.south.lat, poles.south.lon, POLE_DOT_DEG, POLE));
    group.add(dots);
    return () => { group.remove(dots); clear(dots); };
    // at.year stands for at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poles, at?.year, words]);

  useEffect(() => {
    // Side by side: the cursor's half keys the legend, as the card draws it.
    if (!at || split === 'now') return undefined;
    publishLegend('MagneticShield', {
      layerId: 'MagneticShield',
      layer: words.legendLayer,
      when: shieldWhen(at, words),
      shapeMeans: words.legendMeans,
      swatches: [
        { color: STRENGTH, label: words.swatchStrength, shape: 'line' },
        { color: ANOMALY, label: words.swatchAnomaly, shape: 'dashed' },
        { color: EQUATOR, label: words.swatchEquator, shape: 'line' },
        { color: TRACK, label: words.swatchTracks, shape: 'line' },
        { color: POLE, label: words.swatchPole },
      ],
    });
    return () => publishLegend('MagneticShield', null);
    // The legend changes with the year drawn, not the cursor's every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at?.wholeYear, at?.forecast, words, split]);

  return at;
}
