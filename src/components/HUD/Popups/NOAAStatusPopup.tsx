import React from 'react';
import { usePopup } from '../../Popup/PopupManager';
import { useVisualizationMode } from '../../../context/VisualizationModeContext';
import NOAADeepControlsPopup from './NOAADeepControlsPopup';
import styles from './NOAAStatusPopup.module.css';

interface NOAAStatusPopupProps {
  onClose: () => void;
}

const NOAAStatusPopup: React.FC<NOAAStatusPopupProps> = ({ onClose }) => {
  const { showPopup } = usePopup();
  const { visualizationMode } = useVisualizationMode();
  const canOpenNoaaDeepControls = visualizationMode.mode === 'EcoNatural' && visualizationMode.subMode === 'SpaceWeather';

  const openDeepControls = () => {
    showPopup({
      component: NOAADeepControlsPopup,
      backdrop: true,
      zIndex: 3200
    });
  };

  return (
    <section className={styles.popup} aria-label="NOAA status popup">
      <header className={styles.header}>
        <h2 className={styles.title}>Status Detail</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close status popup">
          ✕
        </button>
      </header>

      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.label}>Mode</span>
          <strong>{visualizationMode.mode}</strong>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Sub-mode</span>
          <strong>{visualizationMode.subMode}</strong>
        </div>
      </div>

      {/* "Globe Engine: Operational" and "Data Feeds: Online" stood here as fixed
          text, shown in green with every feed unreachable. Nothing measured them
          (decision B4, as "All systems operational" in plan item 3.1). */}

      <div className={styles.actions}>
        {canOpenNoaaDeepControls ? (
          <button
            type="button"
            className={styles.actionButton}
            onClick={openDeepControls}
            data-testid="noaa-status-open-deep-controls"
          >
            Open NOAA Deep Controls
          </button>
        ) : (
          <div className={styles.unavailableMessage} data-testid="noaa-status-deep-controls-unavailable">
            NOAA deep controls are only available in EcoNatural / SpaceWeather context.
          </div>
        )}
      </div>
    </section>
  );
};

export default NOAAStatusPopup;