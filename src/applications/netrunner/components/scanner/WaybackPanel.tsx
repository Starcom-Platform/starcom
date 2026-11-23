/**
 * The Wayback Machine in NetRunner (decision D-EX, EX34, W10d): a page's snapshots listed, two the person
 * picks compared, and the Archive credited.
 *
 * The full list and the comparison read through Starcom Uplink or the desktop app; a plain browser gets
 * the closest snapshot and is told why. A comparison is shown and never kept: the Archive's terms bar
 * storing personal data. Filing a snapshot keeps its address, time and digest as a capture to put in a
 * case, and nothing of the page.
 */
import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Checkbox, LinearProgress, TextField, Typography } from '@mui/material';
import { History } from 'lucide-react';
import { siteFetcher, useSiteFetchRoute } from '../../../../extension/siteFetcher';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import {
  WAYBACK_CREDIT, diffLines, listSnapshots, snapshotLines, snapshotToItem, type LineDiff, type Snapshot, type SnapshotList,
} from '../../../../services/intel/recon/wayback';
import { formatUtcDateTime } from '../../../../utils/utcTime';

const MONO = 'var(--sc-font-data)';
const DISPLAY = 'var(--sc-font-text)';
const label = { color: 'var(--sc-text-muted)', fontFamily: MONO, fontSize: '0.7rem', letterSpacing: '0.08em' } as const;
const value = { color: 'var(--sc-text-body)', fontFamily: MONO, fontSize: '0.7rem' } as const;
const card = { backgroundColor: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', borderRadius: 0 } as const;
const button = {
  color: 'var(--sc-button-label)', backgroundColor: 'var(--sc-button-fill)', borderRadius: 0, fontFamily: DISPLAY, fontSize: '0.7rem', letterSpacing: '0.08em', px: 2,
  '&.Mui-disabled': { backgroundColor: 'var(--sc-surface-input)', color: 'var(--sc-text-muted)' },
} as const;

/** How many snapshots are shown at once: the newest. */
const SHOWN = 50;
/** How many changed lines a comparison shows. */
const CHANGES_SHOWN = 300;

const when = (s: Snapshot) => formatUtcDateTime(Date.parse(s.at), { year: true });

type Compared = { before: Snapshot; after: Snapshot; diff: LineDiff | 'same' };

const WaybackPanel: React.FC = () => {
  const route = useSiteFetchRoute();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [list, setList] = useState<SnapshotList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [compared, setCompared] = useState<Compared | null>(null);
  const [filed, setFiled] = useState<string[]>([]);

  const look = async () => {
    setBusy('Asking the Wayback Machine…');
    setError(null);
    setList(null);
    setPicked([]);
    setCompared(null);
    try {
      setList(await listSnapshots(target.trim(), await siteFetcher()));
    } catch (e) {
      setError(`Could not look: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const compare = async () => {
    const two = (list?.snapshots ?? []).filter((s) => picked.includes(s.timestamp)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (two.length !== 2) return;
    const [before, after] = two;
    setError(null);
    setCompared(null);
    // One digest, one content: nothing to read to know they match.
    if (before.digest && before.digest === after.digest) {
      setCompared({ before, after, diff: 'same' });
      return;
    }
    setBusy('Reading both snapshots…');
    try {
      const fetcher = await siteFetcher();
      if (!fetcher) throw new Error('comparing needs Starcom Uplink or the desktop app');
      const [a, b] = [await snapshotLines(before, fetcher), await snapshotLines(after, fetcher)];
      setCompared({ before, after, diff: diffLines(a, b) });
    } catch (e) {
      setError(`Could not compare: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const file = (snapshot: Snapshot) => {
    intelWorkspaceManager.addIntelItem(snapshotToItem(snapshot));
    setFiled((f) => [...f, snapshot.timestamp]);
  };

  const toggle = (timestamp: string) =>
    setPicked((p) => (p.includes(timestamp) ? p.filter((t) => t !== timestamp) : p.length < 2 ? [...p, timestamp] : p));

  const shown = (list?.snapshots ?? []).slice(0, SHOWN);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h5" sx={{ color: 'var(--sc-accent)', fontFamily: DISPLAY, fontSize: '1rem', letterSpacing: '0.1em' }}>
        WAYBACK_MACHINE
      </Typography>
      <Card sx={card}>
        <CardContent sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="PAGE"
              placeholder="example.org/about"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && target.trim() && !busy) void look(); }}
              size="small"
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': { color: 'var(--sc-text-body)', fontFamily: MONO, fontSize: '0.75rem', borderRadius: 0, '& fieldset': { borderColor: 'var(--sc-input-border)' } },
                '& .MuiInputLabel-root': { color: 'var(--sc-text-muted)', fontFamily: MONO, fontSize: '0.7rem' },
              }}
            />
            <Button onClick={() => void look()} disabled={!!busy || target.trim().length === 0} startIcon={<History size={14} />} sx={button}>
              LIST SNAPSHOTS
            </Button>
          </Box>
          {busy && <LinearProgress sx={{ mt: 1, height: 2, backgroundColor: 'var(--sc-surface-input)', '& .MuiLinearProgress-bar': { backgroundColor: 'var(--sc-accent)' } }} />}
          {busy && <Typography sx={{ ...label, mt: 0.5 }}>{busy}</Typography>}
          <Typography sx={{ ...label, mt: 0.75, textTransform: 'none' }}>
            Snapshots from the <a href={WAYBACK_CREDIT.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)' }}>Internet Archive&apos;s Wayback Machine</a>, for research use.
            {' '}A comparison is shown, not kept. Filing keeps a snapshot&apos;s address and time, never the page.
          </Typography>
        </CardContent>
      </Card>

      {error && <Typography role="alert" sx={{ ...value, color: 'var(--sc-caution)' }}>{error}</Typography>}

      {list && (
        <Card sx={card}>
          <CardContent sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
            {list.note && <Typography sx={{ ...value, color: 'var(--sc-caution)' }}>{list.note}</Typography>}
            {list.snapshots.length === 0 && <Typography sx={value}>The Archive holds no snapshot of this page.</Typography>}
            {shown.map((s, i) => {
              const older = shown[i + 1];
              const same = !!s.digest && s.digest === older?.digest;
              return (
                <Box key={s.timestamp} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  {list.complete && (
                    <Checkbox
                      size="small"
                      checked={picked.includes(s.timestamp)}
                      disabled={!picked.includes(s.timestamp) && picked.length >= 2}
                      onChange={() => toggle(s.timestamp)}
                      inputProps={{ 'aria-label': `Pick the snapshot of ${s.at} to compare` }}
                      sx={{ p: 0.25, color: 'var(--sc-text-muted)', '&.Mui-checked': { color: 'var(--sc-accent)' } }}
                    />
                  )}
                  <Typography sx={{ ...value, minWidth: 150 }}>{when(s)}</Typography>
                  <Typography sx={{ ...label, minWidth: 30 }}>{s.status}</Typography>
                  <Typography sx={{ ...label, minWidth: 80 }} title="The Archive's digest of what it kept">{s.digest ? s.digest.slice(0, 8) : ''}</Typography>
                  {same && <Typography sx={label}>same as the one before</Typography>}
                  <a href={s.replay} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sc-accent)', fontFamily: MONO, fontSize: '0.7rem' }}>open</a>
                  <Button size="small" disabled={filed.includes(s.timestamp)} onClick={() => file(s)} sx={{ ...label, minWidth: 0, p: 0, color: 'var(--sc-accent)' }}>
                    {filed.includes(s.timestamp) ? 'filed to Captures' : 'file'}
                  </Button>
                </Box>
              );
            })}
            {list.snapshots.length > SHOWN && <Typography sx={label}>+{list.snapshots.length - SHOWN} older</Typography>}
            {list.complete && list.snapshots.length > 1 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                <Button onClick={() => void compare()} disabled={!!busy || picked.length !== 2 || !route} sx={button}>COMPARE TWO</Button>
                <Typography sx={label}>{picked.length === 2 ? 'Ready to compare.' : 'Pick two snapshots to compare.'}</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {compared && (
        <Card sx={card}>
          <CardContent sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
            <Typography sx={{ color: 'var(--sc-accent)', fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em' }}>
              {when(compared.before)} → {when(compared.after)}
            </Typography>
            {compared.diff === 'same' ? (
              <Typography sx={value}>The Archive kept the same content both times: its digests match.</Typography>
            ) : (
              <>
                <Typography sx={value}>
                  {compared.diff.added + compared.diff.removed === 0
                    ? 'The words are the same. The pages differ only in markup, scripts or styles.'
                    : `${compared.diff.removed} ${compared.diff.removed === 1 ? 'line' : 'lines'} removed, ${compared.diff.added} added.`}
                </Typography>
                {!compared.diff.exact && (
                  <Typography sx={{ ...label, textTransform: 'none' }}>The pages were too large to align line by line; these lines appear on one side only.</Typography>
                )}
                {compared.diff.ops.filter((o) => o.kind !== 'same').slice(0, CHANGES_SHOWN).map((o, i) => (
                  <Typography key={`${i}-${o.kind}`} sx={{ ...value, color: o.kind === 'added' ? 'var(--sc-ok)' : 'var(--sc-danger)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {o.kind === 'added' ? '+ ' : '− '}{o.text}
                  </Typography>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default WaybackPanel;
