/**
 * The Safety windows' calendar (decision D-RR, RR1; Mecha Jono's kit 5.1): the windows round recurring nights,
 * grouped by the local day of their start in the place's own zone, each with its place and areas as words, its state
 * at the cursor, "{from} to about {until}" in that zone (the viewer's own on hover), when it is busiest, the schedule's
 * line with its age, and the score line once. Closed windows stay as history with why; a drafted one is greyed,
 * "Not yet possible.". The next 14 days and the last 7 by default, or every window held. No names, team, meeting point
 * or count of takers; no badge; no alarm styling.
 */
import React, { useState } from 'react';
import { PackageDetail } from '../../applications/teamworkspace/missions/ReceivedPackagesPanel';
import { samplePackagesAt } from '../../applications/teamworkspace/missions/RlshSamplesList';
import { useReceivedPackages } from '../../services/intel/useReceivedPackages';
import { useMissionLabels } from '../../services/intel/useMissionLabels';
import { coordinateFor } from '../../services/intel/missionPackageThread';
import type { AcceptedPackage } from '../../services/intel/MissionPackageIngest';
import { rlshKitSamplesOn } from '../../services/rlsh/recurrence/rlshKit';
import { useRlshItems } from '../../services/rlsh/recurrence/useRlshItems';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { ageOf } from '../../services/psiWatch/windowProfile';
import { inDefaultRange, type ShownWindow } from '../../services/rlsh/recurrence/useSafetyWindows';
import { localDay, localTime, zoneName } from '../../services/rlsh/recurrence/localTimes';
import { Docked } from '../Dock/Docked';

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto', pointerEvents: 'auto', maxWidth: 380,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const heading: React.CSSProperties = { color: 'var(--sc-text-heading)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const chip = (on: boolean): React.CSSProperties => ({
  background: 'none', border: `1px solid ${on ? 'var(--sc-accent)' : 'var(--sc-divider)'}`, borderRadius: 3,
  color: on ? 'var(--sc-text-heading)' : 'var(--sc-text-secondary)', font: 'inherit', padding: '1px 6px', cursor: 'pointer',
});

const coordinateOf = (pkg: AcceptedPackage): string => {
  const d = pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  return d ? coordinateFor(pkg.event.pubkey, d) : '';
};

const Row: React.FC<{ shown: ShownWindow; cursorS: number; mission: AcceptedPackage | null; onOpen: (pkg: AcceptedPackage) => void }> = ({ shown, cursorS, mission, onOpen }) => {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const tl = m.psiWatch.timeline;
  const { window: note, state } = shown;
  const t = (s: number) => localTime(lang, s, note.tzid);
  const age = (asOf: number) => {
    const a = ageOf(Math.max(0, cursorS - asOf));
    return a.unit === 'now' ? tl.updatedNow : counted(a.unit === 'minutes' ? tl.updatedMinutes : a.unit === 'hours' ? tl.updatedHours : tl.updatedDays, a.n);
  };
  const said = [
    tl.windowStates[state],
    state === 'armed' ? fill(w.opensAt, { time: t(note.window.from).text }) : null,
    state === 'drafted' ? w.notYetPossible : null,
    state === 'closed' ? (note.closedBecause === 'not_needed' ? w.closedNotNeeded : w.closedPassed) : null,
  ].filter(Boolean).join(' · ');
  return (
    <li data-testid="safety-window-row" data-state={state} style={{ margin: '6px 0', ...(state === 'drafted' ? { opacity: 0.55 } : {}) }}>
      <div style={{ fontWeight: 600 }}>{note.place ?? note.title}</div>
      {note.areas.length ? <div style={muted}>{fill(w.inAreas, { areas: note.areas.join('; ') })}</div> : null}
      <div data-testid="safety-window-state">{said}</div>
      <div title={`${t(note.window.from).title} – ${t(note.window.until).title}`}>
        {fill(w.span, { from: t(note.window.from).text, until: t(note.window.until).text })}
      </div>
      <div title={t(note.window.peak).title}>{fill(w.busiest, { time: t(note.window.peak).text })}</div>
      {note.schedule ? (
        <div style={muted}>{note.schedule.asOf !== null ? `${note.schedule.words} · ${age(note.schedule.asOf)}` : note.schedule.words}</div>
      ) : null}
      {note.scoreLine ? <div data-testid="safety-window-score">{note.scoreLine}</div> : null}
      {/* Its mission's card, with its Case, once the package is held (D-RR follow-up). */}
      {mission ? (
        <button type="button" style={chip(false)} onClick={() => onOpen(mission)} data-testid="safety-window-mission">{w.seeMission}</button>
      ) : null}
    </li>
  );
};

export const SafetyWindowsPanel: React.FC<{ windows: readonly ShownWindow[]; cursorS: number }> = ({ windows, cursorS }) => {
  const { lang, m } = useMessages();
  const w = m.missionParts.safetyNight;
  const [all, setAll] = useState(false);
  // Each window's package, as it stood at the cursor: the kit's sample under ?rlsh=kit, else the one received.
  const [open, setOpen] = useState<AcceptedPackage | null>(null);
  const samples = useRlshItems(rlshKitSamplesOn());
  const received = useReceivedPackages(windows.some((s) => s.window.packageAddress !== null));
  const packages = [...samplePackagesAt(samples, cursorS), ...received.accepted];
  const missionOf = (address: string | null) => (address ? packages.find((p) => coordinateOf(p) === address) ?? null : null);
  const labels = useMissionLabels(open && open.relay !== 'kit' ? [coordinateOf(open)] : []);
  const shown = all ? windows : windows.filter((s) => inDefaultRange(s.window, cursorS));
  const outside = windows.length - shown.length;
  // By the local day of each window's start, in its own zone; in the order of their starts.
  const days: Array<{ key: string; label: string; rows: ShownWindow[] }> = [];
  for (const s of shown) {
    const day = localDay(lang, s.window.window.from, s.window.tzid);
    const label = fill(w.dayIn, { day: day.text, zone: zoneName(lang, s.window.tzid, s.window.window.from) });
    const at = days.find((d) => d.key === `${day.key}|${s.window.tzid}`);
    if (at) at.rows.push(s); else days.push({ key: `${day.key}|${s.window.tzid}`, label, rows: [s] });
  }
  return (
    <Docked slot="safetyWindows">
      <div style={wrap} data-testid="safety-windows-panel">
        <div style={heading}>{w.heading}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label={w.heading}>
          <button type="button" style={chip(!all)} aria-pressed={!all} onClick={() => setAll(false)} data-testid="safety-windows-soon">{w.rangeSoon}</button>
          <button type="button" style={chip(all)} aria-pressed={all} onClick={() => setAll(true)} data-testid="safety-windows-all">{w.rangeAll}</button>
        </div>
        {days.length ? days.map((day) => (
          <section key={day.key} data-testid="safety-windows-day">
            <div style={{ ...muted, marginTop: 4 }}>{day.label}</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {day.rows.map((s) => <Row key={s.window.address} shown={s} cursorS={cursorS} mission={missionOf(s.window.packageAddress)} onOpen={setOpen} />)}
            </ul>
          </section>
        )) : <div style={muted} data-testid="safety-windows-none">{w.none}</div>}
        {!all && outside > 0 ? (
          <button type="button" style={chip(false)} onClick={() => setAll(true)} data-testid="safety-windows-outside">{fill(w.outside, { n: outside })}</button>
        ) : null}
      </div>
      {open && <PackageDetail pkg={open} onClose={() => setOpen(null)} labels={labels} />}
    </Docked>
  );
};

export default SafetyWindowsPanel;
