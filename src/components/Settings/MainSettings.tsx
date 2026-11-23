import React from 'react';
import { SoundSettings } from '../Sound/SoundSettings';
import { openCredits } from '../Credits/creditsEvents';
import { useMessages } from '../../i18n/app/i18n';
import { LanguageSettings } from './LanguageSettings';
import { DeviceSettings } from './DeviceSettings';
import styles from './MainSettings.module.css';

/**
 * The app's own settings, for every screen (asked for 2026-10-05: "if there are
 * no main settings, there should be"). The header's gear opens them, and More on
 * a phone. Sound is the first section; the next app-wide setting goes beside it.
 *
 * The Globe's settings stay on the Globe's ticker, because they are about the
 * Globe and read its energy feed, which only the Globe loads.
 */
export const MainSettings: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // In the language chosen (D-ML, L1); the language itself is the first setting.
  const { m } = useMessages();
  return (
    <div className={styles.panel} data-testid="main-settings">
      <div className={styles.header}>
        <h2 className={styles.title}>{m.settings.title}</h2>
        <button type="button" className={styles.close} onClick={onClose}>{m.settings.close}</button>
      </div>
      <div className={styles.body}>
        <LanguageSettings />
        <SoundSettings />
        <DeviceSettings />
      </div>
      <p className={styles.note}>{m.settings.globeNote}</p>
      <p className={styles.note}>
        {/* Who made what Starcom draws (TX11): not a setting, so beside the note. */}
        <button
          type="button"
          className={styles.textButton}
          onClick={() => { onClose(); openCredits(); }}
        >
          {m.settings.credits}
        </button>
        {' '}{m.settings.creditsNote}
      </p>
    </div>
  );
};

export default MainSettings;
