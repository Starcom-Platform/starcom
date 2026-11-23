/**
 * The measurement has to be trustworthy before the numbers mean anything.
 *
 * Mecha Jono reported 1.0 mean findings per mission and 7% corpus reach, and
 * committed to being judged on whether those move. Starcom adopting the same
 * discipline is worth nothing if the arithmetic flatters itself — so these
 * tests are mostly about the ways a metric can lie: ignoring history,
 * double-counting, or crediting evidence nobody can actually read.
 */
import { describe, it, expect } from 'vitest';
import { computePipelineMetrics } from '../pipelineMetrics';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (id: string): IntelReportUI => ({ id, title: id } as IntelReportUI);
const kase = (id: string, entities: string[] = []): IntelCaseUI =>
  ({ id, relatedEntities: entities } as IntelCaseUI);
const mission = (id: string, reports: string[] = [], cases: string[] = []): MissionUI =>
  ({ id, relatedReports: reports, relatedCases: cases, status: MissionStatus.DRAFT } as MissionUI);

describe('computePipelineMetrics', () => {
  it('reports zeroes for an empty workspace instead of dividing by nothing', () => {
    const m = computePipelineMetrics([], [], []);
    expect(m.meanEvidencePerMission).toBe(0);
    expect(m.reportsReachingAMission).toBe(0);
  });

  it('computes the headline number — mean evidence per mission', () => {
    const m = computePipelineMetrics(
      [report('r1'), report('r2')], [],
      [mission('m1', ['r1']), mission('m2', ['r1', 'r2'])],
    );
    expect(m.meanEvidencePerMission).toBe(1.5);
  });

  it('counts missions resting on nothing, including ones predating the gate', () => {
    // The gate stops NEW groundless missions. Old records still exist, and a
    // metric that ignored them would report success it had not earned.
    const m = computePipelineMetrics([report('r1')], [], [mission('m1'), mission('m2', ['r1'])]);
    expect(m.missionsWithoutEvidence).toBe(1);
    expect(m.meanEvidencePerMission).toBe(0.5);
  });

  it('counts a mission as resting on evidence as the dispatch gate does (plan item 1.8)', () => {
    // It counted links: a mission whose only report had been deleted rested on
    // it here, on nothing at the gate, and on nothing in the globe's note.
    const gone = computePipelineMetrics([report('r1')], [], [mission('m-gone', ['r-deleted']), mission('m-real', ['r1'])]);
    expect(gone.missionsWithoutEvidence).toBe(1);
    // A mission resting on its operator's own eyes says so in its briefing, and the gate accepts that.
    const seen = computePipelineMetrics([], [], [{ ...mission('m-seen'), briefing: 'Rests on direct observation.' } as MissionUI]);
    expect(seen.missionsWithoutEvidence).toBe(0);
  });

  it('credits a report reached THROUGH a case, not only directly', () => {
    // A mission resting on a case rests on that case's evidence. Counting only
    // direct links would understate reach and undervalue the Case layer —
    // exactly the stage this pipeline was missing.
    const m = computePipelineMetrics(
      [report('r1')], [kase('c1', ['r1'])], [mission('m1', [], ['c1'])],
    );
    expect(m.reportsReached).toBe(1);
    expect(m.reportsReachingAMission).toBe(1);
  });

  it('does not credit linked ids that resolve to no known report', () => {
    // A mission may cite an id this workspace does not hold. Counting it would
    // inflate reach with records nobody can read.
    const m = computePipelineMetrics([report('r1')], [], [mission('m1', ['r1', 'ghost'])]);
    expect(m.reportsReached).toBe(1);
    expect(m.reportsReachingAMission).toBe(1);
  });

  it('counts a report once however many paths reach it', () => {
    // Linked directly AND through a case is still one report reached.
    const m = computePipelineMetrics(
      [report('r1')], [kase('c1', ['r1'])], [mission('m1', ['r1'], ['c1'])],
    );
    expect(m.reportsReached).toBe(1);
  });

  it('counts evidence LINKS per mission, not resolved reports', () => {
    // Two cases citing the same report is still two pieces of evidence: the
    // operator linked two positions. Collapsing them would misreport effort.
    const m = computePipelineMetrics(
      [report('r1')], [kase('c1', ['r1']), kase('c2', ['r1'])], [mission('m1', [], ['c1', 'c2'])],
    );
    expect(m.meanEvidencePerMission).toBe(2);
    expect(m.reportsReached).toBe(1);
  });

  it('surfaces reuse — evidence informing more than one mission', () => {
    // Mecha Jono found 2 of 3,685. Effectively no reuse is a distinct failure
    // from having too little evidence, and needs its own number.
    const m = computePipelineMetrics(
      [report('r1'), report('r2')], [],
      [mission('m1', ['r1']), mission('m2', ['r1']), mission('m3', ['r2'])],
    );
    expect(m.reportsBackingMoreThanOneMission).toBe(1);
  });

  it('states the inert share honestly', () => {
    // The number that matters most: how much of what we collected is never acted on.
    const reports = ['r1', 'r2', 'r3', 'r4'].map(report);
    const m = computePipelineMetrics(reports, [], [mission('m1', ['r1'])]);
    expect(m.reportsReachingAMission).toBe(0.25);
  });
});
