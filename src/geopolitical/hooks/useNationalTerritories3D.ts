import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { pickLOD, desiredLod, createFrameBudget, noteBuildLanded, noteFrame, type FrameBudget, type Lod } from './territoryLod';
import { getGlobeQuality } from '../../services/globe/globeQuality';
import { shareActive } from '../../features/globe/capture/shareActivity';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { globalLayerRegistry } from '../LayerRegistry';
import { clearGroup } from '../utils/disposal';
// Corrected path to GeoPoliticalConfig type
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { enableBVHForGroup } from '../../globe-engine/enableBVH';
import { vector3ToLatLon } from '../utils/vector3ToLatLon';
import { buildBorderIndex, queryNearestSegmentId, type BorderIndex } from '../utils/borderIndex';
import { IdPickingPass } from '../picking/IdPickingPass';
import {
  isTerritoryFillMaterial,
  setTerritoryMaterialSunDirection
} from '../theme/territoryFillMaterial';
import { buildLineHighlight, findBatchedLine, lineBatchData } from '../geometry/lineBatches';
import { applyTerritoryLook, TERRITORY_FILLS_ORDER } from '../theme/applyTerritoryLook';
import { publishLegend } from '../../services/globe/globeLegendStore';
import { drawnBorderKinds, territoryLegends, BORDERS_LEGEND_ID, COUNTRIES_LEGEND_ID } from '../theme/borderLegend';
import {
  DEFAULT_TERRITORY_STYLE,
  TERRITORY_STYLE_DEFAULTS,
  crossFadeMsOf,
  type TerritoryLook,
  type TerritoryStyle
} from '../theme/territoryStyles';
import {
  drawnTerritoryStyle,
  noteTerritoryStyleDrawn,
  setScreenTerritories,
  setTerritoriesDrawn,
  territoriesDrawnIn,
  territoryLook
} from '../../globe-engine/territoryLook';
import { onSceneRender } from '../../globe-engine/sceneRenderHooks';
import { liftForHeight, liftRiders, ridesShell, shellLift } from '../../globe-engine/shellLift';
import { setCountryNamesReady, setScreenCountryNames } from '../../globe-engine/countryNamesLook';
import { CountryNames } from '../labels/countryNames';
import { waitForNameFonts } from '../labels/countryNameAtlas';
import { TERRITORY_LABELS } from '../theme/territoryLabels';

/** How long the pointer rests on a country before its name is placed first. */
const HOVER_REST_MS = 300;
import {
  easeTerritoryParts,
  setTerritoryPartTargets,
  territoryBatchData,
  territoryPartAt,
  territoryPartGeometry,
  type TerritoryPart
} from '../geometry/territoryBatch';
import { isGlobeClick, nearerLayerTakes, offerCountryAt, pressOn, type PointerAt } from '../../components/Globe/globeClick';
import { fadeGroupIn, fadeGroupOutThenDispose, replaceGroupContentsWithCrossFade, type FadeHandle } from '../utils/groupFade';
import { visualizationResourceMonitor } from '../../services/visualization/VisualizationResourceMonitor';
import { collectGeometryStats } from '../../utils/threeResourceMetrics';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useNationalTerritories3D' });

export interface CountryHoverInfo {
  countryCode: string;
  name?: string;
}

interface UseNationalTerritoriesParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  // The globe's camera, picks are cast from it. Passed in like the other layer hooks'.
  camera?: THREE.Camera | null;
  config: GeoPoliticalConfig['nationalTerritories'];
  // Real-time sun direction (world-space, normalized), when available — see
  // Globe.tsx's memoized `solarDirection`. Only present in modes where the
  // solar system light rig is active (EcoNatural, CyberCommand minus
  // IntelReports) — GeoPolitical mode has none, and territory fills fall back
  // to the fill shader's own static default direction rather than going dark.
  solarDirection?: THREE.Vector3 | null;
  // Fired when the hovered/selected territory changes (null on clear). Purely
  // additive: hoveredTerritoryRef/selectedTerritoryRef already drive the
  // in-scene highlight/select visuals on their own — these callbacks exist so
  // a 2D UI layer (tooltip/info popup) outside the 3D scene can know what's
  // currently hovered/selected without reaching into THREE.js refs itself.
  onHoverChange?: (info: CountryHoverInfo | null) => void;
  onSelectChange?: (info: CountryHoverInfo | null) => void;
  // The canvas the globe draws into, which pointer positions are measured against. The
  // page has more than one canvas and TinyGlobe's inset comes first, so the first one
  // is the wrong one: measured against it, every pick landed far off the globe.
  getCanvas?: () => HTMLCanvasElement | null;
  /**
   * Every style's look as this browser has set it (decision K5), so a card can be
   * drawn in another style than the screen's. Without it, the screen style's look is
   * read from `config` and every other style takes its defaults.
   */
  looks?: Readonly<Record<TerritoryStyle, TerritoryLook>>;
}

/** Every style's look, from the settings' resolved config when no looks are passed. */
function looksFrom(config: GeoPoliticalConfig['nationalTerritories']): Record<TerritoryStyle, TerritoryLook> {
  const style = config.style ?? DEFAULT_TERRITORY_STYLE;
  const looks = { ...TERRITORY_STYLE_DEFAULTS } as Record<TerritoryStyle, TerritoryLook>;
  looks[style] = {
    ...TERRITORY_STYLE_DEFAULTS[style],
    fillOpacity: config.territoryColors.opacity,
    height: config.fillElevationEpsilon ?? TERRITORY_STYLE_DEFAULTS[style].height,
    borderVisibility: config.borderVisibility,
    borderThickness: config.borderThickness,
  };
  return looks;
}

export function countryInfoFromPart(part: Pick<TerritoryPart, 'countryCode' | 'name'> | null | undefined): CountryHoverInfo | null {
  const code = part?.countryCode;
  if (typeof code !== 'string' || !code) return null;
  const name = typeof part?.name === 'string' ? part.name : undefined;
  return { countryCode: code, name };
}

/** One part of a territory batch. The batch is kept so the part can be found again after an LOD swap. */
interface PartRef {
  mesh: THREE.Mesh;
  index: number;
}

function territoryMeshOf(group: THREE.Group | null): THREE.Mesh | null {
  return (group?.children.find((child) => territoryBatchData(child)) as THREE.Mesh | undefined) ?? null;
}

/**
 * Where a hovered or selected part sits in `mesh`. Parts are numbered per LOD, so
 * after a swap the same part is found by id, or failing that by the first part of
 * its country; null when neither is there.
 */
function partIndexIn(mesh: THREE.Mesh, ref: PartRef | null): number | null {
  if (!ref) return null;
  if (ref.mesh === mesh) return ref.index;
  const wanted = territoryBatchData(ref.mesh)?.parts[ref.index];
  if (!wanted) return null;
  const parts = territoryBatchData(mesh)?.parts ?? [];
  const byId = parts.findIndex((p) => p.id === wanted.id);
  if (byId >= 0) return byId;
  const byCountry = wanted.countryCode ? parts.findIndex((p) => p.countryCode === wanted.countryCode) : -1;
  return byCountry >= 0 ? byCountry : null;
}

function partOf(ref: PartRef | null): TerritoryPart | null {
  return ref ? territoryBatchData(ref.mesh)?.parts[ref.index] ?? null : null;
}

// A hovered border takes its classification's hover colour; one without keeps its own.
const BORDER_HOVER_COLORS: Partial<Record<string, number>> = {
  disputed: 0xff7777,
  line_of_control: 0xffe066,
  indefinite: 0xaaaaaa,
  maritime_overlap: 0xff8800,
  maritime_eez: 0x00aaff
};

function applySunDirectionToGroup(group: THREE.Group | null, direction: THREE.Vector3): void {
  if (!group) return;
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const material = (obj as THREE.Mesh).material;
      if (isTerritoryFillMaterial(material)) setTerritoryMaterialSunDirection(material, direction);
    }
  });
}

const NATIONAL_TERRITORIES_MODE_KEY = 'GeoPolitical.NationalTerritories' as const;

function isDevRuntime(): boolean {
  try {
    if (import.meta.env.DEV) return true;
  } catch {
    // ignore
  }
  return process?.env?.NODE_ENV === 'development';
}

type DeviceTier = 'A' | 'B' | 'C';

export const GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD = -Math.PI / 2;

export function applyGeoPoliticalSceneCounterOffset(group: THREE.Group): void {
  group.rotation.y = GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD;
  group.updateMatrixWorld(true);
  group.userData = {
    ...(group.userData || {}),
    sceneCounterOffsetRad: GEOPOLITICAL_SCENE_COUNTER_OFFSET_RAD
  };
}

function maxLodForDeviceTier(tier: DeviceTier): 0 | 1 | 2 {
  if (tier === 'A') return 0;
  if (tier === 'B') return 1;
  return 2;
}

function defaultLodForDeviceTier(tier: DeviceTier): 0 | 1 | 2 {
  if (tier === 'A') return 0;
  if (tier === 'B') return 1;
  return 2;
}

function detectDeviceTier(): DeviceTier {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('geoDeviceTier')?.toUpperCase();
      if (forced === 'A' || forced === 'B' || forced === 'C') return forced;
    } catch {
      // noop
    }
  }

  const nav = typeof navigator !== 'undefined'
    ? navigator as Navigator & { deviceMemory?: number }
    : undefined;
  const cores = nav?.hardwareConcurrency ?? 8;
  const memory = nav?.deviceMemory;

  if ((typeof memory === 'number' && memory <= 4) || cores <= 4) return 'A';
  if ((typeof memory === 'number' && memory <= 8) || cores <= 8) return 'B';
  return 'C';
}


export function useNationalTerritories3D({ enabled, scene, camera, config, solarDirection, onHoverChange, onSelectChange, getCanvas, looks }: UseNationalTerritoriesParams) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref so every handler and probe reads the latest getter without re-subscribing.
  const getCanvasRef = useRef(getCanvas);
  getCanvasRef.current = getCanvas;
  const globeCanvas = useCallback(
    (): HTMLCanvasElement | null => getCanvasRef.current?.() ?? (document.querySelector('canvas') as HTMLCanvasElement | null),
    []
  );
  const bordersGroupRef = useRef<THREE.Group | null>(null);
  const maritimeGroupRef = useRef<THREE.Group | null>(null);
  const territoriesGroupRef = useRef<THREE.Group | null>(null);
  // Latest sun direction, mirrored into a ref so buildForLOD (a useCallback
  // with its own, unrelated dependency array) can apply it to newly-built
  // meshes without needing solarDirection as a dependency — including it
  // there would rebuild the whole territory group every time the sun angle
  // changes, fighting the LOD/fade system for no reason. Existing meshes are
  // updated in place via the effect below instead.
  const solarDirectionRef = useRef<THREE.Vector3 | null>(solarDirection ?? null);
  // In-flight LOD-replace fade-outs (borders/maritime/territories), tracked so
  // the "cleanup when disabled" effect can force them to finish immediately
  // instead of letting an orphaned rAF loop outlive the layer being disabled.
  // Not pruned as each one completes naturally — bounded by how many LOD
  // switches happen while enabled (realistically dozens per session at most),
  // and cleared wholesale on disable, so this doesn't meaningfully accumulate.
  const pendingFadeHandlesRef = useRef<Set<FadeHandle>>(new Set());
  const trackFade = useCallback((handle: FadeHandle | null) => {
    if (handle) pendingFadeHandlesRef.current.add(handle);
  }, []);
  // No local UI state presently required
  const currentLODRef = useRef<0 | 1 | 2 | null>(null);
  // Builds started and not yet landed: the level-of-detail watcher starts none while any are.
  const buildsUnderWayRef = useRef(0);
  const deviceTierRef = useRef<DeviceTier>(detectDeviceTier());
  const cameraRef = useRef<THREE.Camera | null>(null);
  const hysteresis = config.lod?.hysteresis ?? 20;
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerRef = useRef<THREE.Vector2 | null>(null);
  // The hovered border's id, and the line drawn over it: a sibling of the borders
  // group, like the selection halo is of the territories group.
  const highlightedBorderIdRef = useRef<string | null>(null);
  const borderHighlightRef = useRef<THREE.Group | null>(null);
  const hoveredTerritoryRef = useRef<PartRef | null>(null);
  const selectedTerritoryRef = useRef<PartRef | null>(null);
  const pendingHoverCandidateRef = useRef<number | null>(null);
  const pendingHoverSinceRef = useRef<number>(0);
  const lastPickTsRef = useRef<number>(0);
  const pickIntervalMs = 16; // ~60Hz
  const bvhEnabledRef = useRef<boolean>(!!config?.bvhPicking);
  const lastFrameTimeRef = useRef<number>(performance.now());
  // Slow frames, and the ceiling a step down holds (territoryLod.ts): a build's own frames are never counted.
  const frameBudgetRef = useRef<FrameBudget>(createFrameBudget());
  // Simple spatial index for borders: array of segments with AABB in lon/lat
  const borderIndexRef = useRef<BorderIndex | null>(null);
  // Dev-only ID picking pass
  const idPickingRef = useRef<IdPickingPass | null>(null);
  const idPickEnabledRef = useRef<boolean>(false);
  const lastIdUnderCursorRef = useRef<string | null>(null);
  const idHudElRef = useRef<HTMLDivElement | null>(null);
  // Selection halo: a glow-outline mesh for the selected territory, kept as a
  // sibling of territoriesGroupRef — NOT a child of it — since that group is
  // the raycast target for both hover and click (ray.intersectObjects(tg.children)),
  // and can carry a BVH; a halo living inside it could steal a hover/select
  // hit from the country underneath it.
  const haloGroupRef = useRef<THREE.Group | null>(null);
  const haloFadeHandleRef = useRef<FadeHandle | null>(null);

  /*
   * ─── THE STYLE DRAWN (decision K5) ───────────────────────────────────────
   *
   * The screen draws its style; a card or clip draws its shot's, Quiet unless the
   * shot names one (globe-engine/territoryLook.ts). So the look is applied at the
   * start of every render, from the style that render draws: the fills' one-colour
   * switch and opacity, their height, and the borders' colours, widths and
   * opacity, all in place. A capture switches for its own render and the next live
   * frame switches back, at the cost of a comparison when nothing changed.
   */
  const configRef = useRef(config);
  configRef.current = config;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const screenStyle: TerritoryStyle = config.style ?? DEFAULT_TERRITORY_STYLE;
  const screenStyleRef = useRef(screenStyle);
  screenStyleRef.current = screenStyle;
  // Bumped by every build, so the look is applied to what a build brought in.
  const builtRef = useRef(0);
  const appliedRef = useRef<{ style: TerritoryStyle; look: TerritoryLook; built: number } | null>(null);

  // The country names (decision K5, step 4): made with the layer, drawn from the render hook below.
  const namesRef = useRef<CountryNames | null>(null);
  // The hovered country is named first only once the pointer has rested on it (a sweep names nothing).
  const hoverRestRef = useRef<{ code: string | null; since: number }>({ code: null, since: 0 });

  const applyDrawnLook = useCallback((renderer?: THREE.WebGLRenderer, camera?: THREE.Camera) => {
    const style = drawnTerritoryStyle();
    const look = territoryLook(style);
    /*
     * For compose's check that a card drew its own style (globe-engine/territoryLook.ts).
     * Noted only when the groups styled here are the ones the scene draws: a page of
     * cards came out Classic under Quiet records and passed, since the style was noted
     * for groups a racing build had kept out of the scene while its own were drawn.
     */
    const styledAreDrawn = [territoriesGroupRef.current, bordersGroupRef.current, maritimeGroupRef.current]
      .every((group) => group === null || group.parent === sceneRef.current);
    if (styledAreDrawn) noteTerritoryStyleDrawn(style);
    // Every render, not only when the look changes: a layer may have replaced a root since.
    const fillsDrawn = territoriesGroupRef.current !== null && look.fillOpacity > 0;
    if (sceneRef.current) liftRiders(sceneRef.current, fillsDrawn ? liftForHeight(look.height) : 1);
    // The names, every render: after the lift, so they stand where the shell does.
    const names = namesRef.current;
    if (names && renderer && camera && sceneRef.current) {
      const now = performance.now();
      const hovered = partOf(hoveredTerritoryRef.current)?.countryCode ?? null;
      const rest = hoverRestRef.current;
      if (rest.code !== hovered) hoverRestRef.current = { code: hovered, since: now };
      names.update(renderer, camera, sceneRef.current, now, {
        selected: partOf(selectedTerritoryRef.current)?.countryCode ?? null,
        hovered: hovered && now - hoverRestRef.current.since >= HOVER_REST_MS ? hovered : null,
      });
    }
    const applied = appliedRef.current;
    if (applied && applied.style === style && applied.look === look && applied.built === builtRef.current) return;
    appliedRef.current = { style, look, built: builtRef.current };

    applyTerritoryLook({
      fills: territoriesGroupRef.current,
      borders: bordersGroupRef.current,
      maritime: maritimeGroupRef.current,
      halo: haloGroupRef.current,
    }, style, look, configRef.current);
  }, []);

  /** The territories' entries in the on-screen key, in the screen's style. */
  const publishTerritoryLegends = useCallback(() => {
    const style = screenStyleRef.current;
    for (const { id, legend } of territoryLegends(style, territoriesDrawnIn(style), territoryLook(style))) publishLegend(id, legend);
  }, []);

  const updateSelectionHalo = useCallback((selected: PartRef | null) => {
    // Cancel (force-finish) any in-flight fade-out from a previous deselect
    // before starting a new one — otherwise a rapid select/deselect/reselect
    // could leave two overlapping halos both animating independently.
    haloFadeHandleRef.current?.cancel();
    haloFadeHandleRef.current = null;

    const existingHalo = haloGroupRef.current;
    haloGroupRef.current = null;
    if (existingHalo) {
      const parent = existingHalo.parent;
      haloFadeHandleRef.current = fadeGroupOutThenDispose(existingHalo, 300, config.reducedMotion, () => {
        parent?.remove(existingHalo);
      });
    }

    const tg = territoriesGroupRef.current;
    const partGeometry = selected ? territoryPartGeometry(selected.mesh, selected.index) : null;
    if (!partGeometry || !tg?.parent) {
      partGeometry?.dispose();
      return;
    }

    const halo = new THREE.Group();
    halo.rotation.copy(tg.rotation);
    halo.scale.copy(tg.scale);

    // A copy of the part's own triangles, not a view into the batch: the batch
    // is disposed on an LOD change (cross-faded out — see
    // replaceGroupContentsWithCrossFade) while the halo may still be showing,
    // and WebGLAttributes keys GPU buffers by the attribute object itself, so a
    // shared attribute would be freed out from under the halo. One part is tens
    // of KB at most, even Russia's largest.
    const haloMesh = new THREE.Mesh(
      partGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x88bbff,
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide,
        depthWrite: false
      })
    );
    // Slightly larger than the source mesh, back-face rendered: only the rim
    // that pokes out past the original silhouette is visible, reading as a
    // glow outline rather than a solid oversized duplicate. Scaling around
    // the mesh's own (0,0,0) origin works out correctly here specifically
    // because territory geometry vertices are true globe-relative XYZ
    // coordinates (the globe's own center), not mesh-local-centered — so a
    // uniform scale-up is exactly "push each vertex slightly further from
    // the globe's center," not an off-center distortion.
    haloMesh.scale.setScalar(1.02);
    haloMesh.raycast = () => {}; // belt-and-suspenders — it's not in the raycast-target group at all, but this guarantees it regardless
    halo.add(haloMesh);

    tg.parent.add(halo);
    haloGroupRef.current = halo;
    fadeGroupIn(halo, 300, config.reducedMotion);
  }, [config.reducedMotion]);

  // Selecting a part brightens it and dims every other part by 30%. The hover
  // loop eases each part there (setTerritoryPartTargets, easeTerritoryParts).
  const setSelection = useCallback((selected: PartRef | null) => {
    updateSelectionHalo(selected);
    onSelectChange?.(countryInfoFromPart(partOf(selected)));
    selectedTerritoryRef.current = selected;
  }, [updateSelectionHalo, onSelectChange]);

  const clearBorderHighlight = useCallback(() => {
    const holder = borderHighlightRef.current;
    borderHighlightRef.current = null;
    if (!holder) return;
    holder.parent?.remove(holder);
    clearGroup(holder);
  }, []);

  /*
   * The camera comes from Globe.tsx, as every other layer hook's does. This used to read
   * `scene.__camera`, a private field react-globe.gl was assumed to set. It sets none
   * (measured 2026-09-12: not on the scene, not on its parent), so this ref stayed null
   * and hover, selection and the border highlight all returned before picking anything.
   */
  useEffect(() => {
    cameraRef.current = camera ?? null;
    if (camera && idPickingRef.current) idPickingRef.current.setCamera(camera);
  }, [camera]);

  // Push a changed sun direction into every currently-built territory
  // material. Newly-built meshes (LOD change, initial build) pick up
  // solarDirectionRef.current directly in buildForLOD instead.
  useEffect(() => {
    solarDirectionRef.current = solarDirection ?? null;
    if (solarDirection) applySunDirectionToGroup(territoriesGroupRef.current, solarDirection);
  }, [solarDirection]);

  // Build / activate for a specific LOD (re-register if first time; else replace group contents in-place)
  const buildForLOD = useCallback(async (lod: 0 | 1 | 2, replace = false) => {
    buildsUnderWayRef.current += 1;
    try {
      setLoading(true);
  const borders = await nationalTerritoriesService.loadBordersLOD(lod);
      const newBordersGroup = nationalTerritoriesService.buildBorders(borders, config);
      applyGeoPoliticalSceneCounterOffset(newBordersGroup);
      // The hover highlight was copied from the old LOD's lines; the next pick draws it afresh.
      highlightedBorderIdRef.current = null;
      clearBorderHighlight();
      // We'll build the spatial index after optionally loading maritime features
      if (replace && bordersGroupRef.current) {
        trackFade(replaceGroupContentsWithCrossFade(bordersGroupRef.current, newBordersGroup, {
          durationMs: crossFadeMsOf(config),
          reducedMotion: config.reducedMotion,
          applyTransform: applyGeoPoliticalSceneCounterOffset
        }));
      } else {
        // The borders ride the shell when it is raised (globe-engine/shellLift.ts).
        bordersGroupRef.current = ridesShell(newBordersGroup);
        // Replaced, not registered: a group an earlier mount or build left under the id
        // would stay drawn, and the look go onto this one (LayerRegistry.replace).
        globalLayerRegistry.replace({
          id: 'geopolitical-borders',
          order: 100,
          build: () => bordersGroupRef.current || new THREE.Group(),
          dispose: (g) => clearGroup(g)
        });
        globalLayerRegistry.activate('geopolitical-borders', scene!);
        fadeGroupIn(bordersGroupRef.current, crossFadeMsOf(config), config.reducedMotion);
      }
  // Maritime borders (optional separate layer)
  let maritime: Array<{ id: string; coordinates: [number, number][], classification?: unknown }> | null = null;
      if (config.showMaritimeBorders) {
        maritime = await nationalTerritoriesService.loadMaritimeBordersLOD(lod);
        if (maritime && maritime.length) {
          const newMaritimeGroup = nationalTerritoriesService.buildMaritimeBorders(maritime as unknown as ReturnType<typeof nationalTerritoriesService.loadMaritimeBordersLOD> extends Promise<infer T> ? NonNullable<T> : never, config);
          applyGeoPoliticalSceneCounterOffset(newMaritimeGroup);
          if (replace && maritimeGroupRef.current) {
            trackFade(replaceGroupContentsWithCrossFade(maritimeGroupRef.current, newMaritimeGroup, {
              durationMs: crossFadeMsOf(config),
              reducedMotion: config.reducedMotion,
              applyTransform: applyGeoPoliticalSceneCounterOffset
            }));
          } else {
            maritimeGroupRef.current = ridesShell(newMaritimeGroup);
            globalLayerRegistry.replace({
              id: 'geopolitical-maritime',
              order: 96,
              build: () => maritimeGroupRef.current || new THREE.Group(),
              dispose: (g) => clearGroup(g)
            });
            globalLayerRegistry.activate('geopolitical-maritime', scene!);
            fadeGroupIn(maritimeGroupRef.current, crossFadeMsOf(config), config.reducedMotion);
          }
        } else if (replace && maritimeGroupRef.current) {
          // No maritime features for this LOD — fade existing content out to nothing.
          trackFade(replaceGroupContentsWithCrossFade(maritimeGroupRef.current, new THREE.Group(), {
            durationMs: crossFadeMsOf(config),
            reducedMotion: config.reducedMotion,
            applyTransform: applyGeoPoliticalSceneCounterOffset
          }));
        }
      } else if (replace && maritimeGroupRef.current) {
        // Maritime borders toggled off — fade existing content out to nothing.
        trackFade(replaceGroupContentsWithCrossFade(maritimeGroupRef.current, new THREE.Group(), {
          durationMs: crossFadeMsOf(config),
          reducedMotion: config.reducedMotion,
          applyTransform: applyGeoPoliticalSceneCounterOffset
        }));
      }
      /*
       * The key to the borders, read off what is drawn now (decision D-F,
       * 2026-09-19). Published on every rebuild, so a change of level of detail,
       * or of the setting that hides disputed borders, reaches the key without a
       * second path.
       *
       * From the REFS, not from newBordersGroup — which the first version read,
       * on the reasoning that a crossfade leaves the refs holding the outgoing
       * level. It does the opposite. replaceGroupContentsWithCrossFade calls
       * current.add(...newContent.children), and three.js's add REPARENTS: the
       * incoming borders move into the ref's group and the outgoing ones into a
       * separate fading group. So after any level-of-detail change the new group
       * is empty, the key read from it was null, and publishing null withdrew
       * it. Every unit test passed; the running globe showed a key with no
       * borders in it. The refs hold what is drawn on both paths — the first
       * build assigns the new group to the ref outright.
       */
      // Published below, once the fills are built too (publishTerritoryLegends).
  // Build/refresh spatial index from available features (land + optional maritime)
  const indexFeatures = maritime && maritime.length
    ? [...borders, ...maritime.map(m => ({ id: m.id, coordinates: m.coordinates as [number, number][] }))]
    : borders;
  borderIndexRef.current = buildBorderIndex(indexFeatures);
      if (config.territoryColors.opacity > 0) {
        const territoriesResult = await nationalTerritoriesService.loadTerritoriesLODResolved(lod);
        log.info('[NationalTerritories] resolved territory source', {
          lod,
          source: territoriesResult.kind,
          count: territoriesResult.kind === 'baked'
            ? territoriesResult.parts.length
            : territoriesResult.features.length
        });
        const newTerritoriesGroup = territoriesResult.kind === 'baked'
          ? nationalTerritoriesService.buildTerritoriesFromBaked(territoriesResult.parts, config)
          : nationalTerritoriesService.buildTerritories(territoriesResult.features, config);
        applyGeoPoliticalSceneCounterOffset(newTerritoriesGroup);
        if (solarDirectionRef.current) applySunDirectionToGroup(newTerritoriesGroup, solarDirectionRef.current);
        // Optionally enable BVH for faster raycasting
        if (bvhEnabledRef.current) {
          const ok = await enableBVHForGroup(newTerritoriesGroup);
          if (!ok) bvhEnabledRef.current = false;
        }
        if (replace && territoriesGroupRef.current) {
          // The outgoing fills fade at the holder's scale and order (groupFade.ts), not the bake's radius.
          trackFade(replaceGroupContentsWithCrossFade(territoriesGroupRef.current, newTerritoriesGroup, {
            durationMs: crossFadeMsOf(config),
            reducedMotion: config.reducedMotion,
            applyTransform: applyGeoPoliticalSceneCounterOffset
          }));
        } else {
          territoriesGroupRef.current = newTerritoriesGroup;
          globalLayerRegistry.replace({
            id: 'geopolitical-territories',
            order: TERRITORY_FILLS_ORDER,
            build: () => territoriesGroupRef.current || new THREE.Group(),
            dispose: (g) => clearGroup(g)
          });
          globalLayerRegistry.activate('geopolitical-territories', scene!);
          fadeGroupIn(territoriesGroupRef.current, crossFadeMsOf(config), config.reducedMotion);
        }
        // If dev picking is enabled, refresh target group and camera
        if (idPickingRef.current && cameraRef.current) {
          idPickingRef.current.setCamera(cameraRef.current);
          idPickingRef.current.setTargetGroup(territoriesGroupRef.current);
        }
      }
      // What was drawn, whatever the style, so a card's key can be written in its own (decision K5).
      setTerritoriesDrawn({
        borderKinds: drawnBorderKinds(bordersGroupRef.current, maritimeGroupRef.current),
        fills: territoriesGroupRef.current !== null,
      });
      publishTerritoryLegends();
      // The look is applied at the next render (applyDrawnLook), to what was just built.
      builtRef.current += 1;
      currentLODRef.current = lod;
      setLoading(false);
      // This is the heaviest single render payload of any GeoPolitical layer (LOD2's
      // fills are its densest geometry) but was never reported to VisualizationResourceMonitor
      // at all — every other real THREE-rendering layer (Satellites, EarthWeather, GDACS,
      // IntelReports, the SpaceWeather pipeline...) already does. replaceGroupContentsWithCrossFade
      // mutates group children synchronously (only the old content's *visual* fade-out is
      // gradual), so the three refs already reflect the real new content here.
      visualizationResourceMonitor.recordGeometry(
        NATIONAL_TERRITORIES_MODE_KEY,
        collectGeometryStats([bordersGroupRef.current, maritimeGroupRef.current, territoriesGroupRef.current].filter((g): g is THREE.Group => g !== null))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to build geopolitical layers';
      setError(msg);
      setLoading(false);
    } finally {
      buildsUnderWayRef.current -= 1;
      noteBuildLanded(frameBudgetRef.current, performance.now());
    }
  }, [config, scene, trackFade, clearBorderHighlight, publishTerritoryLegends]);

  // The screen's style and every style's look, for the render hook and for cards.
  const screenLooks = looks ?? looksFrom(config);
  useEffect(() => {
    setScreenTerritories(screenStyle, screenLooks);
    if (enabled && currentLODRef.current !== null) publishTerritoryLegends();
  }, [screenStyle, screenLooks, enabled, publishTerritoryLegends]);

  useEffect(() => {
    if (!enabled || !scene) return;
    appliedRef.current = null;
    return onSceneRender(scene, applyDrawnLook);
  }, [enabled, scene, applyDrawnLook]);

  // The country names: with the layer, drawn once the text face has loaded (or has not come in time).
  useEffect(() => {
    if (!enabled || !scene) return;
    const names = new CountryNames(TERRITORY_LABELS);
    scene.add(names.root);
    namesRef.current = names;
    let gone = false;
    void waitForNameFonts().then((loaded) => {
      if (gone || !names.prepare()) return;
      // A card asking for names waits for this, and is refused on a fallback face.
      setCountryNamesReady(loaded ? 'ready' : 'fallback');
    });
    return () => {
      gone = true;
      names.dispose();
      setCountryNamesReady(null);
      if (namesRef.current === names) namesRef.current = null;
    };
  }, [enabled, scene]);

  // The label slider: how many names the screen shows.
  useEffect(() => {
    setScreenCountryNames(config.labelVisibility);
  }, [config.labelVisibility]);

  // Initial activation. Once: this runs again whenever buildForLOD changes, and the
  // first build is asynchronous, so a settings change before it landed started a
  // second first build, whose groups took the refs while the first's stayed in the
  // scene, where nothing the refs reach could change them.
  const firstBuildStartedRef = useRef(false);
  useEffect(() => {
    if (!enabled || !scene) return;
    if (currentLODRef.current !== null || firstBuildStartedRef.current) return; // built, or building
    firstBuildStartedRef.current = true;
    // The camera's own level when it is known, so a first build is not straight away rebuilt for it.
    const firstCamera = cameraRef.current ?? camera ?? null;
    const initialLOD = config.lod?.mode === 'locked'
      ? config.lod.lockedLevel
      : firstCamera
        ? Math.min(pickLOD(firstCamera.position.length(), hysteresis, null), maxLodForDeviceTier(deviceTierRef.current)) as Lod
        : defaultLodForDeviceTier(deviceTierRef.current);
    buildForLOD(initialLOD);
  }, [enabled, scene, camera, config.lod?.lockedLevel, config.lod?.mode, hysteresis, buildForLOD]);

  // LOD watcher (animation frame for responsiveness with throttling)
  useEffect(() => {
    if (!enabled || !scene) return;
    if (config.lod?.mode === 'locked') return; // no auto switching
    let frame: number;
    let lastCheck = 0;
    const checkIntervalMs = 750; // throttle
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      if (!cameraRef.current) return;
      /*
       * Not while a build is under way, the first among them. This looks on its first
       * frame, while the first build is still loading, and the build it started there
       * for the camera's level could land first: its groups took the layer's place in
       * the scene, the first build's took the refs, and the look went onto groups
       * nobody saw. A card drawn Quiet came out Classic, as built. (A first build that
       * failed is tried again from here, as it always was.)
       */
      if (buildsUnderWayRef.current > 0) return;
      if (t - lastCheck < checkIntervalMs) return;
      lastCheck = t;
      const dist = cameraRef.current.position.length();
      const desired = desiredLod(dist, hysteresis, currentLODRef.current, maxLodForDeviceTier(deviceTierRef.current), frameBudgetRef.current, performance.now());
      if (desired !== currentLODRef.current) {
        buildForLOD(desired, true);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled, scene, config.lod?.mode, config.lod?.lockedLevel, hysteresis, buildForLOD]);

  /*
   * A change of opacity, width, colour or height needs no rebuild: the look is
   * applied at the next render (applyDrawnLook). These rebuild what does change the
   * geometry or the material. They call the latest build through a ref and list only
   * the settings they are about: with buildForLOD itself among their dependencies,
   * they ran on every change to any territory setting, since buildForLOD changes
   * whenever the config does, and each slider step rebuilt the whole layer twice.
   */
  const buildRef = useRef(buildForLOD);
  buildRef.current = buildForLOD;
  // Fills are built only while the screen draws them, so turning them on builds them.
  const fillsOn = config.territoryColors.opacity > 0;
  const settled = useRef(false);
  useEffect(() => {
    if (!enabled) {
      settled.current = false;
      return;
    }
    // Not on the first run: the initial activation below builds, and this would build it twice.
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (currentLODRef.current !== null) {
      buildRef.current(currentLODRef.current, true);
    }
  }, [enabled, config.frontSideOnly, config.usePolygonOffset, config.polygonOffsetFactor, config.polygonOffsetUnits,
    config.showDisputedTerritories, config.showMaritimeBorders, fillsOn]);

  // Allow switching to locked mode dynamically. Not before the first build lands:
  // the initial activation builds the locked level itself, and building here as well
  // raced it, leaving two sets of groups, the refs holding one the scene never showed.
  useEffect(() => {
    if (!enabled || !scene) return;
    if (config.lod?.mode === 'locked' && currentLODRef.current !== null && currentLODRef.current !== config.lod.lockedLevel) {
      buildForLOD(config.lod.lockedLevel, true);
    }
  }, [config.lod?.mode, config.lod?.lockedLevel, enabled, scene, buildForLOD]);

  // ID picking probe (behind ?geoIdPicking), enabled in any env
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const enableIdPicking = params.get('geoIdPicking');
      idPickEnabledRef.current = !!enableIdPicking;
      if (!enableIdPicking) return;
      const w = window as unknown as { __geoIdPickProbe?: { sampleCenter: () => string | null, sampleAtCursor?: () => string | null, getLast?: () => string | null } } & Record<string, unknown>;
      if (!idPickingRef.current) {
        idPickingRef.current = new IdPickingPass(512, 512);
        if (cameraRef.current) idPickingRef.current.setCamera(cameraRef.current);
        if (territoriesGroupRef.current) idPickingRef.current.setTargetGroup(territoriesGroupRef.current);
        const canvas = globeCanvas();
        if (canvas) idPickingRef.current.setSizeFromCanvas(canvas);
      }
      w.__geoIdPickProbe = {
        sampleCenter: () => {
          const canvas = globeCanvas();
          if (!canvas || !idPickingRef.current) return null;
          idPickingRef.current.setSizeFromCanvas(canvas);
          const cx = Math.floor(canvas.width/2);
          const cy = Math.floor(canvas.height/2);
          // Spiral search around center up to ~10% of min dimension
          const maxR = Math.max(24, Math.floor(Math.min(canvas.width, canvas.height) * 0.1));
          if (idPickingRef.current.getIdAt(cx, cy)) return idPickingRef.current.getIdAt(cx, cy);
          for (let r = 1; r <= maxR; r++) {
            for (let dx = -r; dx <= r; dx++) {
              const id1 = idPickingRef.current.getIdAt(cx + dx, cy - r);
              if (id1) return id1;
            }
            for (let dy = -r + 1; dy <= r; dy++) {
              const id2 = idPickingRef.current.getIdAt(cx + r, cy + dy);
              if (id2) return id2;
            }
            for (let dx = r - 1; dx >= -r; dx--) {
              const id3 = idPickingRef.current.getIdAt(cx + dx, cy + r);
              if (id3) return id3;
            }
            for (let dy = r - 1; dy >= -r + 1; dy--) {
              const id4 = idPickingRef.current.getIdAt(cx - r, cy + dy);
              if (id4) return id4;
            }
          }
          return null;
        },
        sampleAtCursor: () => lastIdUnderCursorRef.current,
        getLast: () => lastIdUnderCursorRef.current
      };
      return () => { if (w.__geoIdPickProbe) delete w.__geoIdPickProbe; };
    } catch { /* noop */ }
  }, [enabled, scene]);

  // Development-only: expose an overlay probe to window for tests/diagnostics
  useEffect(() => {
    if (!isDevRuntime()) return;
    // Attach a diagnostic helper to window
  const w = window as unknown as { __geoOverlayProbe?: { getCenterLineDiagnostics: (rectSize?: number) => unknown; getGroupTransforms?: () => unknown } } & Record<string, unknown>;

    try {
      // nothing here for id picking; handled in env-agnostic effect above
    } catch {
      // ignore
    }
    w.__geoOverlayProbe = {
      getCenterLineDiagnostics: (rectSize = 80) => {
        try {
          const canvas = globeCanvas();
          if (!canvas || !cameraRef.current) return null;
          const width = canvas.width;
          const height = canvas.height;
          const cx = Math.floor(width / 2);
          const cy = Math.floor(height / 2);
          const half = Math.floor(rectSize / 2);
          const x0 = cx - half;
          const y0 = cy - half;
          const x1 = cx + half;
          const y1 = cy + half;
          const results: Array<{ classification: string; renderOrder: number; depthWrite: boolean } > = [];
          // Borders are batches (LineSegments2 -> THREE.Mesh, not THREE.Line —
          // see lineBatches.ts): geometry stored as instanced per-segment
          // start/end attributes rather than a flat "position" attribute, plus a
          // record of which segments belong to which border.
          const testBatch = (batch: THREE.Mesh) => {
            const data = lineBatchData(batch);
            const startAttr = batch.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute | undefined;
            const endAttr = batch.geometry.attributes.instanceEnd as THREE.InterleavedBufferAttribute | undefined;
            if (!data || !startAttr) return;
            const v = new THREE.Vector3();
            const sampleHits = (attr: THREE.InterleavedBufferAttribute, i: number): boolean => {
              v.set(attr.getX(i), attr.getY(i), attr.getZ(i));
              v.applyMatrix4(batch.matrixWorld);
              v.project(cameraRef.current!);
              const sx = Math.floor((v.x * 0.5 + 0.5) * width);
              const sy = Math.floor((-v.y * 0.5 + 0.5) * height);
              return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
            };
            const depthWrite = !!(batch.material as THREE.Material & { depthWrite?: boolean }).depthWrite;
            for (const line of data.lines) {
              // Sample every Nth segment of each border to reduce cost
              const step = Math.max(1, Math.floor(line.count / 100));
              let hits = 0;
              for (let i = line.start; i < line.start + line.count && hits <= 2; i += step) {
                if (sampleHits(startAttr, i)) hits++;
                if (hits <= 2 && endAttr && sampleHits(endAttr, i)) hits++;
              }
              if (hits > 0) {
                results.push({ classification: line.classification || 'unknown', renderOrder: batch.renderOrder || 0, depthWrite });
              }
            }
          };
          [bordersGroupRef.current, maritimeGroupRef.current].forEach((group) => {
            group?.children.forEach((obj) => { if (lineBatchData(obj)) testBatch(obj as THREE.Mesh); });
          });
          let maxTerritoryOrder: number | null = null;
          if (territoriesGroupRef.current) {
            territoriesGroupRef.current.traverse(obj => {
              if ((obj as THREE.Mesh).isMesh) {
                maxTerritoryOrder = Math.max(maxTerritoryOrder ?? 0, obj.renderOrder || 0);
              }
            });
          }
          return { lines: results, maxTerritoryOrder };
  } catch (_e) {
          return null;
        }
      },
      getGroupTransforms: () => {
        const summarize = (group: THREE.Group | null) => {
          if (!group) return null;
          return {
            rotationY: group.rotation.y,
            sceneCounterOffsetRad: group.userData?.sceneCounterOffsetRad ?? null,
            source: group.userData?.source ?? null,
            childCount: group.children.length
          };
        };
        return {
          borders: summarize(bordersGroupRef.current),
          maritime: summarize(maritimeGroupRef.current),
          territories: summarize(territoriesGroupRef.current),
          currentLOD: currentLODRef.current
        };
      }
    };
  return () => { if (w.__geoOverlayProbe) delete w.__geoOverlayProbe; };
  }, [enabled]);

  // Cleanup when disabled
  /*
   * And on unmount, which the teardown below does not cover: it runs when the
   * overlay is switched off, not when the globe goes away with it on. The legend
   * store is module-level and outlives this hook, so without this the border key
   * would outlive the borders. Same pattern as useDiplomaticEvents3D.
   */
  useEffect(() => () => {
    publishLegend(BORDERS_LEGEND_ID, null);
    publishLegend(COUNTRIES_LEGEND_ID, null);
    setTerritoriesDrawn(null);
    if (sceneRef.current) liftRiders(sceneRef.current, 1);
    // The groups go too, or a scene that outlives this hook keeps drawing them, as built.
    globalLayerRegistry.reset('geopolitical-borders', sceneRef.current ?? undefined);
    globalLayerRegistry.reset('geopolitical-maritime', sceneRef.current ?? undefined);
    globalLayerRegistry.reset('geopolitical-territories', sceneRef.current ?? undefined);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Force any in-flight LOD-replace cross-fades (a fading-out sibling
      // group not tracked by bordersGroupRef/etc — see replaceGroupContentsWithCrossFade)
      // to finish immediately rather than leaving their rAF loops to complete
      // on their own schedule after this layer's been torn down.
      pendingFadeHandlesRef.current.forEach((handle) => handle.cancel());
      pendingFadeHandlesRef.current.clear();
      haloFadeHandleRef.current?.cancel();
      haloFadeHandleRef.current = null;
      if (haloGroupRef.current) {
        haloGroupRef.current.parent?.remove(haloGroupRef.current);
        clearGroup(haloGroupRef.current);
        haloGroupRef.current = null;
      }
      clearBorderHighlight();
      highlightedBorderIdRef.current = null;
      // Route through the registry, not a raw clearGroup — clearGroup only
      // empties each group's contents, leaving the (now-empty) group object
      // itself still attached to the scene and still cached as
      // globalLayerRegistry's `st.group` for its id. LayerRegistry.build()
      // only ever calls the layer's build() closure when `st.group` is null
      // (see LayerRegistry.ts), so re-enabling would build a fresh group
      // into e.g. territoriesGroupRef.current but the registry would keep
      // reusing its stale, now-permanently-empty cached group — the new one
      // never gets attached. reset() removes the group from the scene, runs
      // clearGroup, and nulls the registry's own reference (same cleanup as
      // dispose()) but leaves the layer's status at 'registered' rather than
      // the terminal 'disposed' — dispose() would make every future
      // activate() call on this id a permanent no-op, since
      // globalLayerRegistry is a module-level singleton and this effect
      // runs every time the layer is toggled off, not just once.
      globalLayerRegistry.reset('geopolitical-borders', scene ?? undefined);
      globalLayerRegistry.reset('geopolitical-maritime', scene ?? undefined);
      globalLayerRegistry.reset('geopolitical-territories', scene ?? undefined);
      visualizationResourceMonitor.clearMode(NATIONAL_TERRITORIES_MODE_KEY);
      bordersGroupRef.current = null;
      maritimeGroupRef.current = null;
      territoriesGroupRef.current = null;
      // The borders and fills are gone, so their key goes with them, on screen and on cards.
      publishLegend(BORDERS_LEGEND_ID, null);
      publishLegend(COUNTRIES_LEGEND_ID, null);
      setTerritoriesDrawn(null);
      // No shell, so nothing rides one.
      if (scene) liftRiders(scene, 1);
      currentLODRef.current = null;
      firstBuildStartedRef.current = false;
  borderIndexRef.current = null;
      // Disabling the layer removes the meshes any hover/select info referred
      // to — clear the 2D UI layer's state too, or it'd keep showing a country
      // that's no longer rendered.
      if (hoveredTerritoryRef.current) {
        hoveredTerritoryRef.current = null;
        onHoverChange?.(null);
      }
      if (selectedTerritoryRef.current) {
        selectedTerritoryRef.current = null;
        onSelectChange?.(null);
      }
    }
  }, [enabled, scene, onHoverChange, onSelectChange, clearBorderHighlight]);

  // Highlight on hover logic
  useEffect(() => {
    if (!enabled || !scene) return;
    if (!raycasterRef.current) raycasterRef.current = new THREE.Raycaster();
    // pointerRef stays null until a pointer is seen: picking from a pointer that never was, the
    // canvas's middle, hovered the country there on a phone or in a headless browser, its tooltip at
    // the page's corner.

    /** The pointer, where this event puts it on the globe's canvas; null without a canvas. */
    function aimAt(e: PointerEvent): THREE.Vector2 | null {
      const canvasEl = globeCanvas();
      if (!canvasEl) return null;
      const rect = canvasEl.getBoundingClientRect();
      const at = pointerRef.current ?? new THREE.Vector2();
      at.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      pointerRef.current = at;
      return at;
    }

    function onPointerMove(e: PointerEvent) {
      const at = aimAt(e);
      if (!at) return;
      // ID picking: sample under cursor if enabled
      if (idPickEnabledRef.current && idPickingRef.current && cameraRef.current) {
        const canvas = globeCanvas();
        if (canvas) {
          idPickingRef.current.setSizeFromCanvas(canvas);
          // Convert normalized device coords to pixel
          const u = (at.x + 1) / 2; // [0,1]
          const v = (1 - (at.y + 1) / 2); // top-left origin
          lastIdUnderCursorRef.current = idPickingRef.current.getIdAtNormalized(u, v);
          if (idHudElRef.current) {
            idHudElRef.current.textContent = lastIdUnderCursorRef.current ? `ID: ${lastIdUnderCursorRef.current}` : 'ID: —';
          }
        }
      }
    }

    // A press that starts on the globe itself, kept until the pointer comes back up.
    let pressedAt: PointerAt | null = null;

    function onPointerDown(e: PointerEvent) {
      // A country is an area: a report's glyph, or a territory outlined for its reports, takes the click (BA9).
      pressedAt = pressOn(e, globeCanvas(), 'area');
    }

    function onPointerUp(e: PointerEvent) {
      const press = pressedAt;
      pressedAt = null;
      // Only a click on the globe itself picks; see globeClick.ts for both rules.
      const canvasEl = globeCanvas();
      if (!canvasEl || e.target !== canvasEl || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const at = aimAt(e);
      if (!at || !cameraRef.current) return;
      // Selection against territories
      const ray = raycasterRef.current! as THREE.Raycaster & { firstHitOnly?: boolean };
      if (bvhEnabledRef.current) ray.firstHitOnly = true;
      ray.setFromCamera(at, cameraRef.current as THREE.Camera);
      const mesh = territoryMeshOf(territoriesGroupRef.current);
      if (!mesh) return;
      const index = territoryPartAt(ray.intersectObject(mesh, false)[0]);
      setSelection(index === null ? null : { mesh, index });
    }

    /** A finger that lifts is gone, so nothing stays hovered where it was; a mouse is still there. */
    function onPointerEnd(e: PointerEvent) {
      if (e.pointerType === 'touch') pointerRef.current = null;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelection(null);
      }
    }

    /**
     * The country a click a nearer layer took would have picked (BA20), named,
     * with its panel to open: offered to the menu at that click. Picked as a
     * click picks, from the camera through the point.
     */
    const stopOffering = offerCountryAt((at) => {
      const canvasEl = globeCanvas();
      const mesh = territoryMeshOf(territoriesGroupRef.current);
      if (!canvasEl || !mesh || !raycasterRef.current || !cameraRef.current) return null;
      const rect = canvasEl.getBoundingClientRect();
      const ndc = new THREE.Vector2(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1);
      const ray = raycasterRef.current as THREE.Raycaster & { firstHitOnly?: boolean };
      if (bvhEnabledRef.current) ray.firstHitOnly = true;
      ray.setFromCamera(ndc, cameraRef.current as THREE.Camera);
      const index = territoryPartAt(ray.intersectObject(mesh, false)[0]);
      const part: PartRef | null = index === null ? null : { mesh, index };
      const info = countryInfoFromPart(partOf(part));
      return part && info ? { name: info.name ?? info.countryCode, open: () => setSelection(part) } : null;
    });

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    // After onPointerUp, so a tap still picks where it landed.
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      stopOffering();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, scene, config.highlightOnHover, config.territoryColors.opacity, setSelection]);

  // Dev-only HUD to display ID under cursor when geoIdPickingHud=1
  useEffect(() => {
    if (!isDevRuntime()) return;
    if (!enabled) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const hud = params.get('geoIdPickingHud');
      if (!hud) return;
      // Create HUD element
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.bottom = '8px';
      el.style.left = '8px';
      el.style.padding = '4px 8px';
      el.style.background = 'rgba(0,0,0,0.6)';
      el.style.color = '#fff';
      el.style.font = '12px/16px var(--sc-font-text)';
      el.style.borderRadius = '4px';
      el.style.pointerEvents = 'none';
      el.textContent = 'ID: —';
      document.body.appendChild(el);
      idHudElRef.current = el;
      return () => { el.remove(); idHudElRef.current = null; };
    } catch { /* noop */ }
  }, [enabled]);

  // Hover highlight loop (borders + territories) with eased transitions
  useEffect(() => {
    if (!enabled || !scene) return;
    let frame: number;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      // Read every frame: the camera can arrive after this effect first runs.
      const camera = cameraRef.current;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrameTimeRef.current) / 1000); // clamp dt
      lastFrameTimeRef.current = now;
      const dtMs = dt * 1000;

      // The frame budget steps detail down only when quality is left to measure itself, and never while the share
      // handle is in use: a pinned setting is the viewer's word, and a session's cards must match each other.
      if (config.lod?.mode === 'auto' && currentLODRef.current !== null && getGlobeQuality().setting === 'auto' && !shareActive()) {
        const down = noteFrame(frameBudgetRef.current, now, dtMs, currentLODRef.current, buildsUnderWayRef.current > 0);
        if (down !== null) {
          buildForLOD(down, true);
          return;
        }
      }

      if (!raycasterRef.current || !camera) return;
      if (now - lastPickTsRef.current < pickIntervalMs) return;
      lastPickTsRef.current = now;
      // No pointer is a miss: what was hovered clears, and a selection still eases in below.
      const pointer = pointerRef.current;

      // Borders hover using spatial index: compute lon/lat at ray-sphere hit and check nearby segments
      if (config.highlightOnHover) {
  const bordersGroup = bordersGroupRef.current;
  const maritimeGroup = maritimeGroupRef.current;
  const index = borderIndexRef.current;
  if (bordersGroup && index) {
          // Ray-sphere hit at radius ~100, or where the borders ride a raised shell: the
          // place under the pointer is the one drawn there (globe-engine/shellLift.ts).
          const ray = raycasterRef.current;
          const sphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 100 * shellLift());
          const hit = new THREE.Vector3();
          if (pointer) ray.setFromCamera(pointer, camera as THREE.Camera);
          const ok = pointer ? ray.ray.intersectSphere(sphere, hit) : null;
          let hoveredId: string | null = null;
          if (ok) {
            const { lat, lon } = vector3ToLatLon(hit, { flipZ: true });
            hoveredId = queryNearestSegmentId(index, lon, lat, 1);
          }
          if (hoveredId !== highlightedBorderIdRef.current) {
            highlightedBorderIdRef.current = hoveredId;
            clearBorderHighlight();
            const found = hoveredId ? findBatchedLine([bordersGroup, maritimeGroup], String(hoveredId)) : null;
            const home = found?.batch.parent;
            if (found && home?.parent) {
              // Drawn over its batch, a little wider, rather than recoloured inside
              // it: leaving a border then has nothing to restore.
              // Rides the shell with the borders it is drawn over (globe-engine/shellLift.ts).
              const holder = ridesShell(new THREE.Group());
              holder.rotation.copy(home.rotation);
              holder.scale.copy(home.scale);
              holder.add(buildLineHighlight(found.batch, found.line, {
                color: BORDER_HOVER_COLORS[found.line.classification ?? ''] ?? found.line.color,
                opacity: Math.min(1, (config.borderVisibility / 100) + 0.25),
                linewidth: (found.batch.material as THREE.Material & { linewidth: number }).linewidth + 1
              }));
              home.parent.add(holder);
              borderHighlightRef.current = holder;
            }
          }
        }
      }

      // Territories hover using BVH if enabled
      const mesh = territoryMeshOf(territoriesGroupRef.current);
      if (mesh) {
        const ray = raycasterRef.current as THREE.Raycaster & { firstHitOnly?: boolean };
        if (bvhEnabledRef.current) ray.firstHitOnly = true;
        if (pointer) ray.setFromCamera(pointer, camera as THREE.Camera);
        // Where a nearer layer takes the click — a report's glyph, a territory outlined for
        // its reports — the country is not lit up, nor offered as "Click for details" (BA9).
        const hitIndex = nearerLayerTakes('area') || !pointer ? null : territoryPartAt(ray.intersectObject(mesh, false)[0]);
        const hoveredIndex = partIndexIn(mesh, hoveredTerritoryRef.current);
        // Debounced hover switch to reduce flicker on fast moves
        if (hitIndex !== hoveredIndex || (hitIndex === null && hoveredTerritoryRef.current)) {
          if (hitIndex !== null) {
            if (pendingHoverCandidateRef.current !== hitIndex) {
              pendingHoverCandidateRef.current = hitIndex;
              pendingHoverSinceRef.current = now;
            } else if (now - pendingHoverSinceRef.current > 75) { // 75ms stability
              hoveredTerritoryRef.current = { mesh, index: hitIndex };
              onHoverChange?.(countryInfoFromPart(partOf(hoveredTerritoryRef.current)));
            }
          } else {
            // No hit; clear hover
            pendingHoverCandidateRef.current = null;
            if (hoveredTerritoryRef.current) {
              hoveredTerritoryRef.current = null;
              onHoverChange?.(null);
            }
          }
        }
        // Easing: tau is the seconds to ~63% of the way (~150ms to near settle).
        // The brighten/dim blend itself is the fill shader's, per part, read from
        // the batch's state texture (territoryFillMaterial.ts).
        const tau = 0.1;
        const alpha = config.reducedMotion ? 1 : Math.min(1, dt / tau);
        const { motion } = territoryBatchData(mesh)!;
        setTerritoryPartTargets(motion, partIndexIn(mesh, hoveredTerritoryRef.current), partIndexIn(mesh, selectedTerritoryRef.current));
        easeTerritoryParts(motion, alpha);
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled, scene, config.highlightOnHover, config.borderVisibility, config.territoryColors.opacity, config.reducedMotion, config.lod?.mode, clearBorderHighlight, buildForLOD, onHoverChange]);

  // Keep BVH enabled flag in sync with config; if enabling at runtime, try to enable on existing group
  useEffect(() => {
    const desired = !!config?.bvhPicking;
    if (bvhEnabledRef.current !== desired) {
      bvhEnabledRef.current = desired;
      if (desired && territoriesGroupRef.current) {
        // Best-effort enable; ignore if fails
        enableBVHForGroup(territoriesGroupRef.current).catch(() => {
          bvhEnabledRef.current = false;
        });
      }
    }
  }, [config?.bvhPicking]);

  return { loading, error, bordersGroup: bordersGroupRef.current, maritimeGroup: maritimeGroupRef.current, territoriesGroup: territoriesGroupRef.current, currentLOD: currentLODRef.current };
}
