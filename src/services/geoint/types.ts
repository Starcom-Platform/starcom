import type { IntelReportPriority, IntelReportStatus } from '../../types/intel/IntelReportUI';

export type ParsedFeatureKind = 'point' | 'line' | 'polygon';

export interface ParsedPoint { lat: number; lon: number; alt?: number | null; }
export interface ParsedLine { coords: ParsedPoint[]; }
export interface ParsedPolygon { rings: ParsedPoint[][]; }

export interface ParsedProps {
  description?: string;
  type?: string;
  confidence?: number;
  timestamp?: number; // ms
  sourceTags?: string[];
  relay?: string;
  rawSize?: number;
  /**
   * Where this feature's coordinate came from.
   *
   * `content` is a coordinate the publisher STATED. `geohash` and `geo-tag` are
   * derived from tags, and a geohash is lossy — a six-character one is accurate
   * to a couple of hundred metres. On a globe where position IS the claim, a
   * reader has to be able to tell a stated position from an approximated one.
   */
  geoSource?: 'content' | 'geohash' | 'geo-tag' | 'geojson';
}

export interface ParsedFeature {
  id: string;
  kind: ParsedFeatureKind;
  createdAtMs: number;
  geometry: ParsedPoint | ParsedLine | ParsedPolygon;
  props: ParsedProps;
}

export type DropReason =
  | 'invalid_sig'
  | 'invalid_shape'
  | 'invalid_kind'
  | 'too_large'
  | 'too_many_tags'
  | 'invalid_tags'
  | 'missing_app_tag'
  | 'invalid_geo'
  | 'invalid_geojson'
  | 'stale'
  | 'deduped'
  | 'bounds'
  | 'parse_error'
  | 'validation_failed';

export interface ValidationResult {
  ok: boolean;
  reason?: DropReason;
}

export interface ParsedResult {
  features: ParsedFeature[];
  /**
   * Features a FeatureCollection contained beyond maxFeaturesPerCollection,
   * discarded before the caller saw them.
   *
   * Reported because the cap is a real, lossy reduction and used to be
   * completely silent: a caller received N features with no way to know
   * whether that was all of them. A consumer that presents ingested claims
   * cannot be honest about coverage without this number.
   */
  cappedFeatures?: number;
  reason?: DropReason;
}

export interface CacheInsertResult {
  accepted: ParsedFeature[];
  dropped: number;
  staleDropped: number;
  reason?: DropReason;
}

export interface GeoIntMetrics {
  parsed: number;
  dropped: Record<DropReason, number>;
  deduped: number;
  stale: number;
  imported: number;
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  lastError?: string;
  lastSeen?: number;
  attempts: number;
}

export interface GeoIntConfig {
  limitPerReq: number;
  freshnessWindowMs: number;
  maxEventsStored: number;
  maxFeaturesPerCollection: number;
  maxVerticesPerPolygon: number;
  maxEventVertexTotal: number;
  contentSizeCapBytes: number;
  tagCountCap: number;
  tagLengthCap: number;
  debounceMs: number;
  backoff: { initialMs: number; maxMs: number; factor: number; jitterMs: number };
  cluster: { enabled: boolean; radiusKm: number; minSize: number };
  intelDefaults: {
    /*
     * `classification: string` was here, set to 'UNCLASSIFIED' in config.ts.
     * Nothing reads intelDefaults at all — no `intelDefaults.` access exists
     * anywhere in src/ — so this defaulted a marking for a consumer that does
     * not exist. Only the classification field is removed; the rest of the
     * block is left as found, since it is not this migration's business.
     *
     * Historical note: `intelDefaults: {,` was the syntax damage my first
     * blanket-regex attempt at this purge left behind. Doing it through the
     * type this time means the compiler names every site instead.
     */
    status: IntelReportStatus;
    category: string;
    priorityHigh: IntelReportPriority;
    priorityMed: IntelReportPriority;
    priorityLow: IntelReportPriority;
    confidenceDefault: number;
  };
}
