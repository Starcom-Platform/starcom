/**
 * Psi Watch's Lists (decision D-PW, build step 9, PW88–PW90): one of the left panels. The daily notes, every one read,
 * newest first, a week at a time; the registrations, each with whether a result exists; the ledger; and Intel in the
 * window of the sky event open in the Psi panel, every Intel Report whose own time falls inside it, nearest the exact
 * moment first, each shown in its popup and opened as a chart; and Psi Watch's missions (PW91), a row chosen marking
 * its window on the Timestream (PW92), each opening its card. Nothing scored or counted. The Experimental badge, and
 * nothing else said of it (PW34).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill, useMessages } from '../../i18n/app/i18n';
import { choosePsiMission, closePsiLists, openPsiLists, PSI_LIST_TABS, usePsiLists } from '../../features/psi/psiListsPanel';
import { openEventChart } from '../../features/psi/eventChartPanel';
import { requestIntelPopup } from '../../features/globe/interaction/intelPopupRequests';
import { usePsiKit } from './usePsiKit';
import { registerPaletteSource } from '../../features/palette/palette';
import { psiListsResults } from '../../features/psi/psiListsPalette';
import { setPsiOpened, usePsiLines } from '../../services/psiWatch/psiLinesStore';
import { useVisualizationModeOptional } from '../../context/VisualizationModeContext';
import { readLedger, readRegistration, readScryResult } from '../../services/psiWatch/psiEvents';
import { briefWeeks, intelInWindow, pointedItems, type PointedItem } from '../../services/psiWatch/lists/psiLists';
import { useHeldIntelReports } from '../../services/psiWatch/lists/useHeldIntelReports';
import { describeRecordTime } from '../../services/intel/recordTime';
import { formatUtcDate, formatUtcDateTime } from '../../utils/utcTime';
import { usePsiMissions } from './usePsiMissions';
import PsiMissionFacts from './PsiMissionFacts';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { PackageDetail } from '../../applications/teamworkspace/missions/ReceivedPackagesPanel';
import { useMissionLabels } from '../../services/intel/useMissionLabels';
import { coordinateFor } from '../../services/intel/missionPackageThread';
import type { PsiMission } from '../../services/psiWatch/missions/psiMissions';
import styles from './EventChartPanel.module.css';

/** A package's address as NavCom's labels key it: kind 30079, its signer and `d`. */
const coordinateOf = (mission: PsiMission): string => {
  const d = mission.pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  return d ? coordinateFor(mission.pkg.event.pubkey, d) : '';
};

const HOUR_MS = 3_600_000;

export const PsiListsPanel: React.FC = () => {
  const { open, tab, mission: chosen } = usePsiLists();
  const { m } = useMessages();
  const w = m.psiWatch.lists;
  const p = m.psiWatch.panel;
  const kit = usePsiKit(open);
  const of = (family: string) => kit.fixtures.filter((f) => f.family === family);
  const { event } = usePsiLines();
  const reports = useHeldIntelReports(open && tab === 'intel');
  const weeks = useMemo(() => (open ? briefWeeks(kit.fixtures.filter((f) => f.family === 'psi_brief').map((f) => f.event)) : []), [open, kit.fixtures]);
  const inWindow = useMemo(() => (event ? intelInWindow(reports, event) : []), [reports, event]);
  // Psi Watch's missions (PW91): a row chosen marks its window on the Timestream (PW92); Open shows its card.
  const missions = usePsiMissions(open && tab === 'missions');
  const temporal = useTemporalStateOptional();
  const [card, setCard] = useState<PsiMission | null>(null);
  const labels = useMissionLabels(card && !card.sample ? [coordinateOf(card)].filter(Boolean) : []);
  const goToPeak = (mission: PsiMission) => { if (mission.window) temporal?.setCurrentTime(mission.window.peakMs); };
  // A daily note's items, each opened as its kind is (kit 2.3): a sky event in the Psi panel, the field readings on
  // their section, a result among the registrations.
  const mode = useVisualizationModeOptional();
  const openItem = (item: PointedItem) => {
    if (item.kind === 'sky') { setPsiOpened(item.address); closePsiLists(); }
    else if (item.kind === 'field') { mode?.setVisualizationMode({ mode: 'PsiWatch', subMode: 'PsiField' }); closePsiLists(); }
    else if (item.kind === 'result') openPsiLists('registrations');
  };
  useEffect(() => registerPaletteSource({ id: 'psiLists', results: psiListsResults }), []);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => { setSaid(null); }, [tab, event]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePsiLists(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const results = of('psi_scry_result').map((f) => readScryResult(f.event));
  const fromExact = (ms: number) => {
    const n = Math.round(Math.abs(ms) / HOUR_MS);
    return n === 0 ? w.atExact : fill(ms < 0 ? w.beforeExact : w.afterExact, { n });
  };

  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="psi-lists-heading" data-testid="psi-lists-panel">
      <div className={styles.head}>
        <h2 id="psi-lists-heading" className={styles.heading}>{w.heading}</h2>
        <span className={styles.badge}>{p.experimental}</span>
        <button type="button" className={styles.close} aria-label={w.close} title={w.close} onClick={closePsiLists}>×</button>
      </div>
      <div className={styles.frames} role="tablist">
        {PSI_LIST_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} className={styles.chip}
            onClick={() => openPsiLists(t)} data-testid={`psi-lists-tab-${t}`}>
            {w[t]}
          </button>
        ))}
      </div>

      {tab === 'notes' && (weeks.length ? weeks.map((week) => (
        <section key={week.monday} data-testid="psi-lists-week">
          <h3 className={styles.subheading}>{fill(w.weekOf, { date: formatUtcDate(Date.parse(`${week.monday}T00:00:00Z`), { year: true }) })}</h3>
          {week.notes.map((note) => (
            <details key={note.address} data-testid="psi-lists-note">
              <summary>{note.title}</summary>
              {note.sections.map((section) => (
                <div key={section.heading}>
                  <p className={styles.quiet}>{section.heading}</p>
                  <ul className={styles.list}>{section.lines.map((line) => <li key={line} className={styles.row}>{line}</li>)}</ul>
                </div>
              ))}
              {note.points.length ? (
                <div data-testid="psi-lists-note-points">
                  <p className={styles.quiet}>{w.pointsTo}</p>
                  <ul className={styles.list}>
                    {pointedItems(note.points, kit.fixtures).map((item) => (
                      <li key={item.address} className={styles.row}>
                        <span>{item.title}</span>
                        {item.held && item.kind !== 'other' ? (
                          <button type="button" className={styles.chip} onClick={() => openItem(item)} data-testid={`psi-lists-open-${item.kind}`}>{w.openItem}</button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </details>
          ))}
        </section>
      )) : <p className={styles.quiet}>{w.noNotes}</p>)}

      {tab === 'registrations' && (of('psi_registration').length ? (
        <ul className={styles.list} data-testid="psi-lists-registrations">
          {of('psi_registration').map((fixture) => {
            const registration = readRegistration(fixture.event);
            const result = results.find((r) => r.registration === registration.id);
            const verdict = result ? (p.verdicts as Record<string, string>)[result.verdict] ?? result.verdict : null;
            return (
              <li key={registration.address} className={styles.row}>
                <span>
                  {registration.title}
                  <span className={styles.quiet}>
                    {' · '}{fill(p.sealed, { rung: registration.rung, time: formatUtcDateTime(Date.parse(registration.sealedAt), { year: true }) })}
                    {' · '}{verdict ? fill(p.resultIs, { verdict }) : p.noResult}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.quiet}>{w.noRegistrations}</p>)}

      {tab === 'ledger' && (of('psi_ledger').length ? (
        <ul className={styles.list} data-testid="psi-lists-ledger">
          {of('psi_ledger').map((fixture) => {
            const ledger = readLedger(fixture.event);
            const count = (name: string) => ledger.counts[name] ?? 0;
            return (
              <li key={ledger.address} className={styles.row}>
                <span>{ledger.title}<span className={styles.quiet}>{' · '}{fill(p.ledgerLine, { registered: count('registered'), scored: count('scored'), met: count('met'), missed: count('missed') })}</span></span>
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.quiet}>{w.noLedger}</p>)}

      {tab === 'intel' && (!event ? <p className={styles.quiet}>{w.noEvent}</p> : (
        <>
          <p className={styles.subject} data-testid="psi-lists-window">
            {fill(w.intelOf, {
              title: event.title, from: formatUtcDateTime(event.from * 1000), until: formatUtcDateTime(event.until * 1000), exact: formatUtcDateTime(event.exact * 1000),
            })}
          </p>
          {inWindow.length ? (
            <ul className={styles.list} data-testid="psi-lists-intel">
              {inWindow.map(({ report, time, fromExactMs }) => {
                const said = describeRecordTime(time);
                const placed = typeof report.latitude === 'number' && typeof report.longitude === 'number';
                return (
                  <li key={report.id} className={styles.row} data-testid="psi-lists-intel-row">
                    <span>
                      {report.title}
                      <span className={styles.quiet}>{` · ${said.label} ${said.text} · ${fromExact(fromExactMs)}`}</span>
                    </span>
                    <span>
                      <button type="button" className={styles.chip} data-testid="psi-lists-show"
                        onClick={() => setSaid(requestIntelPopup(report.id) ? null : w.notDrawn)}>{w.show}</button>
                      {placed ? (
                        <button type="button" className={styles.chip}
                          onClick={() => openEventChart({ title: report.title, timeMs: time.start, place: { lat: report.latitude as number, lng: report.longitude as number }, layer: 'Intel Reports' })}>
                          {m.psiWatch.chart.action}
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className={styles.quiet}>{w.noIntel}</p>}
          {said ? <p className={styles.quiet} role="status" data-testid="psi-lists-said">{said}</p> : null}
        </>
      ))}

      {tab === 'missions' && (missions.length ? (
        <ul className={styles.list} data-testid="psi-lists-missions">
          {missions.map((mission) => {
            const isChosen = mission.address === chosen;
            return (
              <li key={mission.address} data-testid="psi-lists-mission">
                <div className={styles.row}>
                  <button type="button" className={styles.chip} aria-pressed={isChosen} aria-expanded={isChosen}
                    onClick={() => choosePsiMission(isChosen ? null : mission.address)} data-testid="psi-lists-mission-choose">
                    {mission.title}
                  </button>
                  <button type="button" className={styles.chip} title={m.psiWatch.missions.openTitle} onClick={() => setCard(mission)}
                    data-testid="psi-lists-mission-open">
                    {m.psiWatch.missions.open}
                  </button>
                </div>
                {isChosen ? <PsiMissionFacts mission={mission} onGoToPeak={() => goToPeak(mission)} /> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className={styles.quiet}>{w.noMissions}</p>)}
      {card ? (
        <PackageDetail pkg={card.pkg} onClose={() => setCard(null)} labels={labels} psi={{ mission: card, goToPeak: () => goToPeak(card) }} />
      ) : null}
    </aside>
  ), document.body);
};

export default PsiListsPanel;
