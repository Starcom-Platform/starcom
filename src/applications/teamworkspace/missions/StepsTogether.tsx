/**
 * A mission a team works together (decision D-RS, RS15; the owner's RS55–RS57, 2026-10-18). A person who took a
 * mission may work it with a team whose relay they have joined; each step is then taken so no two do it twice,
 * released, marked done, and checked by someone other than the one who did it, each through the publish review to
 * the team's relay only, so only its members see who took what. A take frees itself after 24 hours. Alone, steps
 * stay one's own checklist and nothing is posted.
 */
import React, { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import KeyName from '../../../components/Identity/KeyName';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { isJoinedRelay } from '../../../services/nostr/joinedRelays';
import { takenMissions, type TakenMission, type TakenStep } from '../../../services/intel/received/takenMissions';
import type { StepLabelValue, StepState } from '../../../services/roster/stepLabels';
import { reviewStepLabel } from '../../../services/publishing/stepPosts';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import { utcDateTimeIn } from '../../../i18n/app/dates';

/** Work it with a team, chosen from those whose relay is joined here, or alone again. */
export const WorkTogether: React.FC<{ mission: TakenMission }> = ({ mission }) => {
  const { m: { missionParts: { taking: { together: t } } } } = useMessages();
  const [choosing, setChoosing] = useState(false);
  const [teams, setTeams] = useState<Array<{ relay: string; name: string }>>([]);
  const [chosen, setChosen] = useState('');
  if (!mission.coordinate) return null;
  if (mission.team) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="steps-together">
        <Typography variant="caption" color="text.secondary">{fill(t.withTeam, { team: mission.team.name })}</Typography>
        <Button size="small" onClick={() => takenMissions.setTeam(mission.key, null)}>{t.alone}</Button>
      </Stack>
    );
  }
  if (!choosing) {
    return (
      <Box>
        <Button size="small" variant="outlined" data-testid="steps-together-start" onClick={() => {
          // Read only when asked, not with every card drawn.
          const joined = realTimeTeamService.getTeams().filter((x) => x.relayUrl && isJoinedRelay(x.relayUrl))
            .map((x) => ({ relay: x.relayUrl!, name: x.name }));
          setTeams(joined);
          setChosen(joined[0]?.relay ?? '');
          setChoosing(true);
        }}>
          {t.workWith}
        </Button>
      </Box>
    );
  }
  if (teams.length === 0) return <Typography variant="caption" color="text.secondary" display="block">{t.noTeams}</Typography>;
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField select size="small" label={t.team} id={`steps-team-${mission.key}`} value={chosen} onChange={(e) => setChosen(e.target.value)} sx={{ minWidth: 180 }}>
        {teams.map((x) => <MenuItem key={x.relay} value={x.relay}>{x.name}</MenuItem>)}
      </TextField>
      <Button size="small" variant="contained" onClick={() => {
        const team = teams.find((x) => x.relay === chosen);
        if (team) takenMissions.setTeam(mission.key, team);
      }}>
        {t.start}
      </Button>
    </Stack>
  );
};

/** One step as the team's relay has it, and what this person may do with it. */
export const StepTogether: React.FC<{ mission: TakenMission; step: TakenStep; state: StepState }> = ({ mission, step, state }) => {
  const { lang, m: { missionParts: { taking: { together: t } } } } = useMessages();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const me = nostrIdentityService.signerPubkey();
  const team = mission.team!;
  const when = (s: number) => utcDateTimeIn(lang, s * 1000, false);
  const who = (pubkey: string) => <KeyName pubkey={pubkey} />;

  const post = async (value: StepLabelValue, extra: { doer?: string; note?: string } = {}) => {
    setBusy(true);
    setSaid('');
    try {
      const outcome = await reviewStepLabel(team, { coordinate: mission.coordinate!, title: mission.title }, { id: step.id, ask: step.ask }, value, extra);
      if (outcome.status === 'sent') {
        if (value === 'done') takenMissions.setStepDone(mission.key, step.id, true);
        setChecking(false);
      } else if (outcome.status === 'refused') {
        setSaid(outcome.reason);
      }
    } catch (error) {
      setSaid(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  let line: React.ReactNode = null;
  let actions: React.ReactNode = null;
  if (state.state === 'open') {
    actions = <Button size="small" variant="outlined" disabled={busy} onClick={() => void post('taken')}>{t.take}</Button>;
  } else if (state.state === 'taken' && state.by === me) {
    line = fill(t.yours, { when: when(state.until) });
    actions = (
      <>
        <Button size="small" variant="outlined" disabled={busy} onClick={() => void post('done')}>{t.markDone}</Button>
        <Button size="small" disabled={busy} onClick={() => void post('released')}>{t.release}</Button>
      </>
    );
  } else if (state.state === 'taken') {
    line = fillNodes(t.takenBy, { who: who(state.by), when: when(state.until) });
  } else if (state.state === 'done' && state.by === me) {
    line = t.doneByYou;
  } else if (state.state === 'done') {
    line = fillNodes(t.doneBy, { who: who(state.by) });
    actions = checking ? (
      <>
        <TextField size="small" label={t.note} id={`step-note-${mission.key}-${step.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="small" variant="outlined" disabled={busy} onClick={() => void post('checked', { doer: state.by, ...(note.trim() ? { note: note.trim() } : {}) })}>{t.check}</Button>
      </>
    ) : <Button size="small" variant="outlined" disabled={busy} onClick={() => setChecking(true)}>{t.check}</Button>;
  } else if (state.state === 'checked') {
    line = (
      <>
        {fillNodes(t.checked, { who: who(state.by), checker: who(state.checkedBy) })}
        {state.note ? <>{': '}&ldquo;{state.note}&rdquo;</> : null}
      </>
    );
  }

  return (
    <Box sx={{ pl: 4.5, pb: 0.5 }} data-testid="step-together" data-state={state.state}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {line && <Typography variant="caption" color="text.secondary">{line}</Typography>}
        {actions}
      </Stack>
      {said && <Typography variant="caption" color="warning.main" display="block" role="alert">{said}</Typography>}
    </Box>
  );
};
