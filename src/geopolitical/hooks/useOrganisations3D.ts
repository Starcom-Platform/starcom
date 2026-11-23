/**
 * useOrganisations3D — one body's members, drawn (decision D-ZR, ZR10; the owner, 2026-10-18: "one at a time").
 *
 * The body shown (organisationsStore.ts) is filled over its members' outline, the one the areas are baked with
 * (areas-lod0), and edged, as a membership map draws one: the EU's member states, or ASEAN's. Bodies that share
 * most of their members would bury each other drawn together.
 *
 * Under the pointer, its fill names it; a click opens its panel (GlobeOrganisationPanel). A report's glyph and a
 * Zone's Sector are nearer (globeClick.ts, CLAIM_RANK); over either it neither lights nor takes the click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../geometry/geometryFactory';
import { buildBorderLineBatches } from '../geometry/fatBorderLines';
import type { LineLook } from '../geometry/lineBatches';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import {
  createTerritoryFillMaterial, isTerritoryFillMaterial, setTerritoryMaterialHoverSelectDim, setTerritoryMaterialSunDirection,
} from '../theme/territoryFillMaterial';
import { TERRITORY_FILLS_ORDER } from '../theme/applyTerritoryLook';
import { LIGHT_UP_TAU_S, swatchCss } from '../theme/zoneTheme';
import { useSimpleGeoOverlayLayer, prefersReducedMotion } from './useSimpleGeoOverlayLayer';
import { CLAIM_RANK, claimGlobeClicks, isGlobeClick, nearerLayerTakes, pressOn, type PointerAt } from '../../components/Globe/globeClick';
import { CLOUDS, SURFACE_LINES } from '../../components/Globe/globeAltitudes';
import { shellLift } from '../../globe-engine/shellLift';
import { publishLegend, type LayerLegend } from '../../services/globe/globeLegendStore';
import { loadAreaShapes, type AreaShapes } from '../../features/globe/areas/areaShapes';
import { areaByCode } from '../../features/globe/areas/areaRegistry';
import {
  getOrganisationsState, openOrganisationPanel, setOrganisationHover,
} from '../../features/globe/organisations/organisationsStore';
import { messagesNow } from '../../i18n/app/i18n';

const GLOBE_RADIUS_UNITS = 100;
const FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
const LINE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
const PICK_INTERVAL_MS = 50;

/** One body at a time: a brass gold, clear of the app's cyan, of Hero Watch's orange and of conflict's reds. */
export const ORGANISATION_COLOR = 0xe0b54a;
/** Stronger than a Sphere's, since nothing else is filled beside it. */
export const ORGANISATION_FILL_OPACITY = 0.26;
const EDGE_LOOK: LineLook = { opacity: 0.9, linewidth: 1.8, dashed: false, dashSize: 0, gapSize: 0, dashScale: 1, renderOrder: 108 };

export const ORGANISATIONS_LAYER_ID = 'geopolitical-organisations';
export const ORGANISATIONS_LEGEND_ID = 'Organisations';

type LngLat = [number, number];
const polygonsOf = (geometry: PolygonGeometry): LngLat[][][] =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as LngLat[][][];

/** The body's fill and edge, as direct children of one group; each fill carries `userData.organisationCode`. */
export function buildOrganisationGroup(shapes: AreaShapes, code: string): THREE.Group {
  const group = new THREE.Group();
  const shape = shapes.get(code);
  if (!shape) return group;
  const features: PolygonFeature[] = polygonsOf(shape.geometry)
    .flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `organisation-fill:${code}#${i}`, rings }] : []));
  const built = GeometryFactory.buildTerritoryPolygons(features, { color: ORGANISATION_COLOR, opacity: ORGANISATION_FILL_OPACITY, elevation: FILL_ELEVATION });
  for (const part of built.children) {
    const geometry = (part as THREE.Mesh).geometry;
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, createTerritoryFillMaterial({ baseColorHex: ORGANISATION_COLOR, opacity: ORGANISATION_FILL_OPACITY }));
    mesh.name = `organisation:${code}`;
    mesh.userData.organisationCode = code;
    mesh.renderOrder = TERRITORY_FILLS_ORDER + 1;
    group.add(mesh);
  }
  const edges: LineFeature[] = polygonsOf(shape.geometry).flatMap((rings, i) => rings
    .filter((ring) => ring.length >= 4)
    .map((ring, r) => ({ id: `organisation-edge:${code}#${i}/${r}`, coordinates: ring })));
  const lines = buildBorderLineBatches(edges, () => ({ color: new THREE.Color(ORGANISATION_COLOR).offsetHSL(0, 0, 0.12).getHex(), look: EDGE_LOOK }),
    { elevation: LINE_ELEVATION });
  if (lines.children.length > 0) group.add(...lines.children);
  return group;
}

/** The key: the body shown, in its colour, and how many members it is drawn over. */
export function organisationLegend(code: string): LayerLegend {
  const def = areaByCode(code);
  const members = def && def.from === 'members' ? def.members.length : 0;
  return {
    layerId: ORGANISATIONS_LEGEND_ID,
    layer: 'Organisations',
    colorMeans: `${def?.name ?? code}: its ${members} members; one body at a time`,
    swatches: [{ color: swatchCss(ORGANISATION_COLOR), label: def?.name ?? code, shape: 'area' }],
  };
}

/** Whether a ray meets the body's fill on the near side of the Earth. */
export function organisationUnderRay(ray: THREE.Raycaster, fills: THREE.Object3D[], earthRadius: number): string | null {
  const front = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), earthRadius), new THREE.Vector3());
  const limit = front ? front.distanceTo(ray.ray.origin) + 1 : Number.POSITIVE_INFINITY;
  for (const hit of ray.intersectObjects(fills, false)) {
    const code = hit.object.userData.organisationCode;
    if (hit.distance <= limit && typeof code === 'string') return code;
  }
  return null;
}

export interface UseOrganisations3DParams {
  enabled: boolean;
  /** The body shown, by its code. */
  code: string | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  getCanvas: () => HTMLCanvasElement | null;
  solarDirection?: THREE.Vector3 | null;
}

export function useOrganisations3D({ enabled, code, scene, camera, getCanvas, solarDirection }: UseOrganisations3DParams) {
  const [shapes, setShapes] = useState<AreaShapes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const active = enabled && code !== null;

  useEffect(() => {
    if (!active || shapes) return;
    let alive = true;
    void loadAreaShapes().then((loaded) => {
      if (!alive) return;
      if (loaded) { setShapes(loaded); setLoadError(null); } else setLoadError(messagesNow().organisations.error);
    });
    return () => { alive = false; };
  }, [active, shapes]);

  const buildContent = useCallback(async () => (shapes && code ? buildOrganisationGroup(shapes, code) : new THREE.Group()), [shapes, code]);
  const { loading, error, groupRef } = useSimpleGeoOverlayLayer({
    enabled: active && shapes !== null,
    scene,
    layerId: ORGANISATIONS_LAYER_ID,
    layerOrder: 94,
    buildContent,
  });

  useEffect(() => {
    if (!active || !shapes || !code) return;
    publishLegend(ORGANISATIONS_LEGEND_ID, organisationLegend(code));
    return () => publishLegend(ORGANISATIONS_LEGEND_ID, null);
  }, [active, shapes, code]);

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
    if (!active || !scene) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointer: PointerAt | null = null;
    let hovered: string | null = null;
    let pressed: PointerAt | null = null;

    const stopClaiming = claimGlobeClicks(() => ({ mark: false, area: hovered !== null }), CLAIM_RANK.spheres);
    const fills = (): THREE.Mesh[] => (groupRef.current?.children ?? []).filter((c): c is THREE.Mesh => typeof c.userData.organisationCode === 'string');

    const pick = (at: PointerAt): string | null => {
      const canvas = getCanvasRef.current();
      const cam = cameraRef.current;
      const group = groupRef.current;
      if (!canvas || !cam || !group?.parent) return null;
      const rect = canvas.getBoundingClientRect();
      if (at.x < rect.left || at.x > rect.right || at.y < rect.top || at.y > rect.bottom) return null;
      ndc.set(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      return organisationUnderRay(ray, fills(), GLOBE_RADIUS_UNITS * shellLift());
    };

    const onMove = (e: PointerEvent) => { pointer = e.target === getCanvasRef.current() ? { x: e.clientX, y: e.clientY } : null; };
    const onLeave = () => { pointer = null; };
    const onDown = (e: PointerEvent) => { pressed = pressOn(e, getCanvasRef.current(), 'area', CLAIM_RANK.spheres); };
    const onUp = (e: PointerEvent) => {
      const press = pressed;
      pressed = null;
      const canvas = getCanvasRef.current();
      if (!canvas || e.target !== canvas || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      if (nearerLayerTakes('area', CLAIM_RANK.spheres)) return;
      if (pick({ x: e.clientX, y: e.clientY })) openOrganisationPanel(true);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && getOrganisationsState().open) openOrganisationPanel(false); };

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
        hovered = pointer && !nearerLayerTakes('area', CLAIM_RANK.spheres) ? pick(pointer) : null;
        setOrganisationHover(hovered && pointer ? { code: hovered, x: pointer.x, y: pointer.y } : null);
      }
      const { open } = getOrganisationsState();
      const alpha = reducedMotion ? 1 : Math.min(1, dt / LIGHT_UP_TAU_S);
      for (const mesh of fills()) {
        const material = mesh.material as THREE.Material;
        if (!isTerritoryFillMaterial(material)) continue;
        const t = (mesh.userData.organisationT ??= { hover: 0, select: 0 }) as { hover: number; select: number };
        t.hover += ((hovered ? 1 : 0) - t.hover) * alpha;
        t.select += ((open ? 1 : 0) - t.select) * alpha;
        setTerritoryMaterialHoverSelectDim(material, t.hover, t.select, 0);
        if (mesh.userData.organisationSun !== sunVersionRef.current && sunRef.current) {
          setTerritoryMaterialSunDirection(material, sunRef.current);
          mesh.userData.organisationSun = sunVersionRef.current;
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
      setOrganisationHover(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [active, scene, groupRef]);

  return { loading, error: loadError ?? error, shapes };
}
