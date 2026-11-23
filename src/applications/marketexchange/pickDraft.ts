/**
 * Which draft the Exchange publishes (critique audit of 2026-10-01, section 9).
 *
 * The draft the person chose, else their newest draft, else nothing. Never a
 * report that is not a draft: the old fallback took the newest report of any
 * kind, which can be a network report somebody else wrote.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

export function pickDraft(reports: readonly IntelReportUI[], chosenId: string | null | undefined): IntelReportUI | null {
  const drafts = reports
    .filter((report) => report.status === 'DRAFT')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return drafts.find((report) => report.id === chosenId) ?? drafts[0] ?? null;
}

/** Said when there is nothing to publish. */
export const NO_DRAFT = 'No draft to publish. Write a report, or export one from the Analyzer, and it appears here.';
