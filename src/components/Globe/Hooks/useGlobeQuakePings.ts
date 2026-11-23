/**
 * Pings on new strong quakes on the globe (D-EQ, EQ9, EQ19, EQ20; OR33): whenever Starcom is open, the watcher
 * (quakePings.ts) reads USGS's M4.5+ day feed; each new quake of the magnitude set or more shows a notice that opens it
 * in the inspector, and pulses on the globe until it is opened, its flag drawn here where Eco Disasters does not draw it.
 * Opening its note, from the notice, its flag or Eco Disasters' own, clears it.
 *
 * Never in a card or a clip: a ping is the person's own, and nothing of it leaves the device. Rides the shell, as Eco
 * Disasters' marks do.
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
import {
  clearQuakePing, pingWords, quakePings, useQuakePings, watchQuakePings, type QuakePing,
} from '../../../services/quakes/quakePings';
import { showHUDNotification } from '@utils/hudNotifications';
import { SEMANTIC } from '../../../styles/tokens';
import { classifySeverity, type NaturalEvent, type SeverityBucket } from '../../../hooks/useGeoEvents';

export const QUAKE_PINGS_TYPE = 'quakePings';
/** A ping's ring at the epicentre, CSS px: it spreads from there. */
const PING_RING_PX = 14;
/** How long the notice stays, ms. */
const NOTICE_MS = 15_000;
/** A ping pulses until it is opened. */
const UNTIL_OPENED_S = 1e9;

/** A ping's quake as Eco Disasters' notes and hovers read one: classified as the feed's are. */
const asShown = (ping: QuakePing): NaturalEvent => ({ ...ping.event, severityBucket: classifySeverity(ping.event) as SeverityBucket });

/** Opens a ping's quake in the inspector, and clears the ping. */
export function openQuakePing(ping: QuakePing): void {
  openGlobeNotes(ecoDisasterNoteSet(asShown(ping)), { at: { lat: ping.lat, lng: ping.lng }, layer: 'Eco Disasters' });
  clearQuakePing(ping.id);
}

export interface UseGlobeQuakePingsParams {
  scene: THREE.Scene | null;
  /** The quakes Eco Disasters draws as flags now: a ping's own flag is drawn only where it draws none. */
  drawnQuakeIds: ReadonlySet<string>;
  /** Off in tests and probes that must not read the feed. Default true. */
  watch?: boolean;
}

export function useGlobeQuakePings({ scene, drawnQuakeIds, watch = true }: UseGlobeQuakePingsParams): { pinging: number } {
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.userData = { type: QUAKE_PINGS_TYPE };
    return group;
  })());
  const pings = useQuakePings();
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

  // The watcher, for as long as the globe is open.
  useEffect(() => {
    if (!watch) return undefined;
    return watchQuakePings({
      onPing: (ping) => showHUDNotification({
        title: 'New quake',
        message: pingWords(ping, Date.now()),
        type: 'warning',
        priority: 'high',
        duration: NOTICE_MS,
        sound: 'alert',
        glyph: 'layer:EcologicalDisasters',
        onOpen: () => openQuakePing(ping),
      }),
    });
  }, [watch]);

  // A ping's quake opened anywhere, from its own flag or Eco Disasters', is seen.
  useEffect(() => subscribeGlobeNotes(() => {
    const open = getGlobeNoteState().open;
    if (!open) return;
    for (const note of open.notes) if (quakePings().some((p) => p.id === note.id)) clearQuakePing(note.id);
  }), []);

  useEffect(() => {
    if (!pings.length) return undefined;
    let live = true;
    void bakeFlagAtlas().then((t) => { if (live) setFlagAtlas(t); });
    return () => { live = false; };
  }, [pings.length]);

  useEffect(() => {
    const group = groupRef.current;
    if (!pings.length) return undefined;
    const radius = 100 * SURFACE_LINES;
    const positions = new Float32Array(pings.length * 3);
    pings.forEach((ping, i) => {
      const p = latLngToGlobeWorld(ping.lat, ping.lng, radius);
      positions.set([p.x, p.y, p.z], i * 3);
    });
    const rings = buildMarkPings(positions, pings.length, new THREE.Color(SEMANTIC.danger));
    const material = rings.mesh.material as THREE.ShaderMaterial;
    material.uniforms.duration.value = UNTIL_OPENED_S;
    const started = performance.now() / 1000;
    pings.forEach((_, i) => rings.set(i, PING_RING_PX, 1, 0));
    rings.commit();
    const own = rings.mesh.onBeforeRender;
    rings.mesh.onBeforeRender = function pingStep(...args) {
      own.apply(this, args);
      rings.tick(performance.now() / 1000 - started);
    };
    rings.mesh.userData = { ...rings.mesh.userData, type: `${QUAKE_PINGS_TYPE}:rings`, pinging: pings.length };
    group.add(rings.mesh);
    // A flag for each ping Eco Disasters is not drawing, so it can be hovered and opened where it is.
    const undrawn = pings.filter((ping) => !drawnQuakeIds.has(ping.id));
    const flags = undrawn.length
      ? buildQuakeFlags(undrawn.map((ping) => ({
        id: ping.id, lat: ping.lat, lng: ping.lng, magnitude: ping.magnitude, timeMs: ping.timeMs,
        depthKm: typeof ping.event.depthKm === 'number' ? ping.event.depthKm : null,
        tooltip: `New: ${formatEcoDisasterTooltip(asShown(ping))}`,
        opens: ecoDisasterNoteSet(asShown(ping)),
      })), flagAtlas, { type: `${QUAKE_PINGS_TYPE}:flags`, label: 'Quake pings' })
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
