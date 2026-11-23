/**
 * The returns sealed to this person on an adventure they called (RS41; the owner's "same path" of 2026-10-23, after
 * MX32): each one's seen or not, its counts, its day and its sender's callsign. A caller who names no inbox is told
 * that no return can reach them yet, and offered to post it.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { reportsOn, subscribeReceivedReports, type ReceivedReport } from '../../../services/intel/received/receivedReports';
import { inboxRelays } from '../../../services/nostr/inboxRelays';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { keyLabel } from '../../../services/identity/names';
import { reviewInboxList } from '../../../services/publishing/reportLabels';
import { keptInboxOf, useKeptNotes } from '../../../services/intel/outbox/keptNotes';
import KeptNoteLine from '../../../components/Publishing/KeptNoteLine';
import { useMessages } from '../../../i18n/app/i18n';

export const AdventureReturns: React.FC<{ address: string }> = ({ address }) => {
  const [returns, setReturns] = useState<ReceivedReport[]>(() => reportsOn(address));
  useEffect(() => {
    setReturns(reportsOn(address));
    return subscribeReceivedReports(() => setReturns(reportsOn(address)));
  }, [address]);
  const me = nostrIdentityService.signerPubkey();
  const [hasInbox, setHasInbox] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    if (me) void inboxRelays(me).then((r) => { if (live) setHasInbox(r.length > 0); });
    return () => { live = false; };
  }, [me]);
  const [notice, setNotice] = useState<string | null>(null);
  // The inbox list, when no relay took it and it waits on this device (W1b).
  const keptInbox = keptInboxOf(useKeptNotes(), me);
  const { m } = useMessages();
  const seen = returns.filter((r) => r.seen).length;

  return (
    <Box data-testid="adventure-returns" sx={{ mt: 1 }}>
      <Typography variant="subtitle2">{`Returns (${returns.length}: ${seen} seen it)`}</Typography>
      {hasInbox === false && keptInbox && <KeptNoteLine record={keptInbox} waiting={m.kept.inboxWaits} testId="adventure-returns-inbox-kept" />}
      {hasInbox === false && !keptInbox && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="adventure-returns-no-inbox">
          <Typography variant="caption" color="warning.main">Returns cannot reach you yet: you name no inbox for sealed messages.</Typography>
          <Button size="small" variant="outlined" onClick={() => {
            setNotice(null);
            void reviewInboxList().then((o) => {
              if (o.status === 'sent' && !o.result.kept) setHasInbox(true);
              else if (o.status === 'refused') setNotice(`Not sent: ${o.reason}`);
            }, (e) => setNotice(`Not sent: ${e instanceof Error ? e.message : String(e)}`));
          }}>Post your inbox</Button>
        </Stack>
      )}
      {returns.length === 0 ? (
        <Typography variant="caption" color="text.secondary" component="div">No return has reached you yet.</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {returns.map((r) => (
            <Typography key={r.id} component="li" variant="body2" data-testid="adventure-return">
              {[r.seen ? 'Seen it' : 'Not seen', ...r.counts.map((c) => `${c.line} ${c.n}`), `${r.day}, from ${r.callsign || keyLabel(r.from)}`].join(' · ')}
            </Typography>
          ))}
        </Box>
      )}
      {notice && <Typography variant="caption" color="warning.main" component="div">{notice}</Typography>}
    </Box>
  );
};

export default AdventureReturns;
