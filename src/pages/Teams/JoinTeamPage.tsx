import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Alert, Box, Button, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { readInviteLink } from '../../services/team/inviteLink';
import { joinTeam, type JoinResult, type JoinStep } from '../../services/team/joinTeam';
import { realTimeTeamService } from '../../services/RealTimeTeamService';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import KeyName from '../../components/Identity/KeyName';
import UtcTime from '../../components/Shared/UtcTime';
import { appPath } from '../../routes/appPath';

/**
 * Where an invite link lands: /join?r=<relay>&c=<claim>&… (plan item 2.3).
 *
 * The invite's route, /join-team, did not exist. This page reads the link,
 * says who invited the person to which team on which relay, and joins only
 * when they ask, because joining signs them in to that relay as their key,
 * which tells it who they are.
 */
const STEPS: Array<{ step: JoinStep; words: string }> = [
  { step: 'checking', words: "Reading the relay's description of itself" },
  { step: 'signing-in', words: 'Signing in as you' },
  { step: 'requesting', words: 'Asking to join, with the invite' },
  { step: 'confirming', words: "Finding you on the relay's member list" },
];

const JoinTeamPage: React.FC = () => {
  const { search } = useLocation();
  const read = useMemo(() => readInviteLink(new URLSearchParams(search)), [search]);
  const [step, setStep] = useState<JoinStep | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [busy, setBusy] = useState(false);

  if ('refused' in read) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 8, px: 2 }} data-testid="join-team">
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" component="h1" gutterBottom>This invite cannot be used</Typography>
          <Alert severity="error" role="alert">{read.refused}</Alert>
        </Paper>
      </Box>
    );
  }
  const { invite } = read;

  const join = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await joinTeam(invite, setStep);
    if (outcome.joined) {
      await realTimeTeamService.recordJoinedTeam({
        name: invite.team, relayUrl: invite.relay, relayPubkey: invite.relayPubkey,
        memberPubkey: nostrIdentityService.signerPubkey() ?? '',
      });
    }
    setResult(outcome);
    setBusy(false);
  };

  const reached = step ? STEPS.findIndex((s) => s.step === step) : -1;
  const failed = result && 'reason' in result ? result : null;

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 8, px: 2 }} data-testid="join-team">
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>Join {invite.team}</Typography>
        <Typography variant="body1" gutterBottom>
          <KeyName pubkey={invite.inviter} /> invited you to {invite.team}, on <code>{invite.relay}</code>,{' '}
          <UtcTime at={invite.issuedAt * 1000} year />.
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Joining signs you in to that relay with your key, so it knows who you are. It then asks
          the relay to accept the invite. Whoever runs the relay decides; nothing else is sent.
        </Typography>

        {step && (
          <List dense>
            {STEPS.map((s, i) => (
              <ListItem key={s.step} disableGutters>
                <ListItemText
                  primary={`${i < reached || result?.joined ? '✓' : i === reached ? '…' : '·'} ${s.words}`}
                  primaryTypographyProps={{ color: i <= reached ? 'text.primary' : 'text.secondary' }}
                />
              </ListItem>
            ))}
          </List>
        )}

        {result?.joined && (
          <Alert severity="success" data-testid="join-result" sx={{ my: 2 }}>
            You are a member of {invite.team}.
            {!result.confirmed && ' The relay accepted you but publishes no member list, so this is not confirmed.'}{' '}
            <RouterLink to={appPath('teamworkspace')}>Open Missions</RouterLink>
          </Alert>
        )}
        {failed && (
          <Alert severity="error" role="alert" sx={{ my: 2 }}>
            Joining stopped at “{STEPS.find((s) => s.step === failed.step)?.words}”: {failed.reason}
          </Alert>
        )}

        {!result?.joined && (
          <Button variant="contained" onClick={() => void join()} disabled={busy}>
            {`Join ${invite.team}`}
          </Button>
        )}
      </Paper>
    </Box>
  );
};

export default JoinTeamPage;
