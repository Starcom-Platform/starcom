import React from 'react';
import { Button } from '@mui/material';
import { useBoards } from '../../state/BoardsContext';
import ExportDraftDialog, { ExportDraftConfig } from './ExportDraftDialog';
import DraftBuilder from '../../services/DraftBuilder';
import { reportIdsOf } from '../../services/pinnedReportsDigest';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { emitExportEvent } from '../../services/telemetry';
import { useApplicationRouter } from '../../../../hooks/useApplicationRouter';

export const ExportDraftButton: React.FC<{ source: 'board' | 'inspector' } & React.ComponentProps<typeof Button>> = ({ source, ...btnProps }) => {
  const { boards, activeBoardId } = useBoards();
  const active = boards.find(b => b.id === activeBoardId) || null;
  const [open, setOpen] = React.useState(false);
  const { navigateToApp } = useApplicationRouter();

  const handleConfirm = async (cfg: ExportDraftConfig) => {
    if (!active) { setOpen(false); return; }
    emitExportEvent({ type: 'export_started', source, boardId: active.id });
    try {
      // The pinned reports as stored, so the draft can say what they rest on (plan item 4.3).
      const pinned = await Promise.all(reportIdsOf(active.state.pins ?? []).map((id) => intelReportService.getReport(id)));
      const built = DraftBuilder.buildFromBoard(active, cfg, pinned.filter((r): r is NonNullable<typeof r> => r !== null));
      // Create draft in workspace
  const created = await intelReportService.createReport({
        title: built.report.title,
        content: built.report.content,
        visibility: built.report.visibility,
        sensitivity: built.report.sensitivity,
        category: built.report.category,
        tags: built.report.tags,
        status: 'DRAFT'
      // No author: the signer's, not 'ANALYST' (plan item 2.2).
      });

  // Add citation list and propagate deep-link
  const citationBlock = ['\n\n## Citations', ...built.citations.map(c => `- [${c.type}] ${c.title || c.id} (id: ${c.id}${c.timestamp ? ` @ ${c.timestamp}` : ''})`)].join('\n');
  await intelReportService.saveReport({ ...created, content: created.content + citationBlock, analysisDeepLink: built.report.analysisDeepLink });

      emitExportEvent({ type: 'export_completed', source, boardId: active.id, draftId: created.id });

      // Hand off to the canonical Intel Dashboard app with the new draft
      // selected. (Previously navigated to a ?draft= query param that
      // pages/Intel/IntelDashboard.tsx never actually read — it only ever
      // read ?reportId= — so this handoff never really highlighted
      // anything; fixed by going through the same context key the
      // dashboard now reads either way.)
      navigateToApp('inteldashboard', undefined, { reportId: created.id, from: 'intelanalyzer' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      emitExportEvent({ type: 'export_failed', source, boardId: active?.id || undefined, error: msg });
    } finally {
      setOpen(false);
    }
  };

  if (!active) {
    return <Button {...btnProps} disabled title="Save a board first" />;
  }

  return (
    <>
      <Button {...btnProps} onClick={() => setOpen(true)} />
      <ExportDraftDialog
        open={open}
        initialTitle={active.name}
  boardId={active.id}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default ExportDraftButton;
