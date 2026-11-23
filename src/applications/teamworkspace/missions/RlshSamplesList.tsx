/**
 * The kit's sample night in Missions (decision D-RR, RR3): only in a tab opened with `?rlsh=kit`, its package as it
 * stood at the cursor (open as it armed; ended once the cursor passes its ending), said to be a sample, opening the
 * field variant's card. No badge.
 */
import React from 'react';
import { Box, Button, List, ListItem, ListItemText, Typography } from '@mui/material';
import { useMessages } from '../../../i18n/app/i18n';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../services/exchange/types';
import { missionCardOf } from '../../../services/intel/received/missionCard';
import { KIT_RELAY } from '../../../services/psiWatch/missions/psiMissions';
import { addressOf } from '../../../services/rlsh/recurrence/recurrence';
import { standingAt, type RlshHeld } from '../../../services/rlsh/recurrence/useRlshItems';
import type { Event } from 'nostr-tools';

/** The kit's packages standing at a moment, as the card reads a received one. */
export function samplePackagesAt(held: RlshHeld, atS: number): AcceptedPackage[] {
  return standingAt(held.notes.celebration_safety, atS).flatMap((note) => {
    try {
      const manifest = JSON.parse(note.content) as PackageManifest;
      return [{ event: { ...note, id: `kit:${addressOf(note)}`, sig: '' } as Event, check: { ok: true, manifest }, relay: KIT_RELAY }];
    } catch {
      return [];
    }
  });
}

export const RlshSamplesList: React.FC<{ held: RlshHeld; onOpen: (pkg: AcceptedPackage) => void }> = ({ held, onOpen }) => {
  const { m } = useMessages();
  const w = m.missionParts.safetyNight;
  const atS = Math.floor((useTemporalStateOptional()?.currentTime ?? Date.now()) / 1000);
  const packages = samplePackagesAt(held, atS);
  if (!packages.length) return null;
  return (
    <Box data-testid="received-rlsh-samples" sx={{ mb: 2 }}>
      <Typography variant="overline" component="h3">{w.samples}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">{w.sample}</Typography>
      <List dense disablePadding>
        {packages.map((pkg) => (
          <ListItem key={pkg.event.id} disableGutters data-testid="received-rlsh-sample"
            secondaryAction={<Button size="small" onClick={() => onOpen(pkg)}>{m.psiWatch.missions.open}</Button>}>
            <ListItemText primary={missionCardOf(pkg).headline} secondary={pkg.check.manifest?.name}
              slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }} sx={{ pr: 8 }} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default RlshSamplesList;
