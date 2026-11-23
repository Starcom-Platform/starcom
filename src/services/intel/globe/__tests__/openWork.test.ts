/**
 * Which evidence carries unclaimed work, and what the count must not lose.
 *
 * The risk in an evidence-anchored count is that it quietly under-reports: a
 * mission whose evidence cannot be placed has just as much open work as one
 * whose can, and dropping it would make the globe imply there is less to do.
 */
import { describe, it, expect } from 'vitest';
import { openWorkOnEvidence, isOpen } from '../openWork';
import type { MissionUI } from '../../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../../types/intel/MissionUI';

const report = (id: string, latitude = 10, longitude = 20): IntelReportUI => ({
  id, title: `Report ${id}`, content: '', author: 'a', category: 'GEOINT',
  tags: [], latitude, longitude,
  createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
  status: 'DRAFT',
} as unknown as IntelReportUI);

const objective = (over: Partial<MissionUI['objectives'][number]> = {}) => ({
  id: `o-${Math.random().toString(36).slice(2, 7)}`,
  description: 'Do the thing',
  completed: false,
  ...over,
});

const mission = (over: Partial<MissionUI> = {}): MissionUI => ({
  id: 'm1', missionNumber: 'MSN-1', title: 'A mission', briefing: '',
  status: MissionStatus.PLANNING,
  objectives: [objective()],
  relatedReports: ['r1'], relatedCases: [],
  tags: [], metadata: {},
  createdAt: '2026-09-01', updatedAt: '2026-09-01', createdBy: 'op',
  collaborators: [], comments: [], activityLog: [],
  permissions: { isPublic: false },
  ...over,
} as unknown as MissionUI);

describe('isOpen', () => {
  it('is open only when it is neither done nor taken', () => {
    expect(isOpen(objective())).toBe(true);
    expect(isOpen(objective({ completed: true }))).toBe(false);
    expect(isOpen(objective({ claimedBy: 'Aisha' }))).toBe(false);
    // Both absences are required: a completed objective somebody also claimed
    // is still not open work.
    expect(isOpen(objective({ completed: true, claimedBy: 'Aisha' }))).toBe(false);
  });
});

describe('openWorkOnEvidence', () => {
  it('counts unclaimed objectives against the evidence they rest on', () => {
    const result = openWorkOnEvidence(
      [mission({ objectives: [objective(), objective()] })],
      [report('r1')],
    );
    expect(result.byReportId.get('r1')).toBe(2);
    expect(result.missionsNotDrawn).toBe(0);
  });

  it('ignores a mission whose work is all done or all taken', () => {
    const result = openWorkOnEvidence(
      [mission({ objectives: [objective({ completed: true }), objective({ claimedBy: 'Aisha' })] })],
      [report('r1')],
    );
    expect(result.byReportId.size).toBe(0);
  });

  it('counts work it cannot draw rather than losing it', () => {
    // The mission's evidence is not among the reports, so no pin exists for it.
    const result = openWorkOnEvidence(
      [mission({ relatedReports: ['missing'], objectives: [objective(), objective()] })],
      [report('r1')],
    );
    expect(result.byReportId.size).toBe(0);
    expect(result.missionsNotDrawn).toBe(1);
    expect(result.objectivesNotDrawn).toBe(2);
  });

  it('counts a report with no coordinates as undrawable, not as evidence', () => {
    const noPlace = { ...report('r1'), latitude: undefined, longitude: undefined } as IntelReportUI;
    const result = openWorkOnEvidence([mission()], [noPlace]);
    expect(result.byReportId.size).toBe(0);
    expect(result.missionsNotDrawn).toBe(1);
  });

  it('adds up across missions resting on the same evidence', () => {
    const result = openWorkOnEvidence(
      [
        mission({ id: 'm1', objectives: [objective()] }),
        mission({ id: 'm2', objectives: [objective(), objective()] }),
      ],
      [report('r1')],
    );
    expect(result.byReportId.get('r1')).toBe(3);
  });

  it('marks every pin a mission rests on, not just the first', () => {
    const result = openWorkOnEvidence(
      [mission({ relatedReports: ['r1', 'r2'], objectives: [objective()] })],
      [report('r1'), report('r2', 30, 40)],
    );
    expect(result.byReportId.get('r1')).toBe(1);
    expect(result.byReportId.get('r2')).toBe(1);
  });
});

describe('openWorkOnEvidence — through a mission\'s cases (plan item 1.8)', () => {
  it('draws a mission\'s open work on the reports its cases rest on', () => {
    // Its case ids were looked up as reports, found as nothing, and the
    // mission counted as resting "on nothing this globe can draw" beside a
    // Coverage panel saying it rested on evidence.
    const result = openWorkOnEvidence(
      [mission({ relatedReports: [], relatedCases: ['case-1'] })],
      [report('r-case')],
      [],
      [{ id: 'case-1', relatedEntities: ['r-case'] }],
    );
    expect(result.byReportId.get('r-case')).toBe(1);
    expect(result.missionsNotDrawn).toBe(0);
  });
});
