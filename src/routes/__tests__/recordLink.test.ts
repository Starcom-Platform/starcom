/**
 * One address for a record, used as both a URL and in-app navigation.
 *
 * The reason it is one and not two: the cross-app handoffs already passed
 * context keys through navigateToApp, and adding URLs beside them would make
 * two systems for one idea. They would drift, and a link that opens something
 * different from what the button opens is worse than no link at all.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { recordPath, recordTarget, isRecordKind, RECORD_KINDS } from '../recordLink';

describe('recordPath', () => {
  it('addresses each kind distinctly', () => {
    // A case has a page of its own (plan item 1.2): its address is the page's.
    expect(recordPath('case', 'c1')).toBe('/app/cases/c1');
    expect(recordPath('mission', 'm1')).toBe('/r/mission/m1');
    expect(recordPath('report', 'r1')).toBe('/r/report/r1');
  });

  it('encodes ids that would otherwise break the path', () => {
    // Workspace ids are uuid-shaped today, but an id containing a slash would
    // silently address a different record — and silently is the problem.
    expect(recordPath('case', 'a/b?c')).toBe('/app/cases/a%2Fb%3Fc');
    expect(recordPath('mission', 'a/b?c')).toBe('/r/mission/a%2Fb%3Fc');
  });
});

describe('isRecordKind', () => {
  it('accepts exactly the kinds that resolve', () => {
    for (const k of RECORD_KINDS) expect(isRecordKind(k)).toBe(true);
  });

  it('rejects anything else, including a finding', () => {
    // Findings are derived from correlation over the current working set and
    // carry no stable id, so an address for one would resolve to something
    // different — or nothing — as soon as the corpus changed.
    expect(isRecordKind('finding')).toBe(false);
    expect(isRecordKind('')).toBe(false);
    expect(isRecordKind(undefined)).toBe(false);
  });
});

describe('recordTarget', () => {
  it('sends a case to the cases app with the id to select', () => {
    expect(recordTarget('case', 'c1')).toEqual({ app: 'cases', context: { selectCaseId: 'c1' } });
  });

  it('sends a report to the dashboard, under the key the dashboard reads', () => {
    expect(recordTarget('report', 'r1')).toEqual({ app: 'inteldashboard', context: { reportId: 'r1' } });
  });

  it('sends a mission to the missions TAB, not just the app', () => {
    // teamworkspace opens on Overview. A link that lands there has not opened
    // the mission, and would look like a broken link rather than a missing tab.
    expect(recordTarget('mission', 'm1')).toEqual({
      app: 'teamworkspace',
      context: { initialTab: 'missions', selectMissionId: 'm1' },
    });
  });

  it('names an application that actually exists for every kind', () => {
    // A target pointing at an unregistered id would navigate nowhere and the
    // caller's own assertion would still pass — the exact shape of the
    // teamworkspace tab bug this mapping is written to avoid repeating.
    const registered = ['cases', 'inteldashboard', 'teamworkspace'];
    for (const kind of RECORD_KINDS) {
      expect(registered).toContain(recordTarget(kind, 'x').app);
    }
  });
});
