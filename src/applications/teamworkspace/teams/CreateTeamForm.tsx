import React, { useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import HighlightOff from '@mui/icons-material/HighlightOff';
import HelpOutline from '@mui/icons-material/HelpOutline';
import { checkRelayConformance, whyNotTrusted, type ConformanceReport, type Outcome } from '../../../services/nostr/relayConformance';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { joinRelay } from '../../../services/nostr/joinedRelays';
import type { CyberTeam } from '../../../types/cyberInvestigation';
import WhatIs from '../../../components/Help/WhatIs';

/**
 * Create a team, with the relay it will use (plan item 2.3, step 2).
 *
 * A team was a name and nothing else, so an invite had nowhere to point. It
 * now carries its relay and the relay's own key, read from the relay's
 * description of itself (NIP-11) before the team is made: that key is what
 * signs the relay's member list, and so what confirms who joined.
 *
 * The relay is also checked before Starcom uses it for a team (plan item
 * 2.3a): a team's Limited work goes there, so a relay that lets anyone read
 * would publish it. Each check is shown with what the relay said, and a team
 * is made only on a relay where every one holds; "could not tell" is not a pass.
 */

const MARK: Record<Outcome, { icon: React.ReactNode; label: string }> = {
  holds: { icon: <CheckCircleOutline fontSize="inherit" color="success" />, label: 'Holds' },
  fails: { icon: <HighlightOff fontSize="inherit" color="error" />, label: 'Does not hold' },
  unknown: { icon: <HelpOutline fontSize="inherit" color="warning" />, label: 'Could not tell' },
};

/** Every check, with what it means and what the relay said. */
const RelayChecks: React.FC<{ report: ConformanceReport }> = ({ report }) => (
  <Box data-testid="relay-checks">
    <Typography variant="body2" sx={{ mb: 0.5 }}>
      {report.keepsItToMembers ? 'It keeps what a team sends it to the team:' : 'What the check found:'}
    </Typography>
    <Stack spacing={0.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {report.results.map((r) => (
        <Stack key={r.check} component="li" direction="row" spacing={1} alignItems="flex-start" data-testid={`relay-check-${r.check}`} data-outcome={r.outcome}>
          <Box component="span" aria-label={MARK[r.outcome].label} role="img" sx={{ lineHeight: 1, pt: '2px' }}>{MARK[r.outcome].icon}</Box>
          <Typography variant="body2" component="span">
            {r.says}
            {r.relaySaid && <Typography variant="caption" color="text.secondary" component="span" display="block">The relay said: “{r.relaySaid}”</Typography>}
          </Typography>
        </Stack>
      ))}
    </Stack>
  </Box>
);

const CreateTeamForm: React.FC<{ onCreated: (team: CyberTeam) => void }> = ({ onCreated }) => {
  const [name, setName] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [report, setReport] = useState<ConformanceReport | null>(null);
  const info = report?.info ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setError(null);
    setReport(null);
    // Said first: without a scheme the relay "did not answer", which sent people looking at the relay.
    if (!/^wss?:\/\//i.test(relayUrl.trim())) {
      setError('A relay address starts with wss://, as in wss://crew.cosmiccodex.app.');
      return;
    }
    setBusy(true);
    try {
      setReport(await checkRelayConformance(relayUrl.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!info?.relayPubkey) return;
    setBusy(true);
    setError(null);
    try {
      // Whoever creates the team signs as its lead: the signer, extension first (plan item 2.2).
      const lead = await nostrIdentityService.ensureSigner('creating a team');
      const team = await realTimeTeamService.createTeam(
        { name: name.trim(), relayUrl: relayUrl.trim(), relayPubkey: info.relayPubkey },
        lead,
        lead,
      );
      // The person who makes a team on a relay has joined it: they sign in
      // there, and what teammates send them arrives there.
      joinRelay({ url: relayUrl.trim(), relayPubkey: info.relayPubkey, team: team.name });
      onCreated(team);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = name.trim() !== '' && report?.keepsItToMembers === true && info?.relayPubkey !== undefined && report.url === relayUrl.trim();
  const refused = report ? whyNotTrusted(report) : null;

  return (
    <Stack spacing={2} data-testid="create-team-form">
      <TextField label="Team name" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth required />
      <TextField
        label="Relay address"
        placeholder="Starts with wss://"
        helperText={<>The team's relay: where its members sign in and its Limited work goes. <WhatIs term="relay" /></>}
        value={relayUrl}
        onChange={(e) => { setRelayUrl(e.target.value); setReport(null); }}
        size="small"
        fullWidth
        required
      />
      <Button variant="outlined" onClick={() => void check()} disabled={busy || !relayUrl.trim()}>
        {/* Two connections and a few answers: seconds, not a moment. */}
        {busy && !report ? 'Checking the relay…' : 'Check the relay'}
      </Button>
      {info && (
        <Typography variant="body2" data-testid="relay-described">
          {info.name ?? info.url}:{' '}
          {info.accessRequests ? 'takes access requests, so invites can join it' : 'takes no access requests: members are added by whoever runs it'}
          {info.signIn ? '; asks who is signing in' : '; does not ask who is signing in'}
          {info.management ? '; can be managed from Starcom.' : '.'}
          {!info.relayPubkey && ' It does not state its own key, so membership cannot be confirmed with it.'}
        </Typography>
      )}
      {report && <RelayChecks report={report} />}
      {refused && <Alert severity="warning" role="alert">{refused}</Alert>}
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      <Button variant="contained" onClick={() => void create()} disabled={busy || !ready}>Create team</Button>
    </Stack>
  );
};

export default CreateTeamForm;
