/**
 * The mission card's field variant for a package with a window (decision D-RR, RR2; Mecha Jono's kit 5.4): a safety
 * presence round a recurring night in a city. In the kit's order: the 911 card, always visible, above everything; the
 * mission line, its state with its age, and when it ends; the window on the shared timeline, in the place's own zone;
 * the score line once, and the Case when one exists; the three checklists, each objective with its code and minutes;
 * the topics to look up for one's own place; and after the night, the totals and the count of who took part, hidden
 * until the window has closed. Its state is held to the clock, the shared cursor (the present while the timeline is
 * live). No badge, no alarm styling, no claim count, list or map; nobody named.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { localeOf, localTime, zoneName } from '../../../services/rlsh/recurrence/localTimes';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import type { ObjectiveAsk } from '../../../services/exchange/types';
import { missionCardOf } from '../../../services/intel/received/missionCard';
import { takingPartOf } from '../../../services/intel/packageProfile';
import { coordinateFor } from '../../../services/intel/missionPackageThread';
import { ageOf, shownState, type WindowState } from '../../../services/psiWatch/windowProfile';
import {
  coalitionCount, readRecurrenceCase, readRecurrenceWindow, stateAt, type RecurrenceWindow,
} from '../../../services/rlsh/recurrence/recurrence';
import {
  checksOf, endReasonOf, objectiveCodes, packageCaseOf, packageWindowOf, PHASES,
} from '../../../services/rlsh/recurrence/recurrencePackage';
import { standingAt, type RlshHeld } from '../../../services/rlsh/recurrence/useRlshItems';
import { missionTotals, missionTotalsVersion, readMissionTotals, startMissionTotalsRead, subscribeMissionTotals, type MissionTotals } from '../../../services/roster/missionTotals';
import { WindowTimeline } from '../../../components/PsiWatch/WindowTimeline';
import SafetyNightCase from './SafetyNightCase';
import type { Event } from 'nostr-tools';

/** The cursor, unix seconds: the present while the timeline is live. */
function useCursorS(): number {
  const temporal = useTemporalStateOptional();
  return Math.floor((temporal?.currentTime ?? Date.now()) / 1000);
}

const isEnded = (pkg: AcceptedPackage) => pkg.event.tags.some((t) => t[0] === 'mission_state' && t[1] === 'closed');
const validUntilOf = (pkg: AcceptedPackage): number | null => {
  const v = Number(pkg.event.tags.find((t) => t[0] === 'valid_until')?.[1]);
  return Number.isFinite(v) ? v : null;
};

/**
 * The window note the package names, as it stood at the cursor, and never as it stood before the package was sent: a
 * package exists only from its window's arming, so its note is at least as new as it. Null until one is held.
 */
function windowNoteOf(pkg: AcceptedPackage, held: RlshHeld, atS: number): RecurrenceWindow | null {
  const address = packageWindowOf(pkg.check.manifest)?.note;
  if (!address) return null;
  return standingAt(held.notes.recurrence_window, Math.max(atS, pkg.event.created_at)).map(readRecurrenceWindow).find((w) => w?.address === address) ?? null;
}

/** The 911 card (kit 5.4, 1): always visible, above everything else; text only, no button, no alarm styling. */
export const SafetyNight911: React.FC = () => {
  const { m } = useMessages();
  const w = m.missionParts.safetyNight;
  return (
    <Box role="note" data-testid="safety-night-911"
      // Pinned flush to the card's top edge: at top 0 it stood below the content's 16 px padding, and what scrolled
      // past showed above it (seen on the build, 11 Nov).
      sx={{ position: 'sticky', top: -16, zIndex: 1, mb: 1.5, p: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.call911}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">{w.notEmergency}</Typography>
    </Box>
  );
};

/** The mission line, its state and age, when it ends, the window, the score line and the Case (kit 5.4, 2–4). */
export const SafetyNightTop: React.FC<{ pkg: AcceptedPackage; held: RlshHeld }> = ({ pkg, held }) => {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const tl = m.psiWatch.timeline;
  const cursorS = useCursorS();
  const nowS = Math.floor(Date.now() / 1000);
  const [caseOpen, setCaseOpen] = useState(false);
  const night = packageWindowOf(pkg.check.manifest);
  if (!night) return null;
  const note = windowNoteOf(pkg, held, cursorS);
  const window = note?.window ?? night.window;
  const tzid = note?.tzid ?? night.tzid;
  // The window note's state held to the clock; else the package's own, by the same rule (kit 4.2).
  const state: WindowState = isEnded(pkg) ? 'closed' : note ? stateAt(note, cursorS) : shownState(night.state ?? 'armed', window.from, window.until, cursorS) ?? 'closed';
  const publishedAt = note?.publishedAt ?? pkg.event.created_at;
  const age = ageOf(cursorS - publishedAt);
  const ageText = cursorS < publishedAt
    ? fill(w.asOf, { time: localTime(lang, publishedAt, tzid).text })
    : age.unit === 'now' ? tl.updatedNow : counted(age.unit === 'minutes' ? tl.updatedMinutes : age.unit === 'hours' ? tl.updatedHours : tl.updatedDays, age.n);
  const closedWords = state === 'closed'
    ? (isEnded(pkg) ? endReasonOf(pkg.check.manifest) : null) ?? (note?.closedBecause === 'not_needed' ? w.closedNotNeeded : w.closedPassed)
    : null;
  const until = validUntilOf(pkg) ?? window.until;
  const t = (s: number) => localTime(lang, s, tzid);
  const caseRef = packageCaseOf(pkg.check.manifest);
  // The Case the package names, as it stood at the cursor and never older than the package; shown once one exists.
  const caseNote = caseRef
    ? standingAt(held.notes.recurrence_case, Math.max(cursorS, pkg.event.created_at)).map(readRecurrenceCase).find((c) => c?.address === caseRef.address) ?? null
    : null;
  return (
    <Stack spacing={1} data-testid="safety-night-top">
      <Typography variant="subtitle1" component="p" sx={{ fontWeight: 600, m: 0 }}>{missionCardOf(pkg).headline}</Typography>
      <Typography variant="body2" data-testid="safety-night-state">
        {tl.windowStates[state]}
        {state === 'armed' ? ` · ${fill(w.opensAt, { time: t(window.from).text })}` : null}
        {state === 'drafted' ? ` · ${w.notYetPossible}` : null}
        {closedWords ? ` · ${closedWords}` : null}
        {` · ${ageText}`}
      </Typography>
      <Typography variant="body2" title={t(until).title}>{fill(w.ends, { time: t(until).text })}</Typography>
      <Box>
        <Typography variant="body2" title={`${t(window.from).title} – ${t(window.until).title}`}>
          {fill(w.span, { from: t(window.from).text, until: t(window.until).text })}
        </Typography>
        <Typography variant="body2" title={t(window.peak).title}>{fill(w.busiest, { time: t(window.peak).text })}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">{fill(w.zone, { zone: zoneName(lang, tzid, window.from) })}</Typography>
        <WindowTimeline window={window} title={missionCardOf(pkg).headline} hue="var(--sc-accent)" now={nowS} cursor={cursorS} peakWord="peak" />
      </Box>
      {note?.scoreLine ? <Typography variant="body2" data-testid="safety-night-score">{note.scoreLine}</Typography> : null}
      {caseNote ? (
        <Box>
          <Button size="small" onClick={() => setCaseOpen(true)} data-testid="safety-night-case" title={w.openCase} sx={{ textTransform: 'none', p: 0, minWidth: 0, textAlign: 'left' }}>
            {`${w.caseLabel}: ${caseNote.title}`}
          </Button>
        </Box>
      ) : null}
      {caseOpen && caseNote ? <SafetyNightCase caseNote={caseNote} onClose={() => setCaseOpen(false)} /> : null}
    </Stack>
  );
};

/** The three checklists, each objective with its code and minutes, and the topics to look up (kit 5.4, 5–6). */
export const SafetyNightChecklists: React.FC<{ pkg: AcceptedPackage }> = ({ pkg }) => {
  const { m } = useMessages();
  const w = m.missionParts.safetyNight;
  const manifest = pkg.check.manifest;
  const night = packageWindowOf(manifest);
  if (!manifest || !night) return null;
  const ended = isEnded(pkg);
  const objectives = manifest.objectives ?? [];
  const codes = objectiveCodes(objectives);
  const byId = new Map<string, ObjectiveAsk>(objectives.map((o) => [o.id, o]));
  const checks = ended ? [] : checksOf(pkg.event.tags);
  return (
    <Box data-testid="safety-night-checklists" sx={ended ? { opacity: 0.55 } : undefined} aria-disabled={ended || undefined}>
      {PHASES.map((phase) => {
        const items = night.phases[phase].map((id) => byId.get(id)).filter((o): o is ObjectiveAsk => !!o);
        if (!items.length) return null;
        return (
          <Box key={phase} data-testid={`safety-night-phase-${phase}`}>
            <Typography variant="overline" component="h5" sx={{ display: 'block', lineHeight: 1.6 }}>{w.phases[phase]}</Typography>
            <List dense disablePadding>
              {items.map((o) => (
                <ListItem key={o.id} disableGutters>
                  <ListItemText
                    primary={`${codes.get(o.id) ? `${codes.get(o.id)} · ` : ''}${o.ask}`}
                    secondary={typeof o.effortMinutes === 'number' && o.effortMinutes > 0 ? fill(w.minutes, { n: o.effortMinutes }) : undefined}
                    slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        );
      })}
      {checks.length ? (
        <Box data-testid="safety-night-checks">
          <Typography variant="body2" sx={{ mt: 1 }}>{w.lookUp}</Typography>
          <List dense disablePadding>
            {checks.map((c) => <ListItem key={c} disableGutters><ListItemText primary={w.checks[c]} slotProps={{ primary: { variant: 'body2' } }} /></ListItem>)}
          </List>
        </Box>
      ) : null}
    </Box>
  );
};

/** After the night: the totals, counts only, and the count of who took part, hidden until the window closes (kit 5.4, 7; 5.6). */
export const SafetyNightAfter: React.FC<{ pkg: AcceptedPackage; held: RlshHeld; sample: boolean }> = ({ pkg, held, sample }) => {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const cursorS = useCursorS();
  const night = packageWindowOf(pkg.check.manifest);
  const d = pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  const coordinate = d ? coordinateFor(pkg.event.pubkey, d) : '';
  // Live totals through the one totals read; the kit's from its own file, only once published by the cursor.
  const hasNight = night !== null;
  useEffect(() => (sample || !hasNight ? undefined : startMissionTotalsRead()), [sample, hasNight]);
  useSyncExternalStore(subscribeMissionTotals, missionTotalsVersion, missionTotalsVersion);
  if (!night) return null;
  const until = validUntilOf(pkg) ?? night.window.until;
  if (cursorS <= until && !isEnded(pkg)) return null;
  const totals: MissionTotals | null = sample
    ? held.notes.mission_totals.filter((n) => n.created_at <= cursorS)
      .map((n) => readMissionTotals(n as unknown as Event)).flatMap((r) => (r.ok && r.totals.coordinate === coordinate ? [r.totals] : []))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    : missionTotals().of(coordinate);
  const coalition = coalitionCount(until, cursorS, takingPartOf(pkg.event));
  return (
    <Box data-testid="safety-night-after">
      {totals ? (
        <Box data-testid="safety-night-totals">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {fill(w.totals, { date: totals.asOf ? new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${totals.asOf}T00:00:00Z`)) : '', n: totals.reports ?? 0 })}
          </Typography>
          <List dense disablePadding>
            {totals.counts.map((c) => <ListItem key={c.label} disableGutters><ListItemText primary={`${c.label}: ${c.n}`} slotProps={{ primary: { variant: 'body2' } }} /></ListItem>)}
          </List>
          <Typography variant="caption" color="text.secondary" component="div">{w.countsOnly}</Typography>
        </Box>
      ) : null}
      <Box data-testid="safety-night-coalition" sx={{ mt: 1 }}>
        {'why' in coalition ? (
          <Typography variant="caption" color="text.secondary" component="div">{coalition.why === 'before_until' ? w.shownAfterClose : w.notCounted}</Typography>
        ) : (
          <>
            <Typography variant="body2">{fill(w.takingPart, { n: coalition.operators })}</Typography>
            {coalition.agents > 0 ? <Typography variant="body2">{fill(w.agentsTakingPart, { n: coalition.agents })}</Typography> : null}
          </>
        )}
      </Box>
    </Box>
  );
};
