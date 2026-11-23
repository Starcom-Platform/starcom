/**
 * Kept evidence, as the person looks at it (decision D-EX, E2, W8; EX14, EX15, EX21, EX22): the page's
 * picture, where and when it was captured, each file with its size and SHA-256, the custody record and
 * who signed it, and each file to save. Opened from the Captures inbox and from a case's evidence.
 *
 * The page's HTML is a file to save, never shown here: a page's HTML can carry scripts, and Starcom
 * draws no page it did not write. "Check again" reads each file back and hashes it; an unsigned record
 * is signed at the person's click, with their key, which that click may make.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { nip19, verifyEvent } from 'nostr-tools';
import UtcTime from '../Shared/UtcTime';
import { evidenceStore } from '../../extension/evidenceStore';
import { recheckEvidence, signEvidence, type FileState } from '../../extension/evidenceActions';
import type { KeptCustody } from '../../extension/keepEvidence';
import type { EvidenceFileName } from '../../extension/protocol';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { base64ToBytes } from '../../extension/bytes';
import { browserCompletion, completeTimestamps } from '../../extension/completeTimestamps';
import { formatUtcDateTime } from '../../utils/utcTime';
import { fill, listed, numbered, useMessages } from '../../i18n/app/i18n';
import { fillNodes } from '../../i18n/app/fillNodes';
import type { Messages } from '../../i18n/app/en';

/** Each evidence file's words, in the language shown (D-ML, L3). */
const FILE_KEY: Record<EvidenceFileName, keyof Messages['evidence']['files']> = { 'screenshot.png': 'picture', 'page.html': 'html', 'text.txt': 'text' };
/** The files a completion proved, by name: only those, never "these files" when some had no proof. */
const provenFiles = (record: KeptCustody, t: Messages['evidence']) =>
  listed((record.capture.files ?? []).filter((f) => record.anchored?.proofs[f.name]).map((f) => t.filesInSentence[FILE_KEY[f.name]]));

const sha256Hex = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Hands the person a file to save; nothing is opened or drawn. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EvidenceViewer: React.FC<{ itemId: string; title: string; onClose: () => void }> = ({ itemId, title, onClose }) => {
  const { m } = useMessages();
  const t = m.evidence;
  const fileWord = (name: EvidenceFileName) => t.files[FILE_KEY[name]];
  const [record, setRecord] = useState<KeptCustody | null | undefined>(undefined);
  const [picture, setPicture] = useState<string | null>(null);
  const [checks, setChecks] = useState<Array<{ name: EvidenceFileName; state: FileState }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completion, setCompletion] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void evidenceStore.getRecord(itemId).then(async (kept) => {
      if (!live) return;
      setRecord(kept ?? null);
      const shot = kept?.capture.files?.find((f) => f.name === 'screenshot.png');
      const blob = shot ? await evidenceStore.getFile(shot.sha256) : undefined;
      if (live && blob && typeof URL.createObjectURL === 'function') {
        url = URL.createObjectURL(blob);
        setPicture(url);
      }
    }).catch(() => { if (live) setRecord(null); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [itemId]);

  if (record === undefined) return <Paper sx={{ p: 2 }} data-testid="evidence-viewer"><Typography variant="body2">{t.reading}</Typography></Paper>;
  if (record === null) {
    return (
      <Paper sx={{ p: 2 }} data-testid="evidence-viewer">
        <Typography variant="body2">{t.notHere}</Typography>
        <Button size="small" onClick={onClose}>{t.close}</Button>
      </Paper>
    );
  }

  const { capture, event } = record;
  // Checked on a plain copy: nostr-tools marks an event it has verified, and a copy carries the mark,
  // so an altered copy of a signed event would read as checked.
  const signedAndChecks = event ? verifyEvent(JSON.parse(JSON.stringify(event))) : false;
  const stem = `evidence-${capture.at.slice(0, 19).replace(/[:T]/g, '-')}`;

  const check = async () => {
    setChecks(await recheckEvidence(capture, { getFile: evidenceStore.getFile, sha256Hex }));
  };
  const sign = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await signEvidence(itemId, {
        getRecord: evidenceStore.getRecord,
        putRecord: evidenceStore.putRecord,
        // At the person's click: their key, made now if they have none.
        sign: async (unsigned) => {
          await nostrIdentityService.ensureSigner('signing an evidence record');
          return nostrIdentityService.signWithExisting(unsigned);
        },
        updateItemContent: (id, content) => {
          const item = intelWorkspaceManager.getIntelItem(id);
          if (item) intelWorkspaceManager.updateIntelItem({ ...item, content });
        },
      });
      const { unsigned: _signedNow, ...kept } = record;
      setRecord({ ...kept, event: next });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t.signFailed);
    } finally {
      setBusy(false);
    }
  };
  // At the person's click: the calendars' finished proofs, and the block they reach checked twice over.
  const complete = async () => {
    setCompleting(true);
    setCompletion(null);
    try {
      const done = await completeTimestamps(capture, browserCompletion());
      if ('anchored' in done) {
        const next: KeptCustody = { ...record, anchored: done.anchored };
        await evidenceStore.putRecord(itemId, next);
        setRecord(next);
      } else {
        // The one "not yet" in the language shown; a failure's own reason as it came.
        setCompletion('pending' in done ? t.noProofYet : done.failed);
      }
    } catch (e) {
      setCompletion(fill(t.completeFailed, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setCompleting(false);
    }
  };
  const saveFile = async (name: EvidenceFileName, sha256: string) => {
    const blob = await evidenceStore.getFile(sha256);
    if (blob) save(blob, `${stem}-${name}`);
    else setProblem(fill(t.fileMissing, { file: fileWord(name) }));
  };
  const saveProof = (name: EvidenceFileName, base64: string) =>
    save(new Blob([base64ToBytes(base64)], { type: 'application/octet-stream' }), `${stem}-${name}.ots`);
  const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
  const saveRecord = () => save(new Blob([JSON.stringify(event ?? record.unsigned, null, 2)], { type: 'application/json' }), `${stem}-custody.json`);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid="evidence-viewer">
      <Typography variant="subtitle1" component="h3">{title}</Typography>
      {picture && (
        <Box component="img" src={picture} alt={capture.scaledTo ? fill(t.pictureAltScaled, { px: capture.scaledTo }) : t.pictureAlt}
          sx={{ maxWidth: '100%', border: 1, borderColor: 'divider' }} />
      )}
      <Typography variant="body2">
        {fillNodes(t.from, {
          page: <a href={capture.page.url} target="_blank" rel="noopener noreferrer nofollow">{capture.page.title ?? capture.page.url}</a>,
          when: <UtcTime at={capture.at} year />,
        })}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2 }} data-testid="evidence-files">
        {(capture.files ?? []).map((f) => {
          const state = checks?.find((c) => c.name === f.name)?.state;
          return (
            <li key={f.name}>
              <Typography variant="body2" component="span">{`${fill(t.fileLine, { file: fileWord(f.name), bytes: numbered(f.size) })} `}</Typography>
              <Typography variant="body2" component="code" sx={{ fontFamily: 'var(--sc-font-data)', overflowWrap: 'anywhere' }}>{f.sha256}</Typography>
              {state && <Typography variant="body2" component="span" data-state={state}>{` · ${t.states[state as FileState]}`}</Typography>}
              {' '}
              <Button size="small" onClick={() => { void saveFile(f.name, f.sha256); }}>{t.save}</Button>
            </li>
          );
        })}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {t.htmlNote}
      </Typography>
      <Box data-testid="evidence-timestamps">
        {record.anchored ? (
          <>
            <Typography variant="body2" data-testid="evidence-anchored">
              {fill(t.proven, { files: provenFiles(record, t), when: formatUtcDateTime(Date.parse(record.anchored.block.minedAt), { year: true }), height: record.anchored.block.height })}
              {` ${fill(t.checkedWith, { explorers: listed(record.anchored.block.checkedWith) })}`}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              {(capture.files ?? []).filter((f) => record.anchored?.proofs[f.name]).map((f) => (
                <Button key={f.name} size="small" onClick={() => saveProof(f.name, record.anchored!.proofs[f.name]!)}>
                  {fill(t.saveProof, { file: fileWord(f.name) })}
                </Button>
              ))}
            </Box>
          </>
        ) : capture.timestamps ? (
          <>
            <Typography variant="body2">
              {fill(t.pending, { calendars: listed(capture.timestamps.calendars.map(hostOf)) })}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5, alignItems: 'center' }}>
              <Button size="small" variant="outlined" disabled={completing} onClick={() => { void complete(); }}>
                {completing ? t.completing : t.complete}
              </Button>
              {(capture.files ?? []).filter((f) => capture.timestamps?.proofs[f.name]).map((f) => (
                <Button key={f.name} size="small" onClick={() => saveProof(f.name, capture.timestamps!.proofs[f.name]!)}>
                  {fill(t.saveProof, { file: fileWord(f.name) })}
                </Button>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {t.completeNote}
            </Typography>
            {completion && <Typography variant="body2" data-testid="evidence-completion">{completion}</Typography>}
          </>
        ) : (
          <Typography variant="body2">{capture.timestampNote ? `${capture.timestampNote.replace(/\.$/, '')}.` : t.notTimestamped}</Typography>
        )}
      </Box>
      {event ? (
        <Typography variant="body2" data-testid="evidence-signed">
          {fill(signedAndChecks ? t.signed : t.signedBad, { npub: nip19.npubEncode(event.pubkey) })}
        </Typography>
      ) : (
        <Typography variant="body2" data-testid="evidence-unsigned">
          {t.unsigned}
        </Typography>
      )}
      {problem && <Typography variant="body2" role="alert">{problem}</Typography>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => { void check(); }}>{t.checkAgain}</Button>
        {!event && <Button size="small" variant="outlined" disabled={busy} onClick={() => { void sign(); }}>{t.signWithKey}</Button>}
        <Button size="small" onClick={saveRecord}>{t.saveRecord}</Button>
        <Button size="small" onClick={onClose}>{t.close}</Button>
      </Box>
    </Paper>
  );
};

export default EvidenceViewer;
