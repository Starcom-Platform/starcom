import React from 'react';
import type { SeverityLevel } from './severityLevel';
import styles from './SeverityBadge.module.css';
import { fill, useMessages } from '../../i18n/app/i18n';

/**
 * How serious something is, drawn one way everywhere (BD3): the word on the
 * Cases' scale, with pips on the warm ramp, so the level reads without colour.
 * The ramp has no green, because low harm is not "good". Nobody having said is
 * "Not assessed", in grey, which is not a low level.
 *
 * Reports drew it so (ReportSeverity, plan item 1.9); the cases list drew its
 * own chip from a colour map of its own, where "Low" was cyan.
 */
const PIPS = { low: 1, medium: 2, high: 3, critical: 4 } as const;

const SeverityBadge: React.FC<{
  level: SeverityLevel;
  /** Whose word it is, for the hover: "by its author". */
  said?: string;
  testId?: string;
}> = ({ level, said, testId = 'severity-badge' }) => {
  const { m: { shared: t } } = useMessages();
  if (level === 'unset') {
    return (
      <span className={styles.severity} data-level="unset" title={t.notAssessedMeans} data-testid={testId}>
        {t.notAssessed}
      </span>
    );
  }
  return (
    <span className={styles.severity} data-level={level} title={said ? fill(t.severitySaid, { level: t.severity[level], said }) : t.severity[level]} data-testid={testId}>
      <span className={styles.pips} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => <span key={n} className={styles.pip} data-pip={n <= PIPS[level] ? 'on' : 'off'} />)}
      </span>
      {t.severity[level]}
    </span>
  );
};

export default SeverityBadge;
