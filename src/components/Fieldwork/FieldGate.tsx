/**
 * The gate before taking any field trial or field mission (decision D-RS, RS37, RS38, RS47; the legal review of
 * 2026-10-17). The rules are fieldGate.ts's; this shows what each asks for: the age question, the warning with its
 * release, the parent or guardian tick for 13 to 17, or why not. A desk trial passes straight through.
 *
 * The age question and the warning stay in English, the text agreed to, as consent windows do (D-ML, ML9).
 */
import React, { useState, useSyncExternalStore } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Typography } from '@mui/material';
import AgeQuestion from '../Identity/AgeQuestion';
import { AGE_CHOICES, ageAnswer, subscribeAge } from '../../services/identity/ageAnswer';
import {
  GOING_OUT_AGREEMENT, GOING_OUT_WARNING, adventuresVersion, agreeToWarning, subscribeAdventures, warningAgreed,
} from '../../services/roster/adventure';
import { fieldVerdict, type NwsReading } from '../../services/roster/fieldGate';

const PARENT_TICK = 'I am going with my parent or guardian, or an adult they have authorised, in daylight';

/** The warning before the first field trial, ticked to agree (RS38). */
const GoingOutWarning: React.FC = () => {
  const [ticked, setTicked] = useState(false);
  return (
    <Box data-testid="going-out-warning" sx={{ borderLeft: '3px solid', borderColor: 'warning.main', pl: 1.5, py: 0.5, my: 1 }}>
      <Typography variant="subtitle2" component="h5">Before you go out</Typography>
      {GOING_OUT_WARNING.map((line) => <Typography key={line} variant="body2">{line}</Typography>)}
      <FormControlLabel control={<Checkbox size="small" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />} label={GOING_OUT_AGREEMENT} />
      <Button size="small" variant="contained" disabled={!ticked} onClick={() => agreeToWarning()}>Go on</Button>
    </Box>
  );
};

const FieldGate: React.FC<{
  /** A field trial or mission, away from home; a desk one passes straight through. */
  field: boolean;
  /** Dark anywhere in its window; null when not known. An untimed mission commits to daylight in the tick. */
  dark?: boolean | null;
  nws?: NwsReading;
  children: React.ReactNode;
}> = ({ field, dark = false, nws = 'none', children }) => {
  const age = useSyncExternalStore(subscribeAge, ageAnswer, ageAnswer);
  useSyncExternalStore(subscribeAdventures, adventuresVersion, adventuresVersion);
  const [parentTicked, setParentTicked] = useState(false);
  if (!field) return <>{children}</>;
  const verdict = fieldVerdict({ age, warningAgreed: warningAgreed(), parentTicked, dark, nws });
  const minor = age?.bracket === '13_15' || age?.bracket === '16_17';
  return (
    <Box data-testid="field-gate" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {verdict.kind === 'ask_age' && <AgeQuestion />}
      {verdict.kind === 'ask_warning' && <GoingOutWarning />}
      {verdict.kind === 'no' && <Typography variant="caption">{verdict.reason}</Typography>}
      {minor && (verdict.kind === 'needs_parent' || verdict.kind === 'yes') && (
        <FormControlLabel control={<Checkbox size="small" checked={parentTicked} onChange={(e) => setParentTicked(e.target.checked)} />} label={PARENT_TICK} />
      )}
      {verdict.kind === 'yes' && children}
      {age && (
        <Typography variant="caption" color="text.secondary">{`You said you are ${AGE_CHOICES.find((c) => c.bracket === age.bracket)?.said}. Starcom asked; it did not check.`}</Typography>
      )}
    </Box>
  );
};

export default FieldGate;
