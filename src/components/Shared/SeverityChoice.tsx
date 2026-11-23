import React, { useId } from 'react';
import type { IntelReportPriority } from '../../types/intel/IntelReportUI';
import { REPORT_PRIORITIES } from '../../services/intel/reportPriority';
import SeverityBadge from './SeverityBadge';
import { severityLevel } from './severityLevel';
import styles from './SeverityChoice.module.css';
import { useMessages } from '../../i18n/app/i18n';

/**
 * Choosing how serious something is (BD17, decided 2026-10-05): five buttons
 * side by side, each drawn as the badge it gives, so every level reads before
 * it is picked. They are native radio buttons, so the arrow keys move between
 * them as in any radio group.
 *
 * Not assessed is a choice like the others, and the one held until someone
 * picks: a default level would read as an assessment nobody made.
 */
const SeverityChoice: React.FC<{
  value: IntelReportPriority | undefined;
  onChange: (priority: IntelReportPriority | undefined) => void;
  /** What the choice is, beside its name: "how serious, in your judgement". */
  hint?: string;
  /** Beside the name, after the hint: a help button. */
  help?: React.ReactNode;
  testId?: string;
}> = ({ value, onChange, hint, help, testId }) => {
  const id = useId();
  const { m: { shared: t } } = useMessages();
  const options: Array<IntelReportPriority | undefined> = [undefined, ...REPORT_PRIORITIES];
  return (
    <div className={styles.field}>
      <span className={styles.label}>
        <span id={`${id}-name`}>{t.severityName}</span>
        {hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
        {help}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-name`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={styles.options}
        data-testid={testId}
      >
        {options.map((level) => (
          <label key={level ?? 'unset'} className={styles.option} data-level={severityLevel(level)}>
            <input
              type="radio"
              name={`${id}-severity`}
              value={level ?? ''}
              checked={value === level}
              onChange={() => onChange(level)}
              className={styles.input}
            />
            <SeverityBadge level={severityLevel(level)} />
          </label>
        ))}
      </div>
    </div>
  );
};

export default SeverityChoice;
