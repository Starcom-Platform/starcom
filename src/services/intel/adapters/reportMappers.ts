import { IntelReportUI, IntelReportHistoryEntry } from '../../../types/intel/IntelReportUI';
import { normalizeReportPriority } from '../reportPriority';
import type { Collaborator } from '../../../types/intel/IntelCaseUI';
import { IntelReportData, IntelReportFile } from '../../../types/IntelWorkspace';
import { isInformationVisibility, isContentSensitivity } from '../../../types/intel/IntelItemUI';
import { readTimePrecisionMs } from '../../../utils/eventTime';
import { citationsOf, namedAddresses } from '../citations';
import { safeSourceLinks } from '../sourceLinks';

// Derive summary from content (first paragraph or first 240 chars)
export function deriveSummary(content: string): string {
  if (!content) return '';
  const firstPara = content.split(/\n\n+/)[0].trim();
  if (firstPara.length <= 240) return firstPara;
  return firstPara.slice(0, 237) + '...';
}

// Map UI report to workspace IntelReportData
export function uiToWorkspaceReportData(ui: IntelReportUI): IntelReportData {
  const summary = ui.manualSummary && ui.summary ? ui.summary : deriveSummary(ui.content);
  return {
    id: ui.id,
    title: ui.title,
    type: 'INTEL_REPORT',
    summary,
    content: ui.content,
    conclusions: ui.conclusions || [],
    recommendations: ui.recommendations || [],
    analysisType: ui.methodology && ui.methodology.length ? 'CUSTOM' : 'GENERAL',
    methodology: ui.methodology || [],
    confidence: ui.confidence ?? 0.5,
    // Stored only when stated: a default here read as an assessment nobody made (plan item 1.9).
    ...(ui.priority ? { priority: ui.priority } : {}),
    sourceIntel: ui.sourceIntelIds || [],
    author: ui.author,
    contributors: [],
    createdAt: ui.createdAt.toISOString(),
    modifiedAt: ui.updatedAt.toISOString(),
    targetAudience: ui.targetAudience || [],
    distributionRestrictions: [],
    relatedReports: [],
    metadata: {
      status: ui.status,
      categories: ui.category ? [ui.category] : [],
      tags: ui.tags,
      /*
       * ─── WITHOUT THESE TWO LINES, 'protected' DID NOTHING ────────────────
       *
       * IntelWorkspaceManager's encryption gate reads the handling axes out of
       * report METADATA (handlingFromMetadata). Stage 6b wired the gate but
       * not this mapper, so a report created through IntelReportService with
       * `sensitivity: 'protected'` reached storage with no axis in its
       * metadata, the bridge saw no legacy tier either, and the content was
       * written as plaintext.
       *
       * 6b's own test did not catch it: it called addReport() with a
       * hand-built `metadata: { sensitivity: 'protected' }`, which is the
       * low-level API, not the path the app uses. A test that constructs the
       * intermediate state cannot tell you the producer fills it in.
       */
      visibility: ui.visibility,
      sensitivity: ui.sensitivity,
      /*
       * The outline rides with the coordinate, because losing it here is
       * silent and total.
       *
       * This mapper writes an explicit field list, so anything not named is
       * dropped on the way to storage. A network report is persisted moments
       * after it is drawn, and the globe then draws the round-tripped copy —
       * so a shape survived until the report was saved and never afterwards.
       * Measured against a real relay: of two reports drawn together, only the
       * one still held in memory had its shape.
       *
       * It is bounded (see boundedOutline) precisely so it can be stored: ~1.3KB
       * per report, against a workspace that serialises into one storage key.
       */
      geo: (ui.latitude !== undefined && ui.longitude !== undefined)
        ? {
          lat: ui.latitude,
          lon: ui.longitude,
          ...(ui.outline ? { outline: ui.outline } : {}),
          // How precisely it was placed: the same trap as the outline. Dropped
          // here, every stored network report came back "precision not stated"
          // (decision D-F, section 18, item 3).
          ...(typeof ui.geoPrecisionM === 'number' ? { precisionM: ui.geoPrecisionM } : {}),
        }
        : undefined,
      /*
       * Stated jurisdictions, beside geo rather than inside it: a report can
       * name a jurisdiction without carrying a coordinate, and nesting it under
       * `geo` would lose exactly those — the non-spatial reports a peer says
       * are a whole class of their output.
       */
      jurisdictions: ui.jurisdictions,
      // What it rests on, so it is cited when published: dropped here, it would be lost on save.
      ...(ui.cites?.length ? { cites: ui.cites } : {}),
      // What a received note names (D-IW): IntelWeb reads the stored copy, so dropped here it is gone there.
      ...(ui.refers?.length ? { refers: ui.refers } : {}),
      // Where it was published (D-CT, CT2): the globe draws the stored copy, so dropped here the sources are gone there.
      ...(ui.sourceLinks?.length ? { sourceLinks: ui.sourceLinks } : {}),
      version: ui.version ?? 1,
      manualSummary: ui.manualSummary || false,
      history: ui.history || [],
      analysisDeepLink: ui.analysisDeepLink,
      startDate: ui.startDate?.toISOString(),
      endDate: ui.endDate?.toISOString(),
      timePrecisionMs: ui.timePrecisionMs,
      hashtags: ui.hashtags,
      extra: ui.extra,
      collaborators: ui.collaborators || [],
      entityRefs: ui.entityRefs || [],
      // Sample material says so where it is stored (plan item 0.9).
      ...(ui.sample ? { sample: true } : {}),
      // Kept through an edit, so a received report still says who sent it (plan item 2.4).
      ...(ui.receivedFrom ? { receivedFrom: ui.receivedFrom } : {}),
      // The version read from a relay, which a review is pinned to (plan item 5.1).
      ...(ui.nostrEventId ? { nostrEventId: ui.nostrEventId } : {}),
      ...(ui.nostrKind ? { nostrKind: ui.nostrKind } : {})
    }
  } as IntelReportData;
}

/** Stored citations, read back: only what is a citation, and none rather than an empty list. */
function citesOf(stored: unknown): { cites?: IntelReportUI['cites'] } {
  const cites = citationsOf([{ cites: stored }]);
  return cites.length ? { cites } : {};
}

/** Stored sources, read back: safe links only, and none rather than an empty list. */
function sourceLinksOf(stored: unknown): { sourceLinks?: string[] } {
  const sourceLinks = Array.isArray(stored) ? safeSourceLinks(stored) : [];
  return sourceLinks.length ? { sourceLinks } : {};
}

/** Stored references, read back: only addresses, and none rather than an empty list. */
function refersOf(stored: unknown): { refers?: string[] } {
  const refers = namedAddresses(stored);
  return refers.length ? { refers } : {};
}

const isReceivedFrom = (value: unknown): value is NonNullable<IntelReportUI['receivedFrom']> =>
  !!value && typeof (value as { pubkey?: unknown }).pubkey === 'string' && typeof (value as { sentAt?: unknown }).sentAt === 'string';

// Map workspace file to UI report
export function workspaceFileToUI(file: IntelReportFile): IntelReportUI {
  const d = file.reportData;
  type ReportMetadata = {
    status?: IntelReportUI['status'];
    categories?: string[];
    tags?: string[];
    geo?: { lat?: number; lon?: number; outline?: IntelReportUI['outline']; precisionM?: number };
    jurisdictions?: string[];
    cites?: unknown;
    refers?: unknown;
    sourceLinks?: unknown;
    version?: number;
    manualSummary?: boolean;
    history?: IntelReportHistoryEntry[];
    analysisDeepLink?: string;
    startDate?: string;
    endDate?: string;
    timePrecisionMs?: number;
    hashtags?: string[];
    extra?: Record<string, unknown>;
    collaborators?: Collaborator[];
    sample?: boolean;
    receivedFrom?: IntelReportUI['receivedFrom'];
    nostrEventId?: string;
    nostrKind?: number;
    confidenceBasis?: IntelReportUI['confidenceBasis'];
    entityRefs?: string[];
    [key: string]: unknown;
  };
  const metadata: ReportMetadata = (d.metadata || {}) as ReportMetadata;
  const geo = metadata.geo || {};
  const categories = Array.isArray(metadata.categories) ? metadata.categories : [];
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const history = Array.isArray(metadata.history) ? metadata.history : [];
  const version = typeof metadata.version === 'number' ? metadata.version : 1;
  const manualSummary = !!metadata.manualSummary;
  const status: IntelReportUI['status'] = metadata.status || 'DRAFT';
  const visibility = isInformationVisibility(metadata.visibility) ? metadata.visibility : undefined;
  const sensitivity = isContentSensitivity(metadata.sensitivity) ? metadata.sensitivity : undefined;
  const analysisDeepLink = typeof metadata.analysisDeepLink === 'string' ? metadata.analysisDeepLink : undefined;
  const startDate = typeof metadata.startDate === 'string' && !isNaN(Date.parse(metadata.startDate))
    ? new Date(metadata.startDate) : undefined;
  const endDate = typeof metadata.endDate === 'string' && !isNaN(Date.parse(metadata.endDate))
    ? new Date(metadata.endDate) : undefined;
  const timePrecisionMs = readTimePrecisionMs(metadata.timePrecisionMs);
  const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags : undefined;
  const extra = (metadata.extra && typeof metadata.extra === 'object') ? metadata.extra : undefined;
  const collaborators = Array.isArray(metadata.collaborators) ? metadata.collaborators : [];
  const entityRefs = Array.isArray(metadata.entityRefs) ? metadata.entityRefs : [];
  return {
    id: d.id,
    ...(metadata.sample === true ? { sample: true } : {}),
    ...(isReceivedFrom(metadata.receivedFrom) ? { receivedFrom: metadata.receivedFrom } : {}),
    ...(typeof metadata.nostrEventId === 'string' ? { nostrEventId: metadata.nostrEventId } : {}),
    ...(typeof metadata.nostrKind === 'number' ? { nostrKind: metadata.nostrKind } : {}),
    title: d.title,
    content: d.content,
    summary: d.summary,
    author: d.author,
    category: (categories && categories[0]) || 'GENERAL',
    tags,
    visibility,
    sensitivity,
    latitude: geo.lat as number | undefined,
    longitude: geo.lon as number | undefined,
    ...(geo.outline ? { outline: geo.outline } : {}),
    ...(typeof geo.precisionM === 'number' && Number.isFinite(geo.precisionM) && geo.precisionM > 0
      ? { geoPrecisionM: geo.precisionM } : {}),
    ...(metadata.jurisdictions?.length ? { jurisdictions: metadata.jurisdictions } : {}),
    ...citesOf(metadata.cites),
    ...refersOf(metadata.refers),
    ...sourceLinksOf(metadata.sourceLinks),
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.modifiedAt),
    status,
    conclusions: d.conclusions || [],
    recommendations: d.recommendations || [],
    methodology: d.methodology || [],
    confidence: d.confidence,
    confidenceBasis: metadata.confidenceBasis,
    priority: normalizeReportPriority(d.priority),
    targetAudience: d.targetAudience || [],
    sourceIntelIds: d.sourceIntel || [],
    entityRefs,
    version,
    manualSummary,
    history,
    analysisDeepLink,
    startDate,
    endDate,
    timePrecisionMs,
    hashtags,
    extra,
    collaborators
  };
}
