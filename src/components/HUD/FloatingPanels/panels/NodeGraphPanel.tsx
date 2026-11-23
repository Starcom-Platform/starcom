import React from 'react';
import { FloatingPanelData } from '../FloatingPanelContext';
import NodeGraphView from '../../CyberCommandCenter/NodeGraphView';

interface NodeGraphPanelProps {
  data?: FloatingPanelData;
}

/**
 * NodeGraphPanel — Floating panel wrapper for the NodeGraphView.
 * Renders the intelligence entity graph (nodes + edges) from the Intel Data Core.
 * Activated via addActiveFeature('node-graph') or addActiveFeature('link-analysis').
 */
const NodeGraphPanel: React.FC<NodeGraphPanelProps> = () => {
  return (
    // Not `fullscreen`, for the same reason as TimelinePanel: a fixed child of the
    // transformed panel frame pins to the frame, not the screen.
    <div style={{ width: '100%', height: '100%' }}>
      <NodeGraphView framed />
    </div>
  );
};

export default NodeGraphPanel;
