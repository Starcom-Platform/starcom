/**
 * The area outlined on the globe with no report naming it (BA24): found in the
 * header's search, or lit by a card about it. Named while it is lit, with the
 * way to clear it, so an outline nobody can account for never stays on.
 */
import React, { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import { getLitArea, setLitArea, subscribeLitArea } from '../../features/globe/areas/litArea';
import { areaByCode } from '../../features/globe/areas/areaRegistry';
import styles from './GlobeLitArea.module.css';

export const GlobeLitArea: React.FC = () => {
  const lit = useSyncExternalStore(subscribeLitArea, getLitArea, getLitArea);
  const area = lit ? areaByCode(lit) : null;
  if (!area) return null;
  return (
    <Docked slot="globeLitArea">
      <div className={styles.chip} role="status">
        <span className={styles.eyebrow}>Outlined</span>
        <span className={styles.name}>{area.the ? `the ${area.name}` : area.name}</span>
        <button type="button" className={styles.clear} aria-label="Clear the outline" title="Clear the outline" onClick={() => setLitArea(null)}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </Docked>
  );
};
