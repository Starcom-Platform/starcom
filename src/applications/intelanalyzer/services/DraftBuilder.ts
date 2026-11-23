import type { BoardState, PinnedItem } from '../state/BoardsTypes';
import { type IntelReportUI } from '../../../types/intel/IntelReportUI';
import {
  requiresCare,
  requiresRestrictedDistribution,
  sensitivityOf,
  visibilityOf,
  type InformationVisibility,
  type ContentSensitivity
} from '../../../types/intel/IntelItemUI';
import { encodeDeepLink, encodeFilters } from '../utils/deepLink';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { digestPinnedReports, digestSection } from './pinnedReportsDigest';

export interface DraftExportOptions {
  title: string;
  /** Who this draft is for. Gates whether internal context appears at all. */
  visibility?: InformationVisibility;
  /** What the draft's content needs. Gates redaction within it. */
  sensitivity?: ContentSensitivity;
  includeFilters?: boolean;
  includeWatchlists?: boolean;
  redactSensitive?: boolean;
}

export interface DraftBuildResult {
  report: Omit<IntelReportUI, 'id' | 'author' | 'createdAt' | 'updatedAt'>;
  citations: DraftCitation[];
}

export type DraftCitation = {
  id: string;
  type: PinnedItem['type'];
  title?: string;
  sourceType?: 'REPORT' | 'INTEL_ITEM' | 'EVENT' | 'ENTITY';
  sourceId?: string;
  timestamp?: string; // ISO
  tags?: string[];
  entities?: string[];
};

/**
 * DraftBuilder
 * Maps a Board snapshot into a Draft Report payload (IntelReportUI shape) plus citations.
 * Notes are used as the opening Summary section; pins become Evidence citations.
 * Watchlists can be reflected into tags for quick context if requested.
 */
export class DraftBuilder {
  /**
   * `reports`, when given, are the pinned reports as stored: the draft then
   * says what they rest on (plan item 4.3). Without them it says nothing it
   * could not read.
   */
  static buildFromBoard(board: BoardState, opts: DraftExportOptions, reports?: readonly IntelReportUI[]): DraftBuildResult {
    const watch = board.state.watch || { entities: [], tags: [] };
    const pins = (board.state.pins || []) as PinnedItem[];
    const notes = board.state.notes || '';

    const citations: DraftCitation[] = pins.map(p => ({
      id: p.id,
      type: p.type,
      title: p.title,
      // Placeholders for richer fields (available when pins include richer data)
      sourceType: p.type === 'report' ? 'REPORT' : p.type === 'intelItem' ? 'INTEL_ITEM' : p.type === 'event' ? 'EVENT' : 'ENTITY',
      sourceId: p.id
    }));

    // Basic content scaffold
    // Keep plaintext/markdown, safe to store as content.
    const sections: string[] = [];
    if (notes) {
      sections.push(`# Summary\n\n${notes.trim()}`);
    } else {
      sections.push(`# Summary\n\nDraft created from board "${board.name}".`);
    }

    // Evidence section
    sections.push('## Evidence');
    if (citations.length === 0) {
      sections.push('- No pinned evidence');
    } else {
      citations.forEach(c => {
        sections.push(`- [${c.type}] ${c.title || c.id} (id: ${c.id})`);
      });
    }

    if (reports) {
      const digest = digestSection(digestPinnedReports(pins, reports));
      if (digest) sections.push(`\n${digest}`);
    }

    // Optional context
    if (opts.includeFilters) {
      sections.push('\n## Context: Active Filters');
      try {
        const json = JSON.stringify(board.state.filters);
        sections.push('```json');
        sections.push(json);
        sections.push('```');
      } catch {
        // ignore
      }
    }
    /*
     * ─── ONE VALUE WAS ANSWERING TWO QUESTIONS, AND A BRANCH DIED OF IT ─────
     *
     * Two separate decisions are made here:
     *
     *   1. does the internal watchlist context appear in this draft at all?
     *   2. are the entity names inside it masked?
     *
     * Both used to read the same ladder value at the same threshold
     * (CONFIDENTIAL and above), which made them the SAME condition wearing two
     * names. The consequence: whenever the section appeared, redaction was
     * already on, so the branch that emits real entity names could not run.
     * Verified by enumeration before this change — all eight combinations of
     * four levels x redactSensitive produced `entitiesInClear = false`. No test
     * caught it because no test could: there was no input that reached it.
     *
     * (Before that, enforcement read `opts.classification === 'CONFIDENTIAL'`,
     * so SECRET and TOP_SECRET drafts emitted entities in the clear while
     * CONFIDENTIAL redacted them — the two most restrictive markings were the
     * two least protected. That was fixed by the ladder comparison this commit
     * replaces; the note stays because it is why the ladder went.)
     *
     * The axes separate the two questions, so each is decided by the field that
     * means it — and 'limited' + 'open' (an internal draft whose contents need
     * no masking) now reaches the branch that had no reachable input.
     */
    const visibility = visibilityOf(opts);
    const sensitivity = sensitivityOf(opts);

    // Question 2: does the CONTENT need masking?
    const forceRedact = opts.redactSensitive || requiresCare(sensitivity);

    // Question 1: does this draft's AUDIENCE get to see our watchlists? Public
    // drafts do not — the watchlist is internal context about what we track.
    const allowWatchlistsSection =
      !!opts.includeWatchlists && requiresRestrictedDistribution(visibility);
    if (allowWatchlistsSection) {
      sections.push('\n## Context: Watchlists');
      if ((watch.tags?.length || 0) > 0) sections.push(`- Tags: ${watch.tags!.join(', ')}`);
      if ((watch.entities?.length || 0) > 0) {
        if (forceRedact) {
          sections.push(`- Entities: [REDACTED]`);
        } else {
          sections.push(`- Entities: ${watch.entities!.join(', ')}`);
        }
      }
      if ((watch.tags?.length || 0) === 0 && (watch.entities?.length || 0) === 0) sections.push('- None');
    }

    // Derive report fields
    const now = new Date();
    const content = sections.join('\n');

  // Tags: include watch tags when opted in and the audience admits them.
  // Same condition as allowWatchlistsSection — deliberately the same variable
  // rather than a restated one, so the two cannot drift apart.
  const tags = allowWatchlistsSection ? [...(watch.tags || [])] : [];

    // Compute analysis deep-link for round-trip
    const deepLink = encodeDeepLink({
      view: board.state.view,
      board: board.id,
      filters: encodeFilters(board.state.filters)
    });

    const report: Omit<IntelReportUI, 'id' | 'author' | 'createdAt' | 'updatedAt'> = {
      title: opts.title || board.name || 'Draft Report',
      content,
      summary: notes ? notes.slice(0, 240) : `Draft created from board "${board.name}" on ${formatUtcDateTime(now.getTime(), { year: true })}.`,
      category: 'GENERAL',
      tags,
      // The draft carries the handling the author chose in the dialog. The
      // tier write that stood here was removed in 7c; leaving nothing in its
      // place would have silently dropped the choice on the way to the report.
      visibility: opts.visibility,
      sensitivity: opts.sensitivity,
      status: 'DRAFT',
      conclusions: [],
      recommendations: [],
      methodology: [],
      confidence: undefined,
      targetAudience: [],
      sourceIntelIds: [],
      version: 1,
      manualSummary: !!notes,
      history: [],
      analysisDeepLink: deepLink
    };

  // Redaction (basic): if requested or required by the content's sensitivity,
  // scrub the entities list. Reuses `forceRedact` rather than restating it.
  if (forceRedact && opts.includeWatchlists) {
      report.content = report.content.replace(/(Entities:\s*)(.*)/, '$1[REDACTED]');
    }

    return { report, citations };
  }
}

export default DraftBuilder;
