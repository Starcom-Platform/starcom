/**
 * useSpheres3D — Spheres, drawn as the domains of influence they are: the states a
 * language or a community of states reaches (areaRegistry.ts, kind "sphere";
 * the canon's Sphere, "a domain of influence", FusionGirl wiki).
 *
 * ─── WHAT IT DRAWS ─────────────────────────────────────────────────────────
 *
 * Each Sphere's outline, the one the areas are baked with (areas-lod0), filled
 * faintly in its own colour (sphereTheme.ts) and edged. Spheres overlap — Canada is
 * in the Anglosphere and the Francophonie — so the fills are faint enough that a
 * country under three still reads, and the colours of Spheres that share or border
 * countries stand apart.
 *
 * ─── WHAT IT DOES UNDER THE POINTER ────────────────────────────────────────
 *
 * Every Sphere under the pointer lights up and is named, the most specific (fewest
 * members) first; a click opens that one in the panel (GlobeSpherePanel), which
 * offers the others there. A Zone's Sector is nearer than a Sphere and a report's
 * glyph nearer still (globeClick.ts, CLAIM_RANK): over either, the Spheres neither
 * light nor take the click. A Sphere is nearer than the country beneath it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../geometry/geometryFactory';
import { buildBorderLineBatches } from '../geometry/fatBorderLines';
import type { LineLook } from '../geometry/lineBatches';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import {
  createTerritoryFillMaterial,
  isTerritoryFillMaterial,
  setTerritoryMaterialHoverSelectDim,
  setTerritoryMaterialSunDirection,
} from '../theme/territoryFillMaterial';
import { TERRITORY_FILLS_ORDER } from '../theme/applyTerritoryLook';
import { LIGHT_UP_TAU_S } from '../theme/zoneTheme';
import { SPHERE_FILL_OPACITY, coloredSpheres, sphereColor, sphereCss } from '../theme/sphereTheme';
import { useSimpleGeoOverlayLayer, prefersReducedMotion } from './useSimpleGeoOverlayLayer';
import { CLAIM_RANK, claimGlobeClicks, isGlobeClick, nearerLayerTakes, pressOn, type PointerAt } from '../../components/Globe/globeClick';
import { CLOUDS, SURFACE_LINES } from '../../components/Globe/globeAltitudes';
import { shellLift } from '../../globe-engine/shellLift';
import { publishLegend, type LayerLegend } from '../../services/globe/globeLegendStore';
import { loadAreaShapes, type AreaShapes } from '../../features/globe/areas/areaShapes';
import { areaByCode, AREAS } from '../../features/globe/areas/areaRegistry';
import { getSpheresState, selectSphere, setSphereHover } from '../../features/globe/spheres/spheresStore';
import { messagesNow } from '../../i18n/app/i18n';

const GLOBE_RADIUS_UNITS = 100;
/** Where the Zones' fills stand: over the clouds, under the surface lines. */
const FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
const LINE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
const SPHERE_FILLS_ORDER = TERRITORY_FILLS_ORDER + 1;
const PICK_INTERVAL_MS = 50;
/** Under the Zones' lines (111, 112), over the borders (100 and a priority). */
const SPHERE_EDGE_LOOK: LineLook = { opacity: 0.85, linewidth: 1.5, dashed: false, dashSize: 0, gapSize: 0, dashScale: 1, renderOrder: 108 };

export const SPHERES_LAYER_ID = 'geopolitical-spheres';
export const SPHERES_LEGEND_ID = 'Spheres';

type LngLat = [number, number];

const polygonsOf = (geometry: PolygonGeometry): LngLat[][][] =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as LngLat[][][];

/** Every Sphere the areas define, in the theme's order (any it does not colour after). */
export function sphereCodes(): string[] {
  const all = AREAS.filter((a) => a.kind === 'sphere').map((a) => a.code);
  const known = coloredSpheres().filter((c) => all.includes(c));
  return [...known, ...all.filter((c) => !known.includes(c))];
}

/** How many states a Sphere holds: the fewer, the more specific a click on it is. */
const membersOf = (code: string): number => {
  const def = areaByCode(code);
  return def && def.from === 'members' ? def.members.length + (def.alsoNamed?.length ?? 0) : Number.MAX_SAFE_INTEGER;
};

/** Every Sphere's fill and edge, as direct children of one group; each fill carries `userData.sphereCode`. */
export function buildSphereGroup(shapes: AreaShapes): THREE.Group {
  const group = new THREE.Group();
  for (const code of sphereCodes()) {
    const shape = shapes.get(code);
    if (!shape) continue;
    const color = sphereColor(code);
    const features: PolygonFeature[] = polygonsOf(shape.geometry)
      .flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `sphere-fill:${code}#${i}`, rings }] : []));
    const built = GeometryFactory.buildTerritoryPolygons(features, { color, opacity: SPHERE_FILL_OPACITY, elevation: FILL_ELEVATION });
    for (const part of built.children) {
      const geometry = (part as THREE.Mesh).geometry;
      if (!geometry) continue;
      // A mesh of our own over the factory's cached geometry, so this Sphere can light alone.
      const mesh = new THREE.Mesh(geometry, createTerritoryFillMaterial({ baseColorHex: color, opacity: SPHERE_FILL_OPACITY }));
      mesh.name = `sphere:${code}`;
      mesh.userData.sphereCode = code;
      mesh.renderOrder = SPHERE_FILLS_ORDER;
      group.add(mesh);
    }
    const edges: LineFeature[] = polygonsOf(shape.geometry).flatMap((rings, i) => rings
      .filter((ring) => ring.length >= 4)
      .map((ring, r) => ({ id: `sphere-edge:${code}#${i}/${r}`, coordinates: ring })));
    const lines = buildBorderLineBatches(edges, () => ({ color: new THREE.Color(color).offsetHSL(0, 0, 0.12).getHex(), look: SPHERE_EDGE_LOOK }),
      { elevation: LINE_ELEVATION });
    if (lines.children.length > 0) group.add(...lines.children);
  }
  return group;
}

/** The key: each Sphere drawn, in its colour. */
export function spheresLegend(shapes: AreaShapes): LayerLegend {
  return {
    layerId: SPHERES_LEGEND_ID,
    layer: 'Spheres',
    colorMeans: 'the Sphere: the states a language or a community of states reaches; they overlap',
    swatches: sphereCodes().filter((c) => shapes.has(c)).map((c) => ({ color: sphereCss(c), label: areaByCode(c)?.name ?? c, shape: 'area' })),
  };
}

/**
 * Every Sphere a ray meets on the near side of the Earth, the most specific first.
 * A fill found through the Earth, on the far side, is not under the pointer.
 */
export function spheresUnderRay(ray: THREE.Raycaster, fills: THREE.Object3D[], earthRadius: number): string[] {
  const front = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), earthRadius), new THREE.Vector3());
  const limit = front ? front.distanceTo(ray.ray.origin) + 1 : Number.POSITIVE_INFINITY;
  const codes: string[] = [];
  for (const hit of ray.intersectObjects(fills, false)) {
    const code = hit.object.userData.sphereCode;
    if (hit.distance > limit || typeof code !== 'string' || codes.includes(code)) continue;
    codes.push(code);
  }
  return codes.sort((a, b) => membersOf(a) - membersOf(b) || a.localeCompare(b));
}

export interface UseSpheres3DParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  getCanvas: () => HTMLCanvasElement | null;
  solarDirection?: THREE.Vector3 | null;
}

export function useSpheres3D({ enabled, scene, camera, getCanvas, solarDirection }: UseSpheres3DParams) {
  const [shapes, setShapes] = useState<AreaShapes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || shapes) return;
    let alive = true;
    void loadAreaShapes().then((loaded) => {
      if (!alive) return;
      if (loaded) { setShapes(loaded); setLoadError(null); } else setLoadError(messagesNow().spheres.error);
    });
    return () => { alive = false; };
  }, [enabled, shapes]);

  const buildContent = useCallback(async () => (shapes ? buildSphereGroup(shapes) : new THREE.Group()), [shapes]);
  const { loading, error, groupRef } = useSimpleGeoOverlayLayer({
    enabled: enabled && shapes !== null,
    scene,
    layerId: SPHERES_LAYER_ID,
    layerOrder: 94,
    buildContent,
  });

  useEffect(() => {
    if (!enabled || !shapes) return;
    publishLegend(SPHERES_LEGEND_ID, spheresLegend(shapes));
    return () => publishLegend(SPHERES_LEGEND_ID, null);
  }, [enabled, shapes]);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const getCanvasRef = useRef(getCanvas);
  getCanvasRef.current = getCanvas;
  const sunRef = useRef<THREE.Vector3 | null>(solarDirection ?? null);
  const sunVersionRef = useRef(0);
  useEffect(() => {
    sunRef.current = solarDirection ?? null;
    sunVersionRef.current += 1;
  }, [solarDirection]);

  useEffect(() => {
    if (!enabled || !scene) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointer: PointerAt | null = null;
    let hovered: string[] = [];
    let pressed: PointerAt | null = null;

    const stopClaiming = claimGlobeClicks(() => ({ mark: false, area: hovered.length > 0 }), CLAIM_RANK.spheres);
    const fills = (): THREE.Mesh[] => (groupRef.current?.children ?? []).filter((c): c is THREE.Mesh => typeof c.userData.sphereCode === 'string');

    const pick = (at: PointerAt): string[] => {
      const canvas = getCanvasRef.current();
      const cam = cameraRef.current;
      const group = groupRef.current;
      if (!canvas || !cam || !group?.parent) return [];
      const rect = canvas.getBoundingClientRect();
      if (at.x < rect.left || at.x > rect.right || at.y < rect.top || at.y > rect.bottom) return [];
      ndc.set(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      return spheresUnderRay(ray, fills(), GLOBE_RADIUS_UNITS * shellLift());
    };

    // Over the globe itself only: a panel drawn over a Sphere does not light it.
    const onMove = (e: PointerEvent) => { pointer = e.target === getCanvasRef.current() ? { x: e.clientX, y: e.clientY } : null; };
    const onLeave = () => { pointer = null; };
    const onDown = (e: PointerEvent) => { pressed = pressOn(e, getCanvasRef.current(), 'area', CLAIM_RANK.spheres); };
    const onUp = (e: PointerEvent) => {
      const press = pressed;
      pressed = null;
      const canvas = getCanvasRef.current();
      if (!canvas || e.target !== canvas || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      if (nearerLayerTakes('area', CLAIM_RANK.spheres)) return;
      const codes = pick({ x: e.clientX, y: e.clientY });
      if (codes.length) selectSphere(codes[0], codes);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && getSpheresState().selected) selectSphere(null); };

    let frame = 0;
    let last = performance.now();
    let lastPick = 0;
    const reducedMotion = prefersReducedMotion();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - lastPick >= PICK_INTERVAL_MS) {
        lastPick = now;
        hovered = pointer && !nearerLayerTakes('area', CLAIM_RANK.spheres) ? pick(pointer) : [];
        setSphereHover(hovered.length && pointer ? { codes: hovered, x: pointer.x, y: pointer.y } : null);
      }
      const { selected } = getSpheresState();
      const alpha = reducedMotion ? 1 : Math.min(1, dt / LIGHT_UP_TAU_S);
      for (const mesh of fills()) {
        const material = mesh.material as THREE.Material;
        if (!isTerritoryFillMaterial(material)) continue;
        const code = mesh.userData.sphereCode as string;
        const t = (mesh.userData.sphereT ??= { hover: 0, select: 0, dim: 0 }) as { hover: number; select: number; dim: number };
        t.hover += ((hovered.includes(code) ? 1 : 0) - t.hover) * alpha;
        t.select += ((selected === code ? 1 : 0) - t.select) * alpha;
        t.dim += ((selected !== null && selected !== code ? 1 : 0) - t.dim) * alpha;
        setTerritoryMaterialHoverSelectDim(material, t.hover, t.select, t.dim);
        if (mesh.userData.sphereSun !== sunVersionRef.current && sunRef.current) {
          setTerritoryMaterialSunDirection(material, sunRef.current);
          mesh.userData.sphereSun = sunVersionRef.current;
        }
      }
    };
    frame = requestAnimationFrame(loop);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('blur', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      stopClaiming();
      setSphereHover(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, scene, groupRef]);

  return { loading, error: loadError ?? error, shapes };
}
