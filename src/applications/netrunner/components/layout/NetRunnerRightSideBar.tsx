/**
 * NetRunner Right Sidebar - Scan Results & Analysis
 * 
 * Displays web crawler scan results and intelligence gathering data.
 * Integrates with the center scanner to show discovered pathways.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Tabs,
  Tab
} from '@mui/material';
import {
  Activity,
  Settings,
  Menu,
  Search,
  BarChart3
} from 'lucide-react';
import { useSiteFetchRoute } from '../../../../extension/siteFetcher';
import { DESKTOP_APP_URL } from '../../../../services/native/desktopApp';
import WebCrawlerResults from '../results/WebCrawlerResults';

interface NetRunnerRightSideBarProps {
  open: boolean;
  width: number;
  onToggle: () => void;
}

const NetRunnerRightSideBar: React.FC<NetRunnerRightSideBarProps> = ({
  open,
  width,
  onToggle
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [targetInput, setTargetInput] = useState('');
  const [scanTarget, setScanTarget] = useState('');
  // A page scan needs the desktop app or Starcom Uplink (B9, EX32): a browser tab cannot read another site's pages.
  const canReadPages = useSiteFetchRoute() !== null;

  const submitTarget = () => {
    const trimmed = targetInput.trim();
    if (!trimmed) return;
    setScanTarget(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  };

  const handleNavigateToUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDeepScan = (url: string) => {
    // No deeper scan mode exists yet beyond the standard crawl — logged
    // honestly rather than silently doing nothing or pretending to.
    console.log('Deep scan requested (not yet implemented beyond standard scan):', url);
  };

  return (
    <Box
      sx={{
        width: `${width}px`,
        height: '100%',
        backgroundColor: '#000000',
        borderLeft: '1px solid #00f5ff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        fontFamily: "var(--sc-font-text)"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'space-between' : 'center',
          px: open ? 0.75 : 0.5,
          borderBottom: '1px solid #00f5ff',
          backgroundColor: '#0a0a0a'
        }}
      >
        {open && (
          <Typography variant="subtitle2" component="h2" sx={{ 
            color: '#00f5ff',
            fontFamily: "var(--sc-font-text)",
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase'
          }}>
            INTEL_DATA
          </Typography>
        )}
        <Tooltip title={open ? "Collapse" : "Expand"}>
          <IconButton
            onClick={onToggle}
            size="small"
            sx={{ color: '#ffffff' }}
          >
            <Menu size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content */}
      {open && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <Box sx={{ borderBottom: '1px solid #00f5ff' }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{
                minHeight: '28px',
                '& .MuiTab-root': {
                  color: '#aaaaaa',
                  fontSize: '0.65rem',
                  minHeight: '28px',
                  textTransform: 'uppercase',
                  fontFamily: "var(--sc-font-text)",
                  letterSpacing: '0.05em',
                  py: 0.25,
                  px: 0.75
                },
                '& .MuiTab-root.Mui-selected': {
                  color: '#00f5ff'
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#00f5ff',
                  // '1px', not 1. MUI reads a unitless height between 0 and 1 as a
                  // PERCENTAGE, so `height: 1` was 100% — a full-height block over the
                  // selected tab, covering its own label. Measured at 28px on a 28px tab.
                  height: '1px',
                }
              }}
            >
              <Tab 
                label="SCANS" 
                icon={<Search size={12} />} 
                iconPosition="start"
                sx={{ gap: 0.5 }}
              />
              <Tab 
                label="STATUS" 
                icon={<BarChart3 size={12} />} 
                iconPosition="start"
                sx={{ gap: 0.5 }}
              />
            </Tabs>
          </Box>

          {/* Tab Content */}
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 0 && (
              <>
                <Box sx={{ p: 0.75, display: 'flex', gap: 0.5, borderBottom: '1px solid #333333' }}>
                  <TextField
                    size="small"
                    placeholder="domain.com"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitTarget(); }}
                    fullWidth
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        fontFamily: "var(--sc-font-data)",
                        fontSize: '0.7rem',
                        height: 28,
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: '#00f5ff' }
                      }
                    }}
                  />
                  <Button
                    onClick={submitTarget}
                    disabled={!targetInput.trim() || !canReadPages}
                    size="small"
                    sx={{
                      backgroundColor: '#00f5ff',
                      color: '#000000',
                      fontSize: '0.65rem',
                      minWidth: 'auto',
                      px: 1,
                      '&:hover': { backgroundColor: '#00d4e6' },
                      '&:disabled': { backgroundColor: '#333333', color: '#666666' }
                    }}
                  >
                    SCAN
                  </Button>
                </Box>
                {scanTarget ? (
                  <Box sx={{ flex: 1, overflow: 'hidden' }}>
                    <WebCrawlerResults
                      targetUrl={scanTarget}
                      onNavigate={handleNavigateToUrl}
                      onDeepScan={handleDeepScan}
                    />
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ color: canReadPages ? '#aaaaaa' : 'var(--sc-caution)', fontSize: '0.7rem', p: 1 }}>
                    {canReadPages ? 'Enter a target above to scan.' : (
                      <>Page scans need Starcom Uplink or the Starcom desktop app: a browser tab cannot read another site's pages. <a href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>Get the desktop app</a>.</>
                    )}
                  </Typography>
                )}
              </>
            )}

            {activeTab === 1 && (
              <Box sx={{ p: 2, overflow: 'auto', height: '100%' }}>
                <Typography variant="body2" sx={{
                  color: '#aaaaaa',
                  fontFamily: "var(--sc-font-data)",
                  fontSize: '0.7rem'
                }}>
                  SYSTEM_STATUS_MODULE :: AWAITING_IMPLEMENTATION
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Collapsed View - Just Icons */}
      {!open && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, p: 1 }}>
          <Tooltip title="Scan Results" placement="left">
            <IconButton size="small" sx={{ color: '#00f5ff' }} onClick={() => { setActiveTab(0); onToggle(); }}>
              <Search size={20} />
            </IconButton>
          </Tooltip>
          <Tooltip title="System Status" placement="left">
            <IconButton size="small" sx={{ color: '#00ff88' }} onClick={() => { setActiveTab(1); onToggle(); }}>
              <Activity size={20} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings" placement="left">
            <IconButton size="small" sx={{ color: '#ffffff' }}>
              <Settings size={20} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};

export default NetRunnerRightSideBar;
