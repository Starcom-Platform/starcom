/**
 * What a mission works toward (the owner's RS59, 2026-10-23): Causes and Initiatives read here, each carried by its
 * package as a `toward` link, so the cause counts the mission as work toward it. Locked with its package, as the rest
 * of what the package carries. The roster is read only while the list is open.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Autocomplete, Box, Chip, Stack, TextField, Typography } from '@mui/material';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { rosterItems, startRosterRead, subscribeRoster } from '../../../services/roster/rosterRead';
import { followsCause } from '../../../services/roster/follows';
import { useMessages } from '../../../i18n/app/i18n';

type Toward = NonNullable<MissionUI['toward']>;

export const MissionToward: React.FC<{
  mission: Pick<MissionUI, 'toward'>;
  onChange: (toward: Toward) => void;
  disabled?: boolean;
  /** Why it cannot be changed: its package is locked. */
  lockedBecause?: string | null;
}> = ({ mission, onChange, disabled, lockedBecause }) => {
  const { m: { missions: t } } = useMessages();
  const items = useSyncExternalStore(subscribeRoster, rosterItems, rosterItems);
  const [open, setOpen] = useState(false);
  useEffect(() => (open ? startRosterRead() : undefined), [open]);
  const links = mission.toward ?? [];
  const locked = disabled || !!lockedBecause;
  const titleOf = (coordinate: string) => items.find((x) => x.address === coordinate)?.title ?? coordinate.split(':').slice(2).join(':');
  // The causes followed here first, then the newest.
  const options = items
    .filter((x) => (x.kind === 'cause' || x.kind === 'initiative') && !links.some((l) => l.coordinate === x.address))
    .sort((a, b) => Number(followsCause(b.address)) - Number(followsCause(a.address)) || b.createdAt - a.createdAt);

  return (
    <Box data-testid="mission-toward">
      <Typography variant="subtitle2">{t.towardHeading}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">{lockedBecause ?? t.towardHelp}</Typography>
      {links.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {links.map((l) => (
            <Chip
              key={l.coordinate}
              size="small"
              label={titleOf(l.coordinate)}
              data-testid="mission-toward-link"
              onDelete={locked ? undefined : () => onChange(links.filter((x) => x.coordinate !== l.coordinate))}
            />
          ))}
        </Stack>
      )}
      {!locked && (
        <Autocomplete
          size="small"
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          options={options}
          getOptionLabel={(o) => o.title}
          isOptionEqualToValue={(a, b) => a.address === b.address}
          noOptionsText={t.towardNone}
          value={null}
          onChange={(_, o) => { if (o) onChange([...links, { coordinate: o.address, relay: '' }]); }}
          renderInput={(params) => <TextField {...params} label={t.towardAdd} />}
          sx={{ mt: 1, maxWidth: 420 }}
          data-testid="mission-toward-add"
        />
      )}
    </Box>
  );
};

export default MissionToward;
