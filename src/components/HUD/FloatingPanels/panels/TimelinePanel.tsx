import React from 'react';
import { FloatingPanelData } from '../FloatingPanelContext';
import TimelineView from '../../CyberCommandCenter/TimelineView';

interface TimelinePanelProps {
  data?: FloatingPanelData;
}

/**
 * TimelinePanel — Floating panel wrapper for the TimelineView.
 * Renders the intelligence timeline from the Intel Data Core.
 * Activated via addActiveFeature('timeline') or addActiveFeature('temporal-view').
 */
const TimelinePanel: React.FC<TimelinePanelProps> = () => {
  return (
    // Not `fullscreen`: that mode is position: fixed, and the panel frame's
    // transform pins a fixed child to the frame rather than the screen, so the
    // view was squeezed into the frame's box while its content overflowed it.
    <div style={{ width: '100%', height: '100%' }}>
      <TimelineView framed />
    </div>
  );
};

export default TimelinePanel;
