/**
 * useGlobeRosterOps: Campaigns and Operations as a layer in Missions mode (decision D-RS, RS25), beside the open
 * missions. Each one running or to come is drawn at the places it names: outlined in its own colour, a disc at
 * each place's middle whose hover names them and whose click opens them in Operations, and a pill with its name
 * and clock ("Count the Geminids · 2 days left"). One naming no place drawn here is listed, never placed.
 *
 * Read from the roster's one read (rosterRead.ts), only while the layer is on. A feed line says what it drew.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { rosterItems, rosterReadStatus, startRosterRead, subscribeRoster } from '../../../services/roster/rosterRead';
import { describeOpsAt, opsNoteSet, opsPillText, rosterOpsByPlace, type OpsAtPlace } from '../../../services/roster/rosterPlaces';
import type { ReadRosterItem } from '../../../services/roster/rosterItem';
import { loadUsStates, US_STATE_CODE, type RegionOutline, type UsStates } from '../../../services/raverWatch/usStates';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { bakeHeroWatchPills, buildHeroWatchPills, disposeHeroWatchPills, type PillAtlas } from '../heroWatchSprites';
import { GeometryFactory, type LineFeature } from '../../../geopolitical/geometry/geometryFactory';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { buildScreenPoints, disposeScreenPoints, drawAboveSurfaceLayers } from '../screenPoints';
import { REPORT_SPRITES } from '../globeAltitudes';
import { ridesShell } from '../../../globe-engine/shellLift';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { DATA_SCALES } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
export const ROSTER_OPS_OUTLINE_TYPE = 'rosterOpsOutlines';
export const ROSTER_OPS_MARK_TYPE = 'rosterOpsMarks';
export const ROSTER_OPS_PILL_TYPE = 'rosterOpsPills';
const OUTLINE_ELEVATION = 0.35;
const OUTLINE_OPACITY = 0.85;
const MARK_PX = 12;
const toColor = (css: string) => parseInt(css.slice(1), 16);

function outlineOf(code: string, region: RegionOutline): LineFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 2
    ? [{ id: `rosterOps:${code}#${i}`, coordinates: rings[0] as [number, number][] }]
    : []));
}

/** What the card says of what is drawn, and of what is listed rather than drawn. */
function opsNote(places: OpsAtPlace[], unplaced: number): string {
  const drawn = new Set(places.flatMap((p) => p.items.map((i) => i.address))).size;
  const listed = unplaced ? ` ${unplaced} name${unplaced === 1 ? 's' : ''} no place drawn here: listed in Operations, not drawn.` : '';
  if (drawn === 0) return `Campaigns and operations: none running or to come names a place drawn here.${listed}`;
  return `Campaigns and operations: ${drawn} running or to come, at ${places.length} place${places.length === 1 ? '' : 's'}, each its author's own, `
    + `outlined, with a pill giving its name and clock.${listed} Ended ones are not drawn.`;
}

export interface UseGlobeRosterOpsOptions {
  scene: THREE.Scene | null;
  active: boolean;
  territories?: TerritoryIndex;
  /** For tests: the moment it is drawn at. */
  now?: number;
}

export interface RosterOpsOnGlobe {
  places: OpsAtPlace[];
  unplaced: ReadRosterItem[];
  feeds: FeedProvenance[];
}

export function useGlobeRosterOps({ scene, active, territories, now }: UseGlobeRosterOpsOptions): RosterOpsOnGlobe {
  useEffect(() => (active ? startRosterRead() : undefined), [active]);
  const items = useSyncExternalStore(subscribeRoster, rosterItems, rosterItems);
  const status = useSyncExternalStore(subscribeRoster, rosterReadStatus, rosterReadStatus);

  // The day moves on, so one past its window leaves the globe.
  const [hour, setHour] = useState(() => Math.floor(Date.now() / 3_600_000));
  useEffect(() => {
    if (!active || now !== undefined) return undefined;
    const timer = setInterval(() => setHour(Math.floor(Date.now() / 3_600_000)), 600_000);
    return () => clearInterval(timer);
  }, [active, now]);
  const today = new Date(now ?? hour * 3_600_000).toISOString().slice(0, 10);

  const [usStates, setUsStates] = useState<UsStates | undefined>(undefined);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void loadUsStates().then((loaded) => { if (live) setUsStates(loaded); });
    return () => { live = false; };
  }, [active]);
  const placeOutline = useMemo(
    () => (code: string): RegionOutline | null => (US_STATE_CODE.test(code) ? usStates?.get(code) : territories?.byCode(code)) ?? null,
    [usStates, territories],
  );
  const ops = useMemo(() => (active ? rosterOpsByPlace(items, placeOutline, today) : { places: [], unplaced: [] }), [active, items, placeOutline, today]);
  const placed = useMemo(() => ops.places.flatMap((place) => {
    const middle = regionPlace(placeOutline(place.code)!);
    return middle ? [{ place, position: latLngToGlobeWorld(middle.lat, middle.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES) }] : [];
  }), [ops, placeOutline]);

  const marksRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const pillsRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const outlinesRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  useEffect(() => registerTooltipGroup(marksRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [outlinesRef.current, marksRef.current, pillsRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  useEffect(() => {
    const group = outlinesRef.current;
    if (!ops.places.length) return undefined;
    const lines = GeometryFactory.buildBorderLines(
      ops.places.flatMap((place) => outlineOf(place.code, placeOutline(place.code)!)),
      { elevation: OUTLINE_ELEVATION, color: toColor(DATA_SCALES.operations), opacity: OUTLINE_OPACITY },
    );
    lines.userData = { type: ROSTER_OPS_OUTLINE_TYPE, places: ops.places.map((place) => place.code) };
    group.add(lines);
    return () => {
      group.remove(lines);
      lines.traverse((line) => {
        if (!(line as THREE.Line).isLine) return;
        (line as THREE.Line).geometry.dispose();
        ((line as THREE.Line).material as THREE.Material).dispose();
      });
    };
  }, [ops, placeOutline]);

  // A disc at each place's middle: its hover names them, its click opens them in Operations (RS25).
  useEffect(() => {
    const group = marksRef.current;
    if (!placed.length) return undefined;
    const marks = buildScreenPoints(placed.map(({ place, position }) => ({
      position, sizePx: MARK_PX, color: toColor(DATA_SCALES.operations),
      tooltip: describeOpsAt(place, today), opens: opsNoteSet(place),
    })), { rim: 'dark', userData: { type: ROSTER_OPS_MARK_TYPE, layer: 'Campaigns and operations' } });
    group.add(marks);
    return () => { group.remove(marks); disposeScreenPoints(marks); };
  }, [placed, today]);

  const pillEntries = useMemo(() => placed.map(({ place, position }) => ({ position, label: opsPillText(place, today) })), [placed, today]);
  const pillKey = useMemo(() => [...new Set(pillEntries.map((e) => e.label))].sort().join('\n'), [pillEntries]);
  const [pills, setPills] = useState<{ key: string; atlas: PillAtlas | null } | null>(null);
  useEffect(() => {
    if (!pillKey) return undefined;
    let live = true;
    let baked: PillAtlas | null = null;
    void bakeHeroWatchPills(pillKey.split('\n'), 2, DATA_SCALES.operations).then((atlas) => {
      baked = atlas;
      if (live) setPills({ key: pillKey, atlas });
      else atlas?.texture.dispose();
    });
    return () => { live = false; baked?.texture.dispose(); };
  }, [pillKey]);
  useEffect(() => {
    const group = pillsRef.current;
    const mesh = pills?.key === pillKey ? buildHeroWatchPills(pillEntries, pills.atlas, ROSTER_OPS_PILL_TYPE) : null;
    if (!mesh) return undefined;
    group.add(mesh);
    return () => { group.remove(mesh); disposeHeroWatchPills(mesh); };
  }, [pills, pillKey, pillEntries]);

  useEffect(() => {
    if (!placed.length) return undefined;
    publishLegend('CampaignsOperations', {
      layerId: 'CampaignsOperations',
      layer: 'Campaigns and operations',
      shapeMeans: 'each place a running or coming campaign or operation names, outlined, a disc at its middle; a click opens it in Operations',
      badgeMeans: 'its pill: its name and clock, or the place and how many',
      swatches: [{ color: DATA_SCALES.operations, label: 'a place of a campaign or operation, outlined in indigo', shape: 'line' }],
    });
    return () => publishLegend('CampaignsOperations', null);
  }, [placed]);

  const feeds = useMemo<FeedProvenance[]>(() => (active ? [{
    name: 'Campaigns and operations, as their authors post them',
    shortName: 'Campaigns and operations',
    layer: 'CampaignsOperations',
    lastUpdated: null,
    timestamped: false,
    loading: !status.loaded && !status.error,
    error: status.error,
    note: opsNote(ops.places, ops.unplaced.length),
  }] : []), [active, status, ops]);

  return { places: ops.places, unplaced: ops.unplaced, feeds };
}
