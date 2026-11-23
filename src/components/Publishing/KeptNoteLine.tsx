/**
 * One note kept because no relay took it (W1, W1b), on the screen that sent it: that it waits, or that it was given
 * up on after ten tries and why; Try again for that, and Cancel sending for either. The report panel draws its
 * own, in its own style, from the same words.
 */
import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { eventOutbox, type WaitingEvent } from '../../services/intel/outbox/EventOutbox';
import { cancelKept } from '../../services/intel/outbox/keptNotes';
import { fill, useMessages } from '../../i18n/app/i18n';

export const KeptNoteLine: React.FC<{ record: WaitingEvent; waiting: string; testId: string }> = ({ record, waiting, testId }) => {
  const { m: { kept: t } } = useMessages();
  const givenUp = record.status === 'abandoned';
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid={testId}>
      <Typography variant="caption" color={givenUp ? 'error.main' : 'warning.main'}>
        {givenUp ? fill(t.givenUp, { n: record.attempts, reason: record.lastError ?? '' }) : waiting}
      </Typography>
      {givenUp && <Button size="small" onClick={() => { void eventOutbox.retry(record.id); }}>{t.tryAgain}</Button>}
      <Button size="small" onClick={() => { void cancelKept(record); }}>{t.cancelSending}</Button>
    </Stack>
  );
};

export default KeptNoteLine;
