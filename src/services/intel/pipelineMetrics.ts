/**
 * Two numbers that say whether the pipeline is actually working.
 *
 * Mecha Jono measured their own registry before proposing a Case layer and
 * committed to being judged on mean findings per mission and the share of
 * their corpus that ever reaches one — 1.0 and 7% when they looked. Starcom
 * could not answer either question about itself, which made every claim about
 * "closing the void" unfalsifiable.
 *
 * That is the trap their risk section names: a layer can be well-formed,
 * shipped, and useless, and without a number nobody finds out. The evidence
 * gate and the findings join are both bets that these figures move. If they
 * do not, the work did not land, however good the design was.
 *
 * PURE ON PURPOSE. Takes the three collections rather than reading storage,
 * so it can be tested against constructed corpora and — more importantly —
 * so an operator's real workspace is never a prerequisite for knowing whether
 * the computation is right.
 *
 * Local only. Each operator's workspace is their own; there is no central
 * corpus to measure and this deliberately does not create one.
 */
import { restsOnEvidence, evidenceIn } from './missionEvidence';
import type { MissionUI } from '../../types/intel/MissionUI';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

export interface PipelineMetrics {
  reportCount: number;
  caseCount: number;
  missionCount: number;
  /**
   * Mean linked evidence per mission — reports plus cases, counted per mission.
   * Mecha Jono's headline number. 1.0 means every mission rests on exactly one
   * thing, which is the condition where a mission is only ever as strong as a
   * single observation.
   */
  meanEvidencePerMission: number;
  /**
   * Missions resting on nothing at all. Should trend to zero as the evidence
   * gate bites, but records created before it existed still count — the
   * measurement must not flatter itself by ignoring history.
   */
  missionsWithoutEvidence: number;
  /**
   * Share of reports that reach a mission, directly or through a case, 0..1.
   * The rest of the corpus is inert: collected, stored, and never acted on.
   */
  reportsReachingAMission: number;
  /** Reports counted by the above. Absolute, because a share hides the scale. */
  reportsReached: number;
  /**
   * Evidence reused across missions. Effectively zero means no report ever
   * informs more than one action, which is a different failure from having
   * too little evidence.
   */
  reportsBackingMoreThanOneMission: number;
}

export function computePipelineMetrics(
  reports: IntelReportUI[],
  cases: IntelCaseUI[],
  missions: MissionUI[],
): PipelineMetrics {
  const caseById = new Map(cases.map((c) => [c.id, c]));

  /** Reports a mission rests on, directly or via any case it links. */
  const reportsBehind = (mission: MissionUI): Set<string> => {
    const ids = new Set<string>(mission.relatedReports);
    for (const caseId of mission.relatedCases) {
      for (const entityId of caseById.get(caseId)?.relatedEntities ?? []) ids.add(entityId);
    }
    return ids;
  };

  const held = evidenceIn(reports.map((r) => r.id), cases.map((c) => c.id));
  const missionsPerReport = new Map<string, number>();
  let evidenceTotal = 0;
  let withoutEvidence = 0;

  for (const mission of missions) {
    // Counts LINKS, not resolved reports: a mission linking two cases rests on
    // two pieces of evidence even if both cases happen to cite one report.
    const links = mission.relatedReports.length + mission.relatedCases.length;
    evidenceTotal += links;
    // Whether it rests on anything is the dispatch gate's own question (plan
    // item 1.8): counted by links, a mission whose report had been deleted
    // rested on it here and on nothing at the gate and on the globe.
    if (!restsOnEvidence(mission, held)) withoutEvidence++;

    for (const reportId of reportsBehind(mission)) {
      missionsPerReport.set(reportId, (missionsPerReport.get(reportId) ?? 0) + 1);
    }
  }

  const knownReportIds = new Set(reports.map((r) => r.id));
  // Only count reports this workspace actually holds. A mission may link an id
  // that resolves to nothing; counting those would inflate the share with
  // records nobody can read.
  const reached = [...missionsPerReport.keys()].filter((id) => knownReportIds.has(id));

  return {
    reportCount: reports.length,
    caseCount: cases.length,
    missionCount: missions.length,
    meanEvidencePerMission: missions.length === 0 ? 0 : evidenceTotal / missions.length,
    missionsWithoutEvidence: withoutEvidence,
    reportsReachingAMission: reports.length === 0 ? 0 : reached.length / reports.length,
    reportsReached: reached.length,
    reportsBackingMoreThanOneMission: reached.filter((id) => (missionsPerReport.get(id) ?? 0) > 1).length,
  };
}
