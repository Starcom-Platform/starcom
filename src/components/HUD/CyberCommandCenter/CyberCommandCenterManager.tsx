// Center View Manager - Simplified for Enhanced Application Router
// Now focuses on Globe visualization for CyberCommand

import React, { useRef } from 'react';
import styles from './CyberCommandCenterManager.module.css';

// Import the real Globe component - not lazy loaded to keep it mounted
import Globe from '../../Globe/Globe';
import { GlobeGate } from '../../Globe/GlobeErrorBoundary';

interface CyberCommandCenterManagerProps {
  className?: string;
  globeOnly?: boolean; // Add prop to show only the globe (for embedded mode)
}

const CyberCommandCenterManager: React.FC<CyberCommandCenterManagerProps> = ({ 
  className = '', 
  globeOnly = true // Default to globe only in Enhanced Application Router
}) => {
  const globeContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`${styles.cyberCommandCenterManager} ${className}`}>
      {/* Globe container - simplified for Enhanced Application Router */}
      <div 
        ref={globeContainerRef}
        className={`${styles.globeContainer} ${globeOnly ? styles.globeOnly : ''}`}
        style={{ 
          width: '100%',
          height: '100%'
        }}
      >
        {/*
          Checked BEFORE mounting, not caught afterwards. three.js constructs
          its renderer outside React's render path, so the throw arrives as an
          uncaught window error that no error boundary can catch — verified by
          running this in a browser without WebGL2, where a boundary alone still
          lost the whole application.
        */}
        <GlobeGate>
          <Globe />
        </GlobeGate>
      </div>
    </div>
  );
};

export default CyberCommandCenterManager;
