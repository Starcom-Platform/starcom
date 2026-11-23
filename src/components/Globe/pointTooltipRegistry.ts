/**
 * pointTooltipRegistry — a plain module-level registry of THREE.Group refs that
 * want their InstancedMesh children's `userData.points[instanceId].tooltip`
 * hoverable, read by useGlobePointTooltips.ts.
 *
 * Mirrors GlobeCameraTelemetry.ts's module-level pub/sub pattern (already proven
 * in this codebase for exactly this kind of cross-hook coordination without
 * prop-drilling or a new React Context) rather than lifting state through
 * Globe.tsx, which every producing hook (useGlobeEarthWeather.ts,
 * useGlobeVolcanoCatalog.ts, useGlobeWaterGauges.ts) already treats as something
 * to touch minimally.
 *
 * Registering is deliberately unconditional on the hook's lifetime (register once
 * on mount, unregister on unmount) — a hook's own groupRef identity is stable
 * across its layer's active/inactive toggles (only the group's *children* get
 * added/removed), and useGlobePointTooltips.ts itself filters to
 * `group.parent !== null` before raycasting, so a registered-but-currently-
 * detached-from-the-scene group costs nothing per hover check.
 */
import * as THREE from 'three';

const registeredGroups = new Set<THREE.Group>();

export function registerTooltipGroup(group: THREE.Group): () => void {
  registeredGroups.add(group);
  return () => {
    registeredGroups.delete(group);
  };
}

export function getRegisteredTooltipGroups(): THREE.Group[] {
  return Array.from(registeredGroups);
}

/** Test-only escape hatch — production code has no reason to clear this mid-session. */
export function clearTooltipRegistryForTests(): void {
  registeredGroups.clear();
}
