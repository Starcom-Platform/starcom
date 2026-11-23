import type { ComposeInput } from '../../exchange/types';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { packageCitations } from '../../intel/citations';

export function composeInputFromDraft(report: IntelReportUI): ComposeInput {
  return {
    name: report.title || `Draft ${report.id}`,
    description: report.summary || 'Draft exported from IntelAnalyzer',
    visibility: report.visibility,
    license: 'OPEN',
    author: report.author || 'Analyst',
    reports: [{ id: report.id, title: report.title || report.id, content: report.content }],
    intel: [],
    assets: [],
  analysisDeepLink: report.analysisDeepLink,
    // What the report rests on, cited on the announcement. The Exchange goes only to public relays, so only a Public report's (D-MX, MX24).
    ...citedIfPublic(report),
  };
}

function citedIfPublic(report: IntelReportUI): Pick<ComposeInput, 'cites'> {
  const { cites } = packageCitations([report], 'public');
  return cites.length ? { cites } : {};
}
