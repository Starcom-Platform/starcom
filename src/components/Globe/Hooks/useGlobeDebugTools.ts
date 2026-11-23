/**
 * useGlobeDebugTools — the globe's QA/debug toolkit, extracted from Globe.tsx.
 *
 * Three independent hooks, all conditionally gated behind
 * `NODE_ENV === 'development'` (and, for two of them, an opt-in URL param on
 * top of that), so extracting them changes zero production behavior — worst
 * case if one of these is subtly wrong is a QA tool regressing, not the
 * shipped app. Grouped in one file because they're one concern (tooling for
 * verifying the globe renders correctly) even though none shares state with
 * the others; each is called independently from Globe.tsx.
 *
 * None of these has automated test coverage, before or after this
 * extraction, because none is meaningfully testable without a real canvas,
 * a real Three.js scene, and a real camera — jsdom doesn't have any of the
 * three. The verification that matters is live: run the app with
 * `?geoSnap=all` or `?geoDebugOverlay=markers` and confirm the tool still
 * does what its name says.
 */
import { useEffect, RefObject, MutableRefObject } from 'react';
import * as THREE from 'three';
import { GlobeMethods } from 'react-globe.gl';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { setGlobePointOfView } from '../../../utils/globeCameraMath';
import { createLogger } from '@utils/logger';
import type { GeoPoliticalConfig } from '../../../hooks/useGeoPoliticalSettings';

const log = createLogger({ prefix: 'globe-debug' });

const isDev = () => typeof window !== 'undefined' && process.env.NODE_ENV === 'development';

/**
 * Exposes `window.__globeDebugApi` — real lat/lng-to-screen projection and
 * direct camera control, for Playwright to drive precise mouse positions onto
 * small real markers (sweeping the canvas blind misses markers a few px
 * across) without faking zoom-button/wheel interaction sequences.
 */
export const useGlobeDebugApi = (
  globeRef: RefObject<unknown>,
  containerRef: RefObject<HTMLDivElement | null>,
): void => {
  useEffect(() => {
    if (!isDev()) return;
    (window as unknown as { __globeDebugApi?: unknown }).__globeDebugApi = {
      projectLatLngToScreen: (lat: number, lng: number, radiusUnits = 101) => {
        const globeObj = globeRef.current as unknown as { camera?: () => THREE.Camera } | undefined;
        const camera = globeObj?.camera?.();
        if (!camera || !containerRef.current) return null;
        const worldPos = latLngToGlobeWorld(lat, lng, radiusUnits);
        const projected = worldPos.clone().project(camera);
        const rect = containerRef.current.getBoundingClientRect();
        return {
          x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
          behindCamera: projected.z > 1,
        };
      },
      /** The live scene and camera — for asking what covers what, by raycast. */
      scene: () => (globeRef.current as unknown as { scene?: () => THREE.Scene } | undefined)?.scene?.() ?? null,
      camera: () => (globeRef.current as unknown as { camera?: () => THREE.Camera } | undefined)?.camera?.() ?? null,
      setAltitude: (altitude: number) => {
        const g = globeRef.current as unknown as GlobeMethods | undefined;
        if (!g) return;
        const current = g.pointOfView();
        setGlobePointOfView(g, { lat: current.lat, lng: current.lng, altitude }, 0);
      },
      /**
       * What the globe actually costs, per frame.
       *
       * The globe has been "heavy" for as long as this project has existed and
       * nobody could say in what way, because nothing reported draw calls,
       * triangle count, texture count or the resolution it renders at. Those
       * are the four numbers that decide the answer, and three of them are
       * hardware-independent — so they can be read under swiftshader in CI and
       * still mean something.
       *
       * `renderer.info.render` is reset each frame by three.js, so the counts
       * below describe ONE frame, not a cumulative total.
       */
      stats: () => {
        const g = globeRef.current as unknown as { renderer?: () => THREE.WebGLRenderer } | undefined;
        const renderer = g?.renderer?.();
        if (!renderer) return null;
        const canvas = renderer.domElement;
        return {
          // Monotonic across the session, unlike the per-frame counters below
          // which simply retain their last value when no render happens — so
          // this is the only one that can tell "rendering" from "paused".
          frame: renderer.info.render.frame,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          programs: renderer.info.programs?.length ?? 0,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          pixelRatio: renderer.getPixelRatio(),
          drawingBufferPx: canvas.width * canvas.height,
          cssPx: canvas.clientWidth * canvas.clientHeight,
        };
      },
      pointOfViewTo: (lat: number, lng: number, altitude: number) => {
        const g = globeRef.current as unknown as GlobeMethods | undefined;
        if (!g) return;
        setGlobePointOfView(g, { lat, lng, altitude }, 0);
      },
    };
  }, [globeRef, containerRef]);
};

const SHOTS: Record<string, { lat: number; lng: number; altitude?: number; ms?: number }> = {
  seam0: { lat: 0, lng: 0, altitude: 2.6, ms: 700 },
  eq90E: { lat: 0, lng: 90, altitude: 2.6, ms: 700 },
  eq90W: { lat: 0, lng: -90, altitude: 2.6, ms: 700 },
  anti180: { lat: 0, lng: 180, altitude: 2.6, ms: 700 },
  pm45N: { lat: 45, lng: 0, altitude: 2.8, ms: 800 },
  pm45S: { lat: -45, lng: 0, altitude: 2.8, ms: 800 },
  lat45E: { lat: 45, lng: 90, altitude: 2.8, ms: 800 },
  lat45W: { lat: 45, lng: -90, altitude: 2.8, ms: 800 },
  // Limb comparison viewpoint
  limb: { lat: 0, lng: 90, altitude: 2.6, ms: 800 },
  limbNoBias: { lat: 0, lng: 90, altitude: 2.6, ms: 800 },
  limbWithBias: { lat: 0, lng: 90, altitude: 2.6, ms: 800 },
  // Poles
  northPole: { lat: 85, lng: 0, altitude: 3.0, ms: 800 },
  southPole: { lat: -85, lng: 0, altitude: 3.0, ms: 800 },
  // Small islands regions (approximate centers)
  maldives: { lat: 3.2, lng: 73.2, altitude: 2.2, ms: 900 },
  aegean: { lat: 37.9, lng: 25.0, altitude: 2.2, ms: 900 },
  caribbean: { lat: 13.1, lng: -59.6, altitude: 2.2, ms: 900 },
  pacificMicro: { lat: 7.0, lng: 158.0, altitude: 2.3, ms: 900 },
  // Disputed and maritime hotspots (approximate views for QA)
  kashmirLoC: { lat: 34.4, lng: 74.3, altitude: 3.0, ms: 900 },
  westSahara: { lat: 24.5, lng: -13.0, altitude: 3.0, ms: 900 },
  southChinaSea: { lat: 15.0, lng: 115.0, altitude: 2.9, ms: 900 },
};

/**
 * Scripted camera snapshots (`?geoSnap=key1,key2` or `?geoSnap=all`) —
 * downloads a PNG of the canvas at each scripted lat/lng/altitude, for an
 * alignment/QA baseline. Runs once per page load (`snapDoneRef`).
 *
 * The bias-restore fix: the original inline effect captured the
 * territory-rendering bias settings, mutated them for the limb-comparison
 * shots, and restored them after the loop — but the restore sat OUTSIDE any
 * try/finally around the loop, so an exception partway through (a bad shot
 * key, a canvas that briefly isn't found) would leave the app's border
 * rendering in the QA-biased state rather than back where it started. Found
 * during this extraction; fixed here with a try/finally around the loop —
 * the restore now runs whether or not the loop completes cleanly.
 */
export const useGlobeSnapshotTool = (
  globeRef: RefObject<unknown>,
  containerRef: RefObject<HTMLDivElement | null>,
  snapDoneRef: MutableRefObject<boolean>,
  updateNationalTerritories: (patch: Record<string, unknown>) => void,
  geoPoliticalConfig: GeoPoliticalConfig | undefined,
): void => {
  useEffect(() => {
    if (!isDev()) return;
    if (!globeRef.current || !containerRef.current) return;
    if (snapDoneRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const snapParam = params.get('geoSnap');
    if (!snapParam) return;

    const keys = snapParam === 'all' ? Object.keys(SHOTS) : snapParam.split(',').map((s) => s.trim()).filter(Boolean);

    const awaitFrames = async (count = 2) => {
      for (let i = 0; i < count; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    };

    const g = globeRef.current as unknown as GlobeMethods;
    const doSnap = (name: string) => {
      const canvas = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        log.warn('Snapshot skipped, canvas not found for', name);
        return;
      }
      try {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `globe-${name}-${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        log.debug(`📸 Captured snapshot: ${name}`);
      } catch (err) {
        log.warn('Snapshot failed for', name, err);
      }
    };

    snapDoneRef.current = true; // ensure single run
    (async () => {
      const fParams = new URLSearchParams(window.location.search);
      const maritimeFlag = fParams.get('geoMaritime');
      const disputedFlag = fParams.get('geoDisputed');
      const lodFlag = fParams.get('geoLod'); // 0|1|2 to lock LOD deterministically
      if (maritimeFlag !== null || disputedFlag !== null || lodFlag !== null) {
        updateNationalTerritories({
          ...(maritimeFlag !== null ? { showMaritimeBorders: maritimeFlag !== '0' && maritimeFlag !== 'false' } : {}),
          ...(disputedFlag !== null ? { showDisputedTerritories: disputedFlag !== '0' && disputedFlag !== 'false' } : {}),
          ...(lodFlag !== null
            ? {
                lod: {
                  mode: 'locked',
                  lockedLevel: (['0', '1', '2'].includes(lodFlag) ? Number(lodFlag) : 2) as 0 | 1 | 2,
                  hysteresis: geoPoliticalConfig?.nationalTerritories?.lod?.hysteresis ?? 25,
                },
              }
            : {}),
        });
        await new Promise((r) => setTimeout(r, 300));
      }

      const originalBias = {
        fillElevationEpsilon: geoPoliticalConfig?.nationalTerritories?.fillElevationEpsilon,
        usePolygonOffset: geoPoliticalConfig?.nationalTerritories?.usePolygonOffset,
        polygonOffsetFactor: geoPoliticalConfig?.nationalTerritories?.polygonOffsetFactor,
        polygonOffsetUnits: geoPoliticalConfig?.nationalTerritories?.polygonOffsetUnits,
      };

      try {
        for (const k of keys) {
          const s = SHOTS[k];
          if (!s) {
            log.warn('Unknown geoSnap key:', k);
            continue;
          }
          try {
            if (k === 'limbNoBias') {
              updateNationalTerritories({ fillElevationEpsilon: 0, usePolygonOffset: false });
              await new Promise((r) => setTimeout(r, 500));
              await awaitFrames(2);
            }
            if (k === 'limbWithBias') {
              updateNationalTerritories({
                fillElevationEpsilon: 0.3,
                usePolygonOffset: true,
                polygonOffsetFactor: -1.5,
                polygonOffsetUnits: -1.5,
              });
              await new Promise((r) => setTimeout(r, 600));
              await awaitFrames(2);
            }
            setGlobePointOfView(g, { lat: s.lat, lng: s.lng, altitude: s.altitude ?? 2.6 }, s.ms ?? 700);
          } catch {
            // ignore — a single bad shot must not abort the rest of the run
          }
          await new Promise((r) => setTimeout(r, (s.ms ?? 700) + 300));
          await awaitFrames(2);
          doSnap(k);
          await new Promise((r) => setTimeout(r, 250));
        }
      } finally {
        // Runs whether the loop above completed, threw, or was interrupted —
        // this is the fix. The original restored bias only after a normal
        // loop completion, so an exception left rendering bias mutated.
        updateNationalTerritories({
          fillElevationEpsilon: originalBias.fillElevationEpsilon,
          usePolygonOffset: originalBias.usePolygonOffset,
          polygonOffsetFactor: originalBias.polygonOffsetFactor,
          polygonOffsetUnits: originalBias.polygonOffsetUnits,
        });
      }
    })();
  }, [globeRef, containerRef, snapDoneRef, updateNationalTerritories, geoPoliticalConfig]);
};

/**
 * Debug prime-meridian/equator alignment markers
 * (`?geoDebugOverlay=markers|audit`). Same phi/theta convention as other
 * Globe overlays (theta = lon+180, inverted X). Always shows the origin
 * marker in dev; `markers`/`audit` add a wider marker grid, `audit` also
 * draws full prime-meridian/equator/anti-meridian lines.
 */
export const useGlobeDebugMarkers = (
  globeRef: RefObject<unknown>,
  isInitializing: boolean,
  markerGroupRef: MutableRefObject<THREE.Group>,
): void => {
  useEffect(() => {
    if (!isDev()) return;
    if (!globeRef.current) return;

    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    if (!scene) return;

    const group = markerGroupRef.current;

    const disposeChildren = () => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          const geom = (child as THREE.Mesh | THREE.Line).geometry as THREE.BufferGeometry | undefined;
          geom?.dispose();
          const material = (child as THREE.Mesh | THREE.Line).material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else if (material) material.dispose();
        }
      }
    };

    disposeChildren();

    const radius = 102; // Globe radius is ~100; place slightly above to avoid z-fighting
    const addMarker = (latDeg: number, lonDeg: number, color = 0xffff00) => {
      const pos = latLngToGlobeWorld(latDeg, lonDeg, radius);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 12),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      sphere.position.copy(pos);
      group.add(sphere);
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        pos.clone().multiplyScalar(0.985),
        pos.clone().multiplyScalar(1.015),
      ]);
      const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
      group.add(line);
    };

    const addPolyline = (points: Array<{ lat: number; lon: number }>, color: number, opacity = 0.8) => {
      const vectors = points.map((point) => latLngToGlobeWorld(point.lat, point.lon, radius));
      const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
      const line = new THREE.LineLoop(geometry, material);
      group.add(line);
    };

    addMarker(0, 0, 0xffff00);

    const params = new URLSearchParams(window.location.search);
    const overlayMode = params.get('geoDebugOverlay');
    const showFull = overlayMode === 'markers';
    const showAudit = overlayMode === 'audit';
    if (showFull || showAudit) {
      addMarker(0, 90, 0x00ffff);
      addMarker(0, -90, 0x00ffff);
      const lats = [45, -45];
      const lons = [0, 90, 180];
      for (const lat of lats) {
        for (const lon of lons) addMarker(lat, lon, 0xff66ff);
      }
    }

    if (showAudit) {
      const meridianPoints: Array<{ lat: number; lon: number }> = [];
      const antiMeridianPoints: Array<{ lat: number; lon: number }> = [];
      const equatorPoints: Array<{ lat: number; lon: number }> = [];
      for (let lat = -90; lat <= 90; lat += 2) {
        meridianPoints.push({ lat, lon: 0 });
        antiMeridianPoints.push({ lat, lon: 180 });
      }
      for (let lon = -180; lon <= 180; lon += 2) equatorPoints.push({ lat: 0, lon });

      addPolyline(meridianPoints, 0xffdd00, 0.95);
      addPolyline(equatorPoints, 0x00ffcc, 0.8);
      addPolyline(antiMeridianPoints, 0xff5599, 0.7);

      addMarker(51.4769, 0, 0xffffff); // Greenwich Observatory (approx)

      log.info('[GeoAudit] Enabled coordinate audit overlay', {
        mode: 'audit',
        includes: ['origin-marker', 'prime-meridian-line', 'equator-line', 'anti-meridian-line', 'greenwich-marker'],
      });
    }

    if (!scene.children.includes(group)) scene.add(group);

    return () => {
      if (scene && group && scene.children.includes(group)) scene.remove(group);
      disposeChildren();
    };
  }, [globeRef, isInitializing, markerGroupRef]);
};
