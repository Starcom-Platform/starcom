/**
 * The briefing tour's ping over the item a stop holds (critique C34), in the app's cyan for what is chosen: read each
 * frame from tourMarker.ts, which the screen's tour and a clip's tell; nothing while no stop is held.
 *
 * The globe has no scene on the first render, so the ping waits for one, as the Sun's glow does.
 */
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { buildTourPing, disposeOverlay } from '../glyphOverlays';
import { tourMarker } from '../../../features/globe/tour/tourMarker';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { ROLES } from '../../../styles/tokens';
import { REPORT_SPRITES } from '../globeAltitudes';
import { SCREEN_POINTS_RENDER_ORDER } from '../screenPoints';
import { ridesShell } from '../../../globe-engine/shellLift';

/** In the glyphs' own band, so the ring reads over the mark it rings (globeAltitudes.ts). */
const PING_RADIUS_UNITS = 100 * REPORT_SPRITES;
const POLL_MS = 250;

export function useGlobeTourPing(globeRef: RefObject<unknown>): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let detach: (() => void) | null = null;
    const attach = () => {
      if (cancelled) return;
      const scene = (globeRef.current as { scene?: () => THREE.Scene } | null)?.scene?.();
      if (!scene) {
        timer = setTimeout(attach, POLL_MS);
        return;
      }
      const ping = buildTourPing(new THREE.Color(ROLES.accent.accent));
      const sizing = ping.mesh.onBeforeRender;
      ping.mesh.onBeforeRender = function placed(this: THREE.Object3D, ...args) {
        const marker = tourMarker();
        ping.show(marker ? latLngToGlobeWorld(marker.lat, marker.lng, PING_RADIUS_UNITS) : null, marker?.heldForMs ?? 0);
        sizing.apply(this, args);
      };
      // In a group of its own, ordered over the marks' groups: three.js sorts what is see-through by its group's
      // order before its own (screenPoints.ts, drawAboveSurfaceLayers). It rides the shell, as the marks it rings do.
      const group = ridesShell(new THREE.Group());
      group.renderOrder = SCREEN_POINTS_RENDER_ORDER + 1000;
      group.add(ping.mesh);
      scene.add(group);
      detach = () => {
        scene.remove(group);
        disposeOverlay(ping.mesh);
      };
    };
    attach();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      detach?.();
    };
  }, [globeRef]);
}
