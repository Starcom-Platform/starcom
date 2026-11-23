import React from 'react';
import { Glyph } from '../../../../symbols/Glyph';
import { usePopup } from '../../../Popup/PopupManager';
import NOAAStatusPopup from '../../Popups/NOAAStatusPopup';
import GeopoliticalLayersPopup from '../../Popups/GeopoliticalLayersPopup';
import GlobeAppearancePopup from '../../Popups/GlobeAppearancePopup';
import { useVisualizationMode } from '../../../../context/VisualizationModeContext';
import { useVisualizationOverlay } from '../../../../hooks/useVisualizationOverlay';
import { primaryRailModes } from './railModeConfig';
import { psiKitOn } from '../../../../services/psiWatch/psiKitSwitch';
import { handleVerticalRailKeyNavigation } from './railKeyboardNavigation';
import { DivisionPicker } from './DivisionPicker';
import { toggleWarConflictOverlay, useWarConflictOverlay } from '../../../../services/globe/warConflictOverlay';
import styles from './CyberCommandRightSideRail.module.css';

export const CyberCommandRightSideRail: React.FC = () => {
  const { visualizationMode, setPrimaryMode } = useVisualizationMode();
  const {
    cursorTrailIndicatorEnabled,
    toggleCursorTrailIndicator,
    resourceZonesOverlayEnabled,
    toggleResourceZonesOverlay,
    diplomaticEventsOverlayEnabled,
    toggleDiplomaticEventsOverlay,
  } = useVisualizationOverlay();
  // War & Conflict over any mode, where Conflict Zones' overlay toggle was (owner, 1 Nov).
  const warConflictOverlay = useWarConflictOverlay();
  const { showPopup } = usePopup();
  const modeButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  // Psi Watch only with its switch on (decision D-PW, PW19).
  const modes = primaryRailModes(psiKitOn());

  const focusModeButton = (nextIndex: number) => {
    modeButtonRefs.current[nextIndex]?.focus();
  };

  const openStatusPopup = () => {
    showPopup({
      component: NOAAStatusPopup,
      backdrop: true,
      zIndex: 3100
    });
  };

  const openGeopoliticalLayersPopup = () => {
    showPopup({
      component: GeopoliticalLayersPopup,
      backdrop: true,
      zIndex: 3100
    });
  };

  const openGlobeAppearancePopup = () => {
    showPopup({
      component: GlobeAppearancePopup,
      backdrop: true,
      zIndex: 3100
    });
  };

  return (
    <aside className={styles.rail} data-testid="cyber-right-side-rail" aria-label="Right side rail">
      <div className={styles.modeList}>
        {modes.map(({ mode, glyph, tooltip }, index) => (
          <button
            key={mode}
            type="button"
            ref={(element) => {
              modeButtonRefs.current[index] = element;
            }}
            className={`${styles.modeButton} ${visualizationMode.mode === mode ? styles.modeButtonActive : ''}`}
            onClick={() => setPrimaryMode(mode)}
            onKeyDown={(event) =>
              handleVerticalRailKeyNavigation(
                event,
                index,
                modes.length,
                focusModeButton
              )
            }
            aria-label={`${tooltip} primary mode`}
            aria-pressed={visualizationMode.mode === mode}
            data-testid={`cyber-right-rail-mode-${mode}`}
            title={tooltip}
          >
            <span aria-hidden="true"><Glyph name={glyph} /></span>
          </button>
        ))}
      </div>

      <div className={styles.quickActions}>
        {/* Nation States, Zones and Spheres: one button, one division at a time (D-ZR, ZR12). */}
        <DivisionPicker />
        <button
          type="button"
          className={`${styles.quickActionButton} ${styles.overlayToggleButton} ${resourceZonesOverlayEnabled ? styles.quickActionButtonActive : ''}`}
          onClick={toggleResourceZonesOverlay}
          aria-label={`Resource zones overlay ${resourceZonesOverlayEnabled ? 'on' : 'off'}`}
          aria-pressed={resourceZonesOverlayEnabled}
          data-testid="cyber-right-rail-toggle-resource-zones"
          title={`Resource zones overlay: ${resourceZonesOverlayEnabled ? 'ON' : 'OFF'}`}
        >
          <Glyph name="layer:ResourceZones" />
        </button>
        <button
          type="button"
          className={`${styles.quickActionButton} ${styles.overlayToggleButton} ${diplomaticEventsOverlayEnabled ? styles.quickActionButtonActive : ''}`}
          onClick={toggleDiplomaticEventsOverlay}
          aria-label={`Diplomatic events overlay ${diplomaticEventsOverlayEnabled ? 'on' : 'off'}`}
          aria-pressed={diplomaticEventsOverlayEnabled}
          data-testid="cyber-right-rail-toggle-diplomatic-events"
          title={`Diplomatic events overlay: ${diplomaticEventsOverlayEnabled ? 'ON' : 'OFF'}`}
        >
          <Glyph name="layer:DiplomaticEvents" />
        </button>
        <button
          type="button"
          className={`${styles.quickActionButton} ${styles.overlayToggleButton} ${warConflictOverlay ? styles.quickActionButtonActive : ''}`}
          onClick={toggleWarConflictOverlay}
          aria-label={`War and conflict overlay ${warConflictOverlay ? 'on' : 'off'}`}
          aria-pressed={warConflictOverlay}
          data-testid="cyber-right-rail-toggle-war-conflict"
          title={`War & Conflict overlay: ${warConflictOverlay ? 'ON' : 'OFF'}`}
        >
          <Glyph name="layer:WarConflict" />
        </button>
        <button
          type="button"
          className={styles.quickActionButton}
          onClick={openGeopoliticalLayersPopup}
          aria-label="Open geopolitical layers settings"
          data-testid="cyber-right-rail-geopolitical-layers-popup"
          title="Geopolitical layers settings"
        >
          <Glyph name="action:settings" />
        </button>
        <button
          type="button"
          className={styles.quickActionButton}
          onClick={openGlobeAppearancePopup}
          aria-label="Open globe appearance settings"
          data-testid="cyber-right-rail-globe-appearance-popup"
          title="Globe appearance: planet and light"
        >
          <Glyph name="action:globeAppearance" />
        </button>
        <button
          type="button"
          className={`${styles.quickActionButton} ${cursorTrailIndicatorEnabled ? styles.quickActionButtonActive : ''}`}
          onClick={toggleCursorTrailIndicator}
          aria-label={`Cursor trail indicator ${cursorTrailIndicatorEnabled ? 'on' : 'off'}`}
          aria-pressed={cursorTrailIndicatorEnabled}
          data-testid="cyber-right-rail-toggle-cursor-trail"
          title={`Cursor trail indicator: ${cursorTrailIndicatorEnabled ? 'ON' : 'OFF'}`}
        >
          <Glyph name="action:cursorTrail" />
        </button>
        <button
          type="button"
          className={styles.quickActionButton}
          onClick={openStatusPopup}
          aria-label="Open status popup"
          data-testid="cyber-right-rail-status-popup"
          title="Open status popup"
        >
          <Glyph name="action:status" />
        </button>
      </div>
    </aside>
  );
};

export default CyberCommandRightSideRail;
