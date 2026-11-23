import React, { useEffect, useState } from 'react';
import { runJob } from '../../../services/jobs/jobRegistry';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { readBundle, type OpenedBundle } from '../../../services/exchange/bundle';
import {
  applyCopy, applyImport, previewCopy, previewImport, type CopyPreview, type ImportAction, type ImportPreview,
} from '../../../services/intel/bundles/importBundle';
import { COPY_FORMAT, openWorkCopy, type OpenedCopy } from '../../../services/intel/copy/workCopy';
import KeyName from '../../Identity/KeyName';
import UtcTime from '../../Shared/UtcTime';

const ACTION: Record<ImportAction, { label: string; color: 'success' | 'warning' | 'default' }> = {
  add: { label: 'Add', color: 'success' },
  update: { label: 'Update', color: 'warning' },
  keep: { label: 'Keep yours', color: 'default' },
};

const TYPE_WORD: Record<string, string> = { case: 'Case', mission: 'Mission', report: 'Report', item: 'Intel' };

/**
 * Taking in a bundle (plan item 2.4): the file is read and checked, then the
 * person sees who sent it and what would happen to each record, and only
 * then imports. A copy of the person's own work (plan item 9.13b) opens here
 * too, with their key, whichever way they came: nothing in it was sent by
 * anyone, so nothing is marked received. A bundle changed after signing is refused, in words. Records
 * its sender kept Private are counted apart from those still to arrive (plan
 * item 9.13): they never will.
 */
const ImportBundleDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  /** After an import, so the screen behind can show what arrived. */
  onImported?: (subject: OpenedBundle['subject']) => void;
  /** Opens what the bundle was about, once it is imported. */
  onOpen?: (subject: OpenedBundle['subject']) => void;
  /** A bundle already read, as one that arrived over a relay: no file to choose. */
  initial?: OpenedBundle;
  /** Opened to take in a copy of your own work (Your key), rather than a bundle. */
  expecting?: 'bundle' | 'copy';
}> = ({ open, onClose, onImported, onOpen, initial, expecting = 'bundle' }) => {
  const [bundle, setBundle] = useState<OpenedBundle | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [copy, setCopy] = useState<OpenedCopy | null>(null);
  const [copyPreview, setCopyPreview] = useState<CopyPreview | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setBundle(null); setPreview(null); setCopy(null); setCopyPreview(null); setRefused(null); setDone(null); };

  useEffect(() => {
    if (!open || !initial) return;
    setBundle(initial);
    setPreview(previewImport(initial));
    setRefused(null);
    setDone(null);
  }, [open, initial]);

  const choose = async (file: File | undefined) => {
    reset();
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setRefused(expecting === 'copy' ? 'This file is not a copy of Starcom work.' : 'This file is not a Starcom bundle.');
      return;
    }
    if ((parsed as { format?: unknown } | null)?.format === COPY_FORMAT) {
      const opened = await openWorkCopy(parsed);
      if ('refused' in opened) { setRefused(opened.refused); return; }
      setCopy(opened.copy);
      setCopyPreview(previewCopy(opened.copy));
      return;
    }
    const read = await readBundle(parsed);
    if ('refused' in read) { setRefused(read.refused); return; }
    setBundle(read.bundle);
    setPreview(previewImport(read.bundle));
  };

  const importNow = async () => {
    if (!bundle && !copy) return;
    setBusy(true);
    try {
      if (copy) {
        const { added, updated, kept } = await applyCopy(copy);
        setDone(`Added ${added}, updated ${updated}, kept ${kept}.`);
        setCopyPreview(previewCopy(copy));
        return;
      }
      if (!bundle) return;
      // On the job rail while it applies (BD13).
      const { added, updated, kept } = await runJob(
        { kind: 'bundle-import', label: 'Importing a bundle' },
        () => applyImport(bundle),
        (r) => `added ${r.added}, updated ${r.updated}, kept ${r.kept}`,
      );
      setDone(`Added ${added}, updated ${updated}, kept ${kept}.`);
      setPreview(previewImport(bundle));
      onImported?.(bundle.subject);
    } catch (e) {
      setRefused(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = copyPreview?.rows ?? preview?.rows ?? null;
  const changes = rows?.filter((r) => r.action !== 'keep').length ?? 0;
  const asCopy = expecting === 'copy' || copy !== null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="import-bundle-dialog">
      <DialogTitle>{asCopy ? 'Open a copy of your work' : 'Import a bundle'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {asCopy
              ? 'A copy of your own work, sealed to your key. Nothing is added until you import it.'
              : <>{initial ? 'A case or mission someone sent you' : 'A case or mission someone exported'}, with its reports. Nothing is added until you import it.</>}
          </Typography>
          {!initial && <Box>
            <label htmlFor="bundle-file-input">
              <Typography variant="body2" component="span">{expecting === 'copy' ? 'Copy of your work ' : 'Bundle file '}</Typography>
            </label>
            <input
              id="bundle-file-input"
              type="file"
              accept=".json,application/json"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </Box>}
          {refused && <Alert severity="error" role="alert">{refused}</Alert>}
          {copyPreview && (
            <Typography variant="body2" data-testid="copy-from">
              A copy of your own work, made <UtcTime at={Date.parse(copyPreview.madeAt)} year />. Sealed to your key, and nothing in it was changed since.
            </Typography>
          )}
          {preview && (
            <Typography variant="body2" data-testid="bundle-from">
              From <KeyName pubkey={preview.from} hint={preview.fromName} showKey />, made <UtcTime at={Date.parse(preview.madeAt)} year />.
              Signed with their key, and nothing in it was changed since.
            </Typography>
          )}
          {rows && (
            <Stack spacing={1} data-testid="bundle-preview">
              {rows.map((row) => (
                <Box key={`${row.type}:${row.id}`} data-testid={`bundle-row-${row.id}`} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 1 }}>
                  <Chip size="small" label={ACTION[row.action].label} color={ACTION[row.action].color} variant={row.action === 'keep' ? 'outlined' : 'filled'} />
                  <Typography variant="body2" color="text.secondary">{TYPE_WORD[row.type] ?? row.type}</Typography>
                  {row.number && <Typography variant="body2" component="code">{row.number}</Typography>}
                  <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{row.title}</Typography>
                  {row.note && <Typography variant="caption" color="text.secondary" sx={{ flexBasis: '100%', pl: 1 }}>{row.note}</Typography>}
                </Box>
              ))}
            </Stack>
          )}
          {preview && preview.withheld.length > 0 && (
            <Typography variant="caption" color="text.secondary" data-testid="bundle-withheld">
              {preview.withheld.length === 1
                ? 'It cites 1 record its sender keeps Private, which was not sent.'
                : `It cites ${preview.withheld.length} records its sender keeps Private, which were not sent.`}
            </Typography>
          )}
          {preview && preview.absent.length > 0 && (
            <Typography variant="caption" color="text.secondary" data-testid="bundle-absent">
              {preview.absent.length === 1
                ? 'It links to 1 record it does not carry, which shows as absent until it arrives.'
                : `It links to ${preview.absent.length} records it does not carry, which show as absent until they arrive.`}
            </Typography>
          )}
          {done && <Alert severity="success" data-testid="bundle-imported">{done}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Close</Button>
        {done && bundle && onOpen && (
          <Button variant="contained" onClick={() => { const { subject } = bundle; reset(); onOpen(subject); }}>
            Open the {bundle.subject.type}
          </Button>
        )}
        {rows && !done && (
          <Button variant="contained" disabled={busy || changes === 0} onClick={() => void importNow()}>
            {changes === 0 ? 'Nothing to import' : `Import ${changes} record${changes === 1 ? '' : 's'}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportBundleDialog;
