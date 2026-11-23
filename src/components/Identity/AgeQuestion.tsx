/**
 * "How old are you?", neutrally (decision D-RS, RS37): four brackets, none chosen to start, and nothing said of
 * what an answer opens or closes, so it does not invite a false one (COPPA's guidance). Kept once, locked. An AI
 * agent says it is one (RS42).
 */
import React, { useState } from 'react';
import { Box, Button, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { AGE_CHOICES, ageAnswer, setAgeAnswer, type AgeAnswer, type AgeAnswerKind } from '../../services/identity/ageAnswer';

const AgeQuestion: React.FC<{ onAnswer?: (answer: AgeAnswer) => void; onDismiss?: () => void }> = ({ onAnswer, onDismiss }) => {
  const [choice, setChoice] = useState<AgeAnswerKind | ''>('');
  const keep = () => {
    if (!choice) return;
    setAgeAnswer(choice);
    const kept = ageAnswer();
    if (kept) onAnswer?.(kept);
  };
  return (
    <Box data-testid="age-question" sx={{ borderLeft: '3px solid', borderColor: 'info.main', pl: 1.5, py: 0.5, my: 1 }}>
      <Typography variant="subtitle2" component="h5" id="age-question-heading">How old are you?</Typography>
      <RadioGroup value={choice} onChange={(e) => setChoice(e.target.value as AgeAnswerKind)} row aria-labelledby="age-question-heading">
        {AGE_CHOICES.map((b) => <FormControlLabel key={b.bracket} value={b.bracket} control={<Radio size="small" />} label={b.label} />)}
      </RadioGroup>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Button size="small" variant="contained" disabled={!choice} onClick={keep}>Keep my answer</Button>
        {onDismiss && <Button size="small" onClick={onDismiss}>Not now</Button>}
        <Typography variant="caption">Asked once, kept on this device, never posted.</Typography>
      </Stack>
    </Box>
  );
};

export default AgeQuestion;
