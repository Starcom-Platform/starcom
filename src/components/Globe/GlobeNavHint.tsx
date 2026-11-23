import React from 'react';
import { Docked } from '../Dock/Docked';
import { usePhone } from '../../hooks/usePhone';

const hint: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  color: 'rgba(255, 255, 255, 0.8)',
  padding: '6px 14px',
  borderRadius: '4px',
  fontSize: '11px',
  pointerEvents: 'none',
};

/**
 * How to move the globe, shown for a moment (useGlobeNavHint).
 *
 * It sat at the globe's top centre, which on a phone is where the clock is
 * (K16), and told a phone to right-click (K2). It docks with the corner notes,
 * and on a phone names only what a finger can do: no long press opens the
 * globe's actions.
 */
export const GlobeNavHint: React.FC<{ visible: boolean }> = ({ visible }) => {
  const phone = usePhone();
  if (!visible) return null;
  return (
    <Docked slot="globeNavHint">
      <div style={hint} data-testid="globe-nav-hint">
        {phone ? 'Drag to rotate • Pinch to zoom' : 'Drag to rotate • Scroll to zoom • Right-click for actions'}
      </div>
    </Docked>
  );
};

export default GlobeNavHint;
