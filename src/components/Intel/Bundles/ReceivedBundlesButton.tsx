import React, { useEffect, useState } from 'react';
import {
  Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography,
} from '@mui/material';
import { Inbox } from 'lucide-react';
import {
  dismissBundle, inboxSize, receivedBundles, subscribeInbox, type ReceivedBundle,
} from '../../../services/intel/bundles/bundleInbox';
import type { OpenedBundle } from '../../../services/exchange/bundle';
import KeyName from '../../Identity/KeyName';
import UtcTime from '../../Shared/UtcTime';
import ImportBundleDialog from './ImportBundleDialog';

/**
 * "Received" (plan item 2.4): bundles teammates sent over the relays. The
 * count is of sealed messages waiting, known without opening any; opening
 * them (an extension may ask) says, bundle by bundle, what arrived, and hands
 * a whole one to the same import preview as a file.
 */
const ReceivedBundlesButton: React.FC<{ onOpen?: (subject: OpenedBundle['subject']) => void; onImported?: () => void }> = ({ onOpen, onImported }) => {
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<{ bundles: ReceivedBundle[]; unreadable: string[] } | null>(null);
  const [importing, setImporting] = useState<Extract<ReceivedBundle, { state: 'ready' }> | null>(null);

  useEffect(() => {
    let live = true;
    const count = () => { void inboxSize().then((n) => { if (live) setWaiting(n); }); };
    count();
    const stop = subscribeInbox(count);
    return () => { live = false; stop(); };
  }, []);

  const load = async () => {
    setLoading(true);
    try { setList(await receivedBundles()); } finally { setLoading(false); }
  };

  const remove = async (bundle: ReceivedBundle) => { await dismissBundle(bundle); await load(); };

  return (
    <>
      <Badge color="primary" badgeContent={waiting} invisible={waiting === 0}>
        <Button variant="outlined" startIcon={<Inbox size={16} />} onClick={() => { setOpen(true); void load(); }} data-testid="received-bundles">
          Received
        </Button>
      </Badge>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth data-testid="received-bundles-dialog">
        <DialogTitle>Received</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {loading && <LinearProgress />}
            {list && list.bundles.length === 0 && list.unreadable.length === 0 && (
              <Typography variant="body2" color="text.secondary">Nothing has been sent to you yet.</Typography>
            )}
            {list?.bundles.map((b) => (
              <Box key={b.bundleId} data-testid={`received-${b.state}`} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: '1 1 16rem', minWidth: 0 }}>
                  {b.state === 'ready' ? (
                    <Typography variant="body2">
                      {b.bundle.subject.number && <code>{b.bundle.subject.number}</code>} {b.bundle.subject.title}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {b.state === 'waiting' ? `Still arriving: ${b.have} of ${b.of} parts.` : b.reason}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" component="div">
                    From <KeyName pubkey={b.sender} hint={b.state === 'ready' ? b.bundle.fromName : undefined} />
                    {b.state === 'ready' && <>, <UtcTime at={Date.parse(b.bundle.madeAt)} year /></>}
                  </Typography>
                </Box>
                {b.state === 'ready' && <Button size="small" variant="contained" onClick={() => setImporting(b)}>Open</Button>}
                {b.state !== 'waiting' && <Button size="small" onClick={() => void remove(b)}>Remove</Button>}
              </Box>
            ))}
            {list && list.unreadable.length > 0 && (
              <Alert severity="warning">
                {list.unreadable.length} sealed message{list.unreadable.length === 1 ? '' : 's'} could not be opened: {[...new Set(list.unreadable)].join(' ')}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      {importing && (
        <ImportBundleDialog
          open
          initial={importing.bundle}
          onClose={() => { setImporting(null); void load(); }}
          onImported={() => { void dismissBundle(importing); onImported?.(); }}
          onOpen={(subject) => { setImporting(null); setOpen(false); onOpen?.(subject); }}
        />
      )}
    </>
  );
};

export default ReceivedBundlesButton;
