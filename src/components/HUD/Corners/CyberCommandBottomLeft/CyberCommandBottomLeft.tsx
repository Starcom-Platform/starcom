import React from 'react';
import { useTemporalStateOptional } from '../../../../context/TemporalContext';
import styles from './CyberCommandBottomLeft.module.css';
import { Docked } from '../../../Dock/Docked';
import { formatUtcDateTime, formatUtcWindow, localTimeTitle, notThisYear } from '../../../../utils/utcTime';

/**
 * BottomLeft Corner — Temporal Position Indicator
 * Shows: LIVE/SCRUB badge, current temporal position, data range window
 *
 * Docked (globeTemporalPosition), so it stacks with the other bottom-left items
 * rather than sitting under them.
 */
const CyberCommandBottomLeft: React.FC = () => {
  const temporal = useTemporalStateOptional();

  // No temporal context, nothing to say, and no empty slot taking a gap in the dock.
  if (!temporal) return null;

  const { isLive, currentTime, timeWindow } = temporal;

  return (
    <Docked slot="globeTemporalPosition">
    <div className={styles.bottomLeft} data-testid="globe-temporal-position">
      <span className={`${styles.badge} ${isLive ? styles.liveBadge : styles.scrubBadge}`}>
        {isLive ? 'LIVE' : 'SCRUB'}
      </span>
      {!isLive && timeWindow && (
        <span
          className={styles.timeRange}
          title={`${localTimeTitle(timeWindow.start.getTime())} – ${localTimeTitle(timeWindow.end.getTime())}`}
        >
          {formatUtcWindow(timeWindow.start.getTime(), timeWindow.end.getTime())}
        </span>
      )}
      {!isLive && (
        <span className={styles.position} title={localTimeTitle(currentTime)}>{formatUtcDateTime(currentTime, { year: notThisYear(currentTime) })}</span>
      )}
    </div>
    </Docked>
  );
};

export default CyberCommandBottomLeft;