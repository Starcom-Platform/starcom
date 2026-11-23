import React, { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { makeAccessRequest } from '../../../services/team/accessRequest';
import { checkMembership, type MembershipResult } from '../../../services/team/joinTeam';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';

/**
 * Asking to join a team without an invite (plan item 2.3, step 5).
 *
 * The request is text signed by this person's key, carrying the relay and a
 * note, for them to send to an admin however they already talk; nothing is
 * sent from here. Once the admin allows it, "Am I in yet?" reads the relay's
 * signed member list and keeps the relay as joined only when it names them.
 */
const AccessRequestForm: React.FC = () => {
  const [relay, setRelay] = useState('');
  const [note, setNote] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [membership, setMembership] = useState<MembershipResult | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    setMembership(null);
    try {
      setText(await makeAccessRequest({ relay: relay.trim(), note: note.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await checkMembership(relay.trim());
      if (outcome.joined) {
        await realTimeTeamService.recordJoinedTeam({
          name: outcome.team, relayUrl: relay.trim(), relayPubkey: outcome.relayPubkey,
          memberPubkey: nostrIdentityService.signerPubkey() ?? '',
        });
      }
      setMembership(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const edit = (set: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setText(null);
    setMembership(null);
  };

  return (
    <Stack spacing={2} data-testid="access-request-form">
      <Typography variant="body2" color="text.secondary">
        Without an invite, ask the team&apos;s admin to let your key in. This makes a request signed
        by you. Send it to them however you already talk; nothing is sent from here.
      </Typography>
      <TextField label="Relay address" placeholder="Starts with wss://" value={relay} onChange={edit(setRelay)} size="small" fullWidth required />
      <TextField
        label="Note"
        helperText="Something the admin will recognise, such as your intake reference."
        value={note}
        onChange={edit(setNote)}
        size="small"
        fullWidth
      />
      <Button variant="contained" onClick={() => void make()} disabled={busy || !relay.trim()}>Make the request</Button>
      {text && (
        <>
          <TextField label="Your request" value={text} InputProps={{ readOnly: true }} size="small" fullWidth multiline minRows={3} />
          <Button
            variant="outlined"
            onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setError('Could not copy it: select the request and copy it.')); }}
          >
            {copied ? 'Copied' : 'Copy request'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            It shows your key and your note to whoever reads it. Once the admin has allowed it, check here.
          </Typography>
          <Button variant="outlined" onClick={() => void check()} disabled={busy}>Am I in yet?</Button>
        </>
      )}
      {membership && (
        <Alert severity={membership.joined ? 'success' : 'info'} data-testid="membership">
          {'reason' in membership
            ? membership.reason
            : `You are in ${membership.team}: its relay is kept as joined, and Your key lists it.`}
        </Alert>
      )}
      {error && <Alert severity="error" role="alert">{error}</Alert>}
    </Stack>
  );
};

export default AccessRequestForm;
