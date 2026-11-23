/**
 * Planet lines on the globe (decision D-PW, build step 4, PW20–PW22; Mecha Jono's kit v0, PsiLines): for the sky
 * event open in Psi Watch's panel, each of its bodies' four lines, where it stands overhead (MC) and underfoot (IC),
 * and where it rises (ASC) and sets (DSC), at the event's exact moment or at the shared cursor inside its window.
 * One aqua: the MC solid, the IC dashed, the ASC and DSC thinner; each labelled with its body and angle near 40°N,
 * clear of the other labels, and in its hover. Computed in the browser from astronomy-engine, checked against the kit's vectors.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { latLonToVector3 } from '../../../geopolitical/utils/latLonToVector3';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { splitGroup, type SplitSide } from '../../../globe-engine/splitView';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { SURFACE_LINES } from '../globeAltitudes';
import { DATA_SCALES, FONTS, GUNMETAL } from '../../../styles/tokens';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { ASTRO_BODIES, type AstroBody } from '../../../services/psiWatch/astro/sky';
import { labelPlaces, linesMoment, planetLinesAt, type GlobePoint, type LineAngle, type PlanetLine } from '../../../services/psiWatch/astro/lineGeometry';
import { bandRibbons, paransAt, type Paran, type Ribbon } from '../../../services/psiWatch/astro/lineBands';
import { setPsiLinesDrawn, usePsiLines } from '../../../services/psiWatch/psiLinesStore';
import { useLayerChoice } from '../../../features/globe/rail/layerChoices';

const GLOBE_RADIUS_UNITS = 100;
const LINE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
const HUE = DATA_SCALES.psiWatch;
const COLOR = parseInt(HUE.slice(1), 16);
/** How this layer's group is found by a probe or a test. */
export const PSI_LINES_TYPE = 'psiLines';

/** Each angle's stroke (PW22): the MC solid, the IC dashed, the horizon curves thinner. */
export const PSI_LINE_LOOKS: Record<LineAngle, LineLook> = {
  MC: { opacity: 0.95, linewidth: 2, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 112 },
  IC: { opacity: 0.9, linewidth: 2, dashed: true, dashSize: 1.6, gapSize: 1.1, dashScale: 1, renderOrder: 112 },
  ASC: { opacity: 0.85, linewidth: 1.25, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 111 },
  DSC: { opacity: 0.85, linewidth: 1.25, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 111 },
};

/** How faint a line's band and a paran's ring are (PW84): the lines stand out, the bands only show where. */
export const BAND_OPACITY = 0.1;
export const PARAN_OPACITY = 0.08;
/** A paran's ring, degrees of longitude between its rows. */
const PARAN_STEP_DEG = 4;
/** Where a paran's label stands from its crossing: above its ring and east of the meridian through it, degrees. */
export const PARAN_LABEL_LIFT_DEG = 1.5;
export const PARAN_LABEL_EAST_DEG = 3;

/** A ribbon of rows (each row its two edges) as a translucent mesh on the lines' shell, saying `tooltip` on a hover. */
function ribbonMesh(rows: ReadonlyArray<readonly [GlobePoint, GlobePoint]>, opacity: number, tooltip: string, type: string): THREE.Mesh {
  const positions: number[] = [];
  const push = (p: GlobePoint) => { const v = toScene(p.lat, p.lng); positions.push(v.x, v.y, v.z); };
  for (let k = 0; k + 1 < rows.length; k += 1) {
    const [a, b] = rows[k];
    const [c, d] = rows[k + 1];
    push(a); push(b); push(c);
    push(b); push(d); push(c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  mesh.renderOrder = 110;
  mesh.userData = { type, tooltip };
  return mesh;
}

/** A paran's ring of latitude: its half width either side of its latitude, round the globe. */
function paranRows(paran: Paran): Array<[GlobePoint, GlobePoint]> {
  const rows: Array<[GlobePoint, GlobePoint]> = [];
  for (let lng = -180; lng <= 180; lng += PARAN_STEP_DEG) {
    rows.push([{ lat: paran.lat - paran.halfWidthDeg, lng }, { lat: paran.lat + paran.halfWidthDeg, lng }]);
  }
  return rows;
}

/** A label's height on screen, as a share of the view's height. */
const LABEL_SCREEN_HEIGHT = 0.022;

/** A point on the lines' shell, in this layer's frame (turned by the scene's counter-offset, as the other line layers are). */
export const toScene = (lat: number, lng: number): THREE.Vector3 => {
  const v = latLonToVector3(lat, lng, { radius: GLOBE_RADIUS_UNITS, elevation: LINE_ELEVATION, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z);
};

function labelSprite(text: string): THREE.Sprite {
  const ratio = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  const fontPx = 13 * ratio;
  const ctx = canvas.getContext('2d');
  const font = `600 ${fontPx}px ${FONTS.data}`;
  const width = Math.ceil((ctx ? (ctx.font = font, ctx.measureText(text).width) : text.length * fontPx * 0.6) + 10 * ratio);
  const height = Math.ceil(fontPx * 1.5);
  canvas.width = width;
  canvas.height = height;
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * ratio;
    // The globe's own ground, at 85%, as a halo under the letters.
    ctx.strokeStyle = `${GUNMETAL[950]}D9`;
    ctx.strokeText(text, 5 * ratio, height / 2);
    ctx.fillStyle = HUE;
    ctx.fillText(text, 5 * ratio, height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set((LABEL_SCREEN_HEIGHT * width) / height, LABEL_SCREEN_HEIGHT, 1);
  sprite.center.set(0, 0.5);
  sprite.renderOrder = 113;
  sprite.userData = { type: 'psiLineLabel', text };
  return sprite;
}

function clear(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
  group.clear();
}

export interface UseGlobePsiLinesOptions {
  scene: THREE.Scene | null;
  active: boolean;
  /** The shared cursor, ms. */
  cursorMs: number;
  /** Side by side (PW73): the half this copy draws in, now's or the cursor's; absent or null, the whole globe. */
  split?: SplitSide | null;
}

export interface PsiLinesOnGlobe {
  /** The lines drawn, for the panel, a probe or a test. */
  lines: PlanetLine[];
  /** The moment they stand at, ms; null when none are drawn. */
  at: number | null;
}

export function useGlobePsiLines({ scene, active, cursorMs, split }: UseGlobePsiLinesOptions): PsiLinesOnGlobe {
  const { m } = useMessages();
  const words = m.psiWatch.lines;
  const { event, allBodies } = usePsiLines();
  // Each line's orb and the event's parans (PW59, PW81–PW84): the rail's two switches, both on by default.
  const bandsOn = useLayerChoice('PsiLines', 'psi:bands', true);
  const paransOn = useLayerChoice('PsiLines', 'psi:parans', true);
  const cursor = Math.floor(cursorMs / 1000);
  const at = useMemo(() => (active && event ? linesMoment(event, cursor) : null), [active, event, cursor]);
  // The lines move by the minute: no finer, so a running clock does not rebuild them every second.
  const minute = at === null ? null : Math.floor(at.getTime() / 60_000);
  const bodies: readonly AstroBody[] = allBodies ? ASTRO_BODIES : (event?.bodies ?? []);
  const bodiesKey = bodies.join(',');
  const lines = useMemo(
    () => (minute === null ? [] : planetLinesAt(new Date(minute * 60_000), bodies)),
    // bodiesKey stands for bodies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, bodiesKey],
  );
  const ribbons = useMemo<Ribbon[]>(
    () => (minute === null || !bandsOn ? [] : bandRibbons(new Date(minute * 60_000), bodies)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, bodiesKey, bandsOn],
  );
  // Parans are the event's own bodies', however many bodies' lines are drawn (PW81).
  const eventBodiesKey = (event?.bodies ?? []).join(',');
  const parans = useMemo<Paran[]>(
    () => (minute === null || !paransOn || !event ? [] : paransAt(new Date(minute * 60_000), event.bodies)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, eventBodiesKey, paransOn],
  );
  // What is drawn, for the inspector's "on a band" (PW83): the moment and the bodies, while the lines stand.
  useEffect(() => {
    if (minute === null || !bodies.length || split === 'now') return undefined;
    setPsiLinesDrawn({ at: minute * 60_000, bodies: [...bodies], bands: bandsOn });
    return () => setPsiLinesDrawn(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, bodiesKey, bandsOn, split]);

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_LINES_TYPE };
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

  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!lines.length || minute === null) return undefined;
    const when = formatUtcDateTime(minute * 60_000);
    const bodyName = (body: AstroBody) => (words.bodies as Record<string, string>)[body] ?? body;
    const paths = lines.flatMap((line) => line.paths.map((path, i) => {
      const positions: number[] = [];
      for (const point of path) {
        const v = toScene(point.lat, point.lng);
        positions.push(v.x, v.y, v.z);
      }
      return {
        id: `psi-line:${line.body}:${line.angle}:${i}`,
        positions,
        color: COLOR,
        look: PSI_LINE_LOOKS[line.angle],
        tooltip: fill(words.tooltips[line.angle], { body: bodyName(line.body), time: when }),
      };
    }));
    const batches = buildLineBatches(paths);
    const labels = new THREE.Group();
    labelPlaces(lines).forEach((place, i) => {
      if (!place) return;
      const sprite = labelSprite(`${bodyName(lines[i].body)} ${lines[i].angle}`);
      sprite.position.copy(toScene(place.lat, place.lng));
      labels.add(sprite);
    });
    // Each line's band, its orb either side (PW82), and each paran's ring of latitude named for its pair (PW81).
    const bands = new THREE.Group();
    for (const ribbon of ribbons) {
      bands.add(ribbonMesh(ribbon.rows, BAND_OPACITY, fill(words.tooltips[ribbon.angle], { body: bodyName(ribbon.body), time: when }), 'psiLineBand'));
    }
    const latWords = (lat: number) => `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'N' : 'S'}`;
    for (const paran of parans) {
      const say = { a: bodyName(paran.a.body), angleA: paran.a.angle, b: bodyName(paran.b.body), angleB: paran.b.angle };
      bands.add(ribbonMesh(paranRows(paran), PARAN_OPACITY, fill(words.paranTooltip, { ...say, lat: latWords(paran.lat), time: when }), 'psiParan'));
      const sprite = labelSprite(`${say.a} ${say.angleA} · ${say.b} ${say.angleB}`);
      // Just clear of the crossing, above its ring and east of the meridian, so it never sits on a line's own label.
      sprite.position.copy(toScene(Math.min(85, paran.lat + paran.halfWidthDeg + PARAN_LABEL_LIFT_DEG), paran.lng + PARAN_LABEL_EAST_DEG));
      labels.add(sprite);
    }
    group.add(bands, batches, labels);
    return () => clear(group);
  }, [lines, ribbons, parans, minute, words]);

  useEffect(() => {
    // Side by side: the cursor's copy keys the layer, as a card draws it; now's leaving must not take its key away.
    if (!lines.length || split === 'now') return undefined;
    publishLegend('PsiLines', {
      layerId: 'PsiLines',
      layer: words.legendLayer,
      shapeMeans: [words.legendMeans, ribbons.length ? words.bandsMeans : null, parans.length ? words.paransMeans : null].filter(Boolean).join('; '),
      swatches: [
        { color: HUE, label: words.legendSwatch, shape: 'line' },
        ...(ribbons.length ? [{ color: `${HUE}66`, label: words.bandsSwatch, shape: 'area' }] : []),
        ...(parans.length ? [{ color: `${HUE}4D`, label: words.paranSwatch, shape: 'area' }] : []),
      ],
    });
    return () => publishLegend('PsiLines', null);
  }, [lines.length, ribbons.length, parans.length, words, split]);

  return { lines, at: at === null ? null : at.getTime() };
}
