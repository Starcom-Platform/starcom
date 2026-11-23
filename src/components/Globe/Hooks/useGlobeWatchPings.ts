/**
 * Pings on what lands in a watched place, on the globe (D-WL, WL2, WL3; OR33): whenever Starcom is open the watcher
 * (watchPings.ts) reads the kinds the watches count; each new item in a watched place shows a notice naming the watch,
 * which opens it in the inspector with a line naming every watch it landed in, and pulses on the globe until it is
 * opened, a quake's flag drawn here where Eco Disasters does not draw it. Opening its note, from the notice, the
 * Watchlist, its flag or Eco Disasters' own, clears it.
 *
 * Never in a card or a clip: a ping is the person's own, and nothing of it leaves the device. Rides the shell, as the
 * quake pings do.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ridesShell } from '../../../globe-engine/shellLift';
import { onStill } from '../../../globe-engine/captureClock';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { buildMarkPings, disposeOverlay } from '../glyphOverlays';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../globeAltitudes';
import { bakeFlagAtlas, buildQuakeFlags } from '../../../features/globe/marks/quakeFlags';
import { disposeKindMarks } from '../../../features/globe/marks/kindMarks';
import { ecoDisasterNoteSet } from '../../../features/globe/noteDetail/ecoDisasterNote';
import { openGlobeNotes, subscribeGlobeNotes, getGlobeNoteState } from '../../../features/globe/noteDetail/globeNoteStore';
import { formatEcoDisasterTooltip } from '../../EcoNatural/formatters';
import { clearWatchPing, isRecordItem, useWatchPings, watchPings, watchWatchlist, type EcoItem, type WatchPing } from '../../../services/watch/watchPings';
import { civilUnrestGlobeNote, noteSet, warConflictGlobeNote } from '../../../features/globe/noteDetail/globeNotesOf';
import type { GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';
import type { GlyphName } from '../../../symbols/uiSymbols';
import { watchOutline } from '../../../services/watch/watchOutline';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';
import { startWarConflict, subscribeWarConflict, warConflictSnapshot } from '../../../services/warConflict/warConflict';
import { civilUnrestItems, startCivilUnrest, subscribeCivilUnrest } from '../../../services/civilUnrest/civilUnrest';
import { subscribeWatches, watches } from '../../../features/watch/watchlist';
import { pingNotice, RECORD_LAYER, watchedInWords, type WatchMessages } from '../../../features/watch/watchWords';
import { messagesNow } from '../../../i18n/app/i18n';
import { showHUDNotification } from '@utils/hudNotifications';
import { SEMANTIC } from '../../../styles/tokens';
import { classifySeverity, type NaturalEvent, type SeverityBucket } from '../../../hooks/useGeoEvents';

export const WATCH_PINGS_TYPE = 'watchPings';
/** A ping's ring at the item, CSS px: it spreads from there. */
const PING_RING_PX = 14;
/** How long the notice stays, ms. */
const NOTICE_MS = 15_000;
/** A ping pulses until it is opened. */
const UNTIL_OPENED_S = 1e9;

/** A natural item's event as Eco Disasters' notes and hovers read one: classified as the feed's are. */
const asShown = (item: EcoItem): NaturalEvent => {
  const event = item.event as unknown as NaturalEvent;
  return { ...event, severityBucket: classifySeverity(event) as SeverityBucket };
};

/** The glyph of the layer that draws a ping's kind, for its notice. */
const glyphOf = (ping: WatchPing): GlyphName => (ping.item.kind === 'intel' ? 'layer:IntelReports'
  : ping.item.kind === 'war' ? 'layer:WarConflict' : ping.item.kind === 'unrest' ? 'layer:CivilUnrest' : 'layer:EcologicalDisasters');

/** What a ping's item opens: its layer's own note, an Intel Report as it says itself. */
function noteSetOf(ping: WatchPing): GlobeNoteSet {
  const { item } = ping;
  if (!isRecordItem(item)) return ecoDisasterNoteSet(asShown(item));
  switch (item.kind) {
    case 'war': return noteSet('War & Conflict', [item.conflict], warConflictGlobeNote) ?? { heading: 'War & Conflict', notes: [] };
    case 'unrest': return noteSet('Civil Unrest', [item.unrest], civilUnrestGlobeNote) ?? { heading: 'Civil Unrest', notes: [] };
    case 'intel': return {
      heading: 'Intel Report',
      notes: [{ id: item.report.id, kind: 'Intel Report', title: item.report.title, text: item.report.summary ?? item.report.content, timeMs: item.timeMs, sources: [] }],
    };
  }
}

const layerOf = (ping: WatchPing): string => (isRecordItem(ping.item) ? RECORD_LAYER[ping.item.kind] : 'Eco Disasters');

const words = (): WatchMessages => messagesNow().watch;

/** Opens a ping's item in the inspector, with the watches it landed in, and clears the ping. */
export function openWatchPing(ping: WatchPing, w: WatchMessages = words()): void {
  const set = noteSetOf(ping);
  const [first, ...rest] = set.notes;
  const notes = first ? [{ ...first, text: `${first.text}\n${watchedInWords(ping, w)}` }, ...rest] : set.notes;
  // A note about a whole territory has no point of its own: the inspector opens where the view is.
  const placed = Number.isFinite(ping.item.lat) && Number.isFinite(ping.item.lng);
  openGlobeNotes({ ...set, notes }, { ...(placed ? { at: { lat: ping.item.lat, lng: ping.item.lng } } : {}), layer: layerOf(ping) });
  clearWatchPing(ping.item.id);
}

export interface UseGlobeWatchPingsParams {
  scene: THREE.Scene | null;
  /** The quakes Eco Disasters draws as flags now: a ping's own flag is drawn only where it draws none. */
  drawnQuakeIds: ReadonlySet<string>;
  /** Off in tests and probes that must not read the feeds. Default true. */
  watch?: boolean;
}

export function useGlobeWatchPings({ scene, drawnQuakeIds, watch = true }: UseGlobeWatchPingsParams): { pinging: number } {
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.userData = { type: WATCH_PINGS_TYPE };
    return group;
  })());
  const pings = useWatchPings();
  const [flagAtlas, setFlagAtlas] = useState<THREE.Texture | null>(null);

  useEffect(() => registerTooltipGroup(groupRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    // Out of every capture: hidden while a card or a clip frame renders.
    const leave = onStill({ still: () => { group.visible = false; }, release: () => { group.visible = true; } });
    return () => { leave(); scene.remove(group); };
  }, [scene]);

  // The watcher, for as long as the globe is open: each kind read only while a watch counts it.
  useEffect(() => {
    if (!watch) return undefined;
    return watchWatchlist({
      list: watches,
      subscribe: subscribeWatches,
      outline: () => watchOutline(watches()),
      // What The Record carries (WL10–WL12): the ingest's new reports, and the layers' own shared readers, held open
      // while a watch counts them, whether or not their layer is drawn.
      record: {
        intel: { subscribe: (told) => nostrStarcomIntelIngest.subscribe((report) => told(report)) },
        war: {
          start: () => startWarConflict(),
          subscribe: (told) => { told(warConflictSnapshot()); return subscribeWarConflict(() => told(warConflictSnapshot())); },
        },
        unrest: {
          start: () => startCivilUnrest(),
          subscribe: (told) => { told(civilUnrestItems()); return subscribeCivilUnrest(() => told(civilUnrestItems())); },
        },
      },
      onPing: (ping) => {
        const notice = pingNotice(ping, words(), Date.now());
        showHUDNotification({
          title: notice.title,
          message: notice.message,
          type: 'warning',
          priority: 'high',
          duration: NOTICE_MS,
          sound: 'alert',
          glyph: glyphOf(ping),
          onOpen: () => openWatchPing(ping),
        });
      },
    });
  }, [watch]);

  // A ping's item opened anywhere, from its own flag or Eco Disasters', is seen.
  useEffect(() => subscribeGlobeNotes(() => {
    const open = getGlobeNoteState().open;
    if (!open) return;
    for (const note of open.notes) if (watchPings().some((p) => p.item.id === note.id)) clearWatchPing(note.id);
  }), []);

  const quakes = pings.filter((p) => p.item.kind === 'quake').length;
  useEffect(() => {
    if (!quakes) return undefined;
    let live = true;
    void bakeFlagAtlas().then((t) => { if (live) setFlagAtlas(t); });
    return () => { live = false; };
  }, [quakes]);

  useEffect(() => {
    const group = groupRef.current;
    // A ring where an item has a point; a note about a whole territory has none to ring.
    const placed = pings.filter((ping) => Number.isFinite(ping.item.lat) && Number.isFinite(ping.item.lng));
    if (!placed.length) return undefined;
    const radius = 100 * SURFACE_LINES;
    const positions = new Float32Array(placed.length * 3);
    placed.forEach((ping, i) => {
      const p = latLngToGlobeWorld(ping.item.lat, ping.item.lng, radius);
      positions.set([p.x, p.y, p.z], i * 3);
    });
    const rings = buildMarkPings(positions, placed.length, new THREE.Color(SEMANTIC.caution));
    const material = rings.mesh.material as THREE.ShaderMaterial;
    material.uniforms.duration.value = UNTIL_OPENED_S;
    const started = performance.now() / 1000;
    placed.forEach((_, i) => rings.set(i, PING_RING_PX, 1, 0));
    rings.commit();
    const own = rings.mesh.onBeforeRender;
    rings.mesh.onBeforeRender = function pingStep(...args) {
      own.apply(this, args);
      rings.tick(performance.now() / 1000 - started);
    };
    rings.mesh.userData = { ...rings.mesh.userData, type: `${WATCH_PINGS_TYPE}:rings`, pinging: placed.length };
    group.add(rings.mesh);
    // A flag for each quake Eco Disasters is not drawing, so it can be hovered and opened where it is.
    const undrawn = placed.flatMap((ping) => (ping.item.kind === 'quake' && !drawnQuakeIds.has(ping.item.id) ? [{ ping, item: ping.item }] : []));
    const flags = undrawn.length
      ? buildQuakeFlags(undrawn.map(({ ping, item }) => ({
        id: item.id, lat: item.lat, lng: item.lng, magnitude: item.level, timeMs: item.timeMs,
        depthKm: typeof item.event.depthKm === 'number' ? item.event.depthKm : null,
        tooltip: `${watchedInWords(ping, words())}\n${formatEcoDisasterTooltip(asShown(item))}`,
        opens: ecoDisasterNoteSet(asShown(item)),
      })), flagAtlas, { type: `${WATCH_PINGS_TYPE}:flags`, label: 'Watch pings' })
      : null;
    if (flags) group.add(flags.group);
    return () => {
      group.remove(rings.mesh);
      disposeOverlay(rings.mesh);
      if (flags) { group.remove(flags.group); disposeKindMarks(flags.group); }
    };
  }, [pings, drawnQuakeIds, flagAtlas]);

  return { pinging: pings.length };
}
