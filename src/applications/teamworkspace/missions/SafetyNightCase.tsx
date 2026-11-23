/**
 * The Case view (decision D-RR, plan step 5; Mecha Jono's kit 5.5): a safety night's Case, opened from its card once
 * one is published. One row per past night, its date and trigger; under it each count on its own line, "{n} {words}",
 * whose count it is, as an outlet reported it where one did, typical where it is our own count, and its link; the
 * decisions that shaped the nights, with whose each was; the settled answers; the score line once. Counts are never
 * summed across owners or measures; nobody named or described; nothing placed finer than a precinct's name.
 */
import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, Typography } from '@mui/material';
import { fill, useMessages } from '../../../i18n/app/i18n';
import type { RecurrenceCase } from '../../../services/rlsh/recurrence/recurrence';
import { localeOf } from '../../../services/rlsh/recurrence/localTimes';

/** A day as the Case names it, `YYYY-MM-DD`, in words. */
const dayWords = (locale: string, day: string): string => {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms) : day;
};

/**
 * Our own count beside its typical night, both labelled (kit 3.1: fine where `typical` exists): each bar on one track
 * of fixed width, the count solid, the typical night outlined, so neither label wraps and both read on a dark card.
 */
const TRACK_PX = 140;
const Bars: React.FC<{ n: number; typical: number; label: string }> = ({ n, typical, label }) => {
  const most = Math.max(n, typical, 1);
  const row = (v: number, solid: boolean, text: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: TRACK_PX, flex: 'none' }}>
        <Box sx={{
          height: 6, width: `${Math.max(2, (v / most) * 100)}%`, borderRadius: 0.5, boxSizing: 'border-box',
          ...(solid ? { bgcolor: 'var(--sc-text-secondary)' } : { border: '1px solid var(--sc-text-secondary)' }),
        }} />
      </Box>
      <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{text}</Typography>
    </Box>
  );
  return (
    <Box sx={{ display: 'grid', gap: 0.25, mt: 0.25 }} aria-hidden="true">
      {row(n, true, String(n))}
      {row(typical, false, label)}
    </Box>
  );
};

export const SafetyNightCase: React.FC<{ caseNote: RecurrenceCase; onClose: () => void }> = ({ caseNote, onClose }) => {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const locale = localeOf(lang);
  const owner = (id: string) => caseNote.owners[id] ?? id;
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="safety-night-case-view">
      <DialogTitle sx={{ pb: 0.5 }}>
        {caseNote.title}
        <Typography variant="caption" color="text.secondary" component="div">{w.caseLabel}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {caseNote.asOf ? (
            <Typography variant="caption" color="text.secondary" component="div">
              {fill(w.caseAsOf, { date: dayWords(locale, caseNote.asOf.day), words: caseNote.asOf.words })}
            </Typography>
          ) : null}

          {/* One row per night; each count on its own line with its owner, never summed (kit 3.1). */}
          {caseNote.nights.map((night) => {
            const counts = caseNote.counts.filter((c) => c.night === night.day);
            return (
              <Box key={night.day} data-testid="safety-night-case-night">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {`${dayWords(locale, night.day)} · ${night.trigger}${(w.where as Record<string, string>)[night.where] ? ` · ${(w.where as Record<string, string>)[night.where]}` : ''}`}
                </Typography>
                {counts.map((c, i) => (
                  <Box key={`${c.measure}-${c.owner}-${i}`} data-testid="safety-night-case-count" sx={{ pl: 1, mt: 0.5 }}>
                    <Typography variant="body2">{`${c.n} ${c.words}`}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {owner(c.owner)}
                      {c.outlet ? fill(w.asReported, { outlet: c.outlet }) : ''}
                      {c.typical !== null ? ` · ${fill(w.typical, { n: c.typical })}` : ''}
                      {c.link ? <>{' · '}<Link href={c.link} target="_blank" rel="noopener noreferrer">{w.source}</Link></> : null}
                    </Typography>
                    {c.typical !== null ? <Bars n={c.n} typical={c.typical} label={fill(w.typical, { n: c.typical })} /> : null}
                  </Box>
                ))}
              </Box>
            );
          })}

          {caseNote.decisions.length ? (
            <Box data-testid="safety-night-case-decisions">
              <Typography variant="overline" component="h5" sx={{ display: 'block', lineHeight: 1.6 }}>{w.decisions}</Typography>
              {caseNote.decisions.map((d, i) => (
                <Box key={`${d.day}-${i}`} sx={{ mt: 0.5 }}>
                  <Typography variant="body2">{`${dayWords(locale, d.day)} · ${d.words}`}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {fill(w.whoseDecision, { owner: owner(d.owner) })}
                    {d.link ? <>{' · '}<Link href={d.link} target="_blank" rel="noopener noreferrer">{w.source}</Link></> : null}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : null}

          {caseNote.answers.length ? (
            <Box data-testid="safety-night-case-answers">
              <Typography variant="overline" component="h5" sx={{ display: 'block', lineHeight: 1.6 }}>{w.answers}</Typography>
              <Stack spacing={1}>
                {caseNote.answers.map((a) => (
                  <Box key={a.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }} data-testid="safety-night-case-answer">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.question}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">{w.answerKinds[a.kind]}</Typography>
                    <Typography variant="body2">{a.answer}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}

          {caseNote.scoreLine ? <Typography variant="body2" data-testid="safety-night-case-score">{caseNote.scoreLine}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{m.missionParts.close}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SafetyNightCase;
