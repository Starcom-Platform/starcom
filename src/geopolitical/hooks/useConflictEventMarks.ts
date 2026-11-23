/**
 * Conflict Zones' events, each at its own place (critique-2026-11-01, O12, OR2, OR13; plan A4, B1): the layer drew one
 * coloured disc a country, a tally, and no icon at any zoom. Each event in the window is now its kind's icon where the
 * report put it, from its CAMEO code (conflictKindOf), ringed in armed conflict's colour, brighter the more severe its
 * Goldstein score; crowded marks fold under a count, and a click lists them. The rail chooses the view (each event, or
 * a tally a country) and the mark (Icon, Dot, Pin, Spike: a spike's height is how many outlets told it).
 *
 * Drawn from a group of its own in the scene's frame, as War & Conflict's marks are, not inside the geopolitical
 * overlay, whose group is turned into another frame and cross-faded.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RealGdeltEvent } from '../../services/geopolitical/GDELTEventService';
import { ridesShell } from '../../globe-engine/shellLift';
import { registerTooltipGroup } from '../../components/Globe/pointTooltipRegistry';
import { bakeBadgeAtlas } from '../../components/Globe/intelReportSprites';
import { publishLegend, type LegendSwatch } from '../../services/globe/globeLegendStore';
import { kindAtlas, kindColour, kindEntry, type KindAtlas } from '../../features/globe/marks/kindAtlas';
import { buildKindMarks, disposeKindMarks, type KindMarkItem, type MarkStyle } from '../../features/globe/marks/kindMarks';
import { warEventNote } from '../../features/globe/noteDetail/conflictZoneNotes';
import { gdeltStampToMs } from '../../services/geopolitical/gdeltEventExport';
import { formatCount } from '@utils/formatCount';
import { useLayerRoot } from '../../globe-engine/compareLayers';

/** How this layer's group is found by a probe or a test. */
export const CONFLICT_EVENT_MARKS_TYPE = 'conflictEventMarks';
export const CONFLICT_EVENTS_LEGEND_ID = 'ConflictZones:events';

/**
 * An event's kind in the lexicon from its CAMEO code: the three-digit code where it says more (an abduction, a
 * bombing, shelling, an air strike), else its root (14 protest, 15 a show of force, 16 and 17 coercion, 18 an assault,
 * 19 fighting, 20 mass violence).
 */
export function conflictKindOf(eventCode: string, rootCode: string): string {
  switch ((eventCode || '').slice(0, 3)) {
    case '181': return 'conflict:effects:captives';
    case '183': return 'conflict:kinetic:explosion';
    case '185': case '186': return 'conflict:kinetic:shooting';
    case '191': return 'conflict:politics:coercion';
    case '192': return 'conflict:forces:troops';
    case '193': return 'conflict:kinetic:shooting';
    case '194': return 'conflict:kinetic:shelling';
    case '195': return 'conflict:kinetic:airstrike';
    case '196': return 'conflict:politics:ceasefire';
    default: break;
  }
  switch ((rootCode || eventCode || '').slice(0, 2)) {
    case '14': return 'society:civic:protest';
    case '15': return 'conflict:forces:troops';
    case '16': case '17': return 'conflict:politics:coercion';
    case '18': return 'conflict:kinetic:shooting';
    case '19': return 'conflict:kinetic:ground-fighting';
    case '20': return 'conflict:effects:mass-violence';
    default: return 'conflict:report';
  }
}

/** How severe, 0 to 1: GDELT's Goldstein score runs from −10, most conflictual, to +10. */
export const severityOfGoldstein = (g: number | null | undefined): number => (typeof g === 'number' ? Math.min(1, Math.max(0, -g / 10)) : 0.3);

export function conflictEventItems(events: readonly RealGdeltEvent[]): KindMarkItem[] {
  return events.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)).map((e) => {
    const note = warEventNote(e);
    return {
      id: e.id,
      lat: e.lat,
      lng: e.lng,
      kind: conflictKindOf(e.eventCode, e.eventRootCode),
      magnitude: typeof e.sources === 'number' && e.sources > 0 ? e.sources : 1,
      severity: severityOfGoldstein(e.goldsteinScale),
      tooltip: `${note.title}\nGoldstein ${e.goldsteinScale.toFixed(1)} (−10 to +10)${e.placeName ? ` · ${e.placeName}` : ''}`,
      // Headed by its place, as the report puts it: the title is the note's own, shown under the heading.
      opens: { heading: e.placeName ? `Conflict Zones · ${e.placeName}` : 'Conflict Zones', notes: [note] },
      timeMs: gdeltStampToMs(e.dateAdded),
    };
  });
}

export interface UseConflictEventMarksParams {
  scene: THREE.Scene | null;
  active: boolean;
  /** The events in the window shown. */
  events: readonly RealGdeltEvent[];
  style: MarkStyle;
  /** The snapshot's note, when a paused window reaches past its day. */
  note?: string | null;
}

export function useConflictEventMarks({ scene, active, events, style, note = null }: UseConflictEventMarksParams): { drawn: number } {
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.userData = { type: CONFLICT_EVENT_MARKS_TYPE };
    return group;
  })());
  const [atlas, setAtlas] = useState<KindAtlas | null>(null);
  const [badges, setBadges] = useState<THREE.Texture | null>(null);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('ConflictZones', groupRef.current);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void bakeBadgeAtlas().then((t) => { if (live) setBadges(t); });
    return () => { live = false; };
  }, [active]);

  const items = active ? conflictEventItems(events) : [];
  const kindsKey = [...new Set(items.map((it) => it.kind))].sort().join('|');
  useEffect(() => {
    if (!active || !kindsKey) return undefined;
    let live = true;
    void kindAtlas(kindsKey.split('|')).then((a) => { if (live) setAtlas(a); });
    return () => { live = false; };
  }, [active, kindsKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (!active) {
      setDrawn(0);
      publishLegend(CONFLICT_EVENTS_LEGEND_ID, null);
      return undefined;
    }
    const built = buildKindMarks(items, { style, atlas, type: `${CONFLICT_EVENT_MARKS_TYPE}:${style}`, label: 'Conflict Zones — armed conflict', badges });
    group.add(built.group);
    setDrawn(items.length);
    const swatches: LegendSwatch[] = built.kindsDrawn.map((kind) => ({ color: kindColour(kind), label: kindEntry(kind).meaning.replace(/\.$/, '') }));
    publishLegend(CONFLICT_EVENTS_LEGEND_ID, items.length || note ? {
      layerId: CONFLICT_EVENTS_LEGEND_ID,
      layer: 'Conflict Zones — armed conflict',
      ...(note ? { when: note } : {}),
      shapeMeans: style === 'spike'
        ? 'a spike is an event where the report put it; its height, how many outlets told it (log scale)'
        : style === 'dot'
          ? 'a dot is an event where the report put it; a number counts the events crowded under it'
          : 'the icon is what happened, from its CAMEO code; a number counts the events crowded under it',
      colorMeans: 'armed conflict, brighter the more severe its Goldstein score',
      ...(built.scale?.length ? { sizeMeans: `outlets that told it: ${built.scale.map((s) => formatCount(s.value)).join(', ')} at the heights drawn` } : {}),
      swatches,
    } : null);
    return () => {
      group.remove(built.group);
      disposeKindMarks(built.group);
      publishLegend(CONFLICT_EVENTS_LEGEND_ID, null);
    };
    // items stands for events while active; kindsKey for the kinds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, events, style, atlas, badges, note]);

  return { drawn };
}
