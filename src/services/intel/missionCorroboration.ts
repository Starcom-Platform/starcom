/**
 * What corroboration, if any, stands behind a mission.
 *
 * Starcom has two tracks that never meet. The findings track does real
 * epistemic work — buckets observations by entity, measures independence in
 * FEEDS rather than records, and refuses to publish fabricated or
 * non-consented material. The dispatch track packages free text an operator
 * wrote. Corroboration is computed on one side and has never been consulted
 * by the other.
 *
 * Mecha Jono reached the same item from their side ("move corroboration to the
 * Case… it needs no new data"), and they are right that it needs none: the
 * reports behind a mission already produce events, those events already
 * bucket, and the buckets already yield findings. This joins what exists
 * rather than computing anything new, which is why it reuses
 * adaptReportsToEvents / bucketByEntity / findingForBucket instead of
 * reimplementing their rules — a second implementation of "what counts as
 * corroboration" is exactly how the two tracks would drift apart again.
 *
 * DESCRIBES, DOES NOT GATE. A single-source mission is not thereby wrong;
 * plenty of real intelligence rests on one good report. What was missing was
 * the operator being able to tell which kind of mission they were about to
 * dispatch. Turning this into a threshold is a separate decision, and one that
 * should be made with a number in hand rather than in advance.
 */
import { adaptReportsToEvents } from '../../applications/intelanalyzer/adapters/eventsAdapter';
import { bucketByEntity, findingForBucket } from '../../applications/intelanalyzer/state/correlationUtils';
import type { MissionUI } from '../../types/intel/MissionUI';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { IntelReliability } from '../../types/intel/IntelItemUI';
import { reportsBehindMission } from './missionEvidence';

/**
 * Reliability of the evidence, which is a DIFFERENT axis from corroboration.
 *
 * Corroboration measures independence — how many separate feeds agree.
 * Reliability measures track record — how good each feed has proven to be.
 * A mission can be corroborated across three feeds that are all grade F, and
 * a reader shown only the corroboration would think it well supported.
 *
 * ─── WHY THIS IS NOT A GATE ────────────────────────────────────────────────
 *
 * The plan called for a promotion threshold on these grades. Building it would
 * have been a mistake, for a reason specific to this network rather than a
 * general dislike of gates.
 *
 * `F` means "reliability cannot be judged" and is the documented safe default
 * for any unknown grade — so a source contributing for the first time is F by
 * construction. The population this network exists to serve is described in
 * workspaceContainment as "whistleblowers, ex-intelligence, ex-police, people
 * who know what their institution did": people with no track record HERE, on
 * their first contribution, graded F precisely because nobody has judged them
 * yet. A reliability floor would exclude them systematically, and it would do
 * it silently.
 *
 * The codebase already records the second failure mode too: gates that are
 * rarely satisfied make the tool look broken, "which is how safety machinery
 * teaches people to route around it".
 *
 * So this discloses and does not block. Weight is derived and shown; the
 * decision stays with the operator, who can see both axes.
 */
export interface EvidenceReliability {
  /** Count per Admiralty grade, absent grades counted as F. */
  byGrade: Partial<Record<IntelReliability, number>>;
  /**
   * True when every piece of evidence is E (unreliable) or F (cannot be
   * judged). Not a verdict on the mission — a first-hand account from an
   * unknown source is exactly this shape, and may be the most important thing
   * in the workspace. It is a statement about what is known of the sources.
   */
  allUnprovenOrWeak: boolean;
  /** Evidence carrying no grade at all, counted as F per the documented default. */
  ungraded: number;
}

export interface MissionCorroboration {
  /** Reports behind the mission — linked directly or through a linked case. */
  reportsBehind: number;
  /**
   * Distinct FEEDS among them. Two reports by one analyst are one feed: one
   * person is one thing that can be wrong, so agreement between them is a
   * single measurement counted twice.
   */
  feedsBehind: number;
  /** Entities where independent feeds actually corroborate a location claim. */
  corroboratedEntities: Array<{ entity: string; sourceCount: number }>;
  /**
   * True when evidence exists but no entity reaches independent corroboration.
   * Distinct from having no evidence at all, and the more interesting state:
   * the mission looks supported and rests on a single line of sight.
   */
  singleSourceOnly: boolean;
  reliability: EvidenceReliability;
}

export function computeMissionCorroboration(
  mission: MissionUI,
  reports: IntelReportUI[],
  cases: IntelCaseUI[],
): MissionCorroboration {
  const behind = reportsBehindMission(mission, reports, cases);
  const events = adaptReportsToEvents(behind);

  // Same rule the corroboration engine uses, not a second definition of it.
  const feeds = new Set(events.map((e) => e.feedId ?? e.sourceId));

  const corroborated: Array<{ entity: string; sourceCount: number }> = [];
  for (const bucket of bucketByEntity(events).values()) {
    const finding = findingForBucket(bucket.displayName, bucket.events);
    if (finding) corroborated.push({ entity: finding.entityRef, sourceCount: finding.sourceCount });
  }
  corroborated.sort((a, b) => b.sourceCount - a.sourceCount);

  const byGrade: Partial<Record<IntelReliability, number>> = {};
  let ungraded = 0;
  for (const report of behind) {
    // Absent grade is F, never optimistic: an unjudged source must not read as
    // a judged-good one.
    const grade = report.reliability ?? 'F';
    if (!report.reliability) ungraded++;
    byGrade[grade] = (byGrade[grade] ?? 0) + 1;
  }
  const weak = (byGrade.E ?? 0) + (byGrade.F ?? 0);

  return {
    reportsBehind: behind.length,
    feedsBehind: feeds.size,
    corroboratedEntities: corroborated,
    singleSourceOnly: behind.length > 0 && corroborated.length === 0,
    reliability: {
      byGrade,
      allUnprovenOrWeak: behind.length > 0 && weak === behind.length,
      ungraded,
    },
  };
}
