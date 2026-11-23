/**
 * NetRunner Left Sidebar - Tools & Navigation
 * 
 * Clean sidebar for tool access and navigation with prominent AI Agent.
 * Ready for real tool integration.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  CircularProgress,
  TextField
} from '@mui/material';
import {
  Brain,
  Activity,
  FileText,
  Wrench,
  GitBranch,
  Play
} from 'lucide-react';

// Import NetRunner PowerTools
import { netRunnerPowerTools } from '../../tools/NetRunnerPowerTools';
import WorkflowPanel from './WorkflowPanel';
import { websiteScanner } from '../../services/WebsiteScanner';

// Import Scripts Engine - RE-ENABLED FOR PHASE 1 TESTING
// Path note: this component resides in components/layout, so engine service is two levels up under scripts/engine
// Using alias for stability in production builds (Vercel)
// Import via root-level aggregator to ensure stable resolution in production (Vercel)
import { NetRunnerScriptsUIService, UIEventData } from '@netrunnerEngine';
import { ScriptDefinition } from '../../scripts/types/ScriptTypes';
import { nativeHost } from '../../../../services/native/nativeHost';
import { useSiteFetchRoute } from '../../../../extension/siteFetcher';
import { DESKTOP_APP_URL } from '../../../../services/native/desktopApp';
import type { ScanResult } from '../../services/WebsiteScanner';

/** The page a script reads, from what the scanner fetched. */
function pageOf(scan: ScanResult) {
  const body = new DOMParser().parseFromString(scan.sourceCode, 'text/html').body;
  return {
    html: scan.sourceCode,
    text: (body?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    headers: (scan.metadata.headers ?? {}) as Record<string, string>,
    url: scan.url,
  };
}

/** What a script found, as counts: "emails 1, domains 2". */
function foundWords(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'done';
  const counts = Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${(v as unknown[]).length}`);
  return counts.length ? counts.join(', ') : 'nothing found';
}

// BACKUP: Mock service code kept as comment for quick rollback if needed
// type UIEventData = { scriptId?: string };
// type ScriptDefinition = { metadata: { id: string; name: string } };
// const NetRunnerScriptsUIService = {
//   getInstance: () => ({
//     getUIState: () => ({ availableScripts: [] as ScriptDefinition[], executingScripts: new Set<string>() }),
//     getDefaultScripts: () => [] as ScriptDefinition[],
//     addEventListener: (_event: string, _handler: (data: UIEventData) => void) => {},
//     removeEventListener: (_event: string, _handler: (data: UIEventData) => void) => {},
//     executeScript: async (_config: object) => ({ success: true, error: null })
//   })
// };

interface NetRunnerLeftSideBarProps {
  open: boolean;
  width: number;
}

const NetRunnerLeftSideBar: React.FC<NetRunnerLeftSideBarProps> = ({
  open,
  width
}) => {
  /**
   * What the local model runtime is actually doing, asked once on mount.
   *
   * Starts as "checking" rather than as a claim in either direction — the
   * answer is not known yet, and rendering ACTIVE or ABSENT before asking would
   * be the same fabrication in a different colour.
   */
  const [inference, setInference] = useState<{ ready: boolean; label: string }>({
    ready: false,
    label: 'Checking…',
  });

  useEffect(() => {
    let cancelled = false;
    const host = nativeHost();
    if (!host) {
      setInference({ ready: false, label: 'Not set up' });
      return;
    }
    void host.inference.status()
      .then((status) => {
        if (cancelled) return;
        setInference(status.available && status.models.length > 0
          // Named, so an operator can tell WHICH reading a derivation came from.
          ? { ready: true, label: (status.models[0] ?? 'Ready').slice(0, 18) }
          : { ready: false, label: status.available ? 'No model downloaded' : 'Not set up' });
      })
      .catch(() => { if (!cancelled) setInference({ ready: false, label: 'Not set up' }); });
    return () => { cancelled = true; };
  }, []);

  // State for managing tab selection and PowerTools
  const [activeTab, setActiveTab] = useState(0);
  const [selectedPowerTools, setSelectedPowerTools] = useState<string[]>([]);
  
  // Scripts Engine state
  const [scriptsService] = useState(() => NetRunnerScriptsUIService.getInstance());
  const [_availableScripts, setAvailableScripts] = useState<ScriptDefinition[]>([]);
  const [executingScripts, setExecutingScripts] = useState<Set<string>>(new Set());
  const [scriptTargetInput, setScriptTargetInput] = useState('');
  // What the last script found, or why it failed. It went only to the console.
  const [scriptOutcome, setScriptOutcome] = useState<{ text: string; ok: boolean } | null>(null);
  // Scripts read a scanned page, which the desktop app or Starcom Uplink can fetch (B9, EX32).
  const canReadPages = useSiteFetchRoute() !== null;
  const [showAllTools, setShowAllTools] = useState(false);

  // Initialize Scripts Engine
  useEffect(() => {
    const updateScriptsState = () => {
      const uiState = scriptsService.getUIState();
      setAvailableScripts(uiState.availableScripts);
      setExecutingScripts(uiState.executingScripts);
    };

    // Initial load
    updateScriptsState();

    // Listen for script execution events
    const handleExecutionStarted = (data: UIEventData) => {
      if (data.scriptId) {
        setExecutingScripts(prev => new Set([...prev, data.scriptId!]));
      }
    };

    const handleExecutionCompleted = (data: UIEventData) => {
      if (data.scriptId) {
        setExecutingScripts(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.scriptId!);
          return newSet;
        });
      }
    };

    scriptsService.addEventListener('execution-started', handleExecutionStarted);
    scriptsService.addEventListener('execution-completed', handleExecutionCompleted);
    scriptsService.addEventListener('execution-failed', handleExecutionCompleted);

    return () => {
      scriptsService.removeEventListener('execution-started', handleExecutionStarted);
      scriptsService.removeEventListener('execution-completed', handleExecutionCompleted);
      scriptsService.removeEventListener('execution-failed', handleExecutionCompleted);
    };
  }, [scriptsService]);

  // Get default scripts for display
  const defaultScripts = scriptsService.getDefaultScripts();
  
  // DEBUG: Log the scripts count
  console.log('[NetRunnerSidebar] Default scripts count:', defaultScripts.length);
  console.log('[NetRunnerSidebar] Default scripts:', defaultScripts.map(s => s.metadata.name));

  // Handle script execution — scripts process scan data, so they need a
  // real scan first. Previously this ran every script against a hardcoded
  // mock target/OSINT payload regardless of what the operative typed in,
  // so results never reflected the actual target.
  const handleExecuteScript = async (scriptId: string, scriptName: string) => {
    const target = scriptTargetInput.trim();
    if (!target) return;

    const targetUrl = target.startsWith('http') ? target : `https://${target}`;
    setScriptOutcome(null);

    try {
      const scanResult = await websiteScanner.scanWebsite(targetUrl);

      const result = await scriptsService.executeScript({
        scriptId,
        targetUrl: scanResult.url,
        osintData: scanResult.osintData,
        page: pageOf(scanResult),
        configuration: {}
      });

      setScriptOutcome(result.success
        ? { ok: true, text: `${scriptName}: ${foundWords(result.data?.data)}` }
        : { ok: false, text: `${scriptName} failed: ${result.error?.message ?? 'no reason given'}` });
    } catch (error) {
      setScriptOutcome({ ok: false, text: `${scriptName} failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  };

  // Calculate AI Agent square size based on sidebar width
  const aiAgentSize = open ? Math.min(width - 32, 200) : 40;

  return (
    <Box
      sx={{
        width: `${width}px`,
        height: '100%',
        backgroundColor: '#000000',
        borderRight: '1px solid #00f5ff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        fontFamily: "var(--sc-font-text)"
      }}
    >
      {/* AI Agent Square */}
      <Box
        sx={{
          p: 0.75,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderBottom: '1px solid #00f5ff',
          backgroundColor: '#0a0a0a'
        }}
      >
        <Box
          sx={{
            width: aiAgentSize,
            height: aiAgentSize,
            backgroundColor: '#000000',
            border: '2px solid #00ff88',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: '#00f5ff',
              backgroundColor: '#0a0a0a'
            }
          }}
        >
          {/* AI Agent Avatar/Icon */}
          <Avatar
            sx={{
              width: open ? 48 : 20,
              height: open ? 48 : 20,
              backgroundColor: 'rgba(0, 255, 136, 0.15)',
              border: '1px solid #00ff88',
              borderRadius: 0,
              mb: open ? 0.5 : 0
            }}
          >
            <Brain size={open ? 24 : 14} color="#00ff88" />
          </Avatar>

          {/* AI Agent Status - Only show when expanded */}
          {open && (
            <>
              <Typography
                variant="caption"
                sx={{
                  color: '#00ff88',
                  fontFamily: "var(--sc-font-text)",
                  fontSize: '0.6rem',
                  letterSpacing: '0.05em',
                  textAlign: 'center',
                  mb: 0.25
                }}
              >
                AI assistant
              </Typography>

              {/*
                Reported, not asserted.

                This read ACTIVE in green as a hardcoded literal, beside the
                label AI_AGENT, in an application containing no model call of
                any kind. A UI that claims a capability it does not have is the
                same failure this system's whole doctrine rejects: self-report
                grants nothing, and weight comes from method rather than
                assertion. It should not be truer of published claims than of
                the interface making them.

                Now it asks the host whether a local runtime actually answered
                and names the model, or says plainly that none did.
              */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Activity size={10} color={inference.ready ? '#00ff88' : '#666666'} />
                <Typography
                  variant="caption"
                  sx={{
                    color: inference.ready ? '#00ff88' : '#888888',
                    fontFamily: "var(--sc-font-data)",
                    fontSize: '0.6rem'
                  }}
                >
                  {inference.label}
                </Typography>
              </Box>

              {/* Status Indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 12,
                  height: 12,
                  backgroundColor: inference.ready ? '#00ff88' : '#555555',
                  borderRadius: '50%',
                  boxShadow: inference.ready ? '0 0 10px rgba(0, 255, 136, 0.8)' : 'none',
                  '@keyframes pulse': {
                    '0%': {
                      opacity: 1,
                      transform: 'scale(1)'
                    },
                    '50%': {
                      opacity: 0.7,
                      transform: 'scale(1.1)'
                    },
                    '100%': {
                      opacity: 1,
                      transform: 'scale(1)'
                    }
                  },
                  animation: inference.ready ? 'pulse 2s infinite' : 'none'
                }}
              />
            </>
          )}

          {/* Collapsed view indicator */}
          {!open && (
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                backgroundColor: inference.ready ? '#00ff88' : '#555555',
                borderRadius: '50%',
                boxShadow: inference.ready ? '0 0 8px rgba(0, 255, 136, 0.8)' : 'none',
                '@keyframes pulse': {
                  '0%': {
                    opacity: 1,
                    transform: 'scale(1)'
                  },
                  '50%': {
                    opacity: 0.7,
                    transform: 'scale(1.1)'
                  },
                  '100%': {
                    opacity: 1,
                    transform: 'scale(1)'
                  }
                },
                animation: inference.ready ? 'pulse 2s infinite' : 'none'
              }}
            />
          )}
        </Box>
      </Box>      {/* Scripts & PowerTools Section */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Section Header */}
        {open && (
          <Box sx={{ p: 1, borderBottom: '1px solid #00f5ff' }}>
            <Typography
              variant="caption"
              sx={{
                color: '#00f5ff',
                fontFamily: "var(--sc-font-text)",
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                mb: 0.25
              }}
            >
              INTEL_PIPELINE
            </Typography>
          </Box>
        )}

        {/* Tabs */}
        {open && (
          <Box sx={{ borderBottom: '1px solid #333333' }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{
                minHeight: '28px',
                '& .MuiTab-root': {
                  color: '#aaaaaa',
                  fontSize: '0.6rem',
                  minHeight: '28px',
                  textTransform: 'uppercase',
                  fontFamily: "var(--sc-font-text)",
                  letterSpacing: '0.05em',
                  py: 0.25,
                  px: 0.75,
                  minWidth: 'auto'
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
                label="SCRIPTS" 
                icon={<FileText size={10} />} 
                iconPosition="start"
                sx={{ gap: 0.5 }}
              />
              <Tab 
                label="TOOLS" 
                icon={<Wrench size={10} />} 
                iconPosition="start"
                sx={{ gap: 0.5 }}
              />
              <Tab 
                label="FLOWS" 
                icon={<GitBranch size={10} />} 
                iconPosition="start"
                sx={{ gap: 0.5 }}
              />
            </Tabs>
          </Box>
        )}

        {/* Tab Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {/* Scripts Tab */}
          {(!open || activeTab === 0) && (
            <Box sx={{ p: open ? 1 : 0.5, height: '100%' }}>
              {open ? (
                <Box>
                  <Typography variant="caption" sx={{ color: '#aaaaaa', mb: 1, display: 'block' }}>
                    RawData → Intel Processing
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
                    <TextField
                      size="small"
                      placeholder="domain.com"
                      value={scriptTargetInput}
                      onChange={(e) => setScriptTargetInput(e.target.value)}
                      fullWidth
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#ffffff',
                          fontFamily: "var(--sc-font-data)",
                          fontSize: '0.65rem',
                          height: 26,
                          '& fieldset': { borderColor: '#333333' },
                          '&:hover fieldset': { borderColor: '#555555' },
                          '&.Mui-focused fieldset': { borderColor: '#00f5ff' }
                        }
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {/* Default Scripts */}
                    <Box>
                      <Typography variant="caption" sx={{ color: '#00f5ff', fontSize: '0.6rem' }}>
                        DEFAULT SCRIPTS {canReadPages && !scriptTargetInput.trim() && '(enter a target above to run)'}
                      </Typography>
                      {!canReadPages && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'var(--sc-caution)', fontSize: '0.7rem', mb: 0.5 }}>
                          Scripts run on a scanned page, which needs Starcom Uplink or the Starcom desktop app.{' '}
                          <a href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>Get the desktop app</a>.
                        </Typography>
                      )}
                      {defaultScripts.map((script) => {
                        const isExecuting = executingScripts.has(script.metadata.id);
                        const scriptDisplayName = script.metadata.name;
                        const disabled = isExecuting || !scriptTargetInput.trim() || !canReadPages;

                        return (
                          <Box
                            key={script.metadata.id}
                            onClick={() => !disabled && handleExecuteScript(script.metadata.id, scriptDisplayName)}
                            sx={{
                              p: 0.5,
                              backgroundColor: '#0a0a0a',
                              border: '1px solid #333333',
                              borderRadius: 0,
                              color: isExecuting ? '#ffaa00' : disabled ? '#666666' : '#ffffff',
                              fontSize: '0.65rem',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              '&:hover': disabled ? {} : {
                                borderColor: '#00f5ff',
                                backgroundColor: 'rgba(0, 245, 255, 0.1)'
                              }
                            }}
                          >
                            {isExecuting ? (
                              <CircularProgress size={10} sx={{ color: '#ffaa00' }} />
                            ) : (
                              <Play size={10} />
                            )}
                            {scriptDisplayName}
                            {isExecuting && (
                              <Typography variant="caption" sx={{ ml: 'auto', fontSize: '0.5rem', color: '#ffaa00' }}>
                                RUNNING
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                      
                      {scriptOutcome && (
                        <Typography
                          variant="caption"
                          role="status"
                          sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem', color: scriptOutcome.ok ? 'var(--sc-text-body)' : 'var(--sc-danger)' }}
                        >
                          {scriptOutcome.text}
                        </Typography>
                      )}

                      {defaultScripts.length === 0 && (
                        <Typography variant="caption" sx={{ color: '#666666', fontSize: '0.6rem', fontStyle: 'italic' }}>
                          No scripts available
                        </Typography>
                      )}
                    </Box>
                    
                    {/* Custom Scripts */}
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ color: '#00ff88', fontSize: '0.6rem' }}>
                        CUSTOM SCRIPTS
                      </Typography>
                      <Box
                        sx={{
                          p: 0.5,
                          backgroundColor: '#0a0a0a',
                          border: '1px dashed #333333',
                          borderRadius: 0,
                          color: '#aaaaaa',
                          fontSize: '0.65rem',
                          cursor: 'pointer',
                          textAlign: 'center',
                          '&:hover': {
                            borderColor: '#00ff88',
                            backgroundColor: 'rgba(0, 255, 136, 0.1)'
                          }
                        }}
                      >
                        + Add Custom Script
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  <Tooltip title="Scripts" placement="right">
                    <IconButton
                      sx={{
                        width: 28,
                        height: 28,
                        backgroundColor: activeTab === 0 ? 'rgba(0, 245, 255, 0.15)' : '#0a0a0a',
                        border: '1px solid',
                        borderColor: activeTab === 0 ? '#00f5ff' : '#333333',
                        borderRadius: 0,
                        color: activeTab === 0 ? '#00f5ff' : '#ffffff'
                      }}
                      onClick={() => setActiveTab(0)}
                    >
                      <FileText size={14} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          )}

          {/* Tools Tab */}
          {open && activeTab === 1 && (
            <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Compact PowerTools List */}
              <Box sx={{ p: 1, borderBottom: '1px solid #333333' }}>
                <Typography variant="caption" sx={{ color: '#aaaaaa', fontSize: '0.6rem' }}>
                  OSINT POWERTOOLS
                </Typography>
              </Box>
              
              <Box sx={{ flex: 1, overflow: 'auto', p: 0.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {netRunnerPowerTools.slice(0, showAllTools ? undefined : 8).map((tool) => (
                    <Box
                      key={tool.id}
                      onClick={() => {
                        setSelectedPowerTools(prev => 
                          prev.includes(tool.id) 
                            ? prev.filter(id => id !== tool.id)
                            : [...prev, tool.id]
                        );
                      }}
                      sx={{
                        p: 0.75,
                        backgroundColor: selectedPowerTools.includes(tool.id) ? 'rgba(0, 245, 255, 0.15)' : '#0a0a0a',
                        border: '1px solid',
                        borderColor: selectedPowerTools.includes(tool.id) ? '#00f5ff' : '#333333',
                        borderRadius: 0,
                        color: selectedPowerTools.includes(tool.id) ? '#00f5ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.25,
                        opacity: tool.implemented ? 1 : 0.6,
                        '&:hover': {
                          borderColor: '#00f5ff',
                          backgroundColor: 'rgba(0, 245, 255, 0.1)'
                        }
                      }}
                      title={tool.implemented ? undefined : 'No live adapter yet — selecting this tool will report "not available" when a mission runs'}
                    >
                      <Typography variant="caption" sx={{
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        color: 'inherit',
                        fontFamily: "var(--sc-font-text)"
                      }}>
                        {tool.name}
                      </Typography>
                      <Typography variant="caption" sx={{
                        fontSize: '0.55rem',
                        color: '#aaaaaa',
                        lineHeight: 1.2
                      }}>
                        {tool.description.slice(0, 60)}...
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25 }}>
                        <Typography variant="caption" sx={{
                          fontSize: '0.5rem',
                          color: tool.premium ? '#ffaa00' : '#00ff88',
                          textTransform: 'uppercase'
                        }}>
                          {tool.premium ? 'Premium' : 'Free'}
                        </Typography>
                        <Typography variant="caption" sx={{
                          fontSize: '0.5rem',
                          color: '#666666',
                          textTransform: 'uppercase'
                        }}>
                          {tool.category}
                        </Typography>
                        {!tool.implemented && (
                          <Typography variant="caption" sx={{
                            fontSize: '0.5rem',
                            color: '#ff6666',
                            textTransform: 'uppercase'
                          }}>
                            Coming Soon
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                  
                  {/* Show More Button */}
                  {netRunnerPowerTools.length > 8 && (
                    <Box
                      onClick={() => setShowAllTools(prev => !prev)}
                      sx={{
                        p: 0.5,
                        backgroundColor: '#0a0a0a',
                        border: '1px dashed #333333',
                        borderRadius: 0,
                        color: '#aaaaaa',
                        fontSize: '0.65rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        '&:hover': {
                          borderColor: '#00f5ff',
                          backgroundColor: 'rgba(0, 245, 255, 0.1)'
                        }
                      }}
                    >
                      {showAllTools ? '- Show Fewer Tools' : `+ Show More Tools (${netRunnerPowerTools.length - 8} more)`}
                    </Box>
                  )}
                </Box>
              </Box>
              
              {/* Selected Tools Summary */}
              {selectedPowerTools.length > 0 && (
                <Box sx={{ p: 0.75, borderTop: '1px solid #00f5ff', backgroundColor: '#0a0a0a' }}>
                  <Typography variant="caption" sx={{ 
                    color: '#00f5ff', 
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 0.5
                  }}>
                    SELECTED: {selectedPowerTools.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap' }}>
                    {selectedPowerTools.slice(0, 3).map((toolId) => {
                      const tool = netRunnerPowerTools.find(t => t.id === toolId);
                      return tool ? (
                        <Typography key={toolId} variant="caption" sx={{ 
                          fontSize: '0.55rem', 
                          color: '#ffffff',
                          backgroundColor: 'rgba(0, 245, 255, 0.2)',
                          px: 0.5,
                          py: 0.25,
                          borderRadius: 0
                        }}>
                          {tool.name.split(' ')[0]}
                        </Typography>
                      ) : null;
                    })}
                    {selectedPowerTools.length > 3 && (
                      <Typography variant="caption" sx={{ 
                        fontSize: '0.55rem', 
                        color: '#aaaaaa'
                      }}>
                        +{selectedPowerTools.length - 3}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Workflows Tab */}
          {open && activeTab === 2 && <WorkflowPanel />}

          {/* Collapsed Tools Icons */}
          {!open && (
            <Box sx={{ p: 0.25 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Tooltip title="Tools" placement="right">
                  <IconButton
                    sx={{
                      width: 28,
                      height: 28,
                      backgroundColor: activeTab === 1 ? 'rgba(0, 245, 255, 0.15)' : '#0a0a0a',
                      border: '1px solid',
                      borderColor: activeTab === 1 ? '#00f5ff' : '#333333',
                      borderRadius: 0,
                      color: activeTab === 1 ? '#00f5ff' : '#ffffff'
                    }}
                    onClick={() => setActiveTab(1)}
                  >
                    <Wrench size={14} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Workflows" placement="right">
                  <IconButton
                    sx={{
                      width: 28,
                      height: 28,
                      backgroundColor: activeTab === 2 ? 'rgba(0, 245, 255, 0.15)' : '#0a0a0a',
                      border: '1px solid',
                      borderColor: activeTab === 2 ? '#00f5ff' : '#333333',
                      borderRadius: 0,
                      color: activeTab === 2 ? '#00f5ff' : '#ffffff'
                    }}
                    onClick={() => setActiveTab(2)}
                  >
                    <GitBranch size={14} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default NetRunnerLeftSideBar;
