/**
 * Psi Watch's places on the globe (decision D-PW, build step 5, PW32–PW33; Mecha Jono's kit v0), three ways: what
 * stands on the ground in violet, the sky's windows in aqua (PW66). Psi Alerts (PsiRifts): the Zone's edge drawn bright, the merge glyph at its middle, while the alert
 * holds. Windows (PsiWindows): the Zone filled, as strongly as the window's curve stands at the shared cursor, so it
 * swells and fades with the scrubber. Tested places (PsiZones): a thin dotted edge, nothing filled: where a
 * registered test looked, its result in the hover. Nothing but the Experimental badge qualifies any of it (PW34).
 * A retired 1.0 Zone is drawn as the Zones that now hold it, and its hover says so (psiPlaces.ts). A span brushed on
 * the Timestream (PW50) lights what touches it; what lies outside is drawn at a third of its strength.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GeometryFactory } from '../../../geopolitical/geometry/geometryFactory';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { splitGroup, type SplitSide } from '../../../globe-engine/splitView';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { LIT_FILL_ELEVATION } from '../litTerritory';
import { bakeSvgAtlas } from '../intelReportSprites';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { GLYPHS } from '../../../symbols/uiSymbols';
import { iconMarkup } from '../../../symbols/symbolRegistry';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { labelOf } from '../../../geopolitical/zones/zsp';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import { psiPlacesAt, type PsiPlace, type PsiPlaceLayer, type PsiPlaces } from '../../../services/psiWatch/psiPlaces';
import { usePsiKit } from '../../PsiWatch/usePsiKit';
import { useBrush } from '../../../services/psiWatch/timestream/brush';
import { toScene } from './useGlobePsiLines';

/** The sky's aqua for windows; the ground's violet for alerts and tested places (PW66). */
const SKY_HUE = DATA_SCALES.psiWatch;
const GROUND_HUE = DATA_SCALES.psiGround;
const hueOf = (layer: PsiPlaceLayer) => (layer === 'PsiWindows' ? SKY_HUE : GROUND_HUE);
const colorOf = (layer: PsiPlaceLayer) => parseInt(hueOf(layer).slice(1), 16);
/** How this layer's group is found by a probe or a test. */
export const PSI_ZONES_TYPE = 'psiZones';
/** A window's fill at its peak; it fades with the curve to nothing. */
export const WINDOW_PEAK_OPACITY = 0.32;
/** What lies outside a brushed span, drawn at this share of its strength (PW50). */
export const DIMMED = 0.35;
const strength = (p: PsiPlace) => (p.dim ? DIMMED : 1);

/** An alert's edge, bright, over the borders and the planet lines; a tested place's, thin and dotted (PW32). */
export const PSI_ZONE_LOOKS: Record<'PsiRifts' | 'PsiZones', LineLook> = {
  PsiRifts: { opacity: 1, linewidth: 3, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 121 },
  PsiZones: { opacity: 0.95, linewidth: 1.5, dashed: true, dashSize: 0.9, gapSize: 0.9, dashScale: 1, renderOrder: 110 },
};

/** The glyph's height on screen, as a share of the view's height. */
const GLYPH_SCREEN_HEIGHT = 0.03;

/** The merge glyph on a dark disc ringed in violet, as a standalone SVG for the atlas. */
export function alertGlyphSvg(): string {
  const icon = GLYPHS['layer:PsiRifts'].icon;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    + `<circle cx="32" cy="32" r="28" fill="${GUNMETAL[950]}" fill-opacity="0.85" stroke="${GROUND_HUE}" stroke-width="3.5"/>`
    + iconMarkup(icon, { x: 16, y: 16, size: 32, stroke: 2.5, colour: GROUND_HUE })
    + '</svg>';
}

let glyphTexture: Promise<THREE.Texture | null> | null = null;
const alertGlyph = (): Promise<THREE.Texture | null> => (glyphTexture ??= bakeSvgAtlas([[alertGlyphSvg()]]).then((texture) => {
  // The atlas is unflipped for point sprites, whose texture origin is the top row; a Sprite's is the bottom.
  if (texture) { texture.flipY = true; texture.needsUpdate = true; }
  return texture;
}));

const polygonsOf = (geometry: PolygonGeometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

/** Every ring of a place, as positions on the lines' shell. */
export function ringPaths(geometry: PolygonGeometry): number[][] {
  return polygonsOf(geometry).flatMap((rings) => rings.filter((ring) => ring.length >= 3).map((ring) => {
    const positions: number[] = [];
    for (const [lng, lat] of ring) {
      const v = toScene(lat, lng);
      positions.push(v.x, v.y, v.z);
    }
    return positions;
  }));
}

function clear(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // Fills share their geometry with GeometryFactory's cache; their materials are this layer's own copies.
    if (!(mesh.isMesh && mesh.userData.psiWindow)) mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  group.clear();
}

export interface UseGlobePsiZonesOptions {
  scene: THREE.Scene | null;
  active: Readonly<Record<PsiPlaceLayer, boolean>>;
  /** The shared cursor, ms. */
  cursorMs: number;
  /** Side by side (PW73): the half this copy draws in, now's or the cursor's; absent or null, the whole globe. */
  split?: SplitSide | null;
}

export function useGlobePsiZones({ scene, active, cursorMs, split }: UseGlobePsiZonesOptions): PsiPlaces {
  const { m } = useMessages();
  const words = m.psiWatch.places;
  const anyOn = active.PsiRifts || active.PsiWindows || active.PsiZones;
  const { fixtures } = usePsiKit(anyOn);
  const [shapes, setShapes] = useState<AreaShapes | undefined>(undefined);
  useEffect(() => {
    if (!anyOn || shapes) return undefined;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setShapes(loaded); });
    return () => { live = false; };
  }, [anyOn, shapes]);

  const cursor = Math.floor(cursorMs / 1000);
  const brush = useBrush();
  const layersKey = `${active.PsiRifts}${active.PsiWindows}${active.PsiZones}`;
  const drawn = useMemo(() => {
    const layers = new Set<PsiPlaceLayer>((['PsiRifts', 'PsiWindows', 'PsiZones'] as const).filter((layer) => active[layer]));
    const span = brush ? { from: brush.fromMs / 1000, until: brush.untilMs / 1000 } : null;
    return psiPlacesAt(fixtures, cursor, shapes, layers, span);
    // layersKey stands for active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures, cursor, shapes, layersKey, brush]);
  // What is drawn, apart from how strongly: the meshes are rebuilt only when this changes.
  const shapeKey = drawn.places.map((p) => `${p.layer}|${p.address}|${p.code}|${p.dim ? 1 : 0}`).join('\n');

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_ZONES_TYPE };
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

  const sayOf = useMemo(() => {
    const retired = (p: PsiPlace) => (p.retiredInto ? ` ${counted(words.retired, p.retiredInto, { place: p.name })}.` : '');
    return (p: PsiPlace, at: number): string => {
      switch (p.layer) {
        case 'PsiRifts':
          return (p.until !== undefined ? fill(words.alert, { title: p.title, time: formatUtcDateTime(p.until * 1000) }) : p.title) + retired(p);
        case 'PsiWindows':
          return fill(words.window, { title: p.title, share: Math.round((p.weight ?? 0) * 100), time: formatUtcDateTime(at * 1000) }) + retired(p);
        default:
          return (p.result
            ? fill(words.tested, { registration: p.result.registration, place: p.name, rr: p.result.rr, p: p.result.p })
            : p.title) + retired(p);
      }
    };
  }, [words]);

  // Build: an alert's edge and glyph, a window's fill, a tested place's dotted edge.
  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!drawn.places.length) return undefined;
    let live = true;
    const lines = drawn.places.filter((p) => p.layer !== 'PsiWindows').flatMap((p) => ringPaths(p.geometry).map((positions, i) => ({
      id: `psi-zone:${p.layer}:${p.address}:${p.code}:${i}`,
      positions,
      color: colorOf(p.layer),
      look: p.dim ? { ...PSI_ZONE_LOOKS[p.layer as 'PsiRifts' | 'PsiZones'], opacity: PSI_ZONE_LOOKS[p.layer as 'PsiRifts' | 'PsiZones'].opacity * DIMMED }
        : PSI_ZONE_LOOKS[p.layer as 'PsiRifts' | 'PsiZones'],
      tooltip: sayOf(p, cursor),
    })));
    if (lines.length) group.add(buildLineBatches(lines));
    for (const p of drawn.places.filter((place) => place.layer === 'PsiWindows')) {
      const fills = GeometryFactory.buildTerritoryPolygons(
        polygonsOf(p.geometry).flatMap((rings, i) => (rings[0] && rings[0].length >= 3
          ? [{ id: `psi-window:${p.address}:${p.code}#${i}`, rings: rings as [number, number][][] }] : [])),
        { color: colorOf('PsiWindows'), opacity: WINDOW_PEAK_OPACITY * (p.weight ?? 0) * strength(p), elevation: LIT_FILL_ELEVATION },
      );
      fills.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = (mesh.material as THREE.Material).clone();
        mesh.userData = { ...mesh.userData, psiWindow: `${p.address}|${p.code}`, tooltip: sayOf(p, cursor) };
      });
      group.add(fills);
    }
    const alerts = drawn.places.filter((p) => p.layer === 'PsiRifts');
    if (alerts.length) {
      void alertGlyph().then((texture) => {
        if (!live || !texture) return;
        for (const p of alerts) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false, opacity: strength(p) }));
          sprite.scale.set(GLYPH_SCREEN_HEIGHT, GLYPH_SCREEN_HEIGHT, 1);
          sprite.renderOrder = 122;
          const at = labelOf(p.geometry);
          sprite.position.copy(toScene(at.lat, at.lon));
          sprite.userData = { type: 'psiAlertGlyph', code: p.code };
          group.add(sprite);
        }
      });
    }
    return () => { live = false; clear(group); };
    // shapeKey stands for drawn.places' identity; their strength is set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey, sayOf]);

  // Each window's strength and words at the cursor, without rebuilding it.
  useEffect(() => {
    const byKey = new Map(drawn.places.filter((p) => p.layer === 'PsiWindows').map((p) => [`${p.address}|${p.code}`, p]));
    groupRef.current.traverse((child) => {
      const key = child.userData.psiWindow as string | undefined;
      const p = key ? byKey.get(key) : undefined;
      if (!p) return;
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = WINDOW_PEAK_OPACITY * (p.weight ?? 0) * strength(p);
      child.userData.tooltip = sayOf(p, cursor);
    });
  }, [drawn, cursor, sayOf]);

  const shownLayers = [...new Set(drawn.places.map((p) => p.layer))].sort().join(',');
  useEffect(() => {
    const legends: Record<PsiPlaceLayer, [string, string, string, 'line' | 'area']> = {
      PsiRifts: [words.legendAlerts, words.legendAlertsMeans, words.swatchAlert, 'line'],
      PsiWindows: [words.legendWindows, words.legendWindowsMeans, words.swatchWindow, 'area'],
      PsiZones: [words.legendTested, words.legendTestedMeans, words.swatchTested, 'line'],
    };
    // Side by side: the cursor's copy keys the layers, as a card draws them; now's leaving must not take their keys away.
    const shown = shownLayers && split !== 'now' ? (shownLayers.split(',') as PsiPlaceLayer[]) : [];
    for (const layer of shown) {
      const [name, means, swatch, shape] = legends[layer];
      publishLegend(layer, { layerId: layer, layer: name, shapeMeans: means, swatches: [{ color: hueOf(layer), label: swatch, shape }] });
    }
    return () => { for (const layer of shown) publishLegend(layer, null); };
  }, [shownLayers, words, split]);

  return drawn;
}
