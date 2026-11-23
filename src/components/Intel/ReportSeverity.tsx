import React from 'react';
import type { IntelReportPriority } from '../../types/intel/IntelReportUI';
import { getIntelReportPriority } from '../../utils/intelReportPriority';
import SeverityBadge from '../Shared/SeverityBadge';
import { useMessages } from '../../i18n/app/i18n';

/**
 * How serious a report's author said it is (plan item 1.9, story S7), as the
 * one severity badge (BD3). The report panel, the globe's popup and its
 * tooltip each had their own reading, on their own words, and called an
 * unassessed report "STANDARD". What the author stated comes first; a peer's
 * report says it with a tag.
 */
const ReportSeverity: React.FC<{ priority?: IntelReportPriority; tags?: string[] }> = ({ priority, tags }) => {
  const { m: { shared: t } } = useMessages();
  return <SeverityBadge level={getIntelReportPriority({ priority, tags: tags ?? [] })} said={t.byItsAuthor} testId="report-severity" />;
};

export default ReportSeverity;
