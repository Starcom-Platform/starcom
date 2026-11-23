/**
 * Reporting back on a taken mission (decision D-MF, MF11–MF13): a whole number for each count it asks for, then
 * the publish review, which shows the report as it will be sealed to its publisher before anything is signed.
 * The reports sent are listed, each with its day and how many relays took it. A mission that names no counts
 * offers none. One whose publisher's key is exposed says reports are paused, and offers no form (NavCom §5.0).
 * Each report sent says where it stands, by NavCom's rules (§5.3): settled by its publisher, by a witness, or by
 * itself after seven days, and who challenged it; a challenge reverses nothing.
 */
import React, { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import type { TakenMission } from '../../../services/intel/received/takenMissions';
import { reviewMissionReport } from '../../../services/publishing/missionReports';
import { sealTargetOf } from '../../../services/nostr/publisherKeys';
import { keyLabel } from '../../../services/identity/names';
import { useReportSettlements } from '../../../services/intel/received/useReportSettlements';
import type { Settlement } from '../../../services/intel/received/reportSettlement';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { utcDateIn } from '../../../i18n/app/dates';

const WHOLE = /^\d{1,7}$/;

export const ReportBack: React.FC<{ mission: TakenMission }> = ({ mission }) => {
  const { lang, m } = useMessages();
  const t = m.missionParts.taking;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const settlements = useReportSettlements(mission);
  const counts = mission.counts ?? [];
  if (!counts.length) return null;

  const given = Object.entries(values).filter(([, v]) => v.trim() !== '');
  const valid = given.length > 0 && given.every(([, v]) => WHOLE.test(v.trim()));
  const labelOf = (id: string) => counts.find((c) => c.id === id)?.label ?? id;
  const target = sealTargetOf(mission.signer, Math.floor(Date.now() / 1000));
  const exposed = target.key ? null : target.exposedOn;
  const standing = (s: Settlement): string => {
    const how = s.state === 'pending' ? fill(t.settlesOn, { day: utcDateIn(lang, s.until * 1000, true) })
      : s.how === 'poster' ? t.settledByPublisher
        : s.how === 'witness' ? fill(t.settledByWitness, { who: keyLabel(s.by) })
          : t.settledBySilence;
    return s.challengedBy.length ? `${how} · ${fill(t.challengedBy, { who: s.challengedBy.map(keyLabel).join(', ') })}` : how;
  };

  const send = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const outcome = await reviewMissionReport(mission, Object.fromEntries(given.map(([k, v]) => [k, Number(v.trim())])));
      if (outcome.status === 'sent') { setOpen(false); setValues({}); }
      if (outcome.status === 'refused') setSaid(fill(t.notSent, { why: outcome.reason }));
    } catch (e) {
      setSaid(fill(t.notSent, { why: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid="report-back">
      {(mission.reports ?? []).map((r) => {
        const settled = r.id ? settlements.get(r.id) : undefined;
        return (
          <Typography key={r.sentAt} variant="caption" color="text.secondary" component="div" data-testid="report-sent">
            {`${fill(t.reported, { day: utcDateIn(lang, Date.parse(`${r.day}T00:00:00Z`), true), counts: Object.entries(r.values).map(([k, n]) => `${labelOf(k)} ${n}`).join(' · ') })} · ${counted(t.relaysTook, r.relays, {}, lang)}${settled ? ` · ${standing(settled)}` : ''}`}
          </Typography>
        );
      })}
      {exposed ? (
        <Typography variant="caption" color="text.secondary" component="div" data-testid="report-paused">
          {fill(t.reportPaused, { day: utcDateIn(lang, Date.parse(`${exposed}T00:00:00Z`), true) })}
        </Typography>
      ) : !open ? (
        <Button size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mt: 0.5 }} data-testid="report-back-open">{t.report}</Button>
      ) : (
        <Box sx={{ mt: 1 }} data-testid="report-back-form">
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>{t.reportIntro}</Typography>
          <Stack spacing={1}>
            {counts.map((c) => (
              <TextField
                key={c.id}
                size="small"
                label={c.label}
                value={values[c.id] ?? ''}
                onChange={(e) => setValues((held) => ({ ...held, [c.id]: e.target.value }))}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'data-testid': `report-count-${c.id}` }}
              />
            ))}
          </Stack>
          {given.length > 0 && !valid && <Typography variant="caption" color="warning.main" component="div">{t.needCount}</Typography>}
          {said && <Typography variant="caption" color="warning.main" component="div" data-testid="report-not-sent">{said}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant="contained" disabled={!valid || busy} onClick={() => { void send(); }} data-testid="report-back-send">{t.reviewSend}</Button>
            <Button size="small" onClick={() => { setOpen(false); setSaid(null); }}>{t.cancel}</Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default ReportBack;
