/**
 * Sky from a place on the globe (critique-2026-11-01, OR9, OR32, OR41–OR43; plan D5). Choosing it on the Solar System
 * kit opens it at the point under the view's centre (OR43): the camera glides down to the ground there, the globe's
 * own controls give way, and a drag turns the view while the wheel widens or narrows it (OR42). The stars, the IAU's
 * figures and the 88 names are drawn far beyond Neptune, turned by the moment the time bar shows, so the sky turns as it
 * does; the planets, the Sun and the Moon stand at their true places and sizes (the distances are True's). Below the
 * horizon the Earth hides what is there. Choosing another scale, or anything that moves the camera, gives the globe
 * back, the camera over the same place.
 */
import { sourceAllowed } from '../../../legal/buildProfile';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { onSceneRender } from '../../../globe-engine/sceneRenderHooks';
import { stilledAt } from '../../../globe-engine/captureClock';
import { subsolarDirectionWorld } from '../../../globe-engine/globeLighting';
import { setSkyDrawn } from '../../../globe-engine/imagery';
import { skyFrame } from '../../../solar-system/bodyPlacement';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { BOUNDARY_CONTOURS_TYPE } from '../../../globe-engine/SpaceWeatherGeometry';
import { setHoverOwner } from '../hoverOwners';
import { skyWeightNow, solarScale, subscribeSolarScale } from '../../../solar-system/solarScale';
import { closeSky, openSky, setSkyLook, skyLook, takeLiftOnClose } from '../../../solar-system/sky/skyLook';
import {
  createDome, createFigures, createNames, createStars, daylightOf, nightOf, sizeNames, type SkyData,
} from '../../../solar-system/sky/skyObjects';

/** How high above the ground the observer's eye is: three kilometres, clear of the globe's flat facets. */
const EYE_HEIGHT_UNITS = 0.05;
const GLOBE_RADIUS_UNITS = 100;
const POLL_MS = 250;
/** Where the baked sky is served (scripts/sky/bake-sky.mjs), fetched only when Sky first opens. */
export const SKY_DATA_URL = '/data/sky/sky-mag6.json';

type Pov = { lat: number; lng: number; altitude: number };
type GlobeLike = {
  scene?: () => THREE.Scene;
  camera?: () => THREE.PerspectiveCamera;
  controls?: () => { enabled: boolean };
  renderer?: () => THREE.WebGLRenderer;
  pointOfView?: (pov?: Partial<Pov>, ms?: number) => Pov;
};

/**
 * What Space Weather draws round the Earth that no eye on the ground sees (the owner, 3 Nov: "what an eye sees"): the
 * solar wind, ENLIL, the CMEs, the field lines, the belts, the flow near the Earth, the cusps, the tail sheet, the
 * magnetopause and the bow shock. Hidden in Sky, each render only; the aurora is seen, and stays.
 */
export const SKY_HIDDEN_NAMES: ReadonlySet<string> = new Set([
  'heliosphere', 'enlil', 'cmes', 'field-lines', 'van-allen-belts', 'near-earth-flow-layer', 'cusps', 'tail-sheet-layer',
]);
export const hiddenInSky = (object: THREE.Object3D): boolean =>
  SKY_HIDDEN_NAMES.has(object.name) || object.userData?.type === BOUNDARY_CONTOURS_TYPE;

/** The observer's own axes at a place: up, north and east, in the globe's frame. */
export function localAxes(lat: number, lng: number): { up: THREE.Vector3; north: THREE.Vector3; east: THREE.Vector3 } {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lng);
  const up = latLngToGlobeWorld(lat, lng, 1).normalize();
  const north = new THREE.Vector3(-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo));
  const east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo));
  return { up, north, east };
}

/** Where a person at a place looks, at an azimuth from north through east and an altitude above the horizon, degrees. */
export function lookDirection(lat: number, lng: number, azDeg: number, altDeg: number): THREE.Vector3 {
  const { up, north, east } = localAxes(lat, lng);
  const az = THREE.MathUtils.degToRad(azDeg);
  const alt = THREE.MathUtils.degToRad(altDeg);
  return north.multiplyScalar(Math.cos(alt) * Math.cos(az)).add(east.multiplyScalar(Math.cos(alt) * Math.sin(az))).add(up.multiplyScalar(Math.sin(alt))).normalize();
}

/** How high the Sun stands at a place at `at`, degrees. */
export function sunAltitude(lat: number, lng: number, at: Date): number {
  const up = latLngToGlobeWorld(lat, lng, 1).normalize();
  return THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(subsolarDirectionWorld(at).dot(up), -1, 1)));
}

export function useGlobeSky(globeRef: RefObject<unknown>, pausedAt: number | null): void {
  const pausedAtRef = useRef(pausedAt);
  pausedAtRef.current = pausedAt;

  useEffect(() => {
    // The stars are the Yale Bright Star Catalogue's, served for research only, and the figures ship in the same file:
    // a commercial build has no sky until a catalogue it may use replaces them (D-CS, CS1, CS12, CS13).
    if (!sourceAllowed('starCatalogue')) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const undo: Array<() => void> = [];

    const start = () => {
      if (cancelled) return;
      const globe = globeRef.current as GlobeLike | null;
      const scene = globe?.scene?.();
      const camera = globe?.camera?.();
      const controls = globe?.controls?.();
      const renderer = globe?.renderer?.();
      if (!globe || !scene || !camera || !controls || !renderer) {
        timer = setTimeout(start, POLL_MS);
        return;
      }

      let objects: { stars: ReturnType<typeof createStars>; figures: ReturnType<typeof createFigures>; names: THREE.Group; dome: ReturnType<typeof createDome> } | null = null;
      let loading = false;
      const load = () => {
        if (objects || loading) return;
        loading = true;
        fetch(SKY_DATA_URL)
          .then((response) => (response.ok ? response.json() as Promise<SkyData> : Promise.reject(new Error(`sky data ${response.status}`))))
          .then((data) => {
            if (cancelled) return;
            objects = { stars: createStars(data), figures: createFigures(data), names: createNames(data), dome: createDome() };
            scene.add(objects.dome, objects.stars, objects.figures, objects.names);
          })
          .catch(() => { /* the sky stays dark; the planets, Sun and Moon still draw */ })
          .finally(() => { loading = false; });
      };
      const hide = () => {
        if (!objects) return;
        objects.stars.visible = objects.figures.visible = objects.names.visible = objects.dome.visible = false;
      };

      // What the camera was as Sky opened, to glide down from; what is handed back as it closes.
      let entry: { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null = null;
      let handBack: { fov: number } | null = null;

      const onScale = () => {
        const inSky = solarScale() === 'sky';
        if (inSky && !skyLook()) {
          const pov = globe.pointOfView?.() ?? { lat: 0, lng: 0, altitude: 2.5 };
          openSky(pov.lat, pov.lng);
          entry = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
          handBack = { fov: camera.fov };
          controls.enabled = false;
          setHoverOwner('sky', true);
          load();
        } else if (!inSky && skyLook()) {
          const { lat, lng } = skyLook()!;
          closeSky();
          hide();
          setSkyDrawn(false);
          camera.up.set(0, 1, 0);
          camera.fov = handBack?.fov ?? camera.fov;
          camera.updateProjectionMatrix();
          controls.enabled = true;
          setHoverOwner('sky', false);
          entry = null;
          // Over the place it was seen from, unless the camera is being sent somewhere else (setGlobePointOfView).
          if (takeLiftOnClose()) globe.pointOfView?.({ lat, lng, altitude: 1.8 }, 1500);
        }
      };
      undo.push(subscribeSolarScale(onScale));
      onScale();

      // A drag turns the view, grabbing the sky; the wheel widens or narrows it (OR42).
      const canvas = renderer.domElement;
      let drag: { x: number; y: number; az: number; alt: number } | null = null;
      const down = (event: PointerEvent) => {
        const look = skyLook();
        if (!look || event.button !== 0) return;
        drag = { x: event.clientX, y: event.clientY, az: look.az, alt: look.alt };
      };
      const move = (event: PointerEvent) => {
        const look = skyLook();
        if (!look || !drag) return;
        const degPerPx = look.fov / Math.max(1, canvas.clientHeight);
        setSkyLook({ az: drag.az - (event.clientX - drag.x) * degPerPx, alt: drag.alt + (event.clientY - drag.y) * degPerPx });
      };
      const up = () => { drag = null; };
      const wheel = (event: WheelEvent) => {
        const look = skyLook();
        if (!look) return;
        event.preventDefault();
        event.stopPropagation();
        setSkyLook({ fov: look.fov * Math.pow(1.12, Math.sign(event.deltaY)) });
      };
      canvas.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      canvas.addEventListener('wheel', wheel, { passive: false, capture: true });
      undo.push(() => {
        canvas.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        canvas.removeEventListener('wheel', wheel, { capture: true });
      });

      // What no eye on the ground sees, hidden for each render and put back as it was after it: their own hooks keep
      // their visibility, which is never changed for them. Looked for again each second, as they come and go.
      let veiled: THREE.Object3D[] = [];
      let veiledAt = -Infinity;
      const was = new Map<THREE.Object3D, boolean>();
      const afterBefore = scene.onAfterRender;
      scene.onAfterRender = function (this: THREE.Scene, ...args: Parameters<THREE.Scene['onAfterRender']>) {
        afterBefore.apply(this, args);
        for (const [object, visible] of was) object.visible = visible;
        was.clear();
      };
      undo.push(() => { scene.onAfterRender = afterBefore; });

      const ground = new THREE.Vector3();
      const ahead = new THREE.Vector3();
      const facing = new THREE.Quaternion();
      const turn = new THREE.Matrix4();
      const viewport = new THREE.Vector2();
      undo.push(onSceneRender(scene, (r) => {
        const look = skyLook();
        if (!look) return;
        const weight = entry ? skyWeightNow() : 1;
        if (performance.now() - veiledAt > 1000) {
          veiled = [];
          scene.traverse((object) => { if (hiddenInSky(object)) veiled.push(object); });
          veiledAt = performance.now();
        }
        for (const object of veiled) {
          if (!was.has(object)) was.set(object, object.visible);
          object.visible = false;
        }
        const at = new Date(stilledAt() ?? pausedAtRef.current ?? Date.now());
        const { up: zenith } = localAxes(look.lat, look.lng);

        // The camera: on the ground, looking where the person looks; gliding down from the globe as Sky opens.
        ground.copy(zenith).multiplyScalar(GLOBE_RADIUS_UNITS + EYE_HEIGHT_UNITS);
        ahead.copy(ground).add(lookDirection(look.lat, look.lng, look.az, look.alt));
        facing.setFromRotationMatrix(turn.lookAt(ground, ahead, zenith));
        if (entry && weight < 1) {
          camera.position.lerpVectors(entry.position, ground, weight);
          camera.quaternion.slerpQuaternions(entry.quaternion, facing, weight);
          camera.fov = entry.fov + (look.fov - entry.fov) * weight;
        } else {
          entry = null;
          camera.position.copy(ground);
          camera.quaternion.copy(facing);
          camera.fov = look.fov;
        }
        camera.up.copy(zenith);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);

        if (!objects) return;
        // The sky turned to the moment shown, and as dark as the Sun allows.
        const frame = skyFrame(at);
        const sunAlt = sunAltitude(look.lat, look.lng, at);
        const night = nightOf(sunAlt) * weight;
        const { day, twilight } = daylightOf(sunAlt);
        for (const object of [objects.stars, objects.figures, objects.names]) {
          object.matrix.copy(frame);
          object.updateMatrixWorld(true);
          object.visible = night > 0.01;
        }
        objects.stars.material.uniforms.opacity.value = night;
        objects.stars.material.uniforms.pixelRatio.value = r.getPixelRatio();
        objects.stars.material.uniforms.widen.value = THREE.MathUtils.clamp(Math.sqrt(70 / look.fov), 0.8, 2.2);
        objects.figures.material.opacity = night;
        sizeNames(objects.names, r.getSize(viewport).y, night * 0.9);
        const dome = objects.dome;
        dome.position.copy(camera.position);
        dome.updateMatrixWorld(true);
        dome.material.uniforms.up.value.copy(zenith);
        dome.material.uniforms.sun.value.copy(subsolarDirectionWorld(at));
        dome.material.uniforms.day.value = day * weight;
        dome.material.uniforms.twilight.value = twilight * weight;
        dome.visible = weight > 0;
        // The stars and figures are in the picture: their credits go on a card (imagery.ts).
        setSkyDrawn(night > 0.01);
      }));
    };
    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      for (const each of undo) each();
      setSkyDrawn(false);
      setHoverOwner('sky', false);
    };
  }, [globeRef]);
}
