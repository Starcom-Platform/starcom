import type { LocationConflict } from '../../../applications/intelanalyzer/state/correlationUtils';
import { provenanceOf, type AttentionItem } from './AttentionItem';

export const CONTRADICTION_PRODUCER = 'contradiction-touching-open-case';

/**
 * The subset of a case this producer needs.
 *
 * `linkedSourceIds` are IntelReport/IntelItem ids — what IntelCaseUI stores in
 * its `relatedEntities` field, whose name is misleading: it holds record ids,
 * not entity names.
 *
 * That distinction is the whole reason this producer works. The first version
 * matched `conflict.entity` (a display name like "MV Northwind") against
 * `case.relatedEntities`, which compiled, typechecked, passed its unit tests
 * against fixtures shaped to agree with it — and could never have matched once
 * against real data, because the two sides hold different kinds of string.
 * LocationConflict carries `sourceIdA`/`sourceIdB`, and those ARE record ids,
 * so the join is exact rather than approximate.
 */
export interface OpenCase {
  id: string;
  title: string;
  /** Report/item ids linked to this case (IntelCaseUI.relatedEntities). */
  linkedSourceIds: string[];
}

export interface ContradictionProducerInput {
  conflicts: LocationConflict[];
  openCases: OpenCase[];
}

/**
 * Contradictions that touch something someone is actually working on.
 *
 * The filter is the point. The correlation engine surfaces every contradiction
 * it can find, and most concern records nobody is investigating — real, but
 * not anyone's business today. A queue listing all of them would be the
 * conflicts panel with a more urgent name, and would be muted within a day.
 *
 * "Touching an open case" is the narrowest defensible trigger: one of the two
 * contradicting records is linked to a case someone has open.
 */
export function produceContradictionItems(
  input: ContradictionProducerInput,
  now: () => Date = () => new Date(),
): AttentionItem[] {
  const { conflicts, openCases } = input;

  // Source id -> cases linked to it. Built once; the naive form rescans every
  // case's id list per conflict and both sides grow with the investigation.
  const casesBySource = new Map<string, OpenCase[]>();
  for (const c of openCases) {
    for (const sourceId of c.linkedSourceIds) {
      const at = casesBySource.get(sourceId);
      if (at) at.push(c);
      else casesBySource.set(sourceId, [c]);
    }
  }

  const at = now().toISOString();
  const items: AttentionItem[] = [];

  for (const conflict of conflicts) {
    // EITHER side linking the case is enough. Requiring both would miss the
    // most important shape this rule can catch: a record already in your case
    // being contradicted by one you have never seen.
    const cases = new Map<string, OpenCase>();
    for (const side of [conflict.sourceIdA, conflict.sourceIdB]) {
      for (const c of casesBySource.get(side) ?? []) cases.set(c.id, c);
    }
    if (cases.size === 0) continue;

    // Sorted, so the same contradiction reported with its sides swapped is ONE
    // concern. The correlation engine makes no promise about which side it
    // calls A, and an id that depended on that would resurface the same
    // conflict as new on any pass that happened to order it differently.
    const [s1, s2] = [conflict.sourceIdA, conflict.sourceIdB].sort();

    for (const c of cases.values()) {
      items.push({
        id: `contradiction:${c.id}:${s1}:${s2}`,
        subject: conflict.entity,
        // Contradiction detection only runs on physically exclusive subjects
        // (see SubjectKind), so anything reaching here is one of those.
        subjectKind: 'unknown',
        reason: 'new-contradiction',
        producedBy: CONTRADICTION_PRODUCER,
        caseId: c.id,
        firstSeen: at,
        lastSeen: at,
        // Derived from the conflict's own strength, already min(confidence of
        // both sides) — a contradiction is only as troubling as its weaker
        // side is credible. Never asserted by this producer.
        severity: conflict.strength,
        state: 'new',
        explanation:
          `Two sources place ${conflict.entity} ${Math.round(conflict.distanceKm)} km apart ` +
          `within ${conflict.hoursApart.toFixed(1)} h, and one of them is linked to case "${c.title}".`,
        // Read from the conflict itself, which inherits it from the two
        // events and ultimately from the Source. The previous version took a
        // set of "mock entity refs" that the app never passed, so every item
        // claimed real evidence unconditionally.
        evidenceProvenance: provenanceOf(conflict.isMock),
      });
    }
  }

  return items;
}
