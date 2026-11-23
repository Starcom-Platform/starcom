/**
 * The captures waiting to be filed (decision D-EX, E2, W5; EX16): what the person sent from their
 * browser through Starcom Uplink that no case holds and no report cites. Each goes to a case, becomes
 * the draft of a report that cites it, or is discarded, with Undo. Shown only while any wait.
 *
 * What was done is said below the list, not on the row: a filed or cited capture leaves the list at
 * once, and its "open the case" or "open the draft" must not leave with it.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import AddToCase from '../Intel/AddToCase';
import EvidenceViewer from './EvidenceViewer';
import { EVIDENCE_TAG } from '../../extension/evidenceItems';
import { Glyph } from '../../symbols/Glyph';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../services/intel/IntelReportService';
import { holdDeletion } from '../../services/intel/deletionHolding';
import { capturedWords, reportDraftFrom, unfiledCaptures } from '../../extension/captureItems';
import Translatable from '../Translation/Translatable';
import { recordPath } from '../../routes/recordLink';
import UtcTime from '../Shared/UtcTime';
import type { IntelItemUI } from '../../types/intel/IntelItemUI';
import { fill, useMessages } from '../../i18n/app/i18n';

const readUnfiled = () => unfiledCaptures(intelWorkspaceManager.getIntelItems(), [
  ...intelWorkspaceManager.getCases(),
  ...intelWorkspaceManager.getReports().map((r) => ({ sourceIntelIds: r.sourceIntel ?? [] })),
]);

/** The captures waiting, kept current as the workspace changes. */
function useUnfiledCaptures(): IntelItemUI[] {
  const [captures, setCaptures] = useState<IntelItemUI[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { if (live) setCaptures(readUnfiled()); };
    void intelWorkspaceManager.ensureInitialized().then(read);
    const stop = intelWorkspaceManager.subscribe(read);
    return () => { live = false; stop(); };
  }, []);
  return captures;
}

const CapturesInbox: React.FC = () => {
  const captures = useUnfiledCaptures();
  // In the language chosen (D-ML, L3); a capture's own words stay as they were captured.
  const { m } = useMessages();
  const t = m.captures;
  const [filing, setFiling] = useState<{ id: string; title: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: string; title: string } | null>(null);
  const [drafted, setDrafted] = useState<{ id: string; title: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const draft = async (capture: IntelItemUI) => {
    setFailed(null);
    try {
      const report = await intelReportService.createReport(reportDraftFrom(capture));
      setDrafted({ id: report.id, title: capture.title });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : t.draftFailed);
    }
  };

  const discard = (capture: IntelItemUI) => {
    const removed = intelWorkspaceManager.removeIntelItem(capture.id);
    if (!removed) return;
    holdDeletion({
      label: fill(t.undoLabel, { title: removed.title }),
      undo: async () => { intelWorkspaceManager.restoreDeleted('item', capture.id); },
      finalize: () => intelWorkspaceManager.finalizeDeletion('item', capture.id),
    });
  };

  if (!captures.length && !filing && !drafted && !viewing) return null;

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }} data-testid="captures-inbox">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Glyph name="action:uplink" size={18} />
        <Typography variant="subtitle1" component="h2">{fill(t.heading, { n: captures.length })}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t.intro}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {captures.map((c) => {
          return (
            <Box component="li" key={c.id} data-testid="capture-row"
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 0.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ flex: '1 1 20rem', minWidth: 0 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{c.title}</Typography>
                {/* A page's words read in the language shown, on this device only: a capture is never Public (ML6). */}
                {capturedWords(c) && <Translatable text={capturedWords(c) ?? ''} testId={`capture-translate-${c.id}`} />}
                <Typography variant="caption" color="text.secondary">
                  {`${(t.kinds as Record<string, string>)[c.tags[1]] ?? t.kinds.capture} · ${c.source} · `}
                  {/* When it was captured, which may be before Starcom took it in. */}
                  <UtcTime at={c.collectedAt ?? c.createdAt} year />
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {c.tags.includes(EVIDENCE_TAG) && (
                  <Button size="small" variant="outlined" onClick={() => setViewing({ id: c.id, title: c.title })}>{t.view}</Button>
                )}
                <Button size="small" variant="outlined" onClick={() => { setDrafted(null); setFiling({ id: c.id, title: c.title }); }}>{t.file}</Button>
                <Button size="small" variant="outlined" onClick={() => { setFiling(null); void draft(c); }}>{t.draft}</Button>
                <Button size="small" onClick={() => discard(c)} aria-label={fill(t.discardLabel, { title: c.title })}>{t.discard}</Button>
              </Box>
            </Box>
          );
        })}
      </Box>
      {viewing && (
        <Box sx={{ mt: 1.5 }}>
          <EvidenceViewer key={viewing.id} itemId={viewing.id} title={viewing.title} onClose={() => setViewing(null)} />
        </Box>
      )}
      {filing && (
        <Box sx={{ mt: 1.5 }}>
          <AddToCase key={filing.id} recordId={filing.id} recordTitle={filing.title} noun="capture" onClose={() => setFiling(null)} />
        </Box>
      )}
      {drafted && (
        <Typography variant="body2" sx={{ mt: 1.5 }} data-testid="capture-drafted">
          {`${fill(t.drafted, { title: drafted.title })} `}
          <a href={recordPath('report', drafted.id)}>{t.openDraft}</a>
        </Typography>
      )}
      {failed && <Typography variant="body2" role="alert" sx={{ mt: 1.5 }}>{failed}</Typography>}
    </Paper>
  );
};

export default CapturesInbox;
