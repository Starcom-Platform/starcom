/**
 * The reports sealed to this person on a mission they published (the owner's MX32, 2026-10-23): each one's counts
 * and day, who sent it by their own callsign, and where it stands by NavCom's rules (§5.3), with Settle and
 * Challenge through the publish review. A mission that asks for no counts takes no reports, and shows nothing here;
 * one whose publisher names no inbox says so, and offers to post it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { reportsOn, subscribeReceivedReports, type ReceivedReport } from '../../../services/intel/received/receivedReports';
import { settlementOf, type Settlement } from '../../../services/intel/received/reportSettlement';
import { MissionLabelIngest } from '../../../services/intel/MissionLabelIngest';
import type { MissionLabel } from '../../../services/intel/missionLabels';
import { inboxRelays } from '../../../services/nostr/inboxRelays';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { keyLabel } from '../../../services/identity/names';
import { reviewInboxList, reviewReportLabel } from '../../../services/publishing/reportLabels';
import { countedBy } from '../../../services/intel/countLines';
import { useAccessVersion } from '../../../services/nostr/accessChanges';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { utcDateIn } from '../../../i18n/app/dates';
import { keptInboxOf, keptLabelOn, useKeptNotes } from '../../../services/intel/outbox/keptNotes';
import KeptNoteLine from '../../../components/Publishing/KeptNoteLine';

const WEEK_S = 7 * 86_400;

/** The labels on this mission's reports, by mission and word, as NavCom asks for them. */
function useReportLabels(coordinate: string | undefined): MissionLabel[] {
  const [labels, setLabels] = useState<MissionLabel[]>([]);
  const access = useAccessVersion();
  useEffect(() => {
    if (!coordinate) return undefined;
    const ingest = new MissionLabelIngest();
    const off = ingest.subscribe((label) => setLabels((held) => [...held, label].slice(-500)));
    ingest.start([coordinate], ['settled', 'witnessed', 'challenged']);
    return () => { off(); ingest.stop(); setLabels([]); };
  }, [coordinate, access]);
  return labels;
}

export const MissionReportsReceived: React.FC<{ mission: MissionUI }> = ({ mission }) => {
  const { lang, m } = useMessages();
  const t = m.missions;
  const said = m.missionParts.taking;
  const coordinate = mission.publishedAs;
  const asks = mission.countLines ?? [];
  const [reports, setReports] = useState<ReceivedReport[]>(() => (coordinate ? reportsOn(coordinate) : []));
  useEffect(() => {
    if (!coordinate) return undefined;
    setReports(reportsOn(coordinate));
    return subscribeReceivedReports(() => setReports(reportsOn(coordinate)));
  }, [coordinate]);
  const me = nostrIdentityService.signerPubkey();
  const [hasInbox, setHasInbox] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    if (me && asks.length) void inboxRelays(me).then((r) => { if (live) setHasInbox(r.length > 0); });
    return () => { live = false; };
  }, [me, asks.length]);
  const labels = useReportLabels(coordinate && asks.length ? coordinate : undefined);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000); return () => clearInterval(tick); }, []);
  const [notice, setNotice] = useState<string | null>(null);
  // What waits on this device because no relay took it (W1b): a settlement, a challenge, the inbox list.
  const keptNotes = useKeptNotes();
  const standing = useMemo(() => new Map(reports.map((r) => [r.id, settlementOf({ id: r.id, author: r.from, at: r.at }, new Set(me ? [me] : []), labels, now)])), [reports, labels, now, me]);

  if (!coordinate || asks.length === 0) return null;

  const standingText = (s: Settlement): string => {
    const how = s.state === 'pending' ? fill(said.settlesOn, { day: utcDateIn(lang, s.until * 1000, true) })
      : s.how === 'poster' ? said.settledByPublisher
        : s.how === 'witness' ? fill(said.settledByWitness, { who: keyLabel(s.by) })
          : said.settledBySilence;
    return s.challengedBy.length ? `${how} · ${fill(said.challengedBy, { who: s.challengedBy.map(keyLabel).join(', ') })}` : how;
  };
  const act = async (go: () => Promise<{ status: string; reason?: string }>) => {
    setNotice(null);
    try {
      const outcome = await go();
      if (outcome.status === 'refused' && outcome.reason) setNotice(fill(said.notSent, { why: outcome.reason }));
    } catch (e) {
      setNotice(fill(said.notSent, { why: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <Box data-testid="mission-reports-received">
      <Typography variant="subtitle2">{t.reportsHeading}</Typography>
      {hasInbox === false && (keptInboxOf(keptNotes, me) ? (
        <KeptNoteLine record={keptInboxOf(keptNotes, me)!} waiting={m.kept.inboxWaits} testId="mission-reports-inbox-kept" />
      ) : (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="mission-reports-no-inbox">
          <Typography variant="caption" color="warning.main">{t.reportsNoInbox}</Typography>
          <Button size="small" variant="outlined" onClick={() => { void act(async () => { const o = await reviewInboxList(); if (o.status === 'sent' && !o.result.kept) setHasInbox(true); return o; }); }}>{t.reportsPostInbox}</Button>
        </Stack>
      ))}
      {reports.length === 0 ? (
        <Typography variant="caption" color="text.secondary" component="div">{t.reportsNone}</Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ m: 0, mt: 0.5, pl: 0, listStyle: 'none' }}>
          {reports.map((r) => {
            const s = standing.get(r.id)!;
            const mine = s.state === 'settled' && s.how === 'poster';
            const challenged = !!me && s.challengedBy.includes(me);
            // Only the counts it asks, on its own lines, verbatim (NavCom §5.2).
            const counts = r.counts.filter((c) => asks.includes(c.line));
            const keptSettle = keptLabelOn(keptNotes, r.id, 'settled');
            const keptChallenge = keptLabelOn(keptNotes, r.id, 'challenged');
            return (
              <li key={r.id} data-testid="mission-report-received">
                <Typography variant="body2">{counts.map((c) => `${countedBy(c.line)} ${c.n}`).join(' · ') || '—'}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {`${fill(t.reportFrom, { day: utcDateIn(lang, Date.parse(`${r.day}T00:00:00Z`), true), who: r.callsign || keyLabel(r.from) })} · ${standingText(s)}`}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  {!mine && !keptSettle && <Button size="small" variant="outlined" onClick={() => { void act(() => reviewReportLabel(mission, r, 'settled')); }} data-testid="mission-report-settle">{t.reportSettle}</Button>}
                  {!challenged && !keptChallenge && now < r.at + WEEK_S && <Button size="small" onClick={() => { void act(() => reviewReportLabel(mission, r, 'challenged')); }} data-testid="mission-report-challenge">{t.reportChallenge}</Button>}
                </Stack>
                {keptSettle && <KeptNoteLine record={keptSettle} waiting={m.kept.settlementWaits} testId="mission-report-settle-kept" />}
                {keptChallenge && <KeptNoteLine record={keptChallenge} waiting={m.kept.challengeWaits} testId="mission-report-challenge-kept" />}
              </li>
            );
          })}
        </Stack>
      )}
      {notice && <Typography variant="caption" color="warning.main" component="div" data-testid="mission-reports-not-sent">{notice}</Typography>}
    </Box>
  );
};

export default MissionReportsReceived;
