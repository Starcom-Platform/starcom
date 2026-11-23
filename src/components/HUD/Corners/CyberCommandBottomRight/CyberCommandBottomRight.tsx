import React from 'react';
import { useGlobeLayerControl } from '../../../Globe/Hooks/useGlobeLayerControl';
import styles from './CyberCommandBottomRight.module.css';
import { Docked } from '../../../Dock/Docked';

interface CyberCommandBottomRightProps {
  /** Opens the command palette on its Layers and modes section (D-CP, CP5), where each layer is pinned or let go;
   * it opened Quick Access before the palette absorbed it. */
  onOpenLayers?: () => void;
}

/**
 * BottomRight Corner — Layer Status
 * Shows: count of active layers, pinned layer badges. Click to open the Layers panel.
 *
 * Docked (globeLayerCount), so nothing but the button itself takes the pointer.
 */
const CyberCommandBottomRight: React.FC<CyberCommandBottomRightProps> = ({ onOpenLayers }) => {
  const { layers, pinnedCount } = useGlobeLayerControl();

  const activeLayers = layers.filter(l => l.isActive);

  return (
    <Docked slot="globeLayerCount">
    <button
      type="button"
      className={styles.bottomRight}
      data-testid="globe-layer-count"
      onClick={onOpenLayers}
      title="Open Globe Layers panel"
      aria-label="Open Globe Layers panel"
    >
      <span className={styles.layerCount}>
        {activeLayers.length} LAYER{activeLayers.length !== 1 ? 'S' : ''}
      </span>
      {pinnedCount > 0 && (
        <span className={styles.pinnedBadge} title={`${pinnedCount} pinned overlays`}>
          +{pinnedCount} PIN
        </span>
      )}
    </button>
    </Docked>
  );
};

export default CyberCommandBottomRight;