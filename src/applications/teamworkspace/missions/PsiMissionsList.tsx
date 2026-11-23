/**
 * Psi Watch's missions in Missions' received list (decision D-PW, PW91): apart from the other missions, under the one
 * badge, Experimental (PW34). Each says its window and where the cursor stands against it, and opens its card, the
 * psi variant of the field mission's, with "Take this mission".
 */
import React from 'react';
import { Box, Button, Chip, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { useClockNow, useTemporalStateOptional } from '../../../context/TemporalContext';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { windowStateAt, type PsiMission } from '../../../services/psiWatch/missions/psiMissions';

const SKY_STATE = { ahead: 'armed', open: 'live', passed: 'closed' } as const;

export const PsiMissionsList: React.FC<{ missions: readonly PsiMission[]; onOpen: (mission: PsiMission) => void }> = ({ missions, onOpen }) => {
  const { m } = useMessages();
  const w = m.psiWatch.missions;
  const now = useClockNow();
  const cursorMs = useTemporalStateOptional()?.currentTime ?? now;
  return (
    <Box data-testid="received-psi-missions" sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="overline" component="h3">{m.psiWatch.panel.title}</Typography>
        <Chip size="small" variant="outlined" label={m.psiWatch.panel.experimental} />
      </Stack>
      <List dense disablePadding>
        {missions.map((mission) => {
          const { window } = mission;
          const state = window ? m.psiWatch.timeline.skyStates[SKY_STATE[windowStateAt(window, cursorMs)]] : null;
          return (
            <ListItem key={mission.address} disableGutters data-testid="received-psi-mission"
              secondaryAction={<Button size="small" title={w.openTitle} onClick={() => onOpen(mission)}>{w.open}</Button>}>
              <ListItemText
                primary={mission.title}
                secondary={window ? `${fill(w.window, {
                  from: formatUtcDateTime(window.fromMs, { year: true }),
                  until: formatUtcDateTime(window.untilMs, { year: true }),
                  peak: formatUtcDateTime(window.peakMs, { year: true }),
                })} · ${fill(w.stateAt, { state: state ?? '' })}` : undefined}
                slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
                sx={{ pr: 8 }}
              />
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default PsiMissionsList;
