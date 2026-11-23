import React from 'react';
import { Box, Button, Stack, Step, StepLabel, Stepper, Typography, type StepIconProps } from '@mui/material';
import OnDarkSurface from '../Shared/OnDarkSurface';
import { movesFrom, pathOf, statusMeans, statusName, type SteppedKind } from '../../services/intel/steps/statusSteps';
import styles from './StatusSteps.module.css';
import { useMessages } from '../../i18n/app/i18n';

/**
 * The one stepper a report, a case and a mission move through (plan item
 * 1.7): the way forward in words with where the record stands marked, what
 * that means, and the moves open from there, read from the table the service
 * enforces. A move that cannot be made yet says why beside it, since a
 * disabled button cannot show its title.
 */
/**
 * Each step's mark (BD24): a green check where the record has been, a cyan
 * ring where it stands (selected, which is cyan's meaning; never a status),
 * and a hollow grey ring for the steps ahead.
 */
const StepMark: React.FC<StepIconProps> = ({ active, completed }) => {
  const step = active ? 'current' : completed ? 'passed' : 'ahead';
  return (
    <span className={styles.mark} data-step={step}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <circle cx="12" cy="12" r="9" className={step === 'passed' ? styles.disc : styles.ring} />
        {step === 'passed' && <path d="m7.5 12.5 3 3 6-6.5" className={styles.tick} />}
        {step === 'current' && <circle cx="12" cy="12" r="4" className={styles.dot} />}
      </svg>
    </span>
  );
};

const StatusSteps: React.FC<{
  kind: SteppedKind;
  status: string;
  onMove: (to: string) => void;
  busy?: boolean;
  /** Why a move cannot be made now, by the status it leads to. */
  blocked?: Partial<Record<string, string | null | undefined>>;
  testId?: string;
  /** Drawn on a dark panel that no dark theme covers. */
  onDark?: boolean;
  /**
   * The statuses the record is known to have been at. Without it every step
   * before the current one is shown passed, and a case closed without
   * resolving showed "Resolved" as done.
   */
  passed?: readonly string[];
}> = ({ kind, status, onMove, busy, blocked, testId, onDark, passed }) => {
  const { m: { shared: words } } = useMessages();
  const path = pathOf(kind);
  const at = path.indexOf(status);
  const moves = movesFrom(kind, status, words);
  const reasons = moves.filter((m) => blocked?.[m.to]);
  // Six steps do not fit their names on a phone (a mission's, since Closed was
  // added, D-MX MX12): there the marks are drawn alone, and the current step is
  // named in the line below them.
  const compact = path.length > 5;
  const steps = (
    <Box data-testid={testId}>
      <Stepper activeStep={at} alternativeLabel sx={{ mb: 1 }} className={styles.stepper} data-compact={compact || undefined}>
        {path.map((s, i) => (
          <Step key={s} completed={at >= 0 && i < at && (!passed || passed.includes(s))}>
            <StepLabel StepIconComponent={StepMark} {...(i === at ? { 'aria-current': 'step' as const } : {})}>{statusName(kind, s, words)}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Typography variant="body2" {...(at < 0 ? { 'aria-current': 'step' as const } : {})}>
        {at < 0 && <strong>{statusName(kind, status, words)}. </strong>}
        {at >= 0 && compact && <strong className={styles.compactName} data-testid={testId ? `${testId}-current` : undefined}>{statusName(kind, status, words)}. </strong>}
        {statusMeans(kind, status, words)}
      </Typography>
      {moves.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
          {moves.map((m) => (
            <Button
              key={m.to}
              variant="outlined"
              size="small"
              disabled={busy || Boolean(blocked?.[m.to])}
              title={blocked?.[m.to] ?? undefined}
              onClick={() => onMove(m.to)}
              data-testid={`transition-to-${m.to}`}
            >
              {m.label}
            </Button>
          ))}
        </Stack>
      )}
      {reasons.map((m) => (
        <Typography key={m.to} variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }} data-testid={`blocked-${m.to}`}>
          {m.label}: {blocked?.[m.to]}
        </Typography>
      ))}
    </Box>
  );
  return onDark ? <OnDarkSurface>{steps}</OnDarkSurface> : steps;
};

export default StatusSteps;
