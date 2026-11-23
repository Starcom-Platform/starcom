// useGlobeCloudLayer.ts - A slowly-drifting, semi-transparent cloud shell above the globe.
//
// Standard technique for a react-globe.gl / three-globe scene, following the exact
// reference pattern from three-globe's own official cloud-layer example: a separate
// sphere slightly larger than the globe, alpha-blended cloud texture, slow independent
// rotation. Added directly to the scene (not as a child of the globe mesh) — matching
// every other custom mesh in Globe.tsx, since the globe mesh itself never rotates in
// world space (Earth's rotation is represented via texture offset / lat-lng math
// instead), so scene-relative and globe-relative positioning are equivalent here.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { GlobeTextureLoader } from '../../../globe-engine/GlobeTextureLoader';
import { getGlobeQuality, subscribeGlobeQuality, qualityStepOf, fullDetailHeld } from '../../../services/globe/globeQuality';
import { createLogger } from '@utils/logger';
import { onStill } from '../../../globe-engine/captureClock';
import { setCloudsDrawn, setCloudsWanted } from '../../../globe-engine/imagery';
import { groundField } from '../../../globe-engine/shellLift';
import { getResolvedGlobeSkin } from '../../../services/globe/globeAppearance';
const log = createLogger({ prefix: 'useGlobeCloudLayer' });

// Matches GLOBE_RADIUS_UNITS in src/globe-engine/SpaceWeatherGeometry.ts (100 scene
// units = 1 Earth radius).
const GLOBE_RADIUS_UNITS = 100;
const CLOUDS_ALTITUDE = 0.004; // Fraction of globe radius above the surface
const CLOUDS_ROTATION_DEG_PER_FRAME = -0.006; // Same slow drift as three-globe's own example
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100; // 10s — react-globe.gl's scene() isn't available until after mount
/**
 * How long to wait for auto quality to settle before fetching anyway.
 *
 * Clouds wait for the governor (globeQuality `settled`), which needs frame
 * windows reported to it. If that reporting ever stopped, a strong device would
 * wait forever and simply have no clouds, with nothing saying why. This bounds
 * it: a real measurement settles in about six seconds.
 */
export const SETTLE_FALLBACK_MS = 15_000;
/** Opacity gained per frame while fading in — about 0.8 s at 60 frames a second. */
const FADE_IN_PER_FRAME = 1 / 48;
/** The loop's frame rate, for turning the per-frame drift into an angle at a moment. */
const DRIFT_FRAMES_PER_SECOND = 60;

/**
 * Where the clouds stand at a moment, as a capture holds them (IM23): the drift
 * they would have made since the epoch, within a turn. The same moment, the same
 * clouds, whenever the shot is made.
 */
export function cloudAngleAt(atMs: number): number {
  const degrees = (atMs / 1000) * DRIFT_FRAMES_PER_SECOND * CLOUDS_ROTATION_DEG_PER_FRAME;
  return ((degrees % 360) * Math.PI) / 180;
}

interface UseGlobeCloudLayerOptions {
  globeRef: React.RefObject<GlobeMethods>;
  /**
   * Hidden while Earth Weather is shown, real clouds or none (decision D-W):
   * this picture is three-globe's example, not the sky, and must never be read
   * as it.
   */
  suppressed?: boolean;
}

/**
 * Whether the made-up clouds belong on the skin drawn now (C28, the owner's critique of 2026-10-16): on a photograph
 * of the Earth they read as weather; over the cyan cyber globe they "look wrong". Not drawn there, and clouds.png,
 * the largest single file of a first visit, is not fetched for it.
 */
function madeUpCloudsBelong(): boolean {
  return getResolvedGlobeSkin() !== 'cyberEarth';
}

export function useGlobeCloudLayer({ globeRef, suppressed = false }: UseGlobeCloudLayerOptions): void {
  const frameRef = useRef<number | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;
  const shownByQuality = useRef(false);

  // Hidden or shown in place when real clouds take over or give it back.
  useEffect(() => {
    if (meshRef.current) meshRef.current.visible = shownByQuality.current && !suppressed && madeUpCloudsBelong();
  }, [suppressed]);

  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let mesh: THREE.Mesh | null = null;
    let holder: THREE.Group | null = null;
    let leaveStill: (() => void) | null = null;
    let geometry: THREE.SphereGeometry | null = null;
    let material: THREE.MeshPhongMaterial | null = null;
    let scene: THREE.Scene | null = null;
    let loaded = false;
    let requested = false;
    let fallbackElapsed = false;

    /*
     * Fetch clouds.png once the device is known to draw clouds, not before.
     *
     * It was fetched as soon as the globe mounted — the largest single file of a
     * first visit, 2.19 MB measured server-side on 2026-09-25 — while auto quality
     * still read "clouds on" only because it had not measured anything yet. A
     * slow device, and every headless agent capturing cards, downloaded clouds
     * it then hid. Now: once auto has settled (or the viewer pinned a setting),
     * and only if the step draws clouds. Decided with the user, 2026-09-25.
     */
    const requestClouds = () => {
      if (requested || disposed || !material || !madeUpCloudsBelong()) return;
      const state = getGlobeQuality();
      if (!(state.settled || fallbackElapsed) || !qualityStepOf(state).clouds) return;
      requested = true;
      GlobeTextureLoader.loadTexture('clouds')
        .then((texture) => {
          if (disposed || !material || !mesh) return;
          material.map = texture;
          // Faded in by the animation loop rather than switched on: arriving a
          // few seconds after the globe, a sudden cloud layer reads as a glitch.
          material.opacity = 0;
          material.needsUpdate = true;
          loaded = true;
          shownByQuality.current = qualityStepOf(getGlobeQuality()).clouds;
          mesh.visible = shownByQuality.current && !suppressedRef.current && madeUpCloudsBelong();
        })
        .catch((error) => {
          requested = false;
          log.warn('Failed to load cloud texture:', error);
        });
    };

    // Hidden rather than removed when a quality step drops the clouds, so coming back
    // does not reload the texture. See services/globe/globeQuality.ts.
    const unsubscribeQuality = subscribeGlobeQuality(() => {
      if (mesh && loaded) {
        shownByQuality.current = qualityStepOf(getGlobeQuality()).clouds;
        mesh.visible = shownByQuality.current && !suppressedRef.current && madeUpCloudsBelong();
      }
      requestClouds();
    });
    const fallbackTimer = setTimeout(() => {
      fallbackElapsed = true;
      requestClouds();
    }, SETTLE_FALLBACK_MS);

    const setup = (readyScene: THREE.Scene) => {
      scene = readyScene;
      geometry = new THREE.SphereGeometry(GLOBE_RADIUS_UNITS * (1 + CLOUDS_ALTITUDE), 64, 64);
      material = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0, depthWrite: false });
      mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      meshRef.current = mesh;
      // In a group of its own, drawn with the ground fields: under a raised territories
      // shell, which tints it (globe-engine/shellLift.ts). A mesh straight on the scene
      // sorts with every group at 0, after the shell.
      holder = groundField(new THREE.Group());
      holder.add(mesh);
      scene.add(holder);

      // Quality may already have settled while the scene was coming up.
      requestClouds();

      const animate = () => {
        if (disposed || !mesh) return;
        // The skin can change under a built globe; the made-up clouds follow it (C28).
        if (madeUpCloudsBelong()) {
          requestClouds();
          // Back on a skin they belong to: shown as quality and the real clouds allow.
          const wanted = loaded && shownByQuality.current && !suppressedRef.current;
          if (mesh.visible !== wanted) mesh.visible = wanted;
        } else if (mesh.visible) {
          mesh.visible = false;
        }
        // Whether the clouds are in the picture, for a card's imagery credit (TX8): loaded and shown.
        setCloudsDrawn(loaded && mesh.visible);
        // And whether they are meant to be, so a card made at full detail can wait for them.
        setCloudsWanted(madeUpCloudsBelong() && qualityStepOf(getGlobeQuality()).clouds && !suppressedRef.current);
        // A card is not taken halfway through their fade-in.
        if (loaded && material && fullDetailHeld()) material.opacity = 1;
        if (mesh.visible) mesh.rotation.y += (CLOUDS_ROTATION_DEG_PER_FRAME * Math.PI) / 180;
        if (loaded && material && material.opacity < 1) {
          material.opacity = Math.min(1, material.opacity + FADE_IN_PER_FRAME);
        }
        frameRef.current = requestAnimationFrame(animate);
      };
      frameRef.current = requestAnimationFrame(animate);

      // A capture holds the clouds at its moment's drift, fully faded in, and puts them back (IM23).
      let held: { rotation: number; opacity: number } | null = null;
      leaveStill = onStill({
        still: (atMs) => {
          if (!mesh || !material) return;
          held = { rotation: mesh.rotation.y, opacity: material.opacity };
          mesh.rotation.y = cloudAngleAt(atMs);
          material.opacity = 1;
          // three.js reads the world matrix as it draws: the capture renders before the next update.
          mesh.updateMatrixWorld(true);
        },
        release: () => {
          if (!held || !mesh || !material) return;
          mesh.rotation.y = held.rotation;
          material.opacity = held.opacity;
          mesh.updateMatrixWorld(true);
          held = null;
        },
      });
    };

    let attempts = 0;
    const pollForScene = () => {
      if (disposed) return;
      const readyScene = globeRef.current?.scene?.();
      if (readyScene) {
        setup(readyScene);
        return;
      }
      attempts += 1;
      if (attempts >= SCENE_POLL_MAX_ATTEMPTS) {
        log.warn('Globe scene never became available; cloud layer not added');
        return;
      }
      pollTimer = setTimeout(pollForScene, SCENE_POLL_MS);
    };
    pollForScene();

    return () => {
      disposed = true;
      setCloudsDrawn(false);
      leaveStill?.();
      unsubscribeQuality();
      clearTimeout(fallbackTimer);
      if (pollTimer) clearTimeout(pollTimer);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (holder && scene) scene.remove(holder);
      geometry?.dispose();
      material?.map?.dispose?.();
      material?.dispose();
    };
  }, [globeRef]);
}
