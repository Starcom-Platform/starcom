import React from 'react';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import styles from './MainCenter.module.css';
import { useWorkArea } from '../../layouts/CyberCommandHUDLayout/useWorkArea';

interface MainCenterProps {
  children?: React.ReactNode;
}

const MainCenter: React.FC<MainCenterProps> = ({ children }) => {
  const { currentApp } = useApplicationRouter();
  // An application screen publishes its own area, so what is docked clears the header,
  // the strip and the bottom bar; on the globe its layout publishes the area inside
  // its HUD (decision D-F, step 3.2). Nothing publishes before the router knows the app.
  const workAreaRef = useWorkArea<HTMLElement>({ enabled: Boolean(currentApp) && currentApp !== 'cybercommand' });
  
  return (
    <main 
      ref={workAreaRef}
      className={styles.mainCenter}
      data-current-app={currentApp || 'none'}
      aria-live="polite"
    >
      {/* Application content container */}
      <div className={styles.screenContainer}>
        {children}
      </div>
    </main>
  );
};

export default MainCenter;
