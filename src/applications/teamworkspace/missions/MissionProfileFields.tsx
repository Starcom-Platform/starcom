import React, { useEffect, useState } from 'react';
import {
  FormControl, FormControlLabel, FormHelperText, FormLabel, Radio, RadioGroup, Stack, Switch, TextField,
} from '@mui/material';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { fieldWorkProblem } from '../../../services/intel/packageProfile';
import CountryFinder from '../../../components/Intel/CountryFinder';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { utcDateTimeIn } from '../../../i18n/app/dates';

type Profiled = Pick<MissionUI, 'claims' | 'fieldWork'>;

/** The day an end falls on, as a date input shows it. */
const dayOf = (until: string | undefined) => (until && /^\d{4}-\d{2}-\d{2}/.test(until) ? until.slice(0, 10) : '');

/**
 * What NavCom reads of a mission's package, set on the mission (interchange
 * rev 11; decision D-MX: MX2, MX11, MX13): whether one person takes it or
 * anybody joins, and whether it is field work, tagged with a region and an end
 * date for NavCom's map.
 *
 * The words say what the package carries, never what NavCom shows: which
 * packages NavCom reads is NavCom's to say, and on 2026-10-06 it read Mecha
 * Jono's alone, from The Record (its spec, section 3).
 *
 * A region, never a point: a country's code or a state's, typed or found by
 * the country's name. The end is the end of the chosen day, in UTC, and is
 * said again as D-E writes it: the browser's date field puts the month first
 * in some places.
 *
 * A mission that is not Public is never published beyond its team, which is
 * said where field work is switched on.
 *
 * It travels in the package, so it locks with it from Ready on.
 */
const MissionProfileFields: React.FC<{
  mission: Profiled;
  onChange: (patch: Partial<Profiled>) => void;
  disabled?: boolean;
  /** Why it cannot be changed now, and what to do instead. Disables it. */
  lockedBecause?: string | null;
  /** Whether its package can reach NavCom at all: only a Public one does. */
  reachesNavcom?: boolean;
  testId?: string;
}> = ({ mission, onChange, disabled, lockedBecause, reachesNavcom = true, testId = 'mission-profile' }) => {
  const { lang, m: { missionParts: t, missions } } = useMessages();
  const off = Boolean(disabled || lockedBecause);
  const fieldWork = mission.fieldWork;
  const [region, setRegion] = useState(fieldWork?.jurisdiction ?? '');
  useEffect(() => setRegion(fieldWork?.jurisdiction ?? ''), [fieldWork?.jurisdiction]);

  const saveRegion = (value: string) => {
    const code = value.trim().toLowerCase();
    if (code !== (fieldWork?.jurisdiction ?? '')) onChange({ fieldWork: { ...fieldWork, jurisdiction: code || undefined } });
  };
  const problem = fieldWork ? fieldWorkProblem(mission, Date.now(), lang, missions.fieldWorkProblems) : null;
  const end = fieldWork?.until ? Date.parse(fieldWork.until) : NaN;

  return (
    <Stack spacing={1.5} data-testid={testId}>
      <FormControl component="fieldset" disabled={off}>
        <FormLabel component="legend">{t.whoTakes}</FormLabel>
        <RadioGroup
          row
          value={mission.claims ?? 'many'}
          onChange={(e) => onChange({ claims: e.target.value as 'one' | 'many' })}
        >
          <FormControlLabel value="many" control={<Radio size="small" />} label={t.anybody} />
          <FormControlLabel value="one" control={<Radio size="small" />} label={t.onePerson} />
        </RadioGroup>
      </FormControl>

      <FormControl component="fieldset" disabled={off}>
        <FormControlLabel
          control={(
            <Switch
              checked={Boolean(fieldWork)}
              onChange={(e) => onChange({ fieldWork: e.target.checked ? {} : undefined })}
              inputProps={{ 'aria-label': t.fieldWorkSwitch }}
            />
          )}
          label={t.fieldWorkSwitch}
        />
        <FormHelperText>
          {fieldWork ? t.fieldWorkOn : t.fieldWorkOff}
        </FormHelperText>
        {fieldWork && !reachesNavcom && (
          <FormHelperText data-testid={`${testId}-unreached`}>
            {t.notPublic}
          </FormHelperText>
        )}
      </FormControl>

      {fieldWork && (
        <Stack spacing={1.5} sx={{ pl: 1 }}>
          <TextField
            size="small"
            label={t.region}
            value={region}
            disabled={off}
            onChange={(e) => setRegion(e.target.value)}
            onBlur={(e) => saveRegion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveRegion(region); } }}
            helperText={t.regionHelp}
            inputProps={{ 'data-testid': `${testId}-region`, maxLength: 6, autoComplete: 'off' }}
          />
          {!off && (
            <CountryFinder countriesOnly onChoose={(code) => { setRegion(code); saveRegion(code); }} />
          )}
          <TextField
            size="small"
            type="date"
            label={t.ends}
            value={dayOf(fieldWork.until)}
            disabled={off}
            onChange={(e) => onChange({ fieldWork: { ...fieldWork, until: e.target.value ? `${e.target.value}T23:59:59.000Z` : undefined } })}
            helperText={Number.isFinite(end) ? fill(t.endsAt, { when: utcDateTimeIn(lang, end, true) }) : t.endsHelp}
            InputLabelProps={{ shrink: true }}
            inputProps={{ 'data-testid': `${testId}-ends` }}
          />
        </Stack>
      )}

      {(lockedBecause || problem) && (
        <FormHelperText error={Boolean(problem)} data-testid={`${testId}-problem`}>
          {[lockedBecause, problem].filter(Boolean).join(' ')}
        </FormHelperText>
      )}
    </Stack>
  );
};

export default MissionProfileFields;
