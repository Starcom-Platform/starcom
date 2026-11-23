/**
 * An Echo's events on the globe (decision D-PW, PW47, PW54, PW66, PW69): every past return's gathering of the events
 * lane's set at once, each return a shade older, or the one isolated alone, in the ground's violet. Three looks, the
 * Echoes card's choice: each event a dot; a heat of them all, a shell of colour over the land; or each Zone filled by
 * how many fell in it, its count in the hover. Drawn only while an Echo is shown in Psi Watch.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { latLonToVector3 } from '../../../geopolitical/utils/latLonToVector3';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { counted, useMessages } from '../../../i18n/app/i18n';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import { useEcho, useEchoLook } from '../../../services/psiWatch/timestream/echoes';
import { useEventSetChoice } from '../../../services/psiWatch/timestream/eventSetChoice';
import { echoPoints, heatGrid, HEAT_COLS, HEAT_ROWS, HEAT_STEP, zoneCounts } from '../../../services/psiWatch/echoPlaces';
import { useEventSet } from '../../PsiWatch/Timestream/useEventSet';
import { toScene } from './useGlobePsiLines';
import { PSI_ELEVATION, psiZoneFills } from './psiZoneFills';

/** How this layer's group is found by a probe or a test. */
export const PSI_ECHOES_TYPE = 'psiEchoes';
const GLOBE_RADIUS_UNITS = 100;
const GROUND = new THREE.Color(DATA_SCALES.psiGround);
const PALE = new THREE.Color(GUNMETAL[100]);
/** A dot's size on screen, px. */
const DOT_PX = 5;
/** Over the countries' own fills, as the Psi Zones' fills stand (psiZoneFills.ts). */
const ECHO_ELEVATION = PSI_ELEVATION;
/** A Zone's fill at its fullest, and at its emptiest drawn. */
const ZONE_MOST = 0.6;
const ZONE_LEAST = 0.12;

const onShell = (lat: number, lon: number) => {
  const v = latLonToVector3(lat, lon, { radius: GLOBE_RADIUS_UNITS, elevation: ECHO_ELEVATION, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z);
};

/** The heat as a shell of the grid's own vertices, violet rising to pale, nothing where nothing fell. */
export function heatMesh(grid: Float32Array): THREE.Mesh {
  const positions = new Float32Array(HEAT_ROWS * HEAT_COLS * 3);
  const colours = new Float32Array(HEAT_ROWS * HEAT_COLS * 4);
  const c = new THREE.Color();
  for (let row = 0; row < HEAT_ROWS; row++) {
    for (let col = 0; col < HEAT_COLS; col++) {
      const i = row * HEAT_COLS + col;
      const p = onShell(row * HEAT_STEP - 90, col * HEAT_STEP - 180);
      positions.set([p.x, p.y, p.z], i * 3);
      const v = grid[i];
      // Violet, paling only in the warmest places.
      c.copy(GROUND).lerp(PALE, Math.max(0, v - 0.8) / 0.2 * 0.8);
      colours.set([c.r, c.g, c.b, Math.min(0.85, Math.sqrt(v) * 0.9)], i * 4);
    }
  }
  const index: number[] = [];
  for (let row = 0; row < HEAT_ROWS - 1; row++) {
    for (let col = 0; col < HEAT_COLS - 1; col++) {
      const a = row * HEAT_COLS + col;
      index.push(a, a + 1, a + HEAT_COLS, a + 1, a + HEAT_COLS + 1, a + HEAT_COLS);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  mesh.renderOrder = 115;
  mesh.userData = { type: 'psiEchoHeat' };
  return mesh;
}

/** A round dot's mask, drawn once; none where there is no canvas (a test). */
let dotTexture: THREE.Texture | null | undefined;
function roundDot(): THREE.Texture | null {
  if (dotTexture !== undefined) return dotTexture;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return (dotTexture = null);
  canvas.width = 32;
  canvas.height = 32;
  ctx.fillStyle = GUNMETAL[100];
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}

function clear(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // Zone fills share their geometry with GeometryFactory's cache; their materials are this layer's own copies.
    if (!(mesh.isMesh && mesh.userData.psiEchoZone)) mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  group.clear();
}

export interface UseGlobePsiEchoesOptions {
  scene: THREE.Scene | null;
  /** Psi Watch is the mode shown. */
  active: boolean;
}

export function useGlobePsiEchoes({ scene, active }: UseGlobePsiEchoesOptions): void {
  const { m } = useMessages();
  const words = m.psiWatch.places;
  const echo = useEcho();
  const look = useEchoLook();
  const setId = useEventSetChoice();
  const shown = active && echo !== null && echo.returns !== null;
  const set = useEventSet(setId, shown);
  const [shapes, setShapes] = useState<AreaShapes | undefined>(undefined);
  useEffect(() => {
    if (!shown || look !== 'zones' || shapes) return undefined;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setShapes(loaded); });
    return () => { live = false; };
  }, [shown, look, shapes]);

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_ECHOES_TYPE };
    return group;
  })());
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  const points = useMemo(() => (shown && set && echo ? echoPoints(echo, set) : []), [shown, set, echo]);
  const zones = useMemo(() => (shown && set && echo && look === 'zones' ? zoneCounts(echo, set) : null), [shown, set, echo, look]);

  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!shown || !points.length) return undefined;
    if (look === 'dots') {
      const positions = new Float32Array(points.length * 3);
      const colours = new Float32Array(points.length * 4);
      points.forEach((p, i) => {
        const v = toScene(p.lat, p.lon);
        positions.set([v.x, v.y, v.z], i * 3);
        colours.set([GROUND.r, GROUND.g, GROUND.b, p.newness], i * 4);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
      const mask = roundDot();
      const dots = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: DOT_PX, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false,
        ...(mask ? { alphaMap: mask, alphaTest: 0.05 } : {}),
      }));
      dots.renderOrder = 123;
      dots.userData = { type: 'psiEchoDots' };
      group.add(dots);
    } else if (look === 'heat') {
      group.add(heatMesh(heatGrid(points)));
    } else if (zones && shapes) {
      group.add(psiZoneFills(shapes, [...zones.counts].map(([code, count]) => ({
        code,
        opacity: ZONE_LEAST + (ZONE_MOST - ZONE_LEAST) * (count / Math.max(1, zones.most)),
        tooltip: counted(words.echoZone, count, { place: shapes.get(code)?.name ?? code }),
      })), 'psiEchoZone'));
    }
    return () => { clear(group); };
  }, [shown, points, look, zones, shapes, words]);

  useEffect(() => {
    if (!shown) return undefined;
    publishLegend('PsiEchoes', {
      layerId: 'PsiEchoes', layer: words.legendEchoes, shapeMeans: words.legendEchoesMeans,
      swatches: [{ color: DATA_SCALES.psiGround, label: words.swatchEcho, shape: look === 'zones' ? 'area' : look === 'heat' ? 'area' : 'point' }],
    });
    return () => publishLegend('PsiEchoes', null);
  }, [shown, look, words]);
}
