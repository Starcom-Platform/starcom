/**
 * Making a call (decision D-PW, PW40, PW44, PW56, PW72), from a window's card: the window is the call's, the Zone the
 * one under the drawer's observer (the globe's centre, or the place pinned), what is expected a kind from PW56's list
 * with the operative's own words, and the team relay its seal goes to. Seal keeps the call on this device and opens
 * the publish review for its fingerprint; a call is sealed only before its window opens.
 */
import React, { useMemo, useState } from 'react';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES } from '../../../styles/tokens';
import { addCall, CALL_KINDS, newCall, removeCall, type CallKind } from '../../../services/psiWatch/calls';
import { reviewCallSeal } from '../../../services/publishing/psiCalls';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { isJoinedRelay } from '../../../services/nostr/joinedRelays';
import styles from './TimestreamDrawer.module.css';

const WORDS_MAX = 500;

export interface CallCardProps {
  window: { address: string; title: string; fromMs: number; untilMs: number };
  zone: { code: string; name: string } | null;
  now: number;
  onDone: (notice: string | null) => void;
}

const CallCard: React.FC<CallCardProps> = ({ window: win, zone, now, onDone }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const teams = useMemo(() => realTimeTeamService.getTeams().filter((t) => t.relayUrl && isJoinedRelay(t.relayUrl)), []);
  const [kind, setKind] = useState<CallKind>('quakes');
  const [detail, setDetail] = useState('');
  const [words, setWords] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const opened = now >= win.fromMs;
  const team = teams.find((t) => t.id === teamId);
  const ready = !opened && !busy && zone !== null && team !== undefined && words.trim().length > 0
    && ((kind !== 'intel' && kind !== 'archetype') || detail.trim().length > 0);

  const seal = async () => {
    if (!ready || !zone || !team?.relayUrl) return;
    setBusy(true);
    const call = newCall({
      window: { address: win.address, title: win.title, start: Math.floor(win.fromMs / 1000), end: Math.ceil(win.untilMs / 1000) },
      place: { zone: zone.code, name: zone.name },
      expects: { kind, ...(kind === 'intel' || kind === 'archetype' ? { detail: detail.trim() } : {}) },
      words: words.trim(),
    }, now);
    const { id } = call;
    addCall(call);
    const outcome = await reviewCallSeal(id, { relay: team.relayUrl, name: team.name });
    setBusy(false);
    if (outcome.status === 'sent') { onDone(fill(w.callSealed, { team: team.name })); return; }
    removeCall(id);
    if (outcome.status === 'refused') onDone(outcome.reason);
  };

  return (
    <div className={styles.callCard} role="dialog" aria-label={fill(w.callNew, { title: win.title })} data-testid="psi-timestream-call-card">
      <span className={styles.aspectCardName} style={{ borderColor: DATA_SCALES.psiGround }}>{fill(w.callNew, { title: win.title })}</span>
      <span className={styles.readoutTime}>{fill(w.windowSpan, { from: formatUtcDateTime(win.fromMs, { year: true }), until: formatUtcDateTime(win.untilMs, { year: true }) })}</span>
      <span>{zone ? fill(w.callZone, { zone: zone.name }) : w.callNoZone}</span>
      <label className={styles.callField}>
        {w.callKind}
        <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value as CallKind)}>
          {CALL_KINDS.map((k) => <option key={k} value={k}>{w.callKinds[k]}</option>)}
        </select>
      </label>
      {kind === 'intel' || kind === 'archetype' ? (
        <label className={styles.callField}>
          {w.callDetail}
          <input className={styles.select} value={detail} maxLength={120} onChange={(e) => setDetail(e.target.value)} />
        </label>
      ) : null}
      <label className={styles.callField}>
        {w.callWords}
        <textarea className={styles.callWords} value={words} maxLength={WORDS_MAX} rows={3} onChange={(e) => setWords(e.target.value)} />
      </label>
      {teams.length ? (
        <label className={styles.callField}>
          {w.callTeam}
          <select className={styles.select} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      ) : <span className={styles.readoutTime}>{w.callNoTeam}</span>}
      {opened ? <span className={styles.readoutTime}>{w.callOpened}</span> : null}
      <span className={styles.group}>
        <button type="button" className={styles.chip} disabled={!ready} onClick={() => { void seal(); }}>{w.callSeal}</button>
        <button type="button" className={styles.chip} onClick={() => onDone(null)}>{w.aspectClose}</button>
      </span>
    </div>
  );
};

export default CallCard;
