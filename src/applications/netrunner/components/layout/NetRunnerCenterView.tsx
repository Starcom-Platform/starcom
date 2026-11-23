/**
 * NetRunner Center View - Main Work Area
 * 
 * Clean main workspace for NetRunner operations.
 * Ready for real OSINT tool implementation.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Tabs,
  Tab,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Search,
  Target,
  Shield,
  Activity,
  Code,
  Globe,
  ChevronDown
} from 'lucide-react';
import { WebsiteScannerService, type ScanResult, type ScanStep } from '../../services/WebsiteScanner';
import ScannerPanel from '../scanner/ScannerPanel';
import BrowsePane from '../browse/BrowsePane';
import { useSiteFetchRoute } from '../../../../extension/siteFetcher';
import { DESKTOP_APP_URL } from '../../../../services/native/desktopApp';

interface NetRunnerCenterViewProps {
  width: string;
  height: string;
  /** Search subject handed over from another app — see the useState below. */
  initialTarget?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`netrunner-tabpanel-${index}`}
      aria-labelledby={`netrunner-tab-${index}`}
      {...other}
      style={{ height: '100%' }}
    >
      {value === index && (
        <Box sx={{ p: 0.75, height: '100%' }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const NetRunnerCenterView: React.FC<NetRunnerCenterViewProps> = ({
  width,
  height,
  initialTarget
}) => {
  const [activeTab, setActiveTab] = useState(0);
  // Seeded, not forced: the operator can edit or clear it immediately. This
  // arrives from IntelAnalyzer's single-source-claims panel ("find a second
  // source for X"), so the subject is a starting point for their search, not
  // a setting. Deliberately not auto-scanning either — arriving on a screen
  // that has already fired network requests at a target you did not confirm
  // is not a handoff, it is a surprise.
  const [target, setTarget] = useState(initialTarget ?? '');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanStep, setScanStep] = useState<ScanStep | null>(null);
  const [scanStatus, setScanStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const websiteScanner = new WebsiteScannerService();
  // What can read another site's page here: the desktop app, Starcom Uplink, or nothing (EX32).
  const readRoute = useSiteFetchRoute();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleScan = async () => {
    if (!target.trim()) return;
    
    setIsScanning(true);
    setError(null);
    setScanResult(null);
    setScanStep(null);
    setScanStatus('Starting');

    try {
      const result = await websiteScanner.scanWebsite(
        target,
        (step) => {
          setScanStep(step);
          setScanStatus(step.label);
        }
      );
      
      setScanResult(result);
      setScanStatus('Scan completed successfully');
    } catch (err) {
      console.error('Scan failed:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setScanStatus('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Box
      sx={{
        width,
        height,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "var(--sc-font-text)"
      }}
    >
      {/* Tab Headers */}
      <Box
        sx={{
          borderBottom: '1px solid #00f5ff',
          backgroundColor: '#0a0a0a'
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: '32px',
            '& .MuiTab-root': {
              color: '#aaaaaa',
              fontSize: '0.7rem',
              minHeight: '32px',
              textTransform: 'uppercase',
              fontFamily: "var(--sc-font-text)",
              letterSpacing: '0.05em',
              py: 0.5,
              px: 1,
              '&.Mui-selected': {
                color: '#00f5ff'
              }
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
          <Tab icon={<Search size={14} />} label="OSINT" iconPosition="start" sx={{ gap: 0.5 }} />
          <Tab icon={<Target size={14} />} label="SCANNER" iconPosition="start" sx={{ gap: 0.5 }} />
          <Tab icon={<Shield size={14} />} label="BROWSE" iconPosition="start" sx={{ gap: 0.5 }} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* OSINT Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
            <Typography variant="h5" component="h2" sx={{ 
              color: '#00f5ff',
              fontFamily: "var(--sc-font-text)",
              fontSize: '1rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              mb: 0.5
            }}>
              OSINT_SCANNER
            </Typography>
            
            <Card sx={{ 
              backgroundColor: '#0a0a0a', 
              border: '1px solid #00f5ff',
              borderRadius: 0
            }}>
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
                  <TextField
                    label="TARGET"
                    placeholder="domain.com | 192.168.1.1 | identifier"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    variant="outlined"
                    fullWidth
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#ffffff',
                        fontFamily: "var(--sc-font-data)",
                        fontSize: '0.75rem',
                        borderRadius: 0,
                        '& fieldset': { borderColor: '#333333' },
                        '&:hover fieldset': { borderColor: '#555555' },
                        '&.Mui-focused fieldset': { borderColor: '#00f5ff' }
                      },
                      '& .MuiInputLabel-root': { 
                        color: '#aaaaaa',
                        fontFamily: "var(--sc-font-text)",
                        fontSize: '0.7rem',
                        letterSpacing: '0.05em'
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleScan}
                    disabled={!target.trim() || isScanning || !readRoute}
                    size="small"
                    sx={{
                      backgroundColor: '#00f5ff',
                      color: '#000000',
                      fontFamily: "var(--sc-font-text)",
                      fontSize: '0.7rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      borderRadius: 0,
                      px: 1.5,
                      py: 0.75,
                      '&:hover': { backgroundColor: '#00d4e6' },
                      '&:disabled': { backgroundColor: '#333333' }
                    }}
                  >
                    {isScanning ? 'SCANNING...' : 'SCAN'}
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* Scanning Progress */}
            {isScanning && (
              <Card sx={{ 
                backgroundColor: '#0a0a0a', 
                border: '1px solid #00f5ff',
                borderRadius: 0,
                mb: 1
              }}>
                <CardContent sx={{ p: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Activity size={16} style={{ color: '#00f5ff' }} />
                    <Typography sx={{ 
                      color: '#00f5ff',
                      fontFamily: "var(--sc-font-text)",
                      fontSize: '0.75rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase'
                    }}>
                      {scanStep ? `Step ${scanStep.step} of ${scanStep.of}` : 'Starting'}
                    </Typography>
                  </Box>
                  {/* Indeterminate: how long the fetch takes is not known. */}
                  <LinearProgress 
                    variant="indeterminate" 
                    sx={{
                      height: 4,
                      borderRadius: 0,
                      backgroundColor: '#333333',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: '#00f5ff'
                      }
                    }}
                  />
                  <Typography sx={{ 
                    color: '#aaaaaa',
                    fontFamily: "var(--sc-font-data)",
                    fontSize: '0.65rem',
                    mt: 0.5
                  }}>
                    {scanStatus}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  backgroundColor: '#1a0000', 
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                  borderRadius: 0,
                  fontFamily: "var(--sc-font-text)",
                  fontSize: '0.7rem',
                  mb: 1,
                  '& .MuiAlert-icon': { color: '#ff4444' }
                }}
              >
                SCAN_ERROR: {error}
              </Alert>
            )}

            {/* Results Display Area */}
            <Box sx={{ 
              flex: 1, 
              backgroundColor: '#0a0a0a', 
              border: '1px solid #333333', 
              borderRadius: 0,
              p: 0.75,
              overflow: 'auto'
            }}>
              {scanResult ? (
                <Box>
                  {/* Results Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Globe size={16} style={{ color: '#00f5ff' }} />
                    <Typography sx={{ 
                      color: '#00f5ff',
                      fontFamily: "var(--sc-font-text)",
                      fontSize: '0.75rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase'
                    }}>
                      Scan Results: {scanResult.url}
                    </Typography>
                  </Box>

                  {/* Source Code Section */}
                  <Accordion 
                    defaultExpanded
                    sx={{
                      backgroundColor: 'rgba(0, 245, 255, 0.05)',
                      border: '1px solid rgba(0, 245, 255, 0.2)',
                      borderRadius: 0,
                      mb: 1,
                      '&:before': { display: 'none' }
                    }}
                  >
                    <AccordionSummary 
                      expandIcon={<ChevronDown size={16} style={{ color: '#00f5ff' }} />}
                      sx={{ 
                        backgroundColor: 'rgba(0, 245, 255, 0.1)',
                        minHeight: 'auto',
                        '& .MuiAccordionSummary-content': { 
                          margin: '8px 0',
                          alignItems: 'center'
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Code size={14} style={{ color: '#00f5ff' }} />
                        <Typography sx={{ 
                          color: '#ffffff',
                          fontFamily: "var(--sc-font-text)",
                          fontSize: '0.7rem',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase'
                        }}>
                          Website Source Code ({(scanResult.sourceCode.length / 1024).toFixed(2)} KB)
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1 }}>
                      <Box sx={{
                        backgroundColor: '#000000',
                        border: '1px solid #333333',
                        borderRadius: 0,
                        p: 1,
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        <pre style={{
                          color: '#00ff88',
                          fontFamily: "var(--sc-font-data)",
                          fontSize: '0.65rem',
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all'
                        }}>
                          {scanResult.sourceCode}
                        </pre>
                      </Box>
                    </AccordionDetails>
                  </Accordion>

                  {/* Website Metadata */}
                  <Accordion 
                    sx={{
                      backgroundColor: 'rgba(0, 245, 255, 0.05)',
                      border: '1px solid rgba(0, 245, 255, 0.2)',
                      borderRadius: 0,
                      mb: 1,
                      '&:before': { display: 'none' }
                    }}
                  >
                    <AccordionSummary 
                      expandIcon={<ChevronDown size={16} style={{ color: '#00f5ff' }} />}
                      sx={{ 
                        backgroundColor: 'rgba(0, 245, 255, 0.1)',
                        minHeight: 'auto',
                        '& .MuiAccordionSummary-content': { 
                          margin: '8px 0',
                          alignItems: 'center'
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Shield size={14} style={{ color: '#00f5ff' }} />
                        <Typography sx={{ 
                          color: '#ffffff',
                          fontFamily: "var(--sc-font-text)",
                          fontSize: '0.7rem',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase'
                        }}>
                          Website Metadata
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 1 }}>
                      <Box sx={{ 
                        color: '#aaaaaa',
                        fontFamily: "var(--sc-font-data)",
                        fontSize: '0.65rem'
                      }}>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          <strong style={{ color: '#00f5ff' }}>Title:</strong> {scanResult.title}
                        </Typography>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          <strong style={{ color: '#00f5ff' }}>Status Code:</strong> {scanResult.metadata.statusCode}
                        </Typography>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          <strong style={{ color: '#00f5ff' }}>Content Type:</strong> {scanResult.metadata.contentType}
                        </Typography>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          <strong style={{ color: '#00f5ff' }}>Response Time:</strong> {scanResult.metadata.responseTime}ms
                        </Typography>
                        <Typography component="div" sx={{ mb: 0.5 }}>
                          <strong style={{ color: '#00f5ff' }}>Content Size:</strong> {scanResult.metadata.size}
                        </Typography>
                        {scanResult.osintData.technologies.length > 0 && (
                          <Typography component="div" sx={{ mb: 0.5 }}>
                            <strong style={{ color: '#00f5ff' }}>Technologies:</strong> {scanResult.osintData.technologies.map(tech => tech.name).join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{
                    color: '#aaaaaa',
                    fontFamily: "var(--sc-font-data)",
                    fontSize: '0.7rem'
                  }}>
                    RESULTS_DISPLAY_AREA :: Enter a URL and click SCAN to begin
                  </Typography>

                  {/*
                    Said before the click (plan item 7, block C; decision B9).
                    A browser tried three public CORS proxies for 31 seconds and
                    then said they had failed. On 2026-10-01 none answered, and
                    each was told what was being investigated. So the scan is
                    not offered in a browser, and the path that works there is.
                  */}
                  {readRoute === 'uplink' && (
                    <Typography sx={{ mt: 2, color: 'var(--sc-text-secondary)', fontFamily: "var(--sc-font-text)", fontSize: '0.75rem', maxWidth: 720 }}>
                      Page scans read through Starcom Uplink. It asks you once for each site, and logs every read.
                    </Typography>
                  )}
                  {!readRoute && (
                    <Box sx={{ mt: 2, p: 1, border: '1px solid #333', maxWidth: 720 }}>
                      <Typography sx={{ color: 'var(--sc-caution)', fontFamily: "var(--sc-font-text)", fontSize: '0.75rem', mb: 0.5 }}>
                        Page scans need Starcom Uplink or the Starcom desktop app: a browser tab cannot read another site's pages.{' '}
                        <a href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>Get the desktop app</a>.
                      </Typography>
                      <Typography sx={{ color: '#888', fontFamily: "var(--sc-font-data)", fontSize: '0.65rem' }}>
                        Certificate logs, DNS and registration work here, with no key.{' '}
                        <Box
                          component="span"
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveTab(1)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab(1); }}
                          sx={{ color: '#00f5ff', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Use passive recon instead →
                        </Box>
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </TabPanel>

        {/* Scanner Tab */}
        <TabPanel value={activeTab} index={1}>
          <ScannerPanel />
        </TabPanel>

        {/*
          Browse. NetRunner's name, made literal — a target is RUN rather than
          only fetched, in its own session, with every subresource observed.

          This replaces the INTEL placeholder rather than sitting beside it: that
          tab described intel correlation, which IntelAnalyzer already performs
          as a registered application with real views. The ANALYSIS placeholder
          went the same way for the same reason. A second, emptier version of an
          existing capability is not a feature.
        */}
        <TabPanel value={activeTab} index={2}>
          <BrowsePane />
        </TabPanel>
      </Box>
    </Box>
  );
};

export default NetRunnerCenterView;
