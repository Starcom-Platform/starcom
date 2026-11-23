/**
 * useGlobeAiWatch: AI Watch on the globe (decision D-AW, docs/missions/01-architecture-decisions/
 * ai-watch.md). Mecha Jono's Terminator Watch notes, from The Record (services/aiWatch/aiWatch.ts), in the
 * sections that are on (AW2).
 *
 * A note giving a point is drawn there, as the glyph of its section with its stance as a small shape (AW4);
 * a note giving only a country (or a state) is drawn at that place's middle, the place outlined in AI
 * Watch's magenta, with a pill counting its notes, as Hero Watch draws field missions; the rest are listed
 * in the panel, never placed by the outlet's country (AW3). Read only while a section is on.
 *
 * It says what it draws: the key, with what the shapes mean; the card's line crediting Mecha Jono and
 * saying the notes are their sources' headlines; and whenReady, which holds a card until the notes are read,
 * the places outlined and the pills drawn.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { aiWatchItems, aiWatchStatus, startAiWatch, subscribeAiWatch, type AiWatchItem, type AiWatchSection } from '../../../services/aiWatch/aiWatch';
import { aiWatchByPlace, byPoint, countryPill, drawnFor, pointTooltip, sourceNameOf, stanceWords, type AiWatchCountry } from '../../../services/aiWatch/aiWatchPlaces';
import { loadUsStates, US_STATE_CODE, type RegionOutline, type UsStates } from '../../../services/raverWatch/usStates';
import { buildGlyphSprites, disposeIntelSprites, type GlyphSpriteMark } from '../intelReportSprites';
import { bakeHeroWatchPills, buildHeroWatchPills, disposeHeroWatchPills, type PillAtlas } from '../heroWatchSprites';
import { AI_WATCH_LAYOUT, AI_WATCH_PILL_TYPE, AI_WATCH_RIM, aiCountryMark, aiNoteMark, aiWatchAtlas } from '../aiWatchSprites';
import { GeometryFactory, type LineFeature } from '../../../geopolitical/geometry/geometryFactory';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { aiWatchGlobeNote, noteSet } from '../../../features/globe/noteDetail/globeNotesOf';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { REPORT_SPRITES } from '../globeAltitudes';
import { ridesShell } from '../../../globe-engine/shellLift';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { DATA_SCALES } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
const toColor = (css: string) => parseInt(css.slice(1), 16);

/** How AI Watch's place outlines are found by a probe or a test. */
export const AI_OUTLINE_TYPE = 'aiWatchOutlines';
/** Over the borders, as Hero Watch's field missions stand. */
const OUTLINE_ELEVATION = 0.35;
const OUTLINE_OPACITY = 0.85;
/** How many notes a place's hover names before it counts the rest. */
const HOVER_NAMES = 4;

const NOTE_SHORT = "AI Watch: sources' headlines, sorted into areas; the stance is their reading.";

/** A place's outline, as lines: every part's outer ring. */
function outlineOf(code: string, region: RegionOutline): LineFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 2
    ? [{ id: `ai-watch:${code}#${i}`, coordinates: rings[0] as [number, number][] }]
    : []));
}

/** What the card says of the notes drawn: how many, where, and what they are. */
function aiWatchNote(drawn: number, points: number, countries: number, listed: number): string {
  if (drawn === 0) return 'AI Watch: no note stands in the sections on at the moment shown.';
  const placed = points + countries;
  return `AI Watch: ${drawn} note${drawn === 1 ? '' : 's'}, each a source's headline and link, `
    + "sorted into areas, with a stance that is their reading of the source's words. "
    + `${placed} drawn: ${points} at the point the note gives, ${countries} at its country, outlined. `
    + `${listed} name${listed === 1 ? 's' : ''} no place, and ${listed === 1 ? 'is' : 'are'} listed in the panel: a note is never placed by where its outlet is.`;
}

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of AI Watch: false while a section is on and its notes are not read, its places not outlined, or its pills not drawn. */
export function aiWatchReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export interface UseGlobeAiWatchOptions {
  scene: THREE.Scene | null;
  /** Which of its sections are on (AW2). */
  active: Readonly<Record<AiWatchSection, boolean>>;
  /** The countries' outlines; undefined until they have loaded. */
  territories?: TerritoryIndex;
  /** The window chosen on the timeline, in ms; null while live. */
  window: { start: number; end: number } | null;
  /** The moment the timeline is paused at, in ms; null while live. Absent, the window's end. */
  moment?: number | null;
}

export interface AiWatchPlace { code: string; name: string; notes: AiWatchItem[] }

export interface AiWatchOnGlobe {
  /** One while a section is on, for the key and the card. */
  feeds: FeedProvenance[];
  anyOn: boolean;
  /** Every note standing in the sections on, newest first: what the panel lists. */
  notes: AiWatchItem[];
  /** Those drawn at a point, those drawn at a place, and those listed only. */
  points: AiWatchItem[];
  places: AiWatchPlace[];
  unplaced: AiWatchItem[];
  /** Where each drawn note is, by its id, for the panel: its place's name, or the point it gives. */
  drawnAt: ReadonlyMap<string, string>;
  /** The Record read: whether it has said it sent all, and why not where it could not be read. */
  status: { loaded: boolean; error: string | null };
}

/**
 * Whether a note stands at a moment, or within a window: a note has no window of its own, only when Mecha
 * Jono published it, so live it stands from then on, and a window or a paused moment shows what was
 * published within it or by then (D-E).
 */
const standsAt = (item: AiWatchItem, at: { atS: number; window: { fromS: number; untilS: number } | null }) =>
  (at.window ? item.publishedAt >= at.window.fromS && item.publishedAt < at.window.untilS : item.publishedAt <= at.atS);

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
  }
}

/** A place's hover: its name and count, then its notes, each with its stance and source. */
function placeTooltip(place: AiWatchPlace): string {
  const named = place.notes.slice(0, HOVER_NAMES).map((note) => `${stanceWords(note.stance)} · ${note.title} (${sourceNameOf(note)})`);
  const rest = place.notes.length - named.length;
  return [`AI Watch · ${countryPill(place, place.name)}`, ...named, ...(rest > 0 ? [`and ${rest} more, in the panel`] : [])].join('\n');
}

export function useGlobeAiWatch({ scene, active, territories, window, moment: pausedAt = null }: UseGlobeAiWatchOptions): AiWatchOnGlobe {
  const anyOn = active.AiIncidents || active.AiFrontier || active.AiWar || active.AiSafety;
  // The sections, as one value that changes only when one turns on or off.
  const sectionsKey = `${+active.AiIncidents}${+active.AiFrontier}${+active.AiWar}${+active.AiSafety}`;

  // Read only while a section is on; one read however many ask.
  useEffect(() => (anyOn ? startAiWatch() : undefined), [anyOn]);
  const items = useSyncExternalStore(subscribeAiWatch, aiWatchItems, aiWatchItems);
  const status = useSyncExternalStore(subscribeAiWatch, aiWatchStatus, aiWatchStatus);

  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!anyOn || window) return undefined;
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [anyOn, window]);
  const windowStart = window?.start ?? null;
  const windowEnd = window?.end ?? null;
  const moment = useMemo(() => (windowStart !== null && windowEnd !== null
    ? { atS: (pausedAt ?? windowEnd) / 1000, window: { fromS: windowStart / 1000, untilS: windowEnd / 1000 } }
    : { atS: minute * 60, window: null }), [minute, windowStart, windowEnd, pausedAt]);

  const notes = useMemo(() => {
    const on = { AiIncidents: sectionsKey[0] === '1', AiFrontier: sectionsKey[1] === '1', AiWar: sectionsKey[2] === '1', AiSafety: sectionsKey[3] === '1' };
    return drawnFor(items.filter((item) => standsAt(item, moment)), on);
  }, [items, moment, sectionsKey]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void aiWatchAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, []);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const pillsRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // The places' outlines, ours to dispose. In the fills' frame.
  const outlinesRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [outlinesRef.current, spritesRef.current, pillsRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  // The US states' outlines, fetched only when a note names one.
  const needsStates = useMemo(() => notes.some((note) => !note.point && !!note.jurisdiction && US_STATE_CODE.test(note.jurisdiction)), [notes]);
  const [usStates, setUsStates] = useState<UsStates | undefined>(undefined);
  const [statesSettled, setStatesSettled] = useState(false);
  useEffect(() => {
    if (!needsStates) return undefined;
    let live = true;
    void loadUsStates().then((loaded) => { if (live) { setUsStates(loaded); setStatesSettled(true); } });
    return () => { live = false; };
  }, [needsStates]);
  const placeOutline = useMemo(
    () => (code: string): RegionOutline | null => (US_STATE_CODE.test(code) ? usStates?.get(code) : territories?.byCode(code)) ?? null,
    [usStates, territories],
  );

  const placed = useMemo(() => aiWatchByPlace(notes, placeOutline), [notes, placeOutline]);
  const places = useMemo<AiWatchPlace[]>(
    () => placed.countries.map((country: AiWatchCountry) => ({ ...country, name: placeOutline(country.code)!.name })),
    [placed, placeOutline],
  );
  const placeMarks = useMemo(() => places.flatMap((place) => {
    const middle = regionPlace(placeOutline(place.code)!);
    return middle ? [{ place, position: latLngToGlobeWorld(middle.lat, middle.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES) }] : [];
  }), [places, placeOutline]);

  // The outlines: rebuilt only when the places change.
  useEffect(() => {
    const group = outlinesRef.current;
    if (!places.length) return undefined;
    const lines = GeometryFactory.buildBorderLines(
      places.flatMap((place) => outlineOf(place.code, placeOutline(place.code)!)),
      { elevation: OUTLINE_ELEVATION, color: toColor(DATA_SCALES.aiWatch), opacity: OUTLINE_OPACITY },
    );
    lines.userData = { type: AI_OUTLINE_TYPE, places: places.map((place) => place.code) };
    group.add(lines);
    return () => {
      group.remove(lines);
      lines.traverse((line) => {
        if (!(line as THREE.Line).isLine) return;
        (line as THREE.Line).geometry.dispose();
        ((line as THREE.Line).material as THREE.Material).dispose();
      });
    };
  }, [places, placeOutline]);

  // The pills' words, drawn once per set of words, the busiest place placed first.
  const pillEntries = useMemo(() => placeMarks.map(({ place, position }) => ({ position, label: countryPill(place, place.name) })), [placeMarks]);
  const pillLabels = useMemo(() => [...new Set(pillEntries.map((entry) => entry.label))].sort(), [pillEntries]);
  const pillKey = pillLabels.join('\n');
  const [pills, setPills] = useState<{ key: string; atlas: PillAtlas | null } | null>(null);
  useEffect(() => {
    if (!pillLabels.length) return undefined;
    let live = true;
    let baked: PillAtlas | null = null;
    void bakeHeroWatchPills(pillLabels, 2, DATA_SCALES.aiWatch).then((made) => {
      baked = made;
      if (live) setPills({ key: pillKey, atlas: made });
      else made?.texture.dispose();
    });
    return () => { live = false; baked?.texture.dispose(); };
    // pillKey stands for pillLabels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillKey]);
  useEffect(() => {
    const group = pillsRef.current;
    const mesh = pills?.key === pillKey ? buildHeroWatchPills(pillEntries, pills.atlas, AI_WATCH_PILL_TYPE) : null;
    if (!mesh) return undefined;
    group.add(mesh);
    return () => { group.remove(mesh); disposeHeroWatchPills(mesh); };
  }, [pills, pillKey, pillEntries]);

  // The marks: a note at its point, and a place's notes at its middle, in one object.
  useEffect(() => {
    const group = spritesRef.current;
    clearGroup(group);
    const on = { AiIncidents: sectionsKey[0] === '1', AiFrontier: sectionsKey[1] === '1', AiWar: sectionsKey[2] === '1', AiSafety: sectionsKey[3] === '1' };
    // Each mark opens the notes its hover names, with their sources (D-CT, CT3).
    const marks: GlyphSpriteMark[] = [
      ...placeMarks.map(({ place, position }) => ({
        ...aiCountryMark(position, placeTooltip(place)),
        opens: noteSet(`AI Watch · ${place.name}`, place.notes, aiWatchGlobeNote),
      })),
      // Notes sharing a point as one mark, its stance theirs where they agree, the hover naming each.
      ...byPoint(placed.points).map((notes) => ({
        ...aiNoteMark(
          { sections: notes[0].sections, stance: notes.every((n) => n.stance === notes[0].stance) ? notes[0].stance : undefined },
          on, latLngToGlobeWorld(notes[0].point!.lat, notes[0].point!.lon, GLOBE_RADIUS_UNITS * REPORT_SPRITES), pointTooltip(notes),
        ),
        opens: noteSet('AI Watch', notes, aiWatchGlobeNote),
      })),
    ];
    const points = marks.length ? buildGlyphSprites(marks, atlas, AI_WATCH_LAYOUT) : null;
    if (points) group.add(points);
    return () => clearGroup(group);
  }, [placed, placeMarks, atlas, sectionsKey]);

  // A card waits for the notes while a section is on; for the places' outlines; and for its pills.
  const placeStanding = useMemo(() => notes.some((note) => !note.point && !!note.jurisdiction), [notes]);
  useEffect(() => {
    if (anyOn && !status.loaded && !status.error) readiness = { ready: false, why: 'AI Watch was still being read from The Record' };
    else if (placeStanding && !territories) readiness = { ready: false, why: "AI Watch's countries were still being outlined" };
    else if (needsStates && !statesSettled) readiness = { ready: false, why: "AI Watch's states were still being outlined" };
    else if (pillLabels.length && pills?.key !== pillKey) readiness = { ready: false, why: "AI Watch's counts were still being drawn" };
    else readiness = { ready: true };
  }, [anyOn, status, placeStanding, territories, needsStates, statesSettled, pillLabels, pills, pillKey]);
  useEffect(() => () => { readiness = { ready: true }; }, []);

  useEffect(() => {
    // Taken off by the cleanup below when nothing is drawn.
    if (!placed.points.length && !placeMarks.length) return undefined;
    publishLegend('AIWatch', {
      layerId: 'AIWatch',
      layer: 'AI Watch',
      shapeMeans: "a note at the point it gives, as its area's glyph, its small shape the stance read in its words: ▲ good, ▼ bad, ◆ ugly, none where none is stated; a country's notes at its middle, the country outlined",
      badgeMeans: "its pill: the country · its notes",
      // Each area's rim by its kind (O17, OR3): the key names the colours drawn.
      swatches: [
        { color: AI_WATCH_RIM.AiWar, label: 'AI in war, rimmed in armed conflict\'s red' },
        { color: AI_WATCH_RIM.AiSafety, label: 'safety and security, rimmed in the technology violet' },
        { color: AI_WATCH_RIM.AiIncidents, label: 'incidents and frontier AI, rimmed in AI\'s magenta' },
        { color: DATA_SCALES.aiWatch, label: 'a country with notes, outlined', shape: 'line' },
      ],
    });
    return () => publishLegend('AIWatch', null);
  }, [placed.points.length, placeMarks.length]);

  const feeds = useMemo<FeedProvenance[]>(() => (anyOn ? [{
    name: "AI Watch: sources' headlines on AI, posted on The Record",
    shortName: 'AI Watch',
    // Its four layers share it, as they share their legend (D-LS).
    layer: 'AIWatch',
    lastUpdated: status.at === null ? null : new Date(status.at).toISOString(),
    error: status.error,
    loading: !status.loaded && !status.error,
    note: aiWatchNote(notes.length, placed.points.length, placed.countries.reduce((n, c) => n + c.notes.length, 0), placed.unplaced.length),
    noteShort: NOTE_SHORT,
    // Our own notes, nothing to credit: the operator dropped our name from every card (24 Oct; record D-L).
    credits: [],
  }] : []), [anyOn, status, notes, placed]);

  const drawnAt = useMemo(() => new Map<string, string>([
    ...placed.points.map((note) => [note.id, `the point it gives${note.precision ? `, to a ${note.precision}` : ''}`] as [string, string]),
    ...places.flatMap((place) => place.notes.map((note) => [note.id, place.name] as [string, string])),
  ]), [placed, places]);

  return {
    feeds, anyOn, notes, points: placed.points, places, unplaced: placed.unplaced, drawnAt,
    status: { loaded: status.loaded, error: status.error },
  };
}
