import React, { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { publishOutbox, MAX_ATTEMPTS } from '../../../services/intel/outbox/PublishOutbox';
import type { OutboxRecord } from '../../../services/intel/outbox/OutboxTypes';

/**
 * Findings waiting to be sent, each one withdrawable (plan item 0.2).
 *
 * A finding that reached no relay is queued, and the queue drains by itself
 * (startOutboxDrain). Nothing showed the queue, so a finding published days
 * earlier could go out with no one watching. One that used up its tries left the
 * list, though it was never sent (plan item 9.4): it stays, to try again or let
 * go. Shown only while something is waiting or was given up on.
 */
function describeRecord(record: OutboxRecord): string {
  const content = record.payload.content as {
    claim?: { entityRef?: string; subjectRef?: string; attribute?: string };
    retracts?: { subjectRef?: string; attribute?: string };
  };
  const subject = content.claim?.entityRef ?? content.claim?.subjectRef ?? content.retracts?.subjectRef ?? 'A finding';
  const attribute = content.claim?.attribute ?? content.retracts?.attribute;
  const label = attribute ? `${subject} — ${attribute}` : subject;
  return content.retracts ? `Retraction of ${label}` : label;
}

const FindingsOutboxStatus: React.FC = () => {
  const [waiting, setWaiting] = useState<OutboxRecord[]>([]);
  const [givenUp, setGivenUp] = useState<OutboxRecord[]>([]);

  useEffect(() => {
    let live = true;
    const load = () => {
      publishOutbox.pending()
        .then((records) => { if (live) setWaiting(records); })
        .catch(() => { if (live) setWaiting([]); });
      publishOutbox.abandoned()
        .then((records) => { if (live) setGivenUp(records); })
        .catch(() => { if (live) setGivenUp([]); });
    };
    load();
    const stop = publishOutbox.onChange(load);
    return () => { live = false; stop(); };
  }, []);

  if (waiting.length === 0 && givenUp.length === 0) return null;

  return (
    <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} data-testid="outbox-waiting">
      {givenUp.length > 0 && (
        <Box sx={{ mb: waiting.length > 0 ? 1.5 : 0 }} data-testid="outbox-given-up">
          <Typography variant="subtitle2" component="h2" sx={{ color: '#ff6b6b' }}>
            Not sent ({givenUp.length})
          </Typography>
          <Typography variant="caption" component="p" sx={{ mb: 1, color: 'rgba(255,255,255,0.6)' }}>
            No relay took these, and they are no longer tried by themselves. Try again, or let them go.
          </Typography>
          <Stack spacing={0.5}>
            {givenUp.map((record) => {
              const label = describeRecord(record);
              return (
                <Stack key={record.id} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap title={label}>{label}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                      {`Gave up after ${record.attempts || MAX_ATTEMPTS} tries: ${record.lastError ?? 'no relay accepted it'}`}
                    </Typography>
                  </Box>
                  <Button size="small" aria-label={`Try again to send ${label}`} onClick={() => { void publishOutbox.retry(record.id); }}>
                    Try again
                  </Button>
                  <Button size="small" aria-label={`Cancel sending ${label}`} onClick={() => { void publishOutbox.cancel(record.id); }}>
                    Cancel
                  </Button>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}
      {waiting.length > 0 && (<>
      <Typography variant="subtitle2" component="h2" sx={{ color: '#f0c674' }}>
        Waiting to send ({waiting.length})
      </Typography>
      {/* Explicit colours, as the rest of this rail uses. */}
      <Typography variant="caption" component="p" sx={{ mb: 1, color: 'rgba(255,255,255,0.6)' }}>
        These reached no relay. They are tried again when the app starts, when the connection
        returns, and every few minutes. The wait grows the longer it fails. Cancel any you no
        longer want sent.
      </Typography>
      <Stack spacing={0.5}>
        {waiting.map((record) => {
          const label = describeRecord(record);
          return (
            <Stack key={record.id} direction="row" alignItems="center" spacing={1}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap title={label}>{label}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  {record.attempts === 0 ? 'Not tried again yet' : `Tried ${record.attempts} times: ${record.lastError ?? 'no relay accepted it'}`}
                </Typography>
              </Box>
              <Button size="small" aria-label={`Cancel sending ${label}`} onClick={() => { void publishOutbox.cancel(record.id); }}>
                Cancel
              </Button>
            </Stack>
          );
        })}
      </Stack>
      </>)}
    </Box>
  );
};

export default FindingsOutboxStatus;
