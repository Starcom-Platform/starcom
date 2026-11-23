import React from 'react';
import { usePrimaryMarqueeData } from './usePrimaryMarqueeData';
import styles from './SystemStatusPanel.module.css';

/**
 * Every readout the app keeps, in one place (decision D-F, step 3.4).
 *
 * The strip under the header shows what bears on the screen a person is on, and
 * opens this for the rest: the route mode, the Solana link, the chain telemetry, the
 * auth posture, the operator diagnostics, the nav history and the mission lane. None
 * of them was retired when the strip stopped carrying them everywhere; they are here,
 * from every screen, and they go on updating while this is open.
 */
const SystemStatusPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { allSignals } = usePrimaryMarqueeData();

  return (
    <section className={styles.panel} aria-label="System status">
      <header className={styles.header}>
        <h2 className={styles.title}>System status</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close system status">
          ×
        </button>
      </header>

      <dl className={styles.readouts}>
        {allSignals.map((signal) => (
          <div key={signal.id} className={styles.readout}>
            <dt className={styles.label}>{signal.label}</dt>
            <dd className={styles.value}>{signal.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default SystemStatusPanel;
