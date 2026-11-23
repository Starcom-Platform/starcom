/**
 * NetRunner Control Station
 * 
 * Main command center layout for the NetRunner OSINT platform.
 * Clean, minimal structure ready for real functionality.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

import React, { useState } from 'react';
import { Box } from '@mui/material';

// Layout Components
import NetRunnerLeftSideBar from './NetRunnerLeftSideBar';
import NetRunnerCenterView from './NetRunnerCenterView';
import NetRunnerRightSideBar from './NetRunnerRightSideBar';
import NetRunnerBottomBar from './NetRunnerBottomBar';

interface NetRunnerControlStationProps {
  className?: string;
  isEmbedded?: boolean;
  /** Search subject handed over from another app, seeded into the OSINT tab. */
  initialTarget?: string;
}

/**
 * NetRunner Control Station - Main command center interface
 */
const NetRunnerControlStation: React.FC<NetRunnerControlStationProps> = ({ 
  className,
  initialTarget
}) => {
  // UI state management
  const leftSidebarOpen = true; // AI Agent sidebar always open
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [bottomBarOpen, setBottomBarOpen] = useState(false);

  // Layout dimensions
  // Open, the roster must hold a whole bot card (name, status, Run Mission, its last
  // activity, and the success-rate row it gains after a mission) plus the row's horizontal
  // scrollbar; shorter, the card clips its activity line.
  const bottomBarHeight = bottomBarOpen ? 268 : 32;
  const leftSidebarWidth = leftSidebarOpen ? 280 : 48;
  const rightSidebarWidth = rightSidebarOpen ? 320 : 48;

  return (
    <Box
      component="main"
      className={className}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: 'var(--sc-font-text)',
        overflow: 'hidden'
      }}
    >
      {/* Main Content Area */}
  <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <NetRunnerLeftSideBar
          open={leftSidebarOpen}
          width={leftSidebarWidth}
        />

        {/* Center View */}
        <NetRunnerCenterView
          width={`calc(100% - ${leftSidebarWidth}px - ${rightSidebarWidth}px)`}
          height={`calc(100% - ${bottomBarHeight}px)`}
          initialTarget={initialTarget}
        />

        {/* Right Sidebar */}
        <NetRunnerRightSideBar
          open={rightSidebarOpen}
          width={rightSidebarWidth}
          onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
        />
      </Box>

      {/* Bottom Bar */}
      <NetRunnerBottomBar
        height={bottomBarHeight}
        open={bottomBarOpen}
        onToggle={() => setBottomBarOpen(!bottomBarOpen)}
      />
    </Box>
  );
};

export default NetRunnerControlStation;
