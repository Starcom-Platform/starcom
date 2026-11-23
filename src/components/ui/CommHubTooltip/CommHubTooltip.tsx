// CommHubTooltip.tsx — hover tooltip for the CommHubs globe layer. Mirrors
// CountryInfoTooltip's structure (fixed-position div, role=tooltip/aria-live, CSS-module
// dark theme, cursor-following) for a cable-or-landing-point payload instead of a country.
import React from 'react';
import type { CommHubPickResult } from '../../../types/CommHubs';
import styles from './CommHubTooltip.module.css';

interface CommHubTooltipProps {
  item: CommHubPickResult | null;
  position: { x: number; y: number };
  visible: boolean;
}

export const CommHubTooltip: React.FC<CommHubTooltipProps> = ({ item, position, visible }) => {
  if (!visible || !item) return null;

  return (
    <div
      className={`${styles.tooltip} ${visible ? styles.visible : ''}`}
      style={{ left: position.x, top: position.y }}
      role="tooltip"
      aria-live="polite"
      aria-label={item.type === 'cable' ? `Submarine cable: ${item.cable.name}` : `Landing point: ${item.point.name}`}
    >
      {item.type === 'cable' ? (
        <>
          <div className={styles.name}>{item.cable.name}</div>
          <div className={styles.meta}>{item.cable.isPlanned ? 'Planned' : 'Active'} submarine cable</div>
        </>
      ) : (
        <>
          <div className={styles.name}>{item.point.name}</div>
          <div className={styles.meta}>
            {item.cableCount} real cable{item.cableCount === 1 ? '' : 's'} converge{item.cableCount === 1 ? 's' : ''} here
          </div>
        </>
      )}
      <div className={styles.hint}>Click for details</div>
    </div>
  );
};

export default CommHubTooltip;
