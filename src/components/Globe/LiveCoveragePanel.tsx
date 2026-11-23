/**
 * The coverage panel as the Globe draws it, with its relays' lights and the
 * gauge read live (BD11, BD12). The relays' clock moves every ten seconds; kept
 * here, only this panel redraws then, not the Globe around it.
 */
import React from 'react';
import { CoveragePanel } from './CoveragePanel';
import { useRelayHealth } from '../../hooks/useRelayHealth';
import type { CoverageAxis } from '../../services/intel/coverage/coverage';

export const LiveCoveragePanel: React.FC<{ axes: readonly CoverageAxis[] }> = ({ axes }) => {
  const health = useRelayHealth();
  return <CoveragePanel axes={axes} health={health} />;
};

export default LiveCoveragePanel;
