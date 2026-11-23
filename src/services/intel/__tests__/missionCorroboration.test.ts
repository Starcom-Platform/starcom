/**
 * The join between the two tracks, tested on the property that matters:
 * independence is measured in FEEDS, not records.
 *
 * Corroboration has been computed in this codebase for a long time and never
 * consulted by dispatch. The risk in connecting them is that the join
 * introduces a SECOND definition of what counts as corroboration, which would
 * let the tracks drift apart again while looking joined. So these tests check
 * the join reports what the engine says, including when that is unflattering.
 */
import { describe, it, expect } from 'vitest';
import { computeMissionCorroboration } from '../missionCorroboration';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (id: string, author: string, lat: number, when: string, reliability?: string): IntelReportUI => ({
  reliability,
  id, title: `Sighting ${id}`, content: '', author,
  category: 'SIGHTING', tags: [], latitude: lat, longitude: -0.12,
  createdAt: new Date(when), updatedAt: new Date(when),
  status: 'SUBMITTED', confidence: 0.8, entityRefs: ['MV Northwind'],
  summary: '', conclusions: [], recommendations: [], methodology: [],
  targetAudience: [], sourceIntelIds: [], history: [],
} as unknown as IntelReportUI);

const mission = (reports: string[] = [], cases: string[] = []): MissionUI =>
  ({ id: 'm1', relatedReports: reports, relatedCases: cases, status: MissionStatus.DRAFT } as MissionUI);

const kase = (id: string, entities: string[]): IntelCaseUI =>
  ({ id, relatedEntities: entities } as IntelCaseUI);

const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-01-01T02:00:00Z';

describe('computeMissionCorroboration', () => {
  it('reports nothing behind a mission that links nothing', () => {
    const c = computeMissionCorroboration(mission(), [], []);
    expect(c.reportsBehind).toBe(0);
    // Not "single source" — that would confuse having no evidence with having
    // thin evidence, which are different problems.
    expect(c.singleSourceOnly).toBe(false);
  });

  it('finds corroboration between two INDEPENDENT feeds', () => {
    const reports = [report('r1', 'analyst-a', 51.5, T1), report('r2', 'analyst-b', 51.5, T2)];
    const c = computeMissionCorroboration(mission(['r1', 'r2']), reports, []);
    expect(c.feedsBehind).toBe(2);
    expect(c.corroboratedEntities[0]?.entity).toBe('MV Northwind');
    expect(c.singleSourceOnly).toBe(false);
  });

  it('does NOT corroborate two reports by the same analyst', () => {
    // One person is one thing that can be wrong. This is the property the
    // whole feed-identity model exists to preserve, and the join must not
    // quietly relax it to make a mission look better supported.
    const reports = [report('r1', 'analyst-a', 51.5, T1), report('r2', 'analyst-a', 51.5, T2)];
    const c = computeMissionCorroboration(mission(['r1', 'r2']), reports, []);
    expect(c.reportsBehind).toBe(2);
    expect(c.feedsBehind).toBe(1);
    expect(c.corroboratedEntities).toHaveLength(0);
    expect(c.singleSourceOnly).toBe(true);
  });

  it('sees evidence reached through a linked case, not only direct links', () => {
    const reports = [report('r1', 'analyst-a', 51.5, T1), report('r2', 'analyst-b', 51.5, T2)];
    const c = computeMissionCorroboration(mission([], ['c1']), reports, [kase('c1', ['r1', 'r2'])]);
    expect(c.reportsBehind).toBe(2);
    expect(c.corroboratedEntities.length).toBeGreaterThan(0);
  });

  it('ignores reports this workspace does not hold', () => {
    const c = computeMissionCorroboration(mission(['r1', 'ghost']), [report('r1', 'a', 51.5, T1)], []);
    expect(c.reportsBehind).toBe(1);
  });

  it('flags the interesting state: evidence present, corroboration absent', () => {
    // A mission that looks supported and rests on one line of sight is more
    // dangerous than one visibly resting on nothing, because nothing prompts
    // a second look.
    const c = computeMissionCorroboration(mission(['r1']), [report('r1', 'analyst-a', 51.5, T1)], []);
    expect(c.reportsBehind).toBe(1);
    expect(c.singleSourceOnly).toBe(true);
  });

  describe('reliability — a different axis from corroboration', () => {
    it('counts an absent grade as F, never as unjudged-but-fine', () => {
      // An unjudged source must not read as a judged-good one. F is the
      // documented safe default.
      const c = computeMissionCorroboration(mission(['r1']), [report('r1', 'a', 51.5, T1)], []);
      expect(c.reliability.byGrade.F).toBe(1);
      expect(c.reliability.ungraded).toBe(1);
    });

    it('shows corroborated evidence that is nonetheless all unproven', () => {
      // The case the two axes exist to separate: three independent feeds
      // agreeing, none of them with any track record. Corroboration says
      // supported; reliability says nobody has judged any of them.
      const reports = [
        report('r1', 'analyst-a', 51.5, T1, 'F'),
        report('r2', 'analyst-b', 51.5, T2, 'F'),
      ];
      const c = computeMissionCorroboration(mission(['r1', 'r2']), reports, []);
      expect(c.corroboratedEntities.length).toBeGreaterThan(0);
      expect(c.reliability.allUnprovenOrWeak).toBe(true);
    });

    it('does not call it weak when any source is proven', () => {
      const reports = [
        report('r1', 'analyst-a', 51.5, T1, 'B'),
        report('r2', 'analyst-b', 51.5, T2, 'F'),
      ];
      const c = computeMissionCorroboration(mission(['r1', 'r2']), reports, []);
      expect(c.reliability.allUnprovenOrWeak).toBe(false);
      expect(c.reliability.byGrade.B).toBe(1);
    });

    it('says nothing about reliability when there is no evidence', () => {
      // Absence of evidence is not weak evidence, and conflating them would
      // make the disclosure meaningless on an empty mission.
      const c = computeMissionCorroboration(mission(), [], []);
      expect(c.reliability.allUnprovenOrWeak).toBe(false);
    });
  });
});
