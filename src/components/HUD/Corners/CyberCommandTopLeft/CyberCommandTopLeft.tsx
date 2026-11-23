// src/components/HUD/Corners/CyberCommandTopLeft/CyberCommandTopLeft.tsx
import React from 'react';
import { useVisualizationMode } from '../../../../context/VisualizationModeContext';
import TinyGlobe from '../../../TinyGlobe/TinyGlobe';
import { GlobeGate } from '../../../Globe/GlobeErrorBoundary';
import styles from './CyberCommandTopLeft.module.css';
import { Docked } from '../../../Dock/Docked';
import { formatUtcTime, localTimeTitle } from '../../../../utils/utcTime';
import { useClockNow } from '../../../../context/TemporalContext';
import { PRIMARY_RAIL_MODES } from '../../Bars/CyberCommandRails/railModeConfig';
import { layerLabel, type GlobeLayerId } from '../../../Globe/Hooks/useGlobeLayerControl';

/** A view's name for a person to read: the rail's own (the ids are for code: CyberCommand is shown as Intel Watch). */
const modeName = (mode: string): string => PRIMARY_RAIL_MODES.find((m) => m.mode === mode)?.tooltip ?? mode;

/**
 * TopLeft Corner — System Identity & Status
 * Shows: Starcom branding, current mode, system clock, and TinyGlobe — a
 * real orientation minimap (where the main globe's camera is pointed),
 * active-layer pulses, and a mode-colored accent ring.
 *
 * Docked (globeOrientation), so it sits clear of the rails and the top bar.
 */
const CyberCommandTopLeft: React.FC = () => {
  const { visualizationMode } = useVisualizationMode();
  // The app's one clock (decision D-E), not an interval of its own.
  const now = useClockNow();

  return (
    <Docked slot="globeOrientation">
    <div className={styles.topLeft} data-testid="globe-orientation">
      <div className={styles.systemStatus}>
        <span className={styles.clockLabel} title={localTimeTitle(now)}>{formatUtcTime(now, { seconds: true })}</span>
        <span className={styles.modeLabel}>
          {modeName(visualizationMode.mode)} / {layerLabel(visualizationMode.subMode as GlobeLayerId)}
        </span>
      </div>
      {/*
        The front door mounts two globes, and this one is the second. Like the
        main view it constructs a WebGLRenderer outside React's render path, so
        without a gate it threw an uncaught error and took the application down
        even after the main globe was protected — found by running the app in a
        browser with no WebGL2, not by any test.

        Renders nothing when unavailable: the main view already explains why,
        and a minimap repeating the paragraph in a corner would be noise.
      */}
      <GlobeGate fallback={null}>
        <TinyGlobe />
      </GlobeGate>
    </div>
    </Docked>
  );
};

export default CyberCommandTopLeft;