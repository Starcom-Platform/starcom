/**
 * With your teams (decision D-RS, RS55): the missions each team whose relay is joined here is working on, read from
 * its step labels on that relay alone, so only its members see them. Each says how many members are on it. One taken
 * here alone can be worked with them in a click; one not taken yet is taken as any mission is, its limits agreed
 * first. Without a joined team, or while no team works anything, nothing is shown.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { isJoinedRelay } from '../../../services/nostr/joinedRelays';
import { takenMissions, takeInputOf } from '../../../services/intel/received/takenMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import { missionCardOf } from '../../../services/intel/received/missionCard';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import { teamMissionsOf, watchStepLabels, type StepLabel } from '../../../services/roster/stepLabels';
import FieldGate from '../../../components/Fieldwork/FieldGate';
import { TakeMission } from './TakeMission';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';

interface Team { relay: string; name: string }

/** The teams whose relay is joined here, read once as the list mounts. */
const useJoinedTeams = (): Team[] => useMemo(() => realTimeTeamService.getTeams()
  .filter((t) => t.relayUrl && isJoinedRelay(t.relayUrl))
  .map((t) => ({ relay: t.relayUrl!, name: t.name })), []);

export const TeamMissions: React.FC<{ received: readonly AcceptedPackage[] }> = ({ received }) => {
  const { lang, m: { missionParts: { taking: { together: t } } } } = useMessages();
  const teams = useJoinedTeams();
  const taken = useTakenMissions();
  const [labels, setLabels] = useState<Record<string, StepLabel[]>>({});
  const relays = teams.map((team) => team.relay).join(' ');

  useEffect(() => {
    const stops = relays.split(' ').filter(Boolean).map((relay) =>
      watchStepLabels(relay, null, { onLabels: (got) => setLabels((was) => ({ ...was, [relay]: got })) }));
    return () => { for (const stop of stops) stop(); };
  }, [relays]);

  // A package by the coordinate a step label names, as taking it records it.
  const packageOf = (coordinate: string) => received.find((p) => takeInputOf(p).coordinate === coordinate);
  const working = teams.map((team) => ({ team, missions: teamMissionsOf(labels[team.relay] ?? []) })).filter((w) => w.missions.length > 0);
  if (working.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }} data-testid="team-missions">
      <Typography variant="overline" component="h4" sx={{ display: 'block' }}>{t.withTeams}</Typography>
      <Stack spacing={1.5}>
        {working.map(({ team, missions }) => (
          <Paper key={team.relay} variant="outlined" sx={{ p: 1.5 }} data-testid="team-missions-team">
            <Typography variant="subtitle2" component="h5">{fill(t.teamWorking, { team: team.name })}</Typography>
            <Stack component="ul" spacing={1} sx={{ m: 0, mt: 1, pl: 0, listStyle: 'none' }}>
              {missions.map((mission) => {
                const pkg = packageOf(mission.coordinate);
                const mine = taken.find((x) => x.coordinate === mission.coordinate);
                const title = (pkg && missionCardOf(pkg).headline) || mine?.title || t.notRead;
                let action: React.ReactNode = null;
                if (mine && mine.team?.relay === team.relay) {
                  action = <Typography variant="caption" color="text.secondary">{t.workingWith}</Typography>;
                } else if (mine) {
                  action = <Button size="small" variant="outlined" onClick={() => takenMissions.setTeam(mine.key, team)}>{t.start}</Button>;
                } else if (pkg) {
                  action = <FieldGate field={missionCardOf(pkg).where === 'field'}><TakeMission pkg={pkg} /></FieldGate>;
                }
                return (
                  <li key={mission.coordinate} data-testid="team-mission">
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
                      <Typography variant="caption" color="text.secondary">{counted(t.membersOn, mission.members, {}, lang)}</Typography>
                      {action}
                    </Stack>
                  </li>
                );
              })}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default TeamMissions;
