// CountryInfoTooltip.tsx — hover tooltip for the National Territories globe
// layer. Mirrors IntelReportTooltip's structure (fixed-position div, role=
// tooltip/aria-live, CSS-module dark theme) for a much simpler payload: just
// the hovered country's name/code, following the mouse (the same fallback
// IntelReportTooltip itself uses when no screen-projected object position is
// available — see Enhanced3DGlobeInteractivity.tsx's getTooltipPosition).
import React from 'react';
import type { CountryHoverInfo } from '../../../geopolitical/hooks/useNationalTerritories3D';
import styles from './CountryInfoTooltip.module.css';

interface CountryInfoTooltipProps {
  info: CountryHoverInfo | null;
  position: { x: number; y: number };
  visible: boolean;
}

export const CountryInfoTooltip: React.FC<CountryInfoTooltipProps> = ({ info, position, visible }) => {
  if (!visible || !info) return null;

  return (
    <div
      className={`${styles.tooltip} ${visible ? styles.visible : ''}`}
      style={{ left: position.x, top: position.y }}
      role="tooltip"
      aria-live="polite"
      aria-label={`Country: ${info.name || info.countryCode}`}
    >
      <div className={styles.name}>{info.name || info.countryCode}</div>
      <div className={styles.code}>{info.countryCode}</div>
      <div className={styles.hint}>Click for details</div>
    </div>
  );
};

export default CountryInfoTooltip;
