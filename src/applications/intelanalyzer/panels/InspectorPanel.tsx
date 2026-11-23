import { formatCoordinate } from '../../../types/intel/SourceObservation';
import React from 'react';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { Box, Typography, Chip, Stack, IconButton, Tooltip, TextField, Button } from '@mui/material';
// Each icon imported from its own subpath, not the package barrel.
// `from '@mui/icons-material'` forces Vite's dependency scan to touch the
// whole package — 10,774 files — which is what threw EMFILE under concurrent
// test forks on this machine (macOS's launchd-spawned process fd limit is
// 256, not the shell's 1,048,576). The other ~14 icon imports in this repo
// already use this form; these eight did not.
import PushPin from '@mui/icons-material/PushPin';
import Link from '@mui/icons-material/Link';
import Launch from '@mui/icons-material/Launch';
import LocationOn from '@mui/icons-material/LocationOn';
import AccessTime from '@mui/icons-material/AccessTime';
import { useSelection } from '../state/SelectionContext';
import { useFilter } from '../state/FilterContext';
import { Event } from '../adapters/eventsAdapter';
import { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { IntelItemUI } from '../../../types/intel/IntelItemUI';
import { encodeDeepLink } from '../utils/deepLink';
import EventDetails from './components/EventDetails';
import { useCorrelation } from '../state/CorrelationContext';
import AnomalyBadge from './components/AnomalyBadge';
import ConflictBadge from './components/ConflictBadge';
import { useBoards } from '../state/BoardsContext';
import ExportDraftButton from './components/ExportDraftButton';
import UtcTime from '../../../components/Shared/UtcTime';
import DistributionChip from '../../../components/Shared/DistributionChip';
import { isInformationVisibility } from '../../../types/intel/IntelItemUI';

/**
 * InspectorPanel - Right panel showing details of selected item
 *
 * Displays metadata, content, and actions for selected events
 */

const InspectorPanel: React.FC = () => {
  const { selectedItem } = useSelection();
  const { updateFilter } = useFilter();
  const { navigateToApp } = useApplicationRouter();
  const { addPin, setNotes, boards, activeBoardId } = useBoards();
  const { anomaliesByDay, showClusters, locationConflicts } = useCorrelation();
  const activeBoard = boards.find(b => b.id === activeBoardId) || null;
  const [noteDraft, setNoteDraft] = React.useState(activeBoard?.state.notes || '');

  const handleEntityClick = (entity: string) => {
    updateFilter('entityRefs', [entity]);
  };

  const handlePinToBoard = () => {
  if (!selectedItem) return;
  const data = (selectedItem as unknown as { data?: { title?: string } }).data;
  addPin({ id: selectedItem.id, type: selectedItem.type, title: data?.title });
  };

  const handleCopyDeepLink = () => {
    if (!selectedItem) return;
    const deepLink = encodeDeepLink({ view: 'table', selected: selectedItem.id });
    const full = `${window.location.origin}${window.location.pathname}?${deepLink}`;
    navigator.clipboard.writeText(full);
    console.log('Copied deep link:', full);
  };

  /*
   * The report the selection came from, which is what the dashboard opens. This
   * went to /intel?selected=, which reads only reportId and redirects home, so
   * the selection was lost and the reader left the Analyzer (critique audit of
   * 2026-10-01, section 8). An observation or an entity has no dashboard page.
   */
  const selectedData = (selectedItem as unknown as { data?: { sourceType?: string; sourceId?: string } } | null)?.data;
  const reportId = !selectedItem ? null
    : selectedItem.type === 'report' ? selectedItem.id
      : selectedData?.sourceType === 'REPORT' && selectedData.sourceId ? selectedData.sourceId
        : null;
  const handleOpenInDashboard = () => {
    if (!reportId) return;
    navigateToApp('inteldashboard', undefined, { reportId, from: 'intelanalyzer' });
  };

  const saveNotes = () => {
    setNotes(noteDraft || '');
  };

  // A selection with nothing behind it is no selection: read as one, it crashed the Analyzer.
  if (!selectedItem || !(selectedItem as unknown as { data?: unknown }).data) {
    return (
      <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          Select an item to inspect
        </Typography>
      </Box>
    );
  }

  // Event specific block moved into component

  // Report details (minimal specialized)
  const renderReport = (report: IntelReportUI) => (
    <Stack spacing={2} sx={{ mt:1 }}>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Report</Typography>
        <Typography variant="body2" sx={{ color:'white' }}>{report.title || selectedItem.id}</Typography>
      </Box>
      {Array.isArray(report.tags) && report.tags.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Tags</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {report.tags.map((t: string) => <Chip key={t} label={t} size="small" sx={{ backgroundColor:'rgba(255,170,0,0.2)', color:'#ffaa00' }} />)}
          </Stack>
        </Box>
      )}
      {(report.createdAt || report.updatedAt) && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
            <AccessTime sx={{ mr:1, fontSize:'1rem' }} /> Timestamp
          </Typography>
          <Typography variant="body2" sx={{ color:'white' }}>
            Created: <UtcTime at={report.createdAt} year /><br />
            Updated: <UtcTime at={report.updatedAt} year />
          </Typography>
        </Box>
      )}
    </Stack>
  );

  // Intel Item details (minimal specialized)
  const renderIntelItem = (item: IntelItemUI) => (
    <Stack spacing={2} sx={{ mt:1 }}>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Intel Item</Typography>
        <Typography variant="body2" sx={{ color:'white' }}>{item.title || selectedItem.id}</Typography>
      </Box>
      {Array.isArray(item.tags) && item.tags.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Tags</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {item.tags.map((t: string) => <Chip key={t} label={t} size="small" sx={{ backgroundColor:'rgba(255,170,0,0.2)', color:'#ffaa00' }} />)}
          </Stack>
        </Box>
      )}
      {Array.isArray(item.categories) && item.categories.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Categories</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {item.categories.map((c: string) => (
              <Chip key={c} label={c} size="small" sx={{ backgroundColor:'rgba(0,255,65,0.2)', color:'#00ff41' }} />
            ))}
          </Stack>
        </Box>
      )}
      {(item.createdAt || item.updatedAt) && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
            <AccessTime sx={{ mr:1, fontSize:'1rem' }} /> Timestamp
          </Typography>
          <Typography variant="body2" sx={{ color:'white' }}>
            Created: <UtcTime at={item.createdAt} year /><br />
            Updated: <UtcTime at={item.updatedAt} year />
          </Typography>
        </Box>
      )}
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Source &amp; Handling</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={item.source} size="small" sx={{ backgroundColor:'rgba(0,191,255,0.2)', color:'#00bfff' }} />
          {/*
            * Was a single `item.classification` chip, which rendered
            * `undefined` for any item that carried no marking. Each axis now
            * appears only when the item actually states it.
            */}
          {isInformationVisibility(item.visibility) && <DistributionChip visibility={item.visibility} what="item" />}
          {item.sensitivity && (
            <Chip label={item.sensitivity} size="small" sx={{ backgroundColor:'rgba(255,255,255,0.1)', color:'white' }} />
          )}
          <Chip label={`Reliability ${item.reliability}`} size="small" sx={{ backgroundColor:'rgba(255,255,255,0.1)', color:'white' }} />
          <Chip label={`Confidence ${(item.confidence*100).toFixed(0)}%`} size="small" sx={{ backgroundColor:'rgba(255,255,255,0.1)', color:'white' }} />
        </Stack>
      </Box>
      {(item.latitude !== undefined && item.longitude !== undefined) && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1, display:'flex', alignItems:'center' }}>
            <LocationOn sx={{ mr:1, fontSize:'1rem' }} /> Location
          </Typography>
          <Typography variant="body2" sx={{ color:'white' }}>{formatCoordinate(item.latitude, item.longitude)}</Typography>
        </Box>
      )}
    </Stack>
  );

  // Entity details (minimal specialized)
  type EntityUI = { id: string; name?: string; types?: string[]; tags?: string[] };
  const renderEntity = (entity: EntityUI) => (
    <Stack spacing={2} sx={{ mt:1 }}>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Entity</Typography>
        <Typography variant="body2" sx={{ color:'white' }}>{entity.name || selectedItem.id}</Typography>
      </Box>
      {Array.isArray(entity.types) && entity.types.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Types</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {entity.types.map((t: string) => <Chip key={t} label={t} size="small" sx={{ backgroundColor:'rgba(0,255,65,0.2)', color:'#00ff41' }} />)}
          </Stack>
        </Box>
      )}
      {Array.isArray(entity.tags) && entity.tags.length > 0 && (
        <Box>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Tags</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {entity.tags.map((t: string) => <Chip key={t} label={t} size="small" sx={{ backgroundColor:'rgba(255,170,0,0.2)', color:'#ffaa00' }} />)}
          </Stack>
        </Box>
      )}
    </Stack>
  );

  // Generic fallback renderer for other types
  const _renderGeneric = (typeLabel: string) => (
    <Stack spacing={2} sx={{ mt:1 }}>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Type</Typography>
        <Chip label={typeLabel} size="small" sx={{ backgroundColor:'rgba(0,255,65,0.2)', color:'#00ff41' }} />
      </Box>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>ID</Typography>
        <Typography variant="body2" sx={{ color:'white' }}>{selectedItem.id}</Typography>
      </Box>
      <Box>
        <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Raw Data (dev)</Typography>
        <Box sx={{ backgroundColor:'rgba(0,0,0,0.4)', p:1, borderRadius:1, fontFamily:'var(--sc-font-data)', fontSize:'0.7rem', maxHeight:180, overflow:'auto', color:'white' }}>
          <pre style={{ margin:0 }}>{JSON.stringify(selectedItem.data, null, 2)}</pre>
        </Box>
      </Box>
    </Stack>
  );

  const content = () => {
    if (selectedItem.type === 'event') {
      return (
        <EventDetails
          event={selectedItem.data as Event}
          onEntityClick={handleEntityClick}
        />
      );
    }
    if (selectedItem.type === 'report') return renderReport(selectedItem.data as IntelReportUI);
    if (selectedItem.type === 'intelItem') return renderIntelItem(selectedItem.data as IntelItemUI);
    if (selectedItem.type === 'entity') return renderEntity(selectedItem.data as { id: string; name?: string; types?: string[]; tags?: string[] });
    return null;
  };

  return (
    <Box sx={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <Box sx={{ p:2, borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Typography variant="h6" sx={{ color:'#00ff41' }}>Inspector</Typography>
          <Stack direction="row" spacing={1}>
            {/* Pinning writes to the open board; with none it did nothing, silently. */}
            <Tooltip title={activeBoardId ? 'Pin to Board' : 'Open or create a board to pin to'}>
              <span aria-label={activeBoardId ? undefined : 'Open or create a board to pin to'}>
                <IconButton aria-label="Pin to Board" size="small" onClick={handlePinToBoard} disabled={!activeBoardId} sx={{ color:'#ffaa00' }}><PushPin fontSize="small" /></IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Copy Deep Link"><IconButton aria-label="Copy Deep Link" size="small" onClick={handleCopyDeepLink} sx={{ color:'#00bfff' }}><Link fontSize="small" /></IconButton></Tooltip>
            <Tooltip title={reportId ? 'Open in Dashboard' : 'Only a report has a dashboard page; this is not one'}>
              <span aria-label={reportId ? undefined : 'Only a report has a dashboard page; this is not one'}>
                <IconButton aria-label="Open in Dashboard" size="small" onClick={handleOpenInDashboard} disabled={!reportId} sx={{ color:'#9c27b0' }}><Launch fontSize="small" /></IconButton>
              </span>
            </Tooltip>
            {/* Export to Draft (Phase D Step 12) */}
            <ExportDraftButton source="inspector" variant="outlined" size="small">Export</ExportDraftButton>
          </Stack>
        </Box>
      </Box>
      <Box sx={{ flex:1, overflowY:'auto', p:2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
          <Typography variant="h6" sx={{ color:'#00ff41' }}>
            {selectedItem.type === 'event'
              ? ((selectedItem.data as Event | null | undefined)?.title ?? selectedItem.id)
              : ((selectedItem as { data?: { title?: string } }).data?.title ?? selectedItem.id)
            }
          </Typography>
          {/* Anomaly badge (Phase C Step 10) */}
          {selectedItem.type === 'event' && (
            <AnomalyBadge
              timestamp={(selectedItem.data as Event)?.timestamp}
              anomaliesByDay={anomaliesByDay}
              showClusters={showClusters}
            />
          )}
          {/* Contradiction detection, phase 1 — same entity placed too far
              apart, too close in time, to plausibly be the same thing. */}
          {selectedItem.type === 'event' && (
            <ConflictBadge
              sourceId={(selectedItem.data as Event)?.sourceId}
              locationConflicts={locationConflicts}
            />
          )}
          {/* Watch badge when current event hits a watchlist */}
          {selectedItem.type === 'event' && (() => {
            const watch = activeBoard?.state.watch;
            const ev = selectedItem.data as Event;
            const hit = !!watch && ((watch.tags?.some(t => ev.tags.includes(t))) || (watch.entities?.some(id => ev.entityRefs?.includes(id))));
            return hit ? <Chip size="small" color="primary" label="Watch" /> : null;
          })()}
        </Stack>
        {content()}
        {/* Notes & Pins */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" component="span" sx={{ color:'#00bfff', mb:1 }}>Notes</Typography>
          <TextField
            multiline
            minRows={3}
            fullWidth
            placeholder="Add notes or hypotheses…"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={saveNotes}>Save Notes</Button>
            {activeBoard?.state.pins && activeBoard.state.pins.length > 0 && (
              <Chip size="small" color="success" label={`Pinned: ${activeBoard.state.pins.length}`} />
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
};

export default InspectorPanel;
