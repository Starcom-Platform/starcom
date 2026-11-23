/**
 * useGlobeVolcanoPlumes — real ash-plume particles rising from currently-active
 * EONET volcanic eruption events (the same live events already rendered as point
 * markers by Globe.tsx's shared point layer — this adds a particle effect on top,
 * it doesn't replace that marker). Distinct from useGlobeVolcanoCatalog's static,
 * dim, always-visible catalog dots: this only appears for volcanoes EONET reports
 * as currently active — real counts vary a lot day to day (32 concurrent active
 * volcanoes seen live at one point, not the single digits originally assumed
 * here), see sortVolcanoesByAllocationPriority below for how the particle pool
 * degrades gracefully when demand exceeds MAX_POOL_SIZE.
 *
 * Built on PointParticleGroup (src/components/Globe/effects/PointParticleGroup.ts),
 * shared with useGlobeEarthWeather.ts's rain particles rather than a second
 * from-scratch particle system.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { NaturalEvent } from '../../../hooks/useGeoEvents';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { PointParticleGroup, type ParticleEmitterSpec } from '../effects/PointParticleGroup';
import { createLogger } from '@utils/logger';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:VolcanoPlumes' });

const GLOBE_RADIUS_UNITS = 100;
const PLUME_ORIGIN_OFFSET = 1.02; // just above the volcano catalog dots / active markers
const PLUME_COLOR = 0x554433; // dim ash grey-brown, distinct from lava/active-marker red
const PARTICLES_PER_VOLCANO = 10;
const PARTICLE_SIZE = 0.35;
const LIFESPAN_MS = 2200;
const SPREAD = 0.5;
const RISE_SPEED = 1.4; // world units/sec, outward along the real surface normal
const MAX_POOL_SIZE = 200; // headroom for several simultaneous real eruptions

/**
 * Real EONET activity can exceed MAX_POOL_SIZE at once (32 concurrent active
 * volcanoes seen live — 320 particles wanted, only 200 available):
 * PointParticleGroup.sync() allocates in spec-array order and simply stops
 * once the pool is exhausted, so whichever volcano happened to be LAST in an
 * arbitrary API-response order was getting silently starved of particles.
 * Real per-volcano severity doesn't actually exist here to weight by —
 * classifySeverity (useGeoEvents.ts) has no real magnitude field for
 * volcanoes and uniformly buckets them all as 'major' — so this uses the one
 * real differentiating signal that does exist: most-recently-reported
 * activity first (event.timestamp, mapped from EONET's last_eruption), the
 * same recency signal useGlobeVolcanoCatalog.ts's selectVolcanoesForTier
 * already ranks by. Exported for direct unit testing.
 */
export function sortVolcanoesByAllocationPriority(volcanoes: NaturalEvent[]): NaturalEvent[] {
  return [...volcanoes].sort((a, b) => {
    const at = a.timestamp ? Date.parse(a.timestamp) : NaN;
    const bt = b.timestamp ? Date.parse(b.timestamp) : NaN;
    const aRank = Number.isFinite(at) ? at : -Infinity;
    const bRank = Number.isFinite(bt) ? bt : -Infinity;
    return bRank - aRank;
  });
}

/**
 * Builds one real particle-emitter spec per active volcano — exported for direct
 * unit testing. The drift direction is the real outward surface normal at that
 * volcano's position (the origin vector itself, normalized), so ash rises away
 * from the globe regardless of where on the sphere the volcano sits.
 */
export function buildPlumeSpecs(volcanoes: NaturalEvent[]): ParticleEmitterSpec[] {
  return volcanoes.map((volcano) => {
    const origin = latLngToGlobeWorld(volcano.lat, volcano.lng, GLOBE_RADIUS_UNITS * PLUME_ORIGIN_OFFSET);
    const drift = origin.clone().normalize().multiplyScalar(RISE_SPEED);
    return {
      id: String(volcano.id),
      origin,
      drift,
      color: PLUME_COLOR,
      size: PARTICLE_SIZE,
      count: PARTICLES_PER_VOLCANO,
      lifespanMs: LIFESPAN_MS,
      spread: SPREAD
    };
  });
}

interface UseGlobeVolcanoPlumesOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  events: NaturalEvent[];
}

export function useGlobeVolcanoPlumes({ globeRef, isLayerActive, events }: UseGlobeVolcanoPlumesOptions) {
  const groupRef = useRef<THREE.Group>(ridesShell(new THREE.Group()));
  const particleGroupRef = useRef<PointParticleGroup | null>(null);
  const animationFrameRef = useRef<number>();

  const activeVolcanoes = useMemo(
    () => sortVolcanoesByAllocationPriority(
      events.filter((e) => e.type === 'volcano' && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    ),
    [events]
  );
  // buildPlumeSpecs allocates a new array/vectors every call — real EONET data
  // only changes once per refresh cycle (minutes apart), not every animation
  // frame, so cache the result and only rebuild when the underlying data
  // (activeVolcanoes' reference) actually changes. PointParticleGroup.sync()
  // only reads specs, never mutates them, so reusing the same array/objects
  // across many sync() calls is safe.
  const plumeSpecsCacheRef = useRef<{ volcanoes: NaturalEvent[]; specs: ParticleEmitterSpec[] }>({ volcanoes: [], specs: [] });
  if (plumeSpecsCacheRef.current.volcanoes !== activeVolcanoes) {
    plumeSpecsCacheRef.current = { volcanoes: activeVolcanoes, specs: buildPlumeSpecs(activeVolcanoes) };
  }

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EcologicalDisasters', groupRef.current);
  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    const teardown = () => {
      particleGroupRef.current?.dispose();
      particleGroupRef.current = null;
      if (scene.children.includes(group)) scene.remove(group);
    };

    if (!isLayerActive('EcologicalDisasters')) {
      teardown();
      return () => {};
    }

    if (!scene.children.includes(group)) scene.add(group);
    if (!particleGroupRef.current) {
      const pg = new PointParticleGroup(MAX_POOL_SIZE);
      group.add(pg.group);
      particleGroupRef.current = pg;
    }

    const tick = (now: number) => {
      const pg = particleGroupRef.current;
      if (pg) {
        pg.sync(plumeSpecsCacheRef.current.specs, now);
        pg.update(now);
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    animationFrameRef.current = requestAnimationFrame(tick);

    log.debug('🌋 Volcano plume particle system active');

    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as unknown as { __volcanoPlumeDebug?: unknown }).__volcanoPlumeDebug = {
        getLiveParticleCount: () => particleGroupRef.current?.getLiveParticleCount() ?? 0,
        getActiveVolcanoCount: () => plumeSpecsCacheRef.current.volcanoes.length
      };
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      teardown();
    };
  }, [globeRef, isLayerActive]);

  return { groupRef };
}
