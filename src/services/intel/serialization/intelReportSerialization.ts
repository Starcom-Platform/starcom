// intelReportSerialization.ts - Phase 1 canonical serialization (schema v1)
import { IntelReportUI, IntelReportHistoryEntry } from '../../../types/intel/IntelReportUI';
import {
  isInformationVisibility,
  isContentSensitivity,
  INFORMATION_VISIBILITIES,
  CONTENT_SENSITIVITIES,
} from '../../../types/intel/IntelItemUI';
import { readTimePrecisionMs } from '../../../utils/eventTime';
import { normalizeReportPriority } from '../reportPriority';

export interface SerializedIntelReportV1 {
  schema: 'intel.report';
  schemaVersion: 1;
  id: string;
  title: string;
  content: string;
  author: string;
  category: string;
  tags: string[];
  /**
   * The handling axes. Optional on the wire: an older export has neither, and
   * a report whose author declared nothing has neither either — both read as
   * the open case, which is what absence means.
   */
  visibility?: IntelReportUI['visibility'];
  sensitivity?: IntelReportUI['sensitivity'];
  status: IntelReportUI['status'];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  summary?: string;
  latitude?: number;
  longitude?: number;
  conclusions?: string[];
  recommendations?: string[];
  methodology?: string[];
  confidence?: number;
  priority?: IntelReportUI['priority'];
  targetAudience?: string[];
  sourceIntelIds?: string[];
  version?: number;
  manualSummary?: boolean;
  history?: IntelReportHistoryEntry[]; // timestamps already ISO
  startDate?: string; // ISO
  endDate?: string; // ISO
  /** How closely startDate and endDate are known, in ms; see IntelReportUI. */
  timePrecisionMs?: number;
  hashtags?: string[];
  /** The publisher's t=names_people (D-NP), kept so a saved copy is still labelled and still left out of captures. */
  namesPeople?: boolean;
  extra?: Record<string, unknown>;
}

export function isSerializedIntelReportV1(x: any): x is SerializedIntelReportV1 {
  return x && x.schema === 'intel.report' && x.schemaVersion === 1 && typeof x.id === 'string';
}

export function serializeReport(r: IntelReportUI): SerializedIntelReportV1 {
  const base: SerializedIntelReportV1 = {
    schema: 'intel.report',
    schemaVersion: 1,
    id: r.id,
    title: r.title,
    content: r.content,
    author: r.author,
    category: r.category,
    tags: r.tags,
    // Carried through both ways. A report marked 'protected' that came back
    // 'open' from its own round trip would be a silent downgrade — the exact
    // failure mode this migration is built to avoid.
    visibility: r.visibility,
    sensitivity: r.sensitivity,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    summary: r.summary || undefined,
    latitude: r.latitude,
    longitude: r.longitude,
    conclusions: r.conclusions && r.conclusions.length ? r.conclusions : undefined,
    recommendations: r.recommendations && r.recommendations.length ? r.recommendations : undefined,
    methodology: r.methodology && r.methodology.length ? r.methodology : undefined,
    confidence: r.confidence,
    priority: r.priority,
    targetAudience: r.targetAudience && r.targetAudience.length ? r.targetAudience : undefined,
    sourceIntelIds: r.sourceIntelIds && r.sourceIntelIds.length ? r.sourceIntelIds : undefined,
    version: r.version,
    manualSummary: r.manualSummary,
    history: r.history && r.history.length ? r.history : undefined,
    startDate: r.startDate?.toISOString(),
    endDate: r.endDate?.toISOString(),
    timePrecisionMs: r.timePrecisionMs,
    hashtags: r.hashtags && r.hashtags.length ? r.hashtags : undefined,
    namesPeople: r.namesPeople ? true : undefined,
    extra: r.extra
  };
  return base;
}

export function parseReport(obj: unknown): { report?: IntelReportUI; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (typeof obj !== 'object' || obj === null) return { warnings, errors: ['Not an object'] };
  const raw: any = obj;
  if (!isSerializedIntelReportV1(raw)) {
    errors.push('Invalid schema header or version');
    return { warnings, errors };
  }
  // Required fields basic checks
  /*
   * `classification` was in this list, and Stage 7a′ made the field optional —
   * so a report that did not declare a tier failed deserialization with
   * "Missing required field: classification" AND "Invalid classification"
   * below. Removed from required; the axes are checked only when present.
   */
  const required = ['title','content','author','category','status','createdAt','updatedAt'];
  for (const f of required) {
    if (raw[f] == null) errors.push(`Missing required field: ${f}`);
  }
  // Enum sanity (lightweight)
  if (raw.visibility != null && !isInformationVisibility(raw.visibility)) {
    errors.push(`Invalid visibility (expected one of ${INFORMATION_VISIBILITIES.join(', ')})`);
  }
  if (raw.sensitivity != null && !isContentSensitivity(raw.sensitivity)) {
    errors.push(`Invalid sensitivity (expected one of ${CONTENT_SENSITIVITIES.join(', ')})`);
  }
  const statusSet = new Set(['DRAFT','SUBMITTED','REVIEWED','APPROVED','ARCHIVED']);
  if (!statusSet.has(raw.status)) errors.push('Invalid status');
  // Confidence range
  if (raw.confidence != null && (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1)) {
    warnings.push('confidence out of range');
  }
  // Build UI object if no fatal errors
  if (errors.length) return { warnings, errors };
  const report: IntelReportUI = {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    author: raw.author,
    category: raw.category,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    visibility: raw.visibility,
    sensitivity: raw.sensitivity,
    status: raw.status,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    summary: raw.summary,
    latitude: raw.latitude,
    longitude: raw.longitude,
    conclusions: raw.conclusions || [],
    recommendations: raw.recommendations || [],
    methodology: raw.methodology || [],
    confidence: raw.confidence,
    priority: normalizeReportPriority(raw.priority),
    targetAudience: raw.targetAudience || [],
    sourceIntelIds: raw.sourceIntelIds || [],
    version: raw.version,
    manualSummary: raw.manualSummary,
    history: raw.history || [],
    startDate: typeof raw.startDate === 'string' && !isNaN(Date.parse(raw.startDate)) ? new Date(raw.startDate) : undefined,
    endDate: typeof raw.endDate === 'string' && !isNaN(Date.parse(raw.endDate)) ? new Date(raw.endDate) : undefined,
    timePrecisionMs: readTimePrecisionMs(raw.timePrecisionMs),
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : undefined,
    ...(raw.namesPeople === true ? { namesPeople: true } : {}),
    extra: (raw.extra && typeof raw.extra === 'object') ? raw.extra : undefined
  };
  return { report, warnings, errors };
}
