import React from 'react';
import styles from './PlacePickHint.module.css';

/**
 * Says what the next click on the globe does while a report's place is picked
 * (plan item 3.5), and gives the way back to the form without one for a person
 * who does not reach for Esc.
 */
const PlacePickHint: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className={styles.hint} role="status" data-testid="place-pick-hint">
    <span className={styles.label}>Picking a place</span>
    <span>Click the globe where the report is about. Drag to turn it; Esc goes back.</span>
    <button type="button" className={styles.back} onClick={onBack}>Back to the report</button>
  </div>
);

export default PlacePickHint;
