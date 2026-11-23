import { describe, it, expect } from 'vitest';
import { computeChangedFields } from '../reportLifecycle';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const base: IntelReportUI = {
  id: 'l1', title: 'T', content: 'C', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(0), updatedAt: new Date(0), status: 'DRAFT',
  startDate: new Date('2026-07-27T00:00:00Z'), timePrecisionMs: 60_000,
};

describe('computeChangedFields: event time', () => {
  it('counts a change to how closely the event time is known as a change', () => {
    // saveReport skips a report with no changed fields, so a change it cannot see is an edit that never saves.
    expect(computeChangedFields(base, { ...base, timePrecisionMs: 86_400_000 })).toEqual(['timePrecisionMs']);
  });
});
