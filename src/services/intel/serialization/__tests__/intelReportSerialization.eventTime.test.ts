import { describe, it, expect } from 'vitest';
import { serializeReport, parseReport } from '../intelReportSerialization';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const sample = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 's1', title: 'T', content: 'C', author: 'a', category: 'general', tags: [],
  status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe('intelReportSerialization: how closely the event time is known', () => {
  it('exports and imports timePrecisionMs with the event time', () => {
    const exported = serializeReport(sample({ startDate: new Date('2026-07-01T00:00:00Z'), timePrecisionMs: 31 * 86_400_000 }));
    expect(exported.timePrecisionMs).toBe(31 * 86_400_000);

    const { report, errors } = parseReport(JSON.parse(JSON.stringify(exported)));
    expect(errors).toHaveLength(0);
    expect(report?.timePrecisionMs).toBe(31 * 86_400_000);
  });

  it('imports a precision that is not a positive number as not stated', () => {
    const exported = { ...serializeReport(sample()), timePrecisionMs: -1 };
    expect(parseReport(exported).report?.timePrecisionMs).toBeUndefined();
  });
});
