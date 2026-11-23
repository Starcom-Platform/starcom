import React from 'react';
import { statusMeans, statusName, statusTone, type SteppedKind, type StatusTone } from '../../services/intel/steps/statusSteps';
import styles from './StatusChip.module.css';
import { useMessages } from '../../i18n/app/i18n';

/**
 * Where a record stands, drawn one way everywhere (BD3, BD24): its word, and a
 * shape and colour for what that means. Working is plain with an open ring,
 * waiting amber with a half ring, done green with a check, closed grey with a
 * filled square. The shape says it without the colour; the word says it all.
 *
 * Missions coloured its statuses from a map of its own (Packaged blue, Ready
 * amber), the cases list from another, and a report's badge carried fills that
 * were never drawn.
 */
const MARK: Record<StatusTone, { mark: string; draw: React.ReactNode }> = {
  working: { mark: 'ring', draw: <circle cx="8" cy="8" r="4.5" className={styles.stroke} /> },
  waiting: {
    mark: 'half',
    draw: (
      <>
        <circle cx="8" cy="8" r="4.5" className={styles.stroke} />
        <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" className={styles.fill} />
      </>
    ),
  },
  done: { mark: 'check', draw: <path d="m3.5 8.5 3 3 6-6.5" className={styles.stroke} /> },
  closed: { mark: 'square', draw: <rect x="4" y="4" width="8" height="8" rx="1" className={styles.fill} /> },
};

const StatusChip: React.FC<{ kind: SteppedKind; status: string; testId?: string }> = ({ kind, status, testId = 'status-chip' }) => {
  const { m: { shared: words } } = useMessages();
  const tone = statusTone(kind, status);
  const { mark, draw } = MARK[tone];
  return (
    <span className={styles.chip} data-status={status} data-tone={tone} data-testid={testId} title={statusMeans(kind, status, words) || undefined}>
      <svg className={styles.mark} viewBox="0 0 16 16" width="12" height="12" data-mark={mark} aria-hidden="true">{draw}</svg>
      {statusName(kind, status, words)}
    </span>
  );
};

export default StatusChip;
