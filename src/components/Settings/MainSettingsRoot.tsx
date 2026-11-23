import React, { useEffect } from 'react';
import { usePopup } from '../Popup/PopupManager';
import { MainSettings } from './MainSettings';
import { MAIN_SETTINGS_EVENT } from './settingsEvents';

/**
 * Opens Settings when anything asks (settingsEvents.ts), as a dialog of the
 * popup layer, so it has a name, keeps focus and closes on Escape. Mounted
 * once, app-wide, because the header and the phone's bar both ask.
 */
const MainSettingsRoot: React.FC = () => {
  const { showPopup } = usePopup();

  useEffect(() => {
    const open = () => {
      showPopup({
        component: ({ onClose }: { onClose: () => void }) => <MainSettings onClose={onClose} />,
        label: 'Settings',
        backdrop: true,
      });
    };
    window.addEventListener(MAIN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(MAIN_SETTINGS_EVENT, open);
  }, [showPopup]);

  return null;
};

export default MainSettingsRoot;
