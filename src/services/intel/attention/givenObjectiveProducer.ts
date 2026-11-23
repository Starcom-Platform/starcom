/**
 * Objectives given to you (plan item 2.5).
 *
 * "Claimed by" is chosen from the mission's people now, so it holds a key, and
 * an objective whose key is yours and which nobody has ticked done is yours to
 * do. It says so here, in the queue, since nothing else would bring it to you.
 */
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { AttentionItem } from './AttentionItem';

export const GIVEN_OBJECTIVE_PRODUCER = 'given-objective';

export function produceGivenObjectiveItems(input: {
  missions: Array<Pick<MissionUI, 'id' | 'missionNumber' | 'title' | 'objectives'>>;
  /** Your key, or null when this browser has none: nothing can be yours then. */
  me: string | null;
}): AttentionItem[] {
  if (!input.me) return [];
  const at = new Date().toISOString();
  const items: AttentionItem[] = [];
  for (const mission of input.missions) {
    for (const objective of mission.objectives) {
      if (objective.completed || objective.claimedBy !== input.me) continue;
      items.push({
        // The objective alone: one concern however often the queue recomputes.
        id: `given-objective:${mission.id}:${objective.id}`,
        subject: objective.description,
        // Neither is measured: an objective is work, not an entity, and has no evidence of its own.
        subjectKind: 'unknown',
        evidenceProvenance: 'unknown',
        reason: 'objective-given-to-you',
        producedBy: GIVEN_OBJECTIVE_PRODUCER,
        caseId: '',
        missionId: mission.id,
        firstSeen: at,
        lastSeen: at,
        severity: 0.5,
        state: 'new',
        explanation: `${mission.missionNumber} ${mission.title}: "${objective.description}" is yours`
          + (objective.expectedArtifact ? `, and hands back ${objective.expectedArtifact}.` : '.'),
      });
    }
  }
  return items;
}
