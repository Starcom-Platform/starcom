/**
 * The Safety windows' layer (decision D-RR, RR1; Mecha Jono's kit 5.2): each window's city at city scale about its
 * point, filled by the window's weight at the cursor, no fill where the weight is 0; an armed window before it opens,
 * a thin outline and its state; a closed one only while the cursor stands inside it, in grey, as history; a drafted
 * one never. Its pill names the place and the state in words. Never a mark, a hero or person icon, a crowd, where
 * police or responders are, or alarm styling; in the missions' own rescue orange, the colour a mission has in every
 * mode (HW8). Never on a card or a clip: the layer is not in the share handle's contract.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { windowWeightAt } from '../../../services/psiWatch/windowProfile';
import type { ShownWindow } from '../../../services/rlsh/recurrence/useSafetyWindows';
import { localTime } from '../../../services/rlsh/recurrence/localTimes';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { ridesShell } from '../../../globe-engine/shellLift';
import { bakeHeroWatchPills, buildHeroWatchPills, disposeHeroWatchPills, type PillAtlas } from '../heroWatchSprites';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';

const GLOBE_RADIUS = 100;
const EARTH_KM = 6371;
/** A city about its point: the scale the kit draws a city-precision point at, never finer. */
export const CITY_RADIUS_KM = 25;
const RING_STEPS = 64;
const LIFT = 0.25;
/** How a probe finds the layer's shapes and its pills. */
export const SAFETY_WINDOWS_TYPE = 'safetyWindows';
export const SAFETY_WINDOWS_PILL_TYPE = 'safetyWindowsPills';

/** The ring of points a radius about a point on the globe, km. */
function ring(lat: number, lng: number, radiusKm: number): THREE.Vector3[] {
  const d = radiusKm / EARTH_KM;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < RING_STEPS; i++) {
    const θ = (2 * Math.PI * i) / RING_STEPS;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    out.push(latLngToGlobeWorld((φ2 * 180) / Math.PI, (λ2 * 180) / Math.PI, GLOBE_RADIUS + LIFT));
  }
  return out;
}

export interface SafetyShape {
  address: string;
  /** The fill's opacity: 0 for none. */
  fill: number;
  outline: boolean;
  history: boolean;
}

/** What each window draws at the cursor, unix seconds (kit 5.2); null for one drawn not at all. */
export function shapeOf(shown: ShownWindow, cursorS: number): SafetyShape | null {
  const { window: note, state } = shown;
  if (!note.point || state === 'drafted') return null;
  const inside = cursorS >= note.window.from && cursorS <= note.window.until;
  if (state === 'closed') return inside ? { address: note.address, fill: 0.18, outline: true, history: true } : null;
  if (state === 'armed') return { address: note.address, fill: 0, outline: true, history: false };
  const w = windowWeightAt(note.window, cursorS) ?? 0;
  return { address: note.address, fill: w > 0 ? 0.12 + 0.5 * w : 0, outline: true, history: false };
}

export function useGlobeSafetyWindows({ scene, active, windows, cursorS }: {
  scene: THREE.Scene | null;
  active: boolean;
  windows: readonly ShownWindow[];
  cursorS: number;
}): void {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const tl = m.psiWatch.timeline;
  const shapesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const pillsRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [shapesRef.current, pillsRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  const drawn = useMemo(() => (active ? windows.map((s) => ({ s, shape: shapeOf(s, cursorS) })).filter((d) => d.shape !== null) : []),
    [active, windows, cursorS]);

  // The places: a fill and an outline each, rebuilt as the cursor moves them.
  useEffect(() => {
    const group = shapesRef.current;
    const made: THREE.Object3D[] = [];
    for (const { s, shape } of drawn) {
      const { point } = s.window;
      if (!point || !shape) continue;
      const colour = shape.history ? GUNMETAL[300] : DATA_SCALES.missions;
      const edge = ring(point.lat, point.lng, CITY_RADIUS_KM);
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge),
        new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: shape.history ? 0.6 : 0.9, depthWrite: false }));
      outline.userData = { type: SAFETY_WINDOWS_TYPE, address: shape.address, part: 'outline' };
      made.push(outline);
      if (shape.fill > 0) {
        const centre = latLngToGlobeWorld(point.lat, point.lng, GLOBE_RADIUS + LIFT);
        const positions: number[] = [];
        for (let i = 0; i < edge.length; i++) {
          const a = edge[i];
          const b = edge[(i + 1) % edge.length];
          positions.push(centre.x, centre.y, centre.z, a.x, a.y, a.z, b.x, b.y, b.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          color: colour, transparent: true, opacity: shape.fill, depthWrite: false, side: THREE.DoubleSide,
        }));
        mesh.userData = { type: SAFETY_WINDOWS_TYPE, address: shape.address, part: 'fill', opacity: shape.fill };
        made.push(mesh);
      }
    }
    if (made.length) group.add(...made);
    return () => {
      for (const object of made) {
        group.remove(object);
        const o = object as THREE.Mesh | THREE.LineLoop;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    };
  }, [drawn]);

  // The pills: the place and the state in words.
  const entries = useMemo(() => drawn.flatMap(({ s }) => {
    const note = s.window;
    if (!note.point) return [];
    const state = s.state === 'armed'
      ? fill(w.armedOpens, { time: localTime(lang, note.window.from, note.tzid).text })
      : tl.windowStates[s.state];
    return [{ position: latLngToGlobeWorld(note.point.lat, note.point.lng, GLOBE_RADIUS + LIFT), label: `${note.place ?? note.title} · ${state}` }];
  }), [drawn, lang, tl, w]);
  const key = useMemo(() => [...new Set(entries.map((e) => e.label))].sort().join('\n'), [entries]);
  const [pills, setPills] = useState<{ key: string; atlas: PillAtlas | null } | null>(null);
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    let baked: PillAtlas | null = null;
    void bakeHeroWatchPills(key.split('\n'), 2, DATA_SCALES.missions).then((atlas) => {
      baked = atlas;
      if (live) setPills({ key, atlas });
      else atlas?.texture.dispose();
    });
    return () => { live = false; baked?.texture.dispose(); };
  }, [key]);
  useEffect(() => {
    const group = pillsRef.current;
    const mesh = pills?.key === key ? buildHeroWatchPills(entries, pills.atlas, SAFETY_WINDOWS_PILL_TYPE) : null;
    if (!mesh) return undefined;
    group.add(mesh);
    return () => { group.remove(mesh); disposeHeroWatchPills(mesh); };
  }, [pills, key, entries]);

  useEffect(() => {
    if (!drawn.length) return undefined;
    publishLegend('SafetyWindows', {
      layerId: 'SafetyWindows',
      layer: 'Safety windows',
      shapeMeans: "a city's place, filled as its window's weight rises and falls at the cursor; outlined only, while armed; grey, as history",
      badgeMeans: 'its pill: the place, and the window\'s state',
      swatches: [
        { color: DATA_SCALES.missions, label: 'a window, in the missions\' rescue orange', shape: 'line' },
        { color: GUNMETAL[300], label: 'a closed window, the cursor inside it', shape: 'line' },
      ],
    });
    return () => publishLegend('SafetyWindows', null);
  }, [drawn]);
}
