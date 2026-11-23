import React from 'react';
import { Typography } from '@mui/material';
import KeyName from '../../Identity/KeyName';
import UtcTime from '../../Shared/UtcTime';
import type { ReceivedFrom } from '../../../types/intel/IntelCaseUI';
import { counted, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';

/**
 * "From <name>, <date>" on a record that arrived in a bundle (plan item 2.4):
 * the key that signed the bundle, and when they made it. Nothing for a record
 * made here. A case or mission also says how many records it cites that its
 * sender kept Private, and did not send (plan item 9.13).
 */
const ReceivedFromLine: React.FC<{ receivedFrom: ReceivedFrom | undefined }> = ({ receivedFrom }) => {
  const { m: { bundles: t } } = useMessages();
  if (!receivedFrom) return null;
  const kept = receivedFrom.withheld?.length ?? 0;
  // The count chosen first, its {who} and {when} kept for the elements that fill them.
  const words = kept > 0 ? counted(t.receivedFromWithheld, kept, { who: '{who}', when: '{when}' }) : t.receivedFrom;
  return (
    <Typography variant="caption" color="text.secondary" component="div" data-testid="received-from">
      {fillNodes(words, { who: <KeyName pubkey={receivedFrom.pubkey} />, when: <UtcTime at={Date.parse(receivedFrom.sentAt)} year /> })}
    </Typography>
  );
};

export default ReceivedFromLine;
