import React, { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { makeInviteLink } from '../../../services/team/inviteLink';
import { readRelayInfo } from '../../../services/nostr/relayInfo';
import { createClaim } from '../../../services/team/relayManagement';
import type { CyberTeam } from '../../../types/cyberInvestigation';

/**
 * An invite to a team, as a link (plan item 2.3, step 3): the team's relay,
 * the claim the relay will accept, the relay's own key and the team, signed
 * by whoever invites. Flotilla reads the same `?r=&c=` link.
 *
 * The claim is the relay's own invite code. Whoever runs the relay creates it;
 * a relay that takes management calls (NIP-86) creates one here, when the
 * person inviting may manage it (step 5).
 */
const InviteLinkForm: React.FC<{ team: CyberTeam }> = ({ team }) => {
  const [claim, setClaim] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [managed, setManaged] = useState(false);

  useEffect(() => {
    if (!team.relayUrl) return;
    let live = true;
    // Unread or unreachable, the claim can still be pasted in.
    readRelayInfo(team.relayUrl).then((info) => { if (live) setManaged(info.management); }).catch(() => {});
    return () => { live = false; };
  }, [team.relayUrl]);

  if (!team.relayUrl || !team.relayPubkey) {
    return (
      <Typography variant="body2" color="text.secondary">
        {team.name} has no relay, so there is nowhere to invite anyone to. A team made with its
        relay can be invited to.
      </Typography>
    );
  }

  const make = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setLink(await makeInviteLink({ relay: team.relayUrl!, claim: claim.trim(), relayPubkey: team.relayPubkey!, team: team.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const claimOnRelay = async () => {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      setClaim(await createClaim(team.relayUrl!));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} data-testid="invite-link-form">
      <TextField
        label="Claim"
        helperText="The invite code the relay will accept. Whoever runs the relay creates it."
        value={claim}
        onChange={(e) => { setClaim(e.target.value); setLink(null); }}
        size="small"
        fullWidth
      />
      {managed && (
        <Button variant="outlined" onClick={() => void claimOnRelay()} disabled={busy}>Create one on the relay</Button>
      )}
      <Button variant="contained" onClick={() => void make()} disabled={busy || !claim.trim()}>Make invite link</Button>
      {link && (
        <>
          <TextField label="Invite link" value={link} InputProps={{ readOnly: true }} size="small" fullWidth />
          <Typography variant="caption" color="text.secondary">
            Signed by you. Whoever opens it sees who invited them, and joins only if the relay accepts the claim.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => { void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setError('Could not copy it: select the link and copy it.')); }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </>
      )}
      {error && <Alert severity="error" role="alert">{error}</Alert>}
    </Stack>
  );
};

export default InviteLinkForm;
