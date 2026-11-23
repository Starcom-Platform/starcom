import React, { useEffect, useState } from 'react';
import { Checkbox, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel, Radio, RadioGroup } from '@mui/material';
import { INFORMATION_VISIBILITIES, type InformationVisibility } from '../../types/intel/IntelItemUI';
import WhatIs from '../Help/WhatIs';
import DistributionChip, { type Distributed } from './DistributionChip';
import { fill, useMessages } from '../../i18n/app/i18n';
import { joinedRelays, relayAddress, subscribeJoinedRelays, type JoinedRelay } from '../../services/nostr/joinedRelays';

/** The team relays joined in this browser, kept up as they are joined and left. */
function useJoinedRelays(): JoinedRelay[] {
  const [joined, setJoined] = useState(joinedRelays);
  useEffect(() => subscribeJoinedRelays(() => setJoined(joinedRelays())), []);
  return joined;
}

const hostOf = (url: string): string => {
  try { return new URL(url).host; } catch { return url; }
};

/**
 * Who may receive a case or a mission, asked in plain words, with nothing
 * chosen in advance (plan item 0.5, decision D2: ask every time). People tend
 * to take whatever is offered first, so nothing is offered first.
 *
 * Under the choice it says what the choice does in this build, or why it
 * sends nothing: a Limited mission in a build with no internal relay goes
 * nowhere, and the person choosing should know that when they choose.
 *
 * Where it cannot be changed, it says why and what to do instead (plan item
 * 9.13): greyed out under "Choose one", it asked for something nobody could
 * give.
 *
 * Beside the question, the chip every screen draws (BD15) shows what is
 * chosen. Where a record may wait (a report, BD16), Decide later is a choice
 * of its own, held until someone picks, rather than a blank.
 *
 * Under Limited, where the record can go to teams (a mission, a case), each
 * team relay joined here is offered to tick (decision LW1). Nothing is ticked
 * in advance: work reaches only a team its author picked.
 */
const DENSE_LABEL = { typography: { fontSize: 13 } } as const;

const DistributionChoice: React.FC<{
  /** Undefined until someone chooses. */
  value: InformationVisibility | undefined;
  onChange: (visibility: InformationVisibility) => void;
  /** What is being sent: a mission, a case. */
  what: Distributed;
  /** Where the current choice sends it, or why it sends nothing. */
  consequence?: string | null;
  disabled?: boolean;
  /** Why it cannot be chosen or changed here, and what to do instead. Disables it. */
  lockedBecause?: string | null;
  /** Where the record may wait: offers Decide later, which calls this. */
  onDecideLater?: () => void;
  /** In a compact form (the report form): its type sizes, not MUI's. */
  dense?: boolean;
  testId?: string;
  /** Under Limited: the joined team relays it also goes to, as picked (LW1). Offered only when one is joined. */
  teams?: { chosen: readonly string[]; onChange: (next: string[]) => void };
}> = ({ value, onChange, what, consequence, disabled, lockedBecause, onDecideLater, dense, testId, teams }) => {
  const { m: { shared: { distribution: t } } } = useMessages();
  const joined = useJoinedRelays();
  const chosen = new Set((teams?.chosen ?? []).map(relayAddress));
  const toggle = (url: string, on: boolean) => {
    if (!teams) return;
    const rest = teams.chosen.filter((r) => relayAddress(r) !== relayAddress(url));
    teams.onChange(on ? [...rest, url] : rest);
  };
  return (
  <FormControl component="fieldset" disabled={disabled || !!lockedBecause} data-testid={testId}>
    <FormLabel component="legend" sx={dense ? { fontSize: 12, display: 'flex', alignItems: 'center', gap: 0.75 } : undefined}>
      {t.who[what]} <WhatIs term="visibility" /> <DistributionChip visibility={value} what={what} />
    </FormLabel>
    <RadioGroup
      value={value ?? ''}
      onChange={(e) => (e.target.value ? onChange(e.target.value as InformationVisibility) : onDecideLater?.())}
    >
      {INFORMATION_VISIBILITIES.map((v) => (
        <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={t.labels[v]} slotProps={dense ? DENSE_LABEL : undefined} />
      ))}
      {onDecideLater && (
        <FormControlLabel value="" control={<Radio size="small" />} label={t.decideLater} slotProps={dense ? DENSE_LABEL : undefined} />
      )}
    </RadioGroup>
    {value === 'limited' && teams && joined.length > 0 && (
      <FormGroup sx={{ pl: 3.5 }} data-testid={testId ? `${testId}-teams` : undefined}>
        <FormHelperText sx={{ m: 0 }}>{t.alsoTeams}</FormHelperText>
        {joined.map((relay) => (
          <FormControlLabel
            key={relay.url}
            control={<Checkbox size="small" checked={chosen.has(relayAddress(relay.url))} onChange={(e) => toggle(relay.url, e.target.checked)} />}
            label={fill(t.teamRelay, { team: relay.team, relay: hostOf(relay.url) })}
            slotProps={dense ? DENSE_LABEL : undefined}
          />
        ))}
      </FormGroup>
    )}
    <FormHelperText data-testid={testId ? `${testId}-consequence` : undefined}>
      {lockedBecause
        ? [lockedBecause, value ? consequence : null].filter(Boolean).join(' ')
        : value || onDecideLater ? consequence ?? '' : t.chooseOne}
    </FormHelperText>
  </FormControl>
  );
};

export default DistributionChoice;
