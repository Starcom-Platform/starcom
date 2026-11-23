/**
 * The Intel Report marks on the globe (decision D-F, step 6, part 4).
 *
 * One batched sprite layer in place of one GLB model per report. See
 * intelReportSprites.ts for why sprites, and intelVariant.ts for what decides
 * which of the four a report is drawn as.
 *
 * ─── THIS LAYER IS ALSO WHAT A PERSON CLICKS ───────────────────────────────
 *
 * It began as artwork only, with the hidden GLB meshes still doing the picking.
 * That left the thing you see at altitude 1.030 and the thing you click at
 * 1.000, and a mesh per report still built for no other reason. Now the Points
 * object is the pick target: `pickLayer` goes to Enhanced3DGlobeInteractivity,
 * which raycasts it and asks `reportAt` what it hit.
 *
 * What three.js can and cannot do here: a THREE.Points is raycast against a
 * world-space sphere around each point, with no knowledge that the mark is
 * drawn at a fixed pixel size. So the clickable area approximates the glyph
 * rather than matching its outline — see INTEL_SPRITE_PICK_THRESHOLD_UNITS,
 * which is the figure the tooltip system already uses, deliberately.
 *
 * ─── WHY THERE ARE STILL OBJECTS PER REPORT, AND WHAT THEY COST ────────────
 *
 * `useModelScreenProjection` places the popup over a mark, and it takes objects
 * with a `mesh` to project. Rather than churn an ADR-extracted hook whose
 * behaviour is deliberately preserved, this publishes a bare THREE.Object3D per
 * report — a transform node. No geometry, no material, no draw call, no raycast
 * target. That is what remains of "a mesh, a raycast target and a draw call
 * each", and the GLB is not fetched at all while the sprites work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { REPORT_SPRITES } from '../globeAltitudes';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { intelVariantOf } from '../intelVariant';
import { categorySymbolOf, reportCategoryOf } from '../../../services/intel/reportCategory';
import {
  bakeIntelSpriteAtlas, bakeEmblemAtlas, buildIntelSprites, disposeIntelSprites, setIntelSpriteHovered,
  INTEL_SPRITE_TYPE, type IntelSpriteMark,
  spriteGlyphFill, SPRITE_GLYPH_MEANING, type SpriteGlyph,
  bakeBadgeAtlas, buildPlaceBadges, STYLED_GLYPH_SCALE, EMBLEM_SYMBOLS,
} from '../intelReportSprites';
import type { SymbolEntry } from '../../../symbols/symbolRegistry';
import { groupReportsByPlace, type ReportPlace } from '../reportPlaces';
import { buildPrecisionAreas, disposePrecisionAreas, INTEL_AREA_TYPE } from '../precisionAreas';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import { publishLegend } from '../../../services/globe/globeLegendStore';

/**
 * Legend ids for the glyphs. Not 'IntelReports' — the analysis marks publish
 * under that — and not 'IntelReports:reports', which the pins use when they are
 * the fallback drawn in place of the glyphs.
 */
const REPORT_MARKS_LEGEND = 'IntelReports:marks';
const RLSH_MARKS_LEGEND = 'RLSH:marks';
import { markerTimeMs, type IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { isFromEarlierSession, SESSION_STARTED_AT_MS } from '../earlierSession';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const GLOBE_RADIUS_UNITS = 100;

/** A place's earliest stated report time, or null when none states one. */
function earliestTimeOf(place: ReportPlace): number | null {
  const times = place.reports.map((r) => markerTimeMs(r)).filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}

/**
 * How big a report's glyph is on screen, in CSS pixels.
 *
 * Fixed, like every other mark on this globe: the models it replaces were sized
 * in globe units and shrank to nothing when zoomed out. 26 px is large enough
 * for the four glyphs to be told apart by shape — which is the whole point of
 * having four — and the layer audit's floor for a legible mark is 8.
 */
const REPORT_GLYPH_PX = 26;

/**
 * How big the whole mark is: the glyph plus its style's backing.
 *
 * The glyph is drawn at STYLED_GLYPH_SCALE of its cell, so the mark grows to
 * keep the glyph itself at 26 px — the size its shapes were judged at. Chosen
 * over keeping the footprint on the review page of 2026-09-25: at 26 px overall
 * a glyph inside a ring is crowded to about 19.
 */
export const REPORT_SPRITE_PX = Math.round(REPORT_GLYPH_PX / STYLED_GLYPH_SCALE);

/** How solid a mark drawn from storage is, against 1 for one that arrived live. */
export const EARLIER_SESSION_OPACITY = 0.45;

/**
 * A featured report's place, drawn this much larger (decision D-F, section 18,
 * item 2), and every other place dimmed to this — so an image says which mark
 * a post is about even where its label has been cropped away.
 */
export const FEATURED_SCALE = 1.4;
export const FEATURED_OTHERS_OPACITY = 0.35;

/**
 * Whether the glyphs could be rasterised.
 *
 * Three states: `pending` while the SVGs decode, when nothing draws yet; `ready`, the
 * glyphs; `unavailable`, plain shapes in the glyphs' colours (buildIntelSprites). The
 * shapes replaced 3D models that were fetched for this case alone (retired 2026-10-08).
 */
export type IntelSpriteAtlasState = 'pending' | 'ready' | 'unavailable';

/**
 * The atlas, baked once per session.
 *
 * Module-level rather than per-hook: the texture is identical for every caller
 * and rasterising it four times would upload four copies. A failed bake caches
 * its failure and is not retried — it fails for a reason that will not change
 * inside a session, and retrying every render would be a loop.
 */
let atlasPromise: Promise<THREE.Texture | null> | null = null;
function sharedAtlas(): Promise<THREE.Texture | null> {
  if (!atlasPromise) atlasPromise = bakeIntelSpriteAtlas();
  return atlasPromise;
}

/** The count badges' atlas, baked once per session like the glyphs'. */
let badgeAtlasPromise: Promise<THREE.Texture | null> | null = null;
function sharedBadgeAtlas(): Promise<THREE.Texture | null> {
  if (!badgeAtlasPromise) badgeAtlasPromise = bakeBadgeAtlas();
  return badgeAtlasPromise;
}

/** The category emblems' masks (BA14), baked once per session, and only once someone wants them. */
let emblemAtlasPromise: Promise<THREE.Texture | null> | null = null;
function sharedEmblemAtlas(): Promise<THREE.Texture | null> {
  if (!emblemAtlasPromise) emblemAtlasPromise = bakeEmblemAtlas();
  return emblemAtlasPromise;
}

/** Test-only: forget the cached atlases so a case can supply its own. */
export function resetIntelSpriteAtlasForTests(): void {
  atlasPromise = null;
  badgeAtlasPromise = null;
  emblemAtlasPromise = null;
}

/** What `useModelScreenProjection` needs to place a popup over a mark. */
export interface ProjectableIntelMark {
  mesh: THREE.Object3D;
  report: IntelReportOverlayMarker;
}

export interface UseGlobeIntelSpritesOptions {
  scene: THREE.Scene | null;
  enabled: boolean;
  reports: readonly IntelReportOverlayMarker[];
  /** False stops the marks moving; the OS reduced-motion preference applies too. */
  animate?: boolean;
  /** The report under the pointer, which is drawn larger. */
  hoveredReportId?: string | null;
  /**
   * When this session began. Reports received before it are drawn faded.
   *
   * An option only so a test can state it; in the app it is when the page
   * loaded.
   */
  sessionStartedAtMs?: number;
  /**
   * How the person chose to draw each layer (decision D-F, step 6). Intel
   * Reports and RLSH are resolved separately, because this layer draws both and
   * a choice made for one must not restyle the other.
   */
  markerStyles?: MarkerStyleChoices;
  /** The report chosen to feature in a capture (featuredReportStore), or null. */
  featuredReportId?: string | null;
  /**
   * Whether the featured report is drawn by this layer's other surface: a report
   * about a territory as a whole, lit as its territory (BA3). Every place here
   * then dims, as it does around a featured glyph, or the glyphs over a small
   * territory would hide it.
   */
  featuredElsewhere?: boolean;
  /**
   * Whether each glyph wears its category's emblem (BA12–BA15): its lead report's
   * stated category, inside a page that keeps its colour for the assessment.
   */
  categoryEmblems?: boolean;
}

export function useGlobeIntelSprites({
  scene, enabled, reports, animate = true, hoveredReportId = null,
  sessionStartedAtMs = SESSION_STARTED_AT_MS, markerStyles, featuredReportId = null, featuredElsewhere = false,
  categoryEmblems = false,
}: UseGlobeIntelSpritesOptions) {
  const intelStyle = resolveMarkerStyle(markerStyles, 'IntelReports');
  const rlshStyle = resolveMarkerStyle(markerStyles, 'RLSH');
  const groupRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  const [atlasSettled, setAtlasSettled] = useState(false);

  // Hoverable through the shared registry, for the group's lifetime.
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('IntelReports', groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  const [badgeAtlas, setBadgeAtlas] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let live = true;
    void sharedAtlas().then((texture) => {
      if (!live) return;
      setAtlas(texture);
      setAtlasSettled(true);
    });
    // The badges are an addition: without them a crowded place still draws, and
    // its tooltip still says how many are there.
    void sharedBadgeAtlas().then((texture) => { if (live) setBadgeAtlas(texture); });
    return () => { live = false; };
  }, []);

  // The emblems are an addition too: without their masks every glyph draws as it always did.
  const [emblemAtlas, setEmblemAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!categoryEmblems) return;
    let live = true;
    void sharedEmblemAtlas().then((texture) => { if (live) setEmblemAtlas(texture); });
    return () => { live = false; };
  }, [categoryEmblems]);

  useEffect(() => {
    const group = groupRef.current;
    if (!scene) return;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  /*
   * Memoised because `reportAt` and the effects below key on it, and a fresh
   * [] every render would rebuild the layer on every render of the globe —
   * which is the identity trap useScreenMarkLayer documents at length.
   */
  const drawn = useMemo(
    () => (enabled && atlasSettled ? reports : []),
    [enabled, atlasSettled, reports],
  );

  /*
   * The transform nodes the popup is positioned against. Keyed on the drawn
   * list so index i here is index i in the geometry and in `reportAt`.
   */
  const marks = useMemo<ProjectableIntelMark[]>(() => drawn.map((report) => {
    const node = new THREE.Object3D();
    node.position.copy(latLngToGlobeWorld(report.latitude, report.longitude, GLOBE_RADIUS_UNITS * REPORT_SPRITES));
    return { mesh: node, report };
  }), [drawn]);

  /*
   * One glyph per place (decision D-F, section 18, item 1.2). Index i of the
   * geometry, of `reportAt` and of the hover is place i; the transform nodes
   * above stay one per report, because the popup pages through reports.
   */
  const places = useMemo<ReportPlace[]>(() => groupReportsByPlace(drawn), [drawn]);

  useEffect(() => {
    const group = groupRef.current;
    const clear = () => {
      for (const child of [...group.children]) {
        group.remove(child);
        if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
        if (child.userData?.type === INTEL_AREA_TYPE) disposePrecisionAreas(child as THREE.Group);
      }
    };
    clear();
    if (drawn.length === 0) {
      publishLegend(REPORT_MARKS_LEGEND, null);
      publishLegend(RLSH_MARKS_LEGEND, null);
      return;
    }

    /*
     * A person for an RLSH entity, one of the four documents for a report.
     *
     * Both are drawn because RLSH has no other mark — useGlobeRLSH fetches them
     * and draws nothing, and this layer is also what the interaction layer
     * picks, so leaving them out took away their glyph AND their click. What
     * separates them is the shape, not the layer: an intel-report document
     * asserts that someone filed a report, and an RLSH person is not that.
     *
     * The kind comes from reportPlaces, which reads it through markerKind:
     * absent means intel, so a bare `kind === 'intel'` silently misses every
     * marker written before RLSH existed.
     */
    /*
     * A mark received before this session began is faded, so a capture shows
     * which part of the picture is stale even where the note explaining it is
     * cropped away. The rule lives in earlierSession.ts because the report notes
     * count the same marks, and a note that disagrees with the marks is worse
     * than no note.
     */
    const opacityOf = (place: ReportPlace) =>
      // A place is solid if anything there arrived this session: the live
      // report is the one a reader should not mistake for stale.
      Math.max(...place.reports.map((r) => (isFromEarlierSession(r, sessionStartedAtMs) ? EARLIER_SESSION_OPACITY : 1)));
    const positionOf = (place: ReportPlace) =>
      latLngToGlobeWorld(place.latitude, place.longitude, GLOBE_RADIUS_UNITS * REPORT_SPRITES);

    /*
     * The featured place, when one is chosen and drawn. Never an RLSH place: a
     * person is not featured in a post. When the chosen report is not on the
     * globe nothing is dimmed, because dimming everything to feature nothing
     * would be a picture of no report at all.
     */
    const featuredIndex = featuredReportId === null ? -1 : places.findIndex((place) => place.kind !== 'rlsh'
      && place.reports.some((r) => r.pubkey === featuredReportId));
    const featuring = featuredIndex >= 0 || featuredElsewhere;
    const emphasis = (i: number) => (!featuring ? { size: 1, opacity: 1 }
      : i === featuredIndex ? { size: FEATURED_SCALE, opacity: 1 } : { size: 1, opacity: FEATURED_OTHERS_OPACITY });

    const spriteMarks: IntelSpriteMark[] = places.map((place, i) => ({
      position: positionOf(place),
      sizePx: REPORT_SPRITE_PX * emphasis(i).size,
      variant: place.kind === 'rlsh' ? 'rlsh' : intelVariantOf(place.lead),
      style: place.kind === 'rlsh' ? rlshStyle : intelStyle,
      opacity: opacityOf(place) * emphasis(i).opacity,
      // In a replay a place appears with its earliest report. RLSH is not a
      // report and has no report time: shown throughout.
      timeMs: place.kind === 'rlsh' ? null : earliestTimeOf(place),
      tooltip: place.count === 1 ? place.lead.title : `${place.lead.title} and ${place.count - 1} more here`,
      // The category the place's drawn report states (BA13): a person states none. Worn only
      // while the setting is on, which decides whether the emblems' masks are passed below.
      emblem: place.kind !== 'rlsh' ? categorySymbolOf(reportCategoryOf(place.lead.tags)) : null,
    }));

    const emblemsDrawn = categoryEmblems && emblemAtlas !== null;
    const points = buildIntelSprites(spriteMarks, atlas, {
      animate,
      emblems: emblemsDrawn ? emblemAtlas : null,
      userData: {
        reports: spriteMarks.length,
        // Per point, for describeView: a report is described, an RLSH figure never is.
        layer: 'Intel Reports',
        layers: places.map((place) => (place.kind === 'rlsh' ? 'RLSH' : 'Intel Reports')),
      },
    });
    if (points) group.add(points);
    const badges = buildPlaceBadges(
      places.map((place, i) => ({ position: spriteMarks[i].position, count: place.count, opacity: spriteMarks[i].opacity })),
      badgeAtlas,
    );
    if (badges) group.add(badges);

    /*
     * The area a roughly placed report could be in, under its glyph (section 18,
     * item 3). The coarsest precision at a place, not the finest: one report
     * there placed to a street does not make the county-level one precise.
     * Reports only; an RLSH figure is a person, and an area around a person is
     * a search radius.
     */
    const areas = buildPrecisionAreas(places
      .filter((place) => place.kind !== 'rlsh')
      .map((place) => {
        const stated = place.reports
          .map((r) => r.geoPrecisionM)
          .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
        return {
          lat: place.latitude,
          lng: place.longitude,
          precisionM: stated.length ? Math.max(...stated) : null,
          color: spriteGlyphFill(intelVariantOf(place.lead)),
        };
      }), GLOBE_RADIUS_UNITS);
    if (areas) group.add(areas);
    // The transform nodes ride along so their world position follows the group.
    for (const { mesh } of marks) group.add(mesh);

    /*
     * The key for what was just drawn.
     *
     * This layer published none, so a card's Intel Reports legend came from the
     * anchor dots underneath — `shape: disc`, purple — while the image showed
     * grey documents. Reported by Mecha Jono, 2026-09-25. One swatch per glyph
     * actually drawn, coloured from the same table the artwork is baked from.
     */
    const glyphsDrawn = new Set(spriteMarks.map((m) => m.variant));
    const swatchesFor = (glyphs: SpriteGlyph[]) => glyphs
      .filter((g) => glyphsDrawn.has(g))
      .map((g) => ({ color: spriteGlyphFill(g), label: SPRITE_GLYPH_MEANING[g] }));
    const reportSwatches = swatchesFor(['critical', 'actionable', 'standard', 'raw']);
    const rlshSwatches = swatchesFor(['rlsh']);
    // Only when a badge was drawn: a key that explains a number nobody can see
    // is a key for a different picture.
    const crowded = (kind: ReportPlace['kind']) => badges !== null && places.some((p) => p.kind === kind && p.count > 1);
    // The emblems actually worn (BA14), most worn first: only with their masks to ink.
    const worn = new Map<SymbolEntry, number>();
    if (emblemsDrawn) {
      for (const mark of spriteMarks) if (mark.emblem) worn.set(mark.emblem, (worn.get(mark.emblem) ?? 0) + 1);
    }
    const emblems = [...worn.entries()]
      .sort(([a, n], [b, m]) => m - n || EMBLEM_SYMBOLS.indexOf(a) - EMBLEM_SYMBOLS.indexOf(b))
      .map(([symbol]) => ({ id: symbol.id, meaning: symbol.meaning, icon: symbol.name }));
    publishLegend(REPORT_MARKS_LEGEND, reportSwatches.length === 0 ? null : {
      layerId: REPORT_MARKS_LEGEND,
      layer: 'Intel Reports',
      // Plain shapes, without the artwork, say the assessment by shape as well as by colour.
      shapeMeans: atlas ? 'document' : 'how the report was assessed',
      colorMeans: 'how the report was assessed',
      ...(emblems.length ? { emblemMeans: 'what it is about', emblems } : {}),
      ...(crowded('intel') ? { badgeMeans: 'how many reports share the place' } : {}),
      ...(areas ? { areaMeans: 'how precisely it was placed' } : {}),
      swatches: reportSwatches.map((swatch) => ({ ...swatch, style: intelStyle })),
    });
    publishLegend(RLSH_MARKS_LEGEND, rlshSwatches.length === 0 ? null : {
      layerId: RLSH_MARKS_LEGEND,
      layer: 'RLSH',
      shapeMeans: 'person',
      ...(crowded('rlsh') ? { badgeMeans: 'how many entities share the place' } : {}),
      swatches: rlshSwatches.map((swatch) => ({ ...swatch, style: rlshStyle })),
    });

    return () => {
      clear();
      publishLegend(REPORT_MARKS_LEGEND, null);
      publishLegend(RLSH_MARKS_LEGEND, null);
    };
  }, [marks, places, atlas, badgeAtlas, animate, sessionStartedAtMs, intelStyle, rlshStyle, featuredReportId, featuredElsewhere, categoryEmblems, emblemAtlas]);

  /*
   * Hover is a uniform write on the existing geometry — see
   * setIntelSpriteHovered. Doing it in its own effect keeps it off the rebuild
   * path, because this runs from a mousemove.
   */
  useEffect(() => {
    const points = groupRef.current.children
      .find((child) => child.userData?.type === INTEL_SPRITE_TYPE) as THREE.Points | undefined;
    if (!points) return;
    // The place holding the report, since a place is what is drawn.
    const index = hoveredReportId === null
      ? null
      : places.findIndex((place) => place.reports.some((report) => report.pubkey === hoveredReportId));
    setIntelSpriteHovered(points, index === null || index < 0 ? null : index);
  }, [hoveredReportId, places, atlas, intelStyle, rlshStyle, badgeAtlas, featuredReportId]);

  /*
   * Stable across renders, because the interaction layer takes it as a prop and
   * a new identity every render would re-create its handlers.
   */
  const reportAt = useCallback(
    // A place's lead: the most severe report there, which is the one drawn.
    (index: number): IntelReportOverlayMarker | null => places[index]?.lead ?? null,
    [places],
  );

  const atlasState: IntelSpriteAtlasState = !atlasSettled
    ? 'pending'
    : atlas === null ? 'unavailable' : 'ready';

  return {
    groupRef,
    atlasState,
    /** The object to raycast to find a mark, or null while nothing is drawn: glyphs or plain shapes. */
    pickLayer: atlasState === 'pending' ? null : groupRef.current,
    /** The transform nodes a popup is placed against. */
    marks,
    /** What is drawn, one entry per place. */
    places,
    /** Which report a picked index means. */
    reportAt,
  };
}

export default useGlobeIntelSprites;
