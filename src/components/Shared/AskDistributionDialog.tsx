import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import DistributionChoice from './DistributionChoice';
import type { Distributed } from './DistributionChip';
import { useMessages } from '../../i18n/app/i18n';

/**
 * "Choose first", before a record nobody has decided on leaves as a file
 * (plan items 9.13 and 9.13b): why it is asked, and the same choice the
 * record's own form offers, with nothing chosen in advance.
 */
const AskDistributionDialog: React.FC<{
  open: boolean;
  title: string;
  /** "this case", "this report". */
  what: Distributed;
  /** Why it is asked. */
  reason: string;
  onChoose: (visibility: InformationVisibility) => void;
  onCancel: () => void;
  busy?: boolean;
  lockedBecause?: string | null;
  testId: string;
}> = ({ open, title, what, reason, onChoose, onCancel, busy, lockedBecause, testId }) => {
  const { m: { shared: t } } = useMessages();
  return (
  <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <Stack spacing={1} sx={{ mt: 1 }} data-testid={testId}>
        <Typography variant="body2">{reason}</Typography>
        <DistributionChoice
          what={what}
          value={undefined}
          onChange={onChoose}
          disabled={busy}
          lockedBecause={lockedBecause}
          testId={`${testId}-distribution`}
        />
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>{t.cancel}</Button>
    </DialogActions>
  </Dialog>
  );
};

export default AskDistributionDialog;
