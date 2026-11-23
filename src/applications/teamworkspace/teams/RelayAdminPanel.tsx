import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Divider, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { readRelayInfo } from '../../../services/nostr/relayInfo';
import {
  listMembers, allowMember, removeMember, banMember,
  listClaims, createClaim, revokeClaim, revokeEveryone, relayManagers,
} from '../../../services/team/relayManagement';
import { readAccessRequest } from '../../../services/team/accessRequest';
import { relayAddress } from '../../../services/nostr/joinedRelays';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
// Whoever the relay removes leaves the roster kept here too (plan item 9.8).
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import KeyName from '../../../components/Identity/KeyName';
import UtcTime from '../../../components/Shared/UtcTime';
import type { CyberTeam } from '../../../types/cyberInvestigation';

type Member = { pubkey: string; reason?: string };

/**
 * A team's relay, managed from the Missions app's Admin tab (plan item 2.3, step 5): who is let
 * in, the claims invites carry, and access requests pasted in by an admin.
 *
 * Every call is NIP-86, signed with NIP-98 as this person's signer. The relay
 * decides whether that key may manage it, and holds the lists; nothing is
 * kept here. A relay that takes no management calls is said to be one, since
 * its members are then added wherever it is run.
 */
const RelayAdminPanel: React.FC<{ team: CyberTeam }> = ({ team }) => {
  const relay = team.relayUrl!;
  const [managed, setManaged] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [claims, setClaims] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [banning, setBanning] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  // Who manages the relay, read when "Revoke everyone…" is pressed: undefined while reading, null when it does not say.
  const [managers, setManagers] = useState<string[] | null | undefined>(undefined);
  const [pasted, setPasted] = useState('');

  const run = useCallback(async (work: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const said = await work();
      if (said) setDone(said);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const [m, c] = await Promise.all([listMembers(relay), listClaims(relay)]);
    setMembers(m ?? []);
    setClaims(c ?? []);
  }, [relay]);

  useEffect(() => {
    let live = true;
    readRelayInfo(relay)
      .then((info) => {
        if (!live) return;
        setManaged(info.management);
        if (info.management) void run(refresh);
      })
      .catch((e) => { if (live) { setManaged(false); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, [relay, refresh, run]);

  if (managed === null) {
    return (
      <Box data-testid="relay-admin">
        <Typography variant="subtitle1">{team.name}</Typography>
        <Typography variant="body2" color="text.secondary">Asking <code>{relay}</code> what it takes…</Typography>
        <LinearProgress sx={{ mt: 1 }} />
      </Box>
    );
  }

  if (!managed) {
    return (
      <Box data-testid="relay-admin">
        <Typography variant="subtitle1">{team.name}</Typography>
        {error ? <Alert severity="error" role="alert">{error}</Alert> : (
          <Typography variant="body2" color="text.secondary" data-testid="relay-unmanaged">
            <code>{relay}</code> takes no management calls (NIP-86), so it cannot be managed from
            Starcom: whoever runs it adds and removes members there.
          </Typography>
        )}
      </Box>
    );
  }

  const read = pasted.trim() ? readAccessRequest(pasted) : null;
  const request = read && 'request' in read ? read.request : null;
  const forThisRelay = request !== null && relayAddress(request.relay) === relayAddress(relay);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <Stack spacing={2} data-testid="relay-admin">
      <Box>
        <Typography variant="subtitle1">{team.name}</Typography>
        <Typography variant="caption" color="text.secondary"><code>{relay}</code></Typography>
      </Box>
      {busy && <LinearProgress />}

      <Box>
        <Typography variant="subtitle2" gutterBottom>Members</Typography>
        {members.length === 0 && <Typography variant="body2" color="text.secondary">Nobody is allowed in yet.</Typography>}
        <Stack spacing={1}>
          {members.map((m) => (
            <Box key={m.pubkey} data-testid={`relay-member-${m.pubkey}`} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Box sx={{ flex: '1 1 12rem', minWidth: 0 }}>
                <KeyName pubkey={m.pubkey} showKey />
                {m.reason && <Typography variant="caption" color="text.secondary" component="div">{m.reason}</Typography>}
              </Box>
              {banning === m.pubkey ? (
                <>
                  <Typography variant="caption">A ban keeps them out even with a claim.</Typography>
                  <Button size="small" color="error" variant="contained" disabled={busy}
                    onClick={() => { setBanning(null); void run(async () => { await banMember(relay, m.pubkey); await realTimeTeamService.removeMemberByKey(team.id, m.pubkey); await refresh(); return 'Banned.'; }); }}>
                    Yes, ban
                  </Button>
                  <Button size="small" onClick={() => setBanning(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button size="small" variant="outlined" disabled={busy}
                    onClick={() => void run(async () => { await removeMember(relay, m.pubkey); await realTimeTeamService.removeMemberByKey(team.id, m.pubkey); await refresh(); return 'Removed.'; })}>
                    Remove
                  </Button>
                  <Button size="small" color="error" disabled={busy} onClick={() => setBanning(m.pubkey)}>Ban</Button>
                </>
              )}
            </Box>
          ))}
        </Stack>
      </Box>

      <Divider />
      <Box>
        <Typography variant="subtitle2" gutterBottom>Approve an access request</Typography>
        <TextField
          label="Access request"
          helperText="Paste what the person sent you. Its signature shows which key asked."
          value={pasted}
          onChange={(e) => { setPasted(e.target.value); setDone(null); }}
          size="small"
          fullWidth
          multiline
          minRows={2}
        />
        {read && 'refused' in read && <Alert severity="error" role="alert" sx={{ mt: 1 }}>{read.refused}</Alert>}
        {request && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" data-testid="access-request-read">
              <KeyName pubkey={request.requester} showKey /> asks to join <code>{request.relay}</code>
              {request.note && <>: &ldquo;{request.note}&rdquo;</>}, <UtcTime at={request.issuedAt * 1000} year />.
              {!forThisRelay && <> This request is for {request.relay}, not this team&apos;s relay.</>}
            </Typography>
            {forThisRelay && (
              <Button sx={{ mt: 1 }} variant="contained" size="small" disabled={busy}
                onClick={() => void run(async () => {
                  await allowMember(relay, request.requester, request.note || undefined);
                  setPasted('');
                  await refresh();
                  return 'Allowed. They can now press "Am I in yet?".';
                })}>
                Allow
              </Button>
            )}
          </Box>
        )}
      </Box>

      <Divider />
      <Box>
        <Typography variant="subtitle2" gutterBottom>Claims</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          Invite codes the relay accepts. An invite link carries one; revoke it and the link stops working.
        </Typography>
        <Stack spacing={1}>
          {claims.map((c) => (
            <Box key={c} data-testid={`relay-claim-${c}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <code style={{ flex: 1, overflowWrap: 'anywhere' }}>{c}</code>
              <Button size="small" variant="outlined" disabled={busy}
                onClick={() => void run(async () => { await revokeClaim(relay, c); await refresh(); return 'Revoked.'; })}>
                Revoke
              </Button>
            </Box>
          ))}
        </Stack>
        <Button sx={{ mt: 1 }} size="small" variant="outlined" disabled={busy}
          onClick={() => void run(async () => { const c = await createClaim(relay); await refresh(); return `Created ${c}.`; })}>
          Create a claim
        </Button>
      </Box>

      <Divider />
      <Box>
        {revokingAll ? (
          <Stack spacing={1} alignItems="flex-start">
            <Typography variant="body2">
              Every member is removed and every claim revoked, as at the end of a cohort.
              Their work stays; only their way in goes.
            </Typography>
            {/* Who stays is said before anyone goes (decision R4): "keep only me" removed the other admin. */}
            <Typography variant="body2" component="div" data-testid="revoke-keeps">
              {managers === undefined && 'Reading who manages the relay…'}
              {managers === null && 'The relay does not say who else manages it, so only you are kept. Allow again anyone who should stay.'}
              {managers && (
                <>
                  Kept: you, and those who manage the relay:{' '}
                  {managers.map((k, i) => <React.Fragment key={k}>{i > 0 && ', '}<KeyName pubkey={k} /></React.Fragment>)}.
                </>
              )}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button color="error" variant="contained" size="small" disabled={busy || managers === undefined}
                onClick={() => { setRevokingAll(false); void run(async () => {
                  const me = await nostrIdentityService.ensureSigner('revoking everyone on a relay');
                  const { removed, claimsRevoked } = await revokeEveryone(relay, { keep: [...new Set([me, ...(managers ?? [])])] });
                  await refresh();
                  return `Removed ${plural(removed, 'member')} and revoked ${plural(claimsRevoked, 'claim')}.`;
                }); }}>
                Yes, revoke every member and claim
              </Button>
              <Button size="small" onClick={() => setRevokingAll(false)}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <Button color="error" size="small" disabled={busy} onClick={() => {
            setRevokingAll(true);
            setManagers(undefined);
            relayManagers(relay).then(setManagers, () => setManagers(null));
          }}>Revoke everyone…</Button>
        )}
      </Box>

      {done && <Alert severity="success" data-testid="relay-admin-done">{done}</Alert>}
      {error && <Alert severity="error" role="alert">{error}</Alert>}
    </Stack>
  );
};

export default RelayAdminPanel;
