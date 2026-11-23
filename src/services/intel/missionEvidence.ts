/**
 * What a mission rests on, found one way wherever it is counted or drawn
 * (plan item 1.8): the mission's card and detail, its corroboration, and the
 * globe's open-work count.
 */
import type { MissionUI } from '../../types/intel/MissionUI';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';

/**
 * The reports behind a mission: linked directly or through a linked case, and
 * held here, so a deleted one is not counted. The mission's card and its detail
 * both count these (plan item 1.8): the card counted its direct links, deleted
 * ones too, and said "0 reports" beside a detail saying "1 report behind".
 */
export function reportsBehindMission(
  mission: Pick<MissionUI, 'relatedReports' | 'relatedCases'>,
  reports: IntelReportUI[],
  cases: Pick<IntelCaseUI, 'id' | 'relatedEntities'>[],
): IntelReportUI[] {
  const behindIds = new Set(missionEvidenceIds(mission, cases));
  return reports.filter((r) => behindIds.has(r.id));
}

/**
 * The ids a mission's evidence is found under: the reports attached to it,
 * and what each of its cases links to. A case's own id is not evidence to look
 * up: the globe's open-work count looked it up as a report, found nothing, and
 * said a mission resting on a case rested on nothing it could draw.
 */
export function missionEvidenceIds(
  mission: Pick<MissionUI, 'relatedReports' | 'relatedCases'>,
  cases: Pick<IntelCaseUI, 'id' | 'relatedEntities'>[],
): string[] {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  return [...mission.relatedReports, ...mission.relatedCases.flatMap((id) => caseById.get(id)?.relatedEntities ?? [])];
}

/**
 * A mission must rest on something before it can be packaged.
 *
 * `relatedReports` and `relatedCases` were optional on creation and read by
 * nothing but a counter. So a Mission Package could be built, signed and
 * dispatched from a title and a briefing alone, and the manifest's
 * `relatedReportCount: 0` was a decoration rather than a claim. A package that
 * asserts nothing about its evidence is a package a receiver cannot weigh.
 *
 * Enforced at READY_FOR_PACKAGE rather than at dispatch, because that is the
 * transition where a mission stops being drafted and becomes a thing intended
 * to leave. Catching it at publish would mean an operator assembles a whole
 * package before learning it was never eligible.
 *
 * ─── WHY THIS IS LOCAL AND NOT IN THE SPEC ─────────────────────────────────
 *
 * Mecha Jono put it well when they made the same change on their side:
 * enforcement is local, the format is shared, and a node may require more of
 * itself than the wire requires of it. Conformance governs what crosses;
 * this governs what we are willing to send. A peer that chooses differently
 * is still conformant, and we are still interoperable with them.
 *
 * Direct observation is a legitimate basis and is NOT silently exempt: a
 * mission resting on the operator's own eyes must say so in its briefing
 * rather than simply omitting the link, so the absence of evidence is a
 * recorded claim instead of an unnoticed gap.
 */
const DIRECT_OBSERVATION_MARKER = /\bdirect observation\b/i;

/**
 * Whether a mission rests on anything, as ONE definition.
 *
 * The UI had its own copy of this rule — including its own inline
 * /\bdirect observation\b/i — so that the transition button could be disabled
 * before the click rather than throwing after it. Two copies of a rule that
 * decides whether a mission may be packaged is one copy too many: they drift,
 * and the failure is a button that is enabled and then refuses, or disabled
 * with no way to find out why.
 *
 * Exported so the button and the gate answer the same question with the same
 * code.
 */
export function restsOnEvidence(
  mission: Pick<MissionUI, 'relatedReports' | 'relatedCases' | 'briefing'>,
  evidence: EvidenceLookup,
): boolean {
  if (mission.relatedReports.some(evidence.hasReport) || mission.relatedCases.some(evidence.hasCase)) return true;
  return DIRECT_OBSERVATION_MARKER.test(mission.briefing);
}

/**
 * Which linked records are here to rest on (plan item 0.6).
 *
 * A link counted whether or not its record still existed, so a mission whose
 * only report had been deleted still read as resting on it, and could be
 * packaged on nothing. Required rather than defaulted: every caller says what
 * it checks against, so the button and the gate cannot quietly differ.
 */
export interface EvidenceLookup {
  hasReport(id: string): boolean;
  hasCase(id: string): boolean;
}

/** A lookup over the records a screen has loaded. */
export function evidenceIn(reportIds: Iterable<string>, caseIds: Iterable<string>): EvidenceLookup {
  const reports = new Set(reportIds);
  const cases = new Set(caseIds);
  return { hasReport: (id) => reports.has(id), hasCase: (id) => cases.has(id) };
}
