/**
 * Which draft the Exchange publishes (critique audit of 2026-10-01, section 9).
 *
 * The button and the wizard read `?draft=`, which nothing has set since the
 * Analyzer's export started handing over to the dashboard instead. So they
 * fell back to the newest draft, and with none, to the newest report of any
 * kind, which can be a network report somebody else wrote. A report that is
 * not a draft is never picked: the draft chosen, else the newest draft, else
 * nothing, and the screen says which.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { pickDraft } from '../pickDraft';

const at = (iso: string) => new Date(iso);
const report = (id: string, status: IntelReportUI['status'], updated: string): IntelReportUI =>
  ({ id, title: id, content: '', author: 'me', category: 'general', tags: [], status, createdAt: at(updated), updatedAt: at(updated) } as IntelReportUI);

describe('pickDraft', () => {
  const older = report('older draft', 'DRAFT', '2026-09-30T10:00:00Z');
  const newer = report('newer draft', 'DRAFT', '2026-10-01T10:00:00Z');
  const networkReport = report('someone else\'s report', 'PUBLISHED', '2026-10-01T23:00:00Z');

  it('the draft chosen', () => {
    expect(pickDraft([older, newer, networkReport], 'older draft')?.id).toBe('older draft');
  });

  it('else the newest draft, however new a report that is not a draft', () => {
    expect(pickDraft([older, networkReport, newer], null)?.id).toBe('newer draft');
  });

  it('a chosen report that is not a draft is not picked', () => {
    expect(pickDraft([older, networkReport], networkReport.id)?.id).toBe('older draft');
  });

  it('nothing, when there is no draft: never another report in its place', () => {
    expect(pickDraft([networkReport], null)).toBeNull();
    expect(pickDraft([], null)).toBeNull();
  });
});
