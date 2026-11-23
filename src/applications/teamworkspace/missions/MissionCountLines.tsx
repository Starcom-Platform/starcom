/**
 * What a mission asks to be counted (the owner's MX32, 2026-10-23): each a thing, never people, that someone who takes
 * it sends back as a whole number in a report sealed to its publisher. Its package carries them, so they lock with it.
 */
import React, { useState } from 'react';
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { countedBy, countLineOf, countLineProblem } from '../../../services/intel/countLines';
import { useMessages } from '../../../i18n/app/i18n';

export const MissionCountLines: React.FC<{
  mission: Pick<MissionUI, 'countLines'>;
  onChange: (countLines: string[]) => void;
  disabled?: boolean;
  /** Why it cannot be changed: its package is locked. */
  lockedBecause?: string | null;
}> = ({ mission, onChange, disabled, lockedBecause }) => {
  const { m: { missions: t } } = useMessages();
  const [what, setWhat] = useState('');
  const [tried, setTried] = useState(false);
  const lines = mission.countLines ?? [];
  const locked = disabled || !!lockedBecause;
  const problem = countLineProblem(what, lines);
  const add = () => {
    setTried(true);
    if (problem) return;
    onChange([...lines, countLineOf(what)]);
    setWhat('');
    setTried(false);
  };

  return (
    <Box data-testid="mission-count-lines">
      <Typography variant="subtitle2">{t.countsHeading}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">{lockedBecause ?? t.countsHelp}</Typography>
      {lines.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {lines.map((line) => (
            <Chip
              key={line}
              size="small"
              label={countedBy(line)}
              data-testid="mission-count-line"
              onDelete={locked ? undefined : () => onChange(lines.filter((l) => l !== line))}
            />
          ))}
        </Stack>
      )}
      {!locked && (
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1, maxWidth: 480 }}>
          <TextField
            size="small"
            fullWidth
            label={t.countsLabel}
            value={what}
            onChange={(e) => { setWhat(e.target.value); setTried(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            error={tried && !!problem}
            helperText={tried && problem ? t.countsProblem[problem] : ' '}
            inputProps={{ 'data-testid': 'mission-count-input' }}
          />
          <Button size="small" variant="outlined" onClick={add} sx={{ mt: 0.5 }} data-testid="mission-count-add">{t.countsAdd}</Button>
        </Stack>
      )}
    </Box>
  );
};

export default MissionCountLines;
