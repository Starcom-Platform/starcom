/**
 * Persisting extracted entities as Intel items, which is what a Case can link.
 *
 * ─── WHY INTEL ITEMS AND NOT GRAPH NODES ───────────────────────────────────
 *
 * The obvious move is a NodeEntity: `storageOrchestrator.storeEntity` persists
 * one, and `linkEntitiesToCase(caseId, entityIds)` is named for entities. It
 * would also have been wrong. CasesDashboard builds its link candidates from
 * `intelReportService.listReports()` and `intelWorkspaceManager.getIntelItems()`
 * — so `relatedEntities` holds REPORT and INTEL ids, and a graph node written
 * to the entity store would never appear in the picker. Storing one would have
 * produced a shelf of records that no case could reach: the same defect, one
 * layer down.
 *
 * ─── WHAT THE NUMBERS MEAN ─────────────────────────────────────────────────
 *
 * Reliability is Admiralty, and it grades the SOURCE. An arbitrary web page
 * nobody has assessed is F — "cannot be judged" — which is this codebase's
 * standing default for an unknown and is not a criticism of the page.
 *
 * Confidence is 0..1 and answers one narrow question: how sure are we that this
 * value appears in that source, as that kind of thing. Not whether it matters.
 * A pattern match is near-certain on both halves, because the grammar decided
 * the kind. A model reading is verified verbatim-present but the KIND is the
 * model's judgment, so it is materially weaker and is scored as such.
 */
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import type { IntelItemUI } from '../../../types/intel/IntelItemUI';
import type { ExtractedEntity } from './entityExtraction';

export interface StoreContext {
  /** Where the text came from — a URL, or a report id. */
  source: string;
  /**
   * The evidence records this rests on, when a host was present to make any.
   *
   * Several rather than one: a recon lookup asks a certificate log, two
   * resolvers and a registry, and an entity may owe its existence to any of
   * them. Naming all of them is honest; naming one would imply a provenance the
   * extraction does not have.
   */
  evidenceRecordIds?: string[];
}

export interface StoredEntities {
  /** Ids in the shape CasesDashboard offers and linkEntitiesToCase accepts. */
  itemIds: string[];
  items: IntelItemUI[];
  failures: Array<{ value: string; error: string }>;
}

/**
 * Confidence in the narrow claim above, not in the entity's importance.
 *
 * Stated as named constants rather than inline numbers so that changing them is
 * a decision somebody makes, rather than a digit somebody edits.
 */
const CONFIDENCE = {
  /** Verbatim, and the grammar determined the kind. */
  pattern: 0.9,
  /** Verbatim — checked — but the kind is a reading, and a reading can be wrong. */
  model: 0.5,
} as const;

export async function storeExtractedEntities(
  entities: ExtractedEntity[],
  context: StoreContext,
): Promise<StoredEntities> {
  const itemIds: string[] = [];
  const items: IntelItemUI[] = [];
  const failures: StoredEntities['failures'] = [];

  for (const entity of entities) {
    try {
      const item = intelWorkspaceManager.addIntelItem({
        title: entity.value,
        type: entity.kind,
        // Open-source web content. Nothing here is classified and pretending
        // otherwise would put a false marking on a public fact.
          // Admiralty grades the source, and an unassessed page cannot be graded.
        reliability: 'F',
        confidence: CONFIDENCE[entity.method],
        source: context.source,
        tags: ['extracted', entity.kind, `method:${entity.method}`],
        categories: ['netrunner-extraction'],
        content:
          `${entity.kind} "${entity.value}" observed in ${context.source}`
          + (entity.derivation
            // Carried in the content, not only in a tag, so it survives into
            // anything that reads the item as prose. A derivation that cannot
            // be reproduced is an assertion.
            ? `\n\nDerived by model ${entity.derivation.model} (prompt sha256 ${entity.derivation.promptDigest}). `
              + 'This is a reading of evidence, not evidence of the world, and may be re-run.'
            : '\n\nMatched by grammar, not by a model.')
          + (context.evidenceRecordIds?.length
            ? `\n\nRests on evidence: ${context.evidenceRecordIds.join(', ')}`
            // Said plainly rather than omitted: without the desktop host
            // nothing could be captured, and an entity with no evidence behind
            // it should say so rather than leave a reader to assume.
            : '\n\nNo evidence record — captured only by the desktop host.'),
        // Extraction is not verification. A machine reporting that it found
        // something is not a second opinion on whether it is so.
        verified: false,
      });

      itemIds.push(item.id);
      items.push(item);
    } catch (error) {
      failures.push({ value: entity.value, error: error instanceof Error ? error.message : 'addIntelItem failed' });
    }
  }

  return { itemIds, items, failures };
}
