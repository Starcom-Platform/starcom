import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createLogger } from '../../../utils/logger';
import { groundUnderShell, shellLift } from '../../../globe-engine/shellLift';

const log = createLogger({ prefix: 'useCursorTrail3D' });

/**
 * The cursor trail: a small indicator that rides the globe's surface under the
 * pointer, with a fading tail behind it.
 *
 * ─── ADR-0002, THE SECOND EXTRACTION AND THE AWKWARD ONE ───────────────────
 *
 * Sixteen refs, eleven tuning constants and four effects, one of which is a 169
 * line requestAnimationFrame loop — the largest single block in the component
 * this came out of. All of it belongs together and none of it belongs there.
 *
 * It could not be lifted directly, because its refs were written from inside
 * `handleUnifiedMouseMove`, a 288-line handler owned by a different concern.
 * Those writes were given names first, in place, so this move is mechanical:
 * the same code, the same order, now behind `CursorTrail3DController`.
 *
 * ─── TWO WRITERS, AND WHY THAT MATTERS ─────────────────────────────────────
 *
 * The trail is driven from two directions and only ever one at a time:
 *
 *   Intel modes           the host component's mousemove handler calls the
 *                         controller returned here.
 *   Non-intel modes       the last effect below attaches its own listeners and
 *                         does its own raycast, and early-returns when
 *                         `hasInteractiveMarkers` is true.
 *
 * That gate is the whole reason this extraction is delicate. Break the
 * controller path and the trail keeps working in non-intel modes, so it looks
 * fine wherever you happen to test it, and is dead everywhere else. If you
 * change anything here, check BOTH.
 *
 * ─── THE CONSTANTS MOVED TO MODULE SCOPE ───────────────────────────────────
 *
 * They were declared inside the component, so every one of them appeared in the
 * effects' dependency arrays — eleven entries that could never change. At module
 * scope they are what they always were: constants.
 */

const CURSOR_TRAIL_RESPONSIVENESS = 16;
const CURSOR_TRAIL_MAX_DEG_PER_SEC = 300;
const CURSOR_SURFACE_OFFSET = 1;
const CURSOR_ANGLE_EPSILON = 1e-5;
const CURSOR_TAIL_MAX_POINTS = 24;
const CURSOR_TAIL_MIN_POINTS = 8;
const CURSOR_TAIL_BASE_OPACITY = 0.22;
const CURSOR_TAIL_MAX_OPACITY = 0.58;
const CURSOR_TAIL_MIN_INTENSITY = 0.22;
const CURSOR_TAIL_PX_FOR_MAX_INTENSITY = 28;
const CURSOR_TAIL_INTENSITY_DECAY_PER_SEC = 2.4;

export interface UseCursorTrail3DParams {
  /** The overlay toggle. False hides the indicator and stops the animation. */
  cursorTrailIndicatorEnabled: boolean;
  /**
   * Whether intel markers are present, which decides WHICH writer drives the
   * trail — see the two-writers note above.
   */
  hasInteractiveMarkers: boolean;
  globeRef: React.RefObject<{ scene: () => THREE.Scene; camera: () => THREE.Camera }>;
  containerRef?: React.RefObject<HTMLDivElement>;
  /**
   * Passed in rather than owned: the globe mesh lookup is shared with concerns
   * that are staying in the component, so it cannot move into any one hook.
   */
  resolveGlobeMesh: (scene: THREE.Scene) => THREE.Mesh | null;
}

export interface CursorTrail3DController {
  /** Feed pointer movement in, so the tail's opacity tracks pointer speed. */
  noteCursorScreenMotion: (clientX: number, clientY: number) => void;
  /** Aim the indicator at a point on the globe. False if unusable. */
  setCursorSurfaceTarget: (intersectionPoint: THREE.Vector3) => boolean;
  /** Hide the indicator and its tail. */
  hideCursorIndicator: () => void;
  /** Hide, and forget the last pointer position so re-enabling does not jump. */
  resetCursorTrail: () => void;
}

export function useCursorTrail3D({
  cursorTrailIndicatorEnabled,
  hasInteractiveMarkers,
  globeRef,
  containerRef,
  resolveGlobeMesh,
}: UseCursorTrail3DParams): CursorTrail3DController {
  /*
   * Its own scratch raycaster, rather than the component's.
   *
   * That one is shared between three writers — the measurement effect, the
   * hover handler and this trail — and is a plain `new THREE.Raycaster()` with
   * no configuration on it, used only as setFromCamera-then-intersect scratch
   * space. So a private instance behaves identically and removes a coupling
   * that was invisible: nothing here can now observe a value another concern
   * left behind between frames.
   */
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const indicatorMeshRef = useRef<THREE.Mesh | null>(null);
  const indicatorTailRef = useRef<THREE.Line | null>(null);
  const indicatorTailAttributeRef = useRef<THREE.BufferAttribute | null>(null);
  const indicatorTailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const indicatorTailPositionsRef = useRef<Float32Array | null>(null);
  const indicatorTailHistoryRef = useRef<THREE.Vector3[]>([]);
  const indicatorMotionIntensityRef = useRef<number>(0);
  const indicatorLastScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  /*
   * Private scratch, like the raycaster above. The component has one of these
   * too, shared between concerns; this hook writes normalised device coordinates
   * into it on every non-intel mousemove and reads them back immediately, so a
   * separate instance behaves identically and shares nothing.
   */
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const indicatorTargetNormalRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const indicatorDisplayNormalRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const indicatorTargetRadiusRef = useRef<number>(0);
  const indicatorTargetActiveRef = useRef<boolean>(false);
  const indicatorDisplayInitializedRef = useRef<boolean>(false);
  const indicatorRotationAxisRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const indicatorFallbackAxisRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const prefersReducedMotionRef = useRef<boolean>(false);

  /*
   * ─── THE CURSOR TRAIL'S SEAM ───────────────────────────────────────────────
   *
   * Three things the mousemove handler does to the trail, named. Defined here
   * as a step toward ADR-0002's `useCursorTrail3D`: the trail owns sixteen refs
   * that nothing else declares, but they are written from inside a 288-line
   * handler belonging to a different concern, so the refs cannot move until the
   * writes have an interface.
   *
   * Behaviour-preserving and verifiable on its own: the same operations, in the
   * same order, called from the same places. Moving them into a hook is then
   * mechanical.
   */
  const hideCursorIndicator = useCallback(() => {
    indicatorTargetActiveRef.current = false;
    const indicator = indicatorMeshRef.current;
    if (indicator) {
      indicator.visible = false;
    }
    const tail = indicatorTailRef.current;
    if (tail) {
      tail.visible = false;
    }
  }, []);

  /** Trail is off: forget where the pointer was, so re-enabling does not jump. */
  const resetCursorTrail = useCallback(() => {
    indicatorLastScreenPosRef.current = null;
    hideCursorIndicator();
  }, [hideCursorIndicator]);

  /**
   * Feed screen movement in, so the tail's opacity tracks how fast the pointer
   * is going. Decays toward the new delta rather than replacing it, which is
   * what keeps the tail from flickering between frames.
   */
  const noteCursorScreenMotion = useCallback((clientX: number, clientY: number) => {
    const prevScreenPos = indicatorLastScreenPosRef.current;
    indicatorLastScreenPosRef.current = { x: clientX, y: clientY };
    if (!prevScreenPos) return;

    const dx = clientX - prevScreenPos.x;
    const dy = clientY - prevScreenPos.y;
    const pxDelta = Math.sqrt(dx * dx + dy * dy);
    const normalizedDelta = THREE.MathUtils.clamp(pxDelta / CURSOR_TAIL_PX_FOR_MAX_INTENSITY, 0, 1);
    indicatorMotionIntensityRef.current = Math.max(indicatorMotionIntensityRef.current * 0.65, normalizedDelta);
  }, []);

  /**
   * Point the indicator at a spot on the globe. Hides it and reports false if
   * the intersection is not usable — a non-finite normal or radius would put
   * the mesh somewhere undefined rather than nowhere.
   */
  const setCursorSurfaceTarget = useCallback((intersectionPoint: THREE.Vector3): boolean => {
    // Over a raised territories shell, as every mark is (globe-engine/shellLift.ts).
    const radius = intersectionPoint.length() * shellLift() + CURSOR_SURFACE_OFFSET;
    const targetNormal = intersectionPoint.clone().normalize();
    const isValidTarget =
      Number.isFinite(targetNormal.x) &&
      Number.isFinite(targetNormal.y) &&
      Number.isFinite(targetNormal.z) &&
      Number.isFinite(radius) &&
      radius > 0;

    if (!isValidTarget) {
      hideCursorIndicator();
      return false;
    }

    indicatorTargetNormalRef.current.copy(targetNormal);
    indicatorTargetRadiusRef.current = radius;
    indicatorTargetActiveRef.current = true;

    if (!indicatorDisplayInitializedRef.current) {
      indicatorDisplayNormalRef.current.copy(targetNormal);
      indicatorDisplayInitializedRef.current = true;
    }
    return true;
  }, [hideCursorIndicator]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      prefersReducedMotionRef.current = mediaQuery.matches;
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;

    const globeObj = globeRef.current;
    const scene = globeObj?.scene();
    if (!scene || typeof scene.add !== 'function') return; // Defensive check for testing

    try {
      // Create a small sphere to indicate mouse position on globe
      const geometry = new THREE.SphereGeometry(0.5, 8, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x00ff41, 
        transparent: true, 
        opacity: 0.7,
        wireframe: true
      });
      const indicator = new THREE.Mesh(geometry, material);
      indicator.visible = false; // Initially hidden
      scene.add(indicator);
      indicatorMeshRef.current = indicator;

      const tailGeometry = new THREE.BufferGeometry();
      const tailPositions = new Float32Array(CURSOR_TAIL_MAX_POINTS * 3);
      const tailAttribute = new THREE.BufferAttribute(tailPositions, 3);
      tailGeometry.setAttribute('position', tailAttribute);
      tailGeometry.setDrawRange(0, 0);

      const tailMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff41,
        transparent: true,
        opacity: CURSOR_TAIL_BASE_OPACITY,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      });

      const tail = new THREE.Line(tailGeometry, tailMaterial);
      tail.visible = false;
      scene.add(tail);

      indicatorTailRef.current = tail;
      indicatorTailGeometryRef.current = tailGeometry;
      indicatorTailAttributeRef.current = tailAttribute;
      indicatorTailPositionsRef.current = tailPositions;
      indicatorTailHistoryRef.current = [];

      return () => {
        indicatorTargetActiveRef.current = false;
        indicatorDisplayInitializedRef.current = false;
        indicatorMeshRef.current = null;
        indicatorTailRef.current = null;
        indicatorTailGeometryRef.current = null;
        indicatorTailAttributeRef.current = null;
        indicatorTailPositionsRef.current = null;
        indicatorTailHistoryRef.current = [];
        if (scene && typeof scene.remove === 'function') {
          scene.remove(indicator);
          scene.remove(tail);
        }

        tailGeometry.dispose();
        tailMaterial.dispose();
      };
    } catch (error) {
      log.warn('Failed to initialize mouse position indicator:', error);
    }
  }, [globeRef]);

  useEffect(() => {
    let animationFrameId: number | null = null;
    let lastFrameTime = 0;

    const animateIndicator = (timestamp: number) => {
      const indicator = indicatorMeshRef.current;
      const tail = indicatorTailRef.current;
      if (!indicator) {
        animationFrameId = requestAnimationFrame(animateIndicator);
        return;
      }

      const dtRaw = lastFrameTime > 0 ? (timestamp - lastFrameTime) / 1000 : 0;
      const dt = Math.min(Math.max(dtRaw, 0), 0.05);
      lastFrameTime = timestamp;

      if (!cursorTrailIndicatorEnabled || !indicatorTargetActiveRef.current || document.hidden) {
        indicator.visible = false;
        indicatorMotionIntensityRef.current = 0;
        if (tail) {
          tail.visible = false;
        }
        animationFrameId = requestAnimationFrame(animateIndicator);
        return;
      }

      const targetNormal = indicatorTargetNormalRef.current;
      const displayNormal = indicatorDisplayNormalRef.current;

      if (!indicatorDisplayInitializedRef.current) {
        displayNormal.copy(targetNormal);
        indicatorDisplayInitializedRef.current = true;
      }

      const dot = THREE.MathUtils.clamp(displayNormal.dot(targetNormal), -1, 1);
      const angle = Math.acos(dot);

      if (angle > CURSOR_ANGLE_EPSILON) {
        const desiredStep = prefersReducedMotionRef.current
          ? angle
          : angle * (1 - Math.exp(-CURSOR_TRAIL_RESPONSIVENESS * Math.max(dt, 1 / 120)));
        const maxStep = THREE.MathUtils.degToRad(CURSOR_TRAIL_MAX_DEG_PER_SEC) * Math.max(dt, 1 / 120);
        const step = prefersReducedMotionRef.current
          ? angle
          : Math.min(angle, desiredStep, maxStep);

        if (step > 0) {
          const rotationAxis = indicatorRotationAxisRef.current;
          rotationAxis.copy(displayNormal).cross(targetNormal);

          if (rotationAxis.lengthSq() < 1e-10) {
            rotationAxis.copy(displayNormal).cross(indicatorFallbackAxisRef.current);
            if (rotationAxis.lengthSq() < 1e-10) {
              rotationAxis.set(1, 0, 0);
            }
          }

          rotationAxis.normalize();
          displayNormal.applyAxisAngle(rotationAxis, step).normalize();
        }
      } else {
        displayNormal.copy(targetNormal);
      }

      const targetRadius = indicatorTargetRadiusRef.current;
      if (!Number.isFinite(targetRadius) || targetRadius <= 0) {
        indicator.visible = false;
        if (tail) {
          tail.visible = false;
        }
        indicatorTargetActiveRef.current = false;
        animationFrameId = requestAnimationFrame(animateIndicator);
        return;
      }

      indicator.position.copy(displayNormal).multiplyScalar(targetRadius);
      indicator.visible = true;

      if (tail && indicatorTailAttributeRef.current && indicatorTailPositionsRef.current) {
        const tailAttribute = indicatorTailAttributeRef.current;
        const tailPositions = indicatorTailPositionsRef.current;
        const tailHistory = indicatorTailHistoryRef.current;

        if (tailHistory.length !== CURSOR_TAIL_MAX_POINTS) {
          tailHistory.length = 0;
          for (let index = 0; index < CURSOR_TAIL_MAX_POINTS; index += 1) {
            tailHistory.push(indicator.position.clone());
          }
        }

        for (let index = CURSOR_TAIL_MAX_POINTS - 1; index > 0; index -= 1) {
          tailHistory[index].copy(tailHistory[index - 1]);
        }
        tailHistory[0].copy(indicator.position);

        indicatorMotionIntensityRef.current = Math.max(
          0,
          indicatorMotionIntensityRef.current - CURSOR_TAIL_INTENSITY_DECAY_PER_SEC * Math.max(dt, 1 / 120)
        );

        const intensity = prefersReducedMotionRef.current
          ? 0
          : (() => {
              const normalized = THREE.MathUtils.clamp(indicatorMotionIntensityRef.current, 0, 1);
              if (normalized <= 0) {
                return 0;
              }

              return Math.max(CURSOR_TAIL_MIN_INTENSITY, Math.sqrt(normalized));
            })();

        const activeTailPoints = prefersReducedMotionRef.current
          ? 1
          : Math.max(
              CURSOR_TAIL_MIN_POINTS,
              Math.min(
                CURSOR_TAIL_MAX_POINTS,
                CURSOR_TAIL_MIN_POINTS + Math.round((CURSOR_TAIL_MAX_POINTS - CURSOR_TAIL_MIN_POINTS) * intensity)
              )
            );

        const curveHistoryPoints = tailHistory
          .slice(0, Math.max(activeTailPoints, 2))
          .map((point) => point.clone().normalize().multiplyScalar(targetRadius));
        const curvedPoints = curveHistoryPoints.length >= 2
          ? new THREE.CatmullRomCurve3(curveHistoryPoints, false, 'centripetal', 0.25).getPoints(activeTailPoints - 1)
          : curveHistoryPoints;

        for (let index = 0; index < CURSOR_TAIL_MAX_POINTS; index += 1) {
          const source = curvedPoints[Math.min(index, activeTailPoints - 1)] || curvedPoints[0] || tailHistory[0];
          const offset = index * 3;
          tailPositions[offset] = source.x;
          tailPositions[offset + 1] = source.y;
          tailPositions[offset + 2] = source.z;
        }

        tailAttribute.needsUpdate = true;
        tail.geometry.setDrawRange(0, activeTailPoints);

        const tailMaterial = tail.material as THREE.LineBasicMaterial;
        tailMaterial.opacity = prefersReducedMotionRef.current
          ? 0
          : CURSOR_TAIL_BASE_OPACITY + (CURSOR_TAIL_MAX_OPACITY - CURSOR_TAIL_BASE_OPACITY) * intensity;

        tail.visible = activeTailPoints > 1 && tailMaterial.opacity > 0;
      }

      animationFrameId = requestAnimationFrame(animateIndicator);
    };

    animationFrameId = requestAnimationFrame(animateIndicator);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [cursorTrailIndicatorEnabled]);

  useEffect(() => {
    if (!containerRef.current || !globeRef.current) {
      return;
    }

    const container = containerRef.current;

    const hideIndicator = () => {
      indicatorLastScreenPosRef.current = null;
      indicatorTargetActiveRef.current = false;
      const indicator = indicatorMeshRef.current;
      if (indicator) {
        indicator.visible = false;
      }
      const tail = indicatorTailRef.current;
      if (tail) {
        tail.visible = false;
      }
    };

    const handleGlobalCursorMove = (event: MouseEvent) => {
      if (hasInteractiveMarkers) {
        return;
      }

      if (!cursorTrailIndicatorEnabled || !containerRef.current || !globeRef.current) {
        hideIndicator();
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        hideIndicator();
        return;
      }

      const prevScreenPos = indicatorLastScreenPosRef.current;
      indicatorLastScreenPosRef.current = { x: event.clientX, y: event.clientY };
      if (prevScreenPos) {
        const dx = event.clientX - prevScreenPos.x;
        const dy = event.clientY - prevScreenPos.y;
        const pxDelta = Math.sqrt(dx * dx + dy * dy);
        const normalizedDelta = THREE.MathUtils.clamp(pxDelta / CURSOR_TAIL_PX_FOR_MAX_INTENSITY, 0, 1);
        indicatorMotionIntensityRef.current = Math.max(indicatorMotionIntensityRef.current * 0.65, normalizedDelta);
      }

      const globeObj = globeRef.current;
      const scene = globeObj?.scene();
      const camera = globeObj?.camera();
      if (!scene || !camera) {
        hideIndicator();
        return;
      }

      mouseRef.current.x = (x / rect.width) * 2 - 1;
      mouseRef.current.y = -(y / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const globeMesh = resolveGlobeMesh(scene);
      if (!globeMesh) {
        hideIndicator();
        return;
      }

      const globeIntersects = raycasterRef.current.intersectObject(globeMesh);
      if (!globeIntersects.length) {
        hideIndicator();
        return;
      }

      // Under the pointer as drawn, and over a raised territories shell (globe-engine/shellLift.ts).
      const intersectionPoint = groundUnderShell(raycasterRef.current.ray, globeIntersects[0].point);
      const radius = intersectionPoint.length() * shellLift() + CURSOR_SURFACE_OFFSET;
      const targetNormal = intersectionPoint.clone().normalize();
      const isValidTarget =
        Number.isFinite(targetNormal.x) &&
        Number.isFinite(targetNormal.y) &&
        Number.isFinite(targetNormal.z) &&
        Number.isFinite(radius) &&
        radius > 0;

      if (!isValidTarget) {
        hideIndicator();
        return;
      }

      indicatorTargetNormalRef.current.copy(targetNormal);
      indicatorTargetRadiusRef.current = radius;
      indicatorTargetActiveRef.current = true;

      if (!indicatorDisplayInitializedRef.current) {
        indicatorDisplayNormalRef.current.copy(targetNormal);
        indicatorDisplayInitializedRef.current = true;
      }
    };

    container.addEventListener('mousemove', handleGlobalCursorMove);
    container.addEventListener('mouseleave', hideIndicator);

    return () => {
      container.removeEventListener('mousemove', handleGlobalCursorMove);
      container.removeEventListener('mouseleave', hideIndicator);
    };
  }, [hasInteractiveMarkers, cursorTrailIndicatorEnabled, containerRef, globeRef, resolveGlobeMesh]);

  return { noteCursorScreenMotion, setCursorSurfaceTarget, hideCursorIndicator, resetCursorTrail };
}
