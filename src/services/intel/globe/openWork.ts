/**
 * Which evidence has unclaimed mission work resting on it.
 *
 * ─── WHAT THIS IS, AND WHAT IT IS CAREFUL NOT TO CLAIM ─────────────────────
 *
 * An objective has no location. A mission has none either — `option C` in
 * case-location-semantics.md settled that, because "a centre worked out from
 * its evidence would mark a place where nothing was reported". So this cannot
 * say where work is, and does not try to.
 *
 * What it can say is true and useful: THIS REPORT, which is at a real
 * coordinate somebody published, is what an unclaimed objective rests on. The
 * mark belongs to the evidence, and the surface that draws it has to word it
 * that way — "evidence with unclaimed work", never "work here". Drawing work at
 * a place nobody said it happens is the error D-F 17 removed when a polygon
 * stopped standing on its first vertex.
 *
 * ─── WHY IT ANNOTATES RATHER THAN BECOMING A LAYER ─────────────────────────
 *
 * Its marks ARE intel report marks. A separate globe layer would draw the same
 * pins a second time, and a viewer with both enabled would see doubles and read
 * them as two findings. markerStyles.ts already names the right shape for this:
 * an auxiliary mark whose style IS its meaning, like the enrichment ring that
 * says "OTX-corroborated" on the cyber layer.
 *
 * ─── WHAT COUNTS AS OPEN ───────────────────────────────────────────────────
 *
 * Not completed, and nobody has claimed it. Those are different absences and
 * both have to hold: a completed objective is done, and a claimed one has
 * somebody on it. `claimedBy` grants no authority and this does not treat it as
 * if it did — it is only the difference between work waiting and work taken.
 */
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../types/intel/IntelItemUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import { placeLinkedRecords } from './linkedRecordPlacement';
import { missionEvidenceIds } from '../missionEvidence';

export interface OpenWorkOnEvidence {
  /** Report id → how many unclaimed objectives rest on it, through its missions. */
  byReportId: Map<string, number>;
  /** Missions carrying unclaimed work that no pin could be found for. */
  missionsNotDrawn: number;
  /** Unclaimed objectives in those missions, so the count is not lost with the pin. */
  objectivesNotDrawn: number;
}

/** Not done, and nobody on it. Both absences, deliberately. */
export const isOpen = (objective: MissionUI['objectives'][number]): boolean =>
  !objective.completed && !objective.claimedBy;

export function openWorkOnEvidence(
  missions: readonly MissionUI[],
  reports: readonly IntelReportUI[],
  items: readonly Pick<IntelItemUI, 'id'>[] = [],
  cases: readonly Pick<IntelCaseUI, 'id' | 'relatedEntities'>[] = [],
): OpenWorkOnEvidence {
  const byReportId = new Map<string, number>();
  let missionsNotDrawn = 0;
  let objectivesNotDrawn = 0;

  for (const mission of missions) {
    const open = mission.objectives.filter(isOpen).length;
    if (open === 0) continue;

    // A mission's evidence is its own attached reports and its cases' — the
    // same rule the shown-record panel uses, through the same pure function,
    // so the two cannot drift into disagreeing about what a mission rests on.
    const related = missionEvidenceIds(mission, [...cases]);
    const placement = placeLinkedRecords(related, reports, items);

    if (placement.markers.length === 0) {
      // Counted rather than dropped. A mission with unclaimed work and nothing
      // placeable is exactly the case an evidence-anchored mark cannot show,
      // and silence here would make the globe imply there is less open work
      // than there is.
      missionsNotDrawn += 1;
      objectivesNotDrawn += open;
      continue;
    }

    for (const marker of placement.markers) {
      byReportId.set(marker.pubkey, (byReportId.get(marker.pubkey) ?? 0) + open);
    }
  }

  return { byReportId, missionsNotDrawn, objectivesNotDrawn };
}
