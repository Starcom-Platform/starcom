import React, { useId, useState } from 'react';
import { useMessages } from '../../i18n/app/i18n';
import { clearThisDevice, type Cleared } from '../../services/device/clearThisDevice';
import styles from './DeviceSettings.module.css';

/**
 * Settings > This device (decision D-CS, 12 Nov 2026): everything Starcom keeps is in this browser, and this clears
 * all of it, the signing key too, after one confirmation in place. What was published stays on the relays. The page
 * reloads once it is done, unless the browser could not list its databases: then it says how to finish.
 */
export const DeviceSettings: React.FC<{ clear?: () => Promise<Cleared>; reload?: () => void }> = ({
  clear = clearThisDevice,
  reload = () => window.location.reload(),
}) => {
  const id = useId();
  const { m } = useMessages();
  const [stage, setStage] = useState<'idle' | 'confirming' | 'clearing' | 'unlisted'>('idle');

  const confirm = async () => {
    setStage('clearing');
    const cleared = await clear();
    if (cleared.databasesListed) reload();
    else setStage('unlisted');
  };

  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`} data-testid="device-settings">
      <h3 id={`${id}-heading`} className={styles.heading}>{m.settings.device}</h3>
      <p className={styles.note}>{m.settings.deviceNote}</p>
      {stage === 'idle' && (
        <button type="button" className={styles.button} onClick={() => setStage('confirming')} data-testid="clear-device">
          {m.settings.clearDevice}
        </button>
      )}
      {(stage === 'confirming' || stage === 'clearing') && (
        <>
          <p className={styles.note} role="alert">{m.settings.clearWarning}</p>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.button} ${styles.danger}`}
              onClick={() => { void confirm(); }}
              disabled={stage === 'clearing'}
              data-testid="clear-device-confirm"
            >
              {m.settings.clearConfirm}
            </button>
            <button type="button" className={styles.button} onClick={() => setStage('idle')} disabled={stage === 'clearing'}>
              {m.settings.clearCancel}
            </button>
          </div>
        </>
      )}
      {stage === 'unlisted' && (
        <>
          <p className={styles.note} role="status">{m.settings.clearUnlisted}</p>
          <button type="button" className={styles.button} onClick={reload}>{m.settings.clearReload}</button>
        </>
      )}
    </section>
  );
};

export default DeviceSettings;
