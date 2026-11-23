/**
 * What the Globe adds to the one ticker (K4): its energy readings, those the
 * visitor has, and the Globe settings (the energy categories, the display, the
 * data and the API keys). They were a second ticker of the Globe's own, under
 * this one, whose every item read "needs an EIA key" for a visitor without one.
 *
 * Rendered only on the Globe, so the energy feed is read only there.
 */
import React, { useEffect, useMemo } from 'react';
import { Settings } from 'lucide-react';
import { useTopBarDataPoints } from '../HUD/Bars/CyberCommandTopBar/useTopBarDataPoints';
import { TOPBAR_CATEGORIES } from '../HUD/Bars/CyberCommandTopBar/topbarCategories';
import EnhancedSettingsPopup from '../HUD/Bars/CyberCommandTopBar/EnhancedSettingsPopup';
import { usePopup } from '../Popup/PopupManager';
import { energySignalsFrom } from './energySignals';
import type { PrimaryMarqueeSignal } from './usePrimaryMarqueeData';
import styles from './MainMarqueeTopBar.module.css';

export const GlobeTickerExtras: React.FC<{ onSignals: (signals: PrimaryMarqueeSignal[]) => void }> = ({ onSignals }) => {
  const { dataPoints, preferences, setCategoryEnabled } = useTopBarDataPoints();
  const { showPopup } = usePopup();
  const signals = useMemo(() => energySignalsFrom(dataPoints), [dataPoints]);

  useEffect(() => { onSignals(signals); }, [signals, onSignals]);
  // Leaving the Globe takes its readings with it.
  useEffect(() => () => onSignals([]), [onSignals]);

  return (
    <button
      type="button"
      className={styles.statusButton}
      aria-label="Globe settings"
      title="Globe settings: the energy readings, display, data and API keys"
      onClick={() => showPopup({
        component: ({ onClose }: { onClose: () => void }) => (
          <EnhancedSettingsPopup
            open
            onClose={onClose}
            enabledCategories={preferences.enabledCategories}
            onCategoryToggle={setCategoryEnabled}
            categories={TOPBAR_CATEGORIES}
            currentDataPoints={dataPoints}
            initialHighlightedDataPoint={null}
          />
        ),
        label: 'Globe settings',
        backdrop: true,
        zIndex: 4000,
      })}
    >
      <Settings className={styles.buttonIcon} size={14} aria-hidden="true" />
      <span className={styles.buttonLabel}>SETTINGS</span>
    </button>
  );
};
