/**
 * EcoNaturalSettingsPopup — real settings UI for the EarthWeather and
 * EcologicalDisasters sub-modes (weatherLayers toggles, colorMode,
 * disaster-type/severity filters, radius opacity, etc.), opened from
 * CyberCommandLeftSideSubRail's settings button — the same real
 * showPopup()-from-left-sub-rail pattern SpaceWeatherSubRailSettingsPopup
 * already uses for the SpaceWeather sub-mode.
 *
 * Wraps SpaceWeatherSettings (src/components/HUD/Settings/SpaceWeatherSettings),
 * which already implements real per-subMode settings panels and real
 * useEcoNaturalSettings-backed state — that component had simply never been
 * mounted anywhere reachable (confirmed via a full grep sweep: no static
 * import, dynamic import, or string-keyed registry reference existed for it
 * or its would-be legacy host, CyberCommandRightSideBar, which itself isn't
 * the component the live HUD layout actually renders).
 */
import React from 'react';
import SpaceWeatherSettings from '../Settings/SpaceWeatherSettings/SpaceWeatherSettings';
import styles from './EcoNaturalSettingsPopup.module.css';

export type EcoNaturalSettingsSubMode = 'EarthWeather' | 'EcologicalDisasters';

interface EcoNaturalSettingsPopupProps {
  subMode: EcoNaturalSettingsSubMode;
  onClose: () => void;
}

const SUBMODE_TITLES: Record<EcoNaturalSettingsSubMode, string> = {
  EarthWeather: 'Earth Weather Settings',
  EcologicalDisasters: 'Ecological Disasters Settings'
};

const EcoNaturalSettingsPopup: React.FC<EcoNaturalSettingsPopupProps> = ({ subMode, onClose }) => {
  const title = SUBMODE_TITLES[subMode];

  return (
    <section className={styles.popup} aria-label={`${title} popup`}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()} popup`}
        >
          ✕
        </button>
      </header>

      <div className={styles.body}>
        <SpaceWeatherSettings subMode={subMode} />
      </div>
    </section>
  );
};

export default EcoNaturalSettingsPopup;
