/**
 * Taking a mission on, whole, desk or field (decision D-MF, MF10). A mission that states limits shows them in
 * full first, and "I'll keep to these" is what takes it (MF9). Taken, it is kept on this device and sent
 * nowhere (MF8): its checklist is under "Your missions" (MF7), where the counts it asks for can be reported back
 * (MF11). Letting it go asks first, since its ticks go too.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import { takenMissions, takeInputOf } from '../../../services/intel/received/takenMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { utcDateTimeIn } from '../../../i18n/app/dates';

/** "Let it go", asking first: a taken mission's ticks go with it. */
export const LetMissionGo: React.FC<{ missionKey: string }> = ({ missionKey }) => {
  const { m } = useMessages();
  const t = m.missionParts.taking;
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button size="small" onClick={() => setAsking(true)} data-testid="mission-let-go">{t.letGo}</Button>;
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="mission-let-go-ask">
      <Typography variant="caption">{t.letGoAsk}</Typography>
      <Button size="small" color="warning" onClick={() => takenMissions.release(missionKey)} data-testid="mission-let-go-yes">{t.letGoYes}</Button>
      <Button size="small" onClick={() => setAsking(false)}>{t.keep}</Button>
    </Stack>
  );
};

export const TakeMission: React.FC<{ pkg: AcceptedPackage }> = ({ pkg }) => {
  const { lang, m } = useMessages();
  const t = m.missionParts.taking;
  useTakenMissions();
  const input = useMemo(() => takeInputOf(pkg), [pkg]);
  const taken = takenMissions.get(input.key);
  const [asking, setAsking] = useState(false);
  const field = input.where === 'field';
  const kept = input.counts?.length ? `${t.deviceOnly} ${t.canReport}` : t.deviceOnly;

  if (taken) {
    return (
      <Box data-testid="mission-taken">
        <Typography variant="body2">{`${fill(t.taken, { when: utcDateTimeIn(lang, Date.parse(taken.takenAt), true) })} ${t.checklistThere}`}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">{kept}</Typography>
        <LetMissionGo missionKey={input.key} />
      </Box>
    );
  }
  return (
    <Box data-testid="mission-take">
      <Button
        variant="contained"
        onClick={() => (input.limits ? setAsking(true) : takenMissions.take(input))}
        data-testid="mission-take-button"
      >
        {t.take}
      </Button>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
        {kept}
      </Typography>
      {asking && (
        <Dialog open onClose={() => setAsking(false)} maxWidth="sm" fullWidth data-testid="mission-take-limits-dialog">
          <DialogTitle>{t.before}</DialogTitle>
          <DialogContent dividers>
            <Typography variant="overline" component="h3" sx={{ display: 'block' }}>{field ? t.limitsField : t.limitsDesk}</Typography>
            <Typography variant="body2" data-testid="mission-take-limits">{input.limits}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAsking(false)}>{t.notNow}</Button>
            <Button variant="contained" onClick={() => { takenMissions.take(input); setAsking(false); }} data-testid="mission-take-agree">{t.agree}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default TakeMission;
