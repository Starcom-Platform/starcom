// CommHubs.ts — types for real submarine cable infrastructure data.
// See SubmarineCableService.ts for the fetch/merge/cache logic and the live verification
// this is based on.

/** A real cable path segment — [longitude, latitude] pairs, real MultiLineString geometry
 * (actual routing, not a straight line between two endpoints). */
export type CablePath = [number, number][];

export interface CableLandingPoint {
  id: string;
  name: string; // e.g. "Luanda, Angola"
  country: string; // real, e.g. "Angola"
}

export interface SubmarineCable {
  id: string;
  name: string;
  color: string; // real, from the source dataset's own per-cable color
  paths: CablePath[]; // one or more real path segments
  length?: string; // real, e.g. "45,000 km" — a free-text field from the source, not parsed to a number
  owners?: string; // real, comma-joined as given by the source (e.g. "Meta, China Mobile, MTN, ...")
  rfsYear?: number; // real ready-for-service year, when known
  // Derived, not read directly from the source's own `is_planned` field — that field is
  // stale (frozen at whatever point this snapshot was originally scraped, roughly 2022):
  // real cables with rfsYear 2023/2024 all show is_planned: true despite being active for
  // years by now. isPlanned here is computed from rfsYear vs. the real current year instead.
  isPlanned: boolean;
  landingPoints: CableLandingPoint[];
}

export interface LandingPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isTbd: boolean; // real — some landing points are announced but not yet finalized
}

export interface SubmarineCableData {
  cables: SubmarineCable[];
  landingPoints: LandingPoint[];
  fetchedAt: number;
  // Real, honest completeness signal — this source is a snapshot, not the full live
  // TeleGeography authoritative count (verified live: 724 cables, no CORS for direct use).
  datasetCableCount: number;
}

/** A real cable or landing point that the user is hovering/has clicked on, built by
 * useCommHubs3D's raycasting for its hover tooltip and click detail popup. */
export type CommHubPickResult =
  | { type: 'cable'; cable: SubmarineCable }
  | { type: 'landingPoint'; point: LandingPoint; cableCount: number; country?: string; connectedCables: Array<{ id: string; name: string }> };
