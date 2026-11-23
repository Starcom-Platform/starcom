import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Checkbox, MenuItem } from '@mui/material';
import {
  INFORMATION_VISIBILITIES,
  CONTENT_SENSITIVITIES,
  VISIBILITY_LABELS,
  SENSITIVITY_LABELS,
  isInformationVisibility,
  isContentSensitivity,
  type InformationVisibility,
  type ContentSensitivity,
} from '../../../../types/intel/IntelItemUI';

export interface ExportDraftConfig {
  title: string;
  /** Who the draft is for — gates whether internal context appears at all. */
  visibility: InformationVisibility;
  /** What the draft's content needs — gates redaction within it. */
  sensitivity: ContentSensitivity;
  includeFilters: boolean;
  includeWatchlists: boolean;
  redactSensitive: boolean;
}

export const ExportDraftDialog: React.FC<{
  open: boolean;
  initialTitle: string;
  boardId?: string;
  onClose: () => void;
  onConfirm: (cfg: ExportDraftConfig) => void;
}> = ({ open, initialTitle, boardId, onClose, onConfirm }) => {
  const [title, setTitle] = React.useState(initialTitle || 'Draft Report');
  const [visibility, setVisibility] = React.useState<InformationVisibility>('public');
  const [sensitivity, setSensitivity] = React.useState<ContentSensitivity>('open');
  const [includeFilters, setIncludeFilters] = React.useState(true);
  const [includeWatchlists, setIncludeWatchlists] = React.useState(true);
  const [redactSensitive, setRedactSensitive] = React.useState(false);

  React.useEffect(() => { setTitle(initialTitle || 'Draft Report'); }, [initialTitle]);

  // Autosave last used config per board
  const STORAGE_KEY = 'intelAnalyzer.exportConfig.v1';
  React.useEffect(() => {
    if (!boardId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const all = JSON.parse(raw) as Record<string, ExportDraftConfig>;
      const cfg = all[boardId];
      if (cfg) {
        /*
         * ─── VALIDATED, NOT TRUSTED ──────────────────────────────────────────
         *
         * This was `setClassification(cfg.classification)`: whatever sat in
         * localStorage went straight into a TYPED select. A stale config from
         * an older build, or a hand-edited one, put a value in the state that
         * the option list does not contain — MUI then renders a select with no
         * matching option, and the export carries a marking nothing produced.
         *
         * localStorage is user-writable and survives across builds, so it is
         * untrusted input like any other. An unrecognised value falls back to
         * the default rather than being adopted.
         */
        if (isInformationVisibility(cfg.visibility)) setVisibility(cfg.visibility);
        if (isContentSensitivity(cfg.sensitivity)) setSensitivity(cfg.sensitivity);
        setIncludeFilters(!!cfg.includeFilters);
        setIncludeWatchlists(!!cfg.includeWatchlists);
        setRedactSensitive(!!cfg.redactSensitive);
      }
    } catch {/* ignore */}
  }, [boardId]);

  const persist = (cfg: ExportDraftConfig) => {
    if (!boardId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all: Record<string, ExportDraftConfig> = raw ? JSON.parse(raw) : {};
      all[boardId] = cfg;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {/* ignore */}
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export to Draft</DialogTitle>
      <DialogContent>
        <TextField
          margin="dense"
          label="Title"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          select
          margin="dense"
          label="Distribution"
          helperText="Who this draft is for"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as InformationVisibility)}
          fullWidth
        >
          {INFORMATION_VISIBILITIES.map(v => (
            <MenuItem key={v} value={v}>{VISIBILITY_LABELS[v]}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          margin="dense"
          label="Sensitivity"
          helperText="What the draft's own content requires"
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value as ContentSensitivity)}
          fullWidth
        >
          {CONTENT_SENSITIVITIES.map(c => (
            <MenuItem key={c} value={c}>{SENSITIVITY_LABELS[c]}</MenuItem>
          ))}
        </TextField>
        <FormControlLabel control={<Checkbox checked={includeFilters} onChange={(e) => setIncludeFilters(e.target.checked)} />} label="Include active filters" />
        <FormControlLabel control={<Checkbox checked={includeWatchlists} onChange={(e) => setIncludeWatchlists(e.target.checked)} />} label="Include watchlists" />
        <FormControlLabel control={<Checkbox checked={redactSensitive} onChange={(e) => setRedactSensitive(e.target.checked)} />} label="Redact sensitive (entities)" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
  <Button variant="contained" onClick={() => { const cfg = { title: title.trim() || 'Draft Report', visibility, sensitivity, includeFilters, includeWatchlists, redactSensitive }; persist(cfg); onConfirm(cfg); }}>Export</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportDraftDialog;
