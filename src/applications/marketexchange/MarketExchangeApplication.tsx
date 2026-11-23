import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Tabs,
  Tab,
  Alert,
  ThemeProvider,
  createTheme
} from '@mui/material';
import { starcomTheme } from '../../styles/starcomTheme';
import { ClipboardList, Landmark, Stamp } from 'lucide-react';
import { packageComposer } from '../../services/exchange/PackageComposer';
import type { PublishResponse } from '../../services/exchange/PublishAdapter';
import { reviewExchangePackage } from '../../services/publishing/exchange';
import { emitComposeEvent } from '../../services/exchange/telemetry';
import { intelReportService } from '../../services/intel/IntelReportService';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { composeInputFromDraft } from '../../services/exchange/adapters/reportToCompose';
import ComposerWizard from './components/ComposerWizard';
import OpportunityBoard from './components/OpportunityBoard';
import GrantsBoard from './components/GrantsBoard';
import { useReceivedPackages } from '../../services/intel/useReceivedPackages';
import { grantNoticesFrom } from '../../services/exchange/grantNotices';
import type { ApplicationContext } from '../../components/Router/EnhancedApplicationRouter';
import { IntelWorkspaceProvider, useIntelWorkspace } from '../../services/intel/IntelWorkspaceContext';
import { createLogger } from '@utils/logger';
import UtcTime from '../../components/Shared/UtcTime';
import KeyName from '../../components/Identity/KeyName';
import { exchangeOutcome } from './exchangeOutcome';
import { pickDraft, NO_DRAFT } from './pickDraft';
import { SHELL_PADDING } from '../../styles/shell';
import DistributionChip from '../../components/Shared/DistributionChip';
const log = createLogger({ prefix: 'MarketExchangeApplication' });

// Your drafts, newest first, from the unified provider. One is chosen to publish:
// the one picked here, else the newest (pickDraft); a report that is not a
// draft never is (critique audit of 2026-10-01).
const DraftReportsPanel: React.FC<{ chosenId: string | null; onChoose: (id: string) => void }> = ({ chosenId, onChoose }) => {
  const { reports } = useIntelWorkspace();
  const drafts = reports.filter(r => r.status === 'DRAFT')
    .sort((a,b)=> b.updatedAt.getTime()-a.updatedAt.getTime())
    .slice(0,5);
  const picked = pickDraft(reports, chosenId);
  return (
    <Paper sx={{ p:2, mb:2 }} data-testid="marketexchange-drafts-live">
      <Typography variant="subtitle2" sx={{ mb:1, fontWeight:'bold' }}>Your drafts</Typography>
      {drafts.length === 0 && <Typography variant="caption" color="text.secondary">{NO_DRAFT}</Typography>}
      {picked && (
        <Typography variant="body2" sx={{ mb: 1 }} data-testid="marketexchange-publishes">
          Publishes: {picked.title}
        </Typography>
      )}
      {drafts.map(d => (
        <Box key={d.id} sx={{ display:'flex', justifyContent:'space-between', alignItems: 'center', mb:0.5, gap: 1 }}>
          <Button
            size="small"
            variant={picked?.id === d.id ? 'contained' : 'text'}
            aria-pressed={picked?.id === d.id}
            onClick={() => onChoose(d.id)}
            sx={{ flex: 1, justifyContent: 'flex-start', textTransform: 'none', minWidth: 0 }}
          >
            <Typography component="span" variant="body2" sx={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.title}</Typography>
          </Button>
          <Chip size="small" label={d.priority || 'ROUTINE'} />
        </Box>
      ))}
    </Paper>
  );
};

// Cyberpunk Market Theme for MarketExchange
const cyberpunkMarketTheme = createTheme(starcomTheme, {
  // The root theme's palette, type and z-index scale (plan items 8.1 and 8.2);
  // this adds only the component styles, until the restyle (8.5).
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          background: 'rgba(0, 20, 10, 0.95)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
          borderRadius: '0',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 0 20px rgba(0, 255, 136, 0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '0',
          textTransform: 'uppercase',
          fontFamily: "var(--sc-font-text)",
          fontWeight: 600,
          letterSpacing: '0.5px',
        },
        contained: {
          background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
          color: '#000',
          border: '1px solid #00ff88',
          boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #00cc66 0%, #009944 100%)',
            boxShadow: '0 0 25px rgba(0, 255, 136, 0.5)',
          },
        },
        outlined: {
          color: '#00ff88',
          border: '1px solid rgba(0, 255, 136, 0.5)',
          '&:hover': {
            border: '1px solid #00ff88',
            background: 'rgba(0, 255, 136, 0.1)',
            boxShadow: '0 0 15px rgba(0, 255, 136, 0.2)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '0',
          fontFamily: "var(--sc-font-text)",
          fontSize: '0.75rem',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'rgba(0, 25, 15, 0.9)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
          borderRadius: '0',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: 'rgba(0, 255, 136, 0.4)',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.2)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            borderBottom: '1px solid rgba(0, 255, 136, 0.1)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily: "var(--sc-font-text)",
          },
          '& .MuiTableHead-root .MuiTableCell-root': {
            backgroundColor: 'rgba(0, 255, 136, 0.1)',
            color: '#00ff88',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(0, 255, 136, 0.2)',
        },
        indicator: {
          backgroundColor: '#00ff88',
          height: '3px',
          boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: 'rgba(255, 255, 255, 0.7)',
          fontFamily: "var(--sc-font-text)",
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          '&.Mui-selected': {
            color: '#00ff88',
            textShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: 'rgba(0, 20, 10, 0.98)',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          borderRadius: '0',
          boxShadow: '0 0 30px rgba(0, 255, 136, 0.2)',
        },
      },
    },
  },
});

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
      id={`market-tabpanel-${index}`}
      aria-labelledby={`market-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: SHELL_PADDING }}>{children}</Box>}
    </div>
  );
}

/** The Grants tab's board, with the grant notices received; mounted only while the tab is open. */
const GrantsTab: React.FC = () => {
  const received = useReceivedPackages();
  const notices = useMemo(() => grantNoticesFrom(received.accepted), [received.accepted]);
  return <GrantsBoard notices={notices} />;
};

const TAB = { desk: 0, grants: 1, publish: 2 } as const;

/**
 * Reads one thing another application hands over: `openTab: 'grants'`, to open on the Grants tab
 * (Missions' link to its grant notices, D-MF, MF5). Anything else in the context does nothing.
 */
const MarketExchangeApplication: React.FC<ApplicationContext> = (context) => {
  // State management
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<number>(context?.openTab === 'grants' ? TAB.grants : TAB.desk);
  // Handed over while already open, too.
  useEffect(() => { if (context?.openTab === 'grants') setActiveTab(TAB.grants); }, [context?.openTab]);
  // Real published intel reports (no mock data — see Phase 3 de-fake pass). Markets/Portfolio
  // tabs were removed entirely: no price feed or ownership ledger exists anywhere in the app,
  // so there was nothing honest to wire them to.
  const [intelListings, setIntelListings] = useState<IntelReportUI[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [composeBusy, setComposeBusy] = useState(false);
  // The draft chosen in "Your drafts"; null means the newest (pickDraft).
  const [chosenDraftId, setChosenDraftId] = useState<string | null>(null);
  const [composeResult, setComposeResult] = useState<PublishResponse | null>(null);
  /*
   * Publishing can fail, and the person who pressed the button is entitled to
   * know. The catch below logged to the console and emitted telemetry, so a
   * failed publish looked exactly like a successful one from the chair: the
   * spinner stopped and nothing else happened.
   */
  const [composeError, setComposeError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Load real intel reports and keep them live via intelReportService's change subscription.
  useEffect(() => {
    const applyReports = (reports: IntelReportUI[]) => {
      setIntelListings(reports.filter(r => r.status !== 'DRAFT'));
      setDraftCount(reports.filter(r => r.status === 'DRAFT').length);
    };

    let unsubscribe: (() => void) | undefined;

    const loadMarketData = async () => {
      setLoading(true);
      try {
        const reports = await intelReportService.listReports();
        applyReports(reports);
        unsubscribe = intelReportService.onChange(applyReports);
      } catch (error) {
        log.error('Error loading market data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMarketData();
    return () => unsubscribe?.();
  }, []);

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return (
      <ThemeProvider theme={cyberpunkMarketTheme}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>Reading the desk…</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  const appInner = (
    <ThemeProvider theme={cyberpunkMarketTheme}>
      <Box sx={{ 
        p: SHELL_PADDING, 
        // The shell's area, not the window's: at 100vh the list's last 66 px
        // could never be scrolled into view (critique audit, section 9).
        height: '100%', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(0, 15, 10, 0.95) 0%, rgba(0, 25, 15, 0.98) 100%)',
        backdropFilter: 'blur(10px)',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(45deg, transparent 49%, rgba(0, 255, 136, 0.02) 50%, transparent 51%)',
          pointerEvents: 'none',
          zIndex: 0,
        }
      }}>
  {/* Header */}
  <Box sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
        {/*
          * One line, where two cards stood: "Active Listings" was the marketplace's word for
          * the reports held, and the cards took a third of the height (critique audit, section 9).
          */}
        <Typography variant="body2" color="text.secondary" data-testid="marketexchange-held" sx={{ mb: 1 }}>
          {`${intelListings.length} published ${intelListings.length === 1 ? 'report' : 'reports'} held · ${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} not yet published`}
        </Typography>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {/*
            * Three tabs: two where there were five, and Grants (D-MF, MF5).
            *
            * Markets, Portfolio, Trading and Analytics were empty placeholders
            * on a frozen NFT/fin-tech model — no price feed, no holdings
            * ledger, and Trading pointing readers at a Markets tab that could
            * not take an order. They advertised a trading floor this network
            * decided not to build when it made the no-amount rule binding.
            */}
          <Tab label="Lead desk" icon={<ClipboardList size={20} />} />
          {/* Grants are not missions, and not leads to work: their own tab (D-MF, MF5). */}
          <Tab label="Grants" icon={<Landmark size={20} />} data-testid="tab-grants" />
          {/* "Intelligence Marketplace" until plan item 4.5: only the name came from
              the retired marketplace. It publishes a report, through the review. */}
          <Tab label="Publish a report" icon={<Stamp size={20} />} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ 
        // What is left below the header and tabs, however tall they are.
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        position: 'relative',
        zIndex: 1,
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '0',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'linear-gradient(180deg, #00ff88 0%, #00cc66 100%)',
          borderRadius: '0',
          boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'linear-gradient(180deg, #00cc66 0%, #009944 100%)',
        },
      }}>
        {/* Markets Tab — no price feed exists anywhere in the app; honest placeholder */}
        <TabPanel value={activeTab} index={TAB.desk}>
          <OpportunityBoard reports={intelListings} />
        </TabPanel>

        <TabPanel value={activeTab} index={TAB.grants}>
          <GrantsTab />
        </TabPanel>

        {/* Publish a report */}
        <TabPanel value={activeTab} index={TAB.publish}>
          {composeError && (
            <Alert severity="error" sx={{ mb: 2 }} data-testid="compose-error">
              Nothing was published — {composeError}
            </Alert>
          )}
          {composeResult && (
            <Alert severity={exchangeOutcome(composeResult).severity} sx={{ mb: 2 }} data-testid="compose-outcome">
              {exchangeOutcome(composeResult).text}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button
              variant="contained"
              disabled={composeBusy || draftCount === 0}
        onClick={async () => {
                try {
                  setComposeBusy(true);
                  setComposeResult(null);
                  setComposeError(null);
          const startedAt = performance.now();
          emitComposeEvent({ type: 'compose_started', timestamp: new Date().toISOString() });
                  // The draft chosen under "Your drafts", else the newest; never a report
                  // that is not a draft. This read `?draft=`, which nothing sets any more.
                  const report = pickDraft(await intelReportService.listReports(), chosenDraftId);
                  if (!report) throw new Error(NO_DRAFT);
                  const composeInput = composeInputFromDraft(report);
                  // Align license/visibility choices if needed
                  composeInput.license = 'CC0';
                  const { manifest, blob, cites } = await packageComposer.composeZip(composeInput);
          emitComposeEvent({ type: 'compose_validated', timestamp: new Date().toISOString(), manifestId: manifest.id, sizes: { assets: manifest.assets.length, blobBytes: blob.size } });
          // Through the publish review: the package, its licence and both
          // destinations are shown before anything is uploaded (plan item 0.1).
          const res = await reviewExchangePackage(manifest, cites);
                  if (!res) return;
                  setComposeResult(res);
          emitComposeEvent({ type: 'compose_published', timestamp: new Date().toISOString(), manifestId: manifest.id, durationMs: performance.now() - startedAt });
                } catch (e) {
                  log.error('Compose failed', e);
                  setComposeError(e instanceof Error ? e.message : String(e));
          emitComposeEvent({ type: 'compose_failed', timestamp: new Date().toISOString(), error: String(e?.message || e) });
                } finally {
                  setComposeBusy(false);
                }
              }}
            >
              {composeBusy ? 'Composing…' : 'Compose & Publish Current Draft'}
            </Button>
            <Button variant="outlined" onClick={() => setWizardOpen(true)}>Open Composer Wizard</Button>
          </Box>
          <ComposerWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onPublished={setComposeResult} />
          {/* Reactive draft reports sourced from IntelWorkspaceProvider (Phase 4 live subscription) */}
          <DraftReportsPanel chosenId={chosenDraftId} onChoose={setChosenDraftId} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {intelListings.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No published intelligence reports yet.
              </Typography>
            )}
            {intelListings.map((listing) => (
              <Box key={listing.id} sx={{ flex: '1 1 400px', minWidth: 400 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Typography variant="h6" fontWeight="bold">
                        {listing.title}
                      </Typography>
                      {/* Was listing.classification, which rendered
                          `undefined` for an unmarked listing. The one chip
                          now (BD18), Undecided included: the Exchange takes
                          only a Public report. */}
                      <DistributionChip visibility={listing.visibility} what="report" />
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {listing.summary || listing.content.slice(0, 160)}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                      <Chip label={listing.category} size="small" variant="outlined" />
                      {listing.tags.slice(0, 3).map(tag => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      By <KeyName pubkey={listing.author} /> • <UtcTime at={listing.createdAt} year />
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>
        </TabPanel>

        {/* Portfolio Tab — no ownership ledger exists anywhere in the app; honest placeholder */}
      </Box>
    </Box>
    </ThemeProvider>
  );

  // Wrap in provider locally if not already wrapped higher in the tree
  return (
    <IntelWorkspaceProvider>
      {appInner}
    </IntelWorkspaceProvider>
  );
};

export default MarketExchangeApplication;
