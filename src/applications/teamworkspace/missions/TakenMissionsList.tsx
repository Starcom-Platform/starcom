/**
 * "Taken on": the missions a person here has taken, each a checklist of its steps (decision D-MF, MF7). Its
 * limits head it (MF9); a step ticked says when; it is kept on this device and sent nowhere (MF8). Who it is
 * from is named as its key's own profile names it (MF4). Once finished, every step ticked or marked so (RS29), it
 * offers a story about it, written in Operations (D-RS, RS51). Worked with a team, each step is taken, done and
 * checked on the team's relay, under it (RS55–RS57).
 */
import React, { useContext } from 'react';
import { Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';
import { takenMissions, type TakenMission } from '../../../services/intel/received/takenMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import KeyName from '../../../components/Identity/KeyName';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import { utcDateIn, utcDateTimeIn } from '../../../i18n/app/dates';
import { effortText, endsText, placeText } from './missionWords';
import { LetMissionGo } from './TakeMission';
import ReportBack from './ReportBack';
import { StepTogether, WorkTogether } from './StepsTogether';
import { useStepBoard } from './useStepBoard';
import { windowStateAt } from '../../../services/psiWatch/missions/psiMissions';

/** The sky states' words say where now stands against a psi mission's window (PW93): Ahead, In its window, Passed. */
const SKY_STATE = { ahead: 'armed', open: 'live', passed: 'closed' } as const;

const TakenMissionCard: React.FC<{ mission: TakenMission; now: number }> = ({ mission, now }) => {
  const { lang, m } = useMessages();
  const t = m.missionParts.taking;
  const words = m.missionParts.cards;
  const done = mission.steps.filter((s) => s.done).length;
  const minutes = mission.steps.filter((s) => !s.done).reduce((n, s) => n + (s.effortMinutes ?? 0), 0);
  const ends = mission.closesAt !== undefined ? endsText(mission.closesAt, now, lang, words) : undefined;
  const router = useContext(EnhancedApplicationRouterContext);
  const finished = (mission.steps.length > 0 && done === mission.steps.length) || (!!mission.coordinate && !!takenMissions.finishedAt(mission.coordinate));
  const together = useStepBoard(mission);
  const crewless = mission.family === 'celebration_safety';

  return (
    <Paper variant="outlined" component="article" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }} data-testid="taken-mission">
      <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600, lineHeight: 1.3, color: 'var(--sc-text-heading)' }}>{mission.title}</Typography>
      {mission.subject && <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>{mission.subject}</Typography>}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {mission.place && <Chip size="small" variant="outlined" label={placeText(mission.place, lang, words)} />}
        {ends && <Chip size="small" variant={ends.soon ? 'filled' : 'outlined'} color={ends.soon ? 'warning' : 'default'} label={ends.text} />}
        {minutes > 0 && <Chip size="small" variant="outlined" label={effortText(minutes, lang, m, words)} />}
        {mission.where && <Chip size="small" variant="outlined" label={mission.where === 'field' ? words.field : words.desk} />}
        {/* A psi mission (PW93): where now stands against its window, and the one badge. */}
        {mission.psiWindow && (
          <>
            <Chip size="small" variant="outlined" data-testid="taken-mission-psi-window"
              label={fill(m.psiWatch.missions.taken, { state: m.psiWatch.timeline.skyStates[SKY_STATE[windowStateAt(mission.psiWindow, now)]] })} />
            <Chip size="small" variant="outlined" label={m.psiWatch.panel.experimental} />
          </>
        )}
      </Stack>

      {/* Its limits head the checklist (MF9). */}
      {mission.limits && (
        <Box sx={{ borderLeft: '3px solid', borderColor: 'warning.main', pl: 1 }} data-testid="taken-mission-limits">
          <Typography variant="overline" component="h5" sx={{ display: 'block', lineHeight: 1.6 }}>{mission.where === 'field' ? t.limitsField : t.limitsDesk}</Typography>
          <Typography variant="body2">{mission.limits}</Typography>
        </Box>
      )}

      <Box>
        <Typography variant="caption" color="text.secondary" component="div" data-testid="taken-mission-progress">
          {counted(t.stepsDone, mission.steps.length, { done }, lang)}
        </Typography>
        {/* A safety night offers no crew, meeting or chat: taking part goes through NavCom (D-RR, kit 5.4). */}
        {mission.steps.length > 0 && !crewless && <Box sx={{ my: 0.5 }}><WorkTogether mission={mission} /></Box>}
        {together && !together.read && <Typography variant="caption" color="text.secondary" display="block">{m.missionParts.taking.together.reading}</Typography>}
        <Stack spacing={0} data-testid="taken-mission-steps">
          {mission.steps.map((step) => (
            <Box key={step.id}>
              <FormControlLabel
                sx={{ alignItems: 'flex-start', m: 0 }}
                control={(
                  <Checkbox
                    size="small"
                    checked={step.done}
                    onChange={(_e, checked) => takenMissions.setStepDone(mission.key, step.id, checked)}
                    sx={{ pt: 0.25 }}
                    inputProps={{ 'aria-label': step.ask }}
                  />
                )}
                label={(
                  <Box sx={{ pt: 0.5 }}>
                    <Typography variant="body2" sx={{ textDecoration: step.done ? 'line-through' : 'none', color: step.done ? 'text.secondary' : 'inherit' }}>{step.ask}</Typography>
                    {step.done && step.doneAt && (
                      <Typography variant="caption" color="text.secondary">{fill(t.doneAt, { when: utcDateTimeIn(lang, Date.parse(step.doneAt), false) })}</Typography>
                    )}
                  </Box>
                )}
              />
              {/* Outside the label, so a click on its buttons never ticks the box. */}
              {together && !crewless && <StepTogether mission={mission} step={step} state={together.board[step.id] ?? { state: 'open' }} />}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Reporting back: the counts it asks for, sealed to its publisher, through the review (MF11–MF13). */}
      <ReportBack mission={mission} />

      {finished && router && (
        <Box>
          <Button size="small" variant="outlined" data-testid="taken-mission-story"
            onClick={() => router.navigateToApp('teamworkspace', undefined, {
              initialTab: 'operations', storyTitle: fill(t.storyTitle, { title: mission.title }), storyToward: mission.coordinate ?? '',
            })}>
            {t.writeStory}
          </Button>
        </Box>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 'auto', pt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          {fillNodes(t.from, { who: <KeyName pubkey={mission.signer} />, when: utcDateIn(lang, Date.parse(mission.takenAt), true) })}
        </Typography>
        <LetMissionGo missionKey={mission.key} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{t.deviceOnly}</Typography>
    </Paper>
  );
};

export const TakenMissionsList: React.FC<{ now?: number }> = ({ now = Date.now() }) => {
  const { lang, m } = useMessages();
  const taken = useTakenMissions();
  if (taken.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }} data-testid="taken-missions">
      <Typography variant="overline" component="h4" sx={{ display: 'block' }}>{counted(m.missionParts.taking.heading, taken.length, {}, lang)}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {taken.map((mission) => <TakenMissionCard key={mission.key} mission={mission} now={now} />)}
      </Box>
    </Box>
  );
};

export default TakenMissionsList;
