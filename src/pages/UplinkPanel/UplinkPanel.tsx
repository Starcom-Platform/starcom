/**
 * Starcom in Uplink's side panel (decision D-EX, E2, W6; EX13, EX16): a slim Starcom page, framed by
 * the extension beside whatever the person is reading. It is the app itself, sharing this browser's
 * storage, so its cases are the person's cases, not a copy.
 *
 * It holds the case open for captures (EX16): what the person sends from the page beside it goes
 * there, while the panel is open, and the captures sent to it are listed as they arrive. Beside them,
 * the missions resting on the case, with each open objective's limits, so the person sees what they
 * may not do while they collect. Everything else opens in a Starcom tab.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Glyph } from '../../symbols/Glyph';
import UtcTime from '../../components/Shared/UtcTime';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';
import { useCaseMissions } from '../../core/intel/hooks/useCaseMissions';
import { recordPath } from '../../routes/recordLink';
import { unfiledCaptures } from '../../extension/captureItems';
import { chooseOpenCase, lastPanelCase, releaseOpenCase } from '../../extension/openCase';
import { capturesInCase, openObjectives } from '../../extension/panelView';
import { useStarcomUplink } from '../../extension/useStarcomUplink';
import { useUplinkCaptures } from '../../extension/useUplinkCaptures';
import { useUplinkInboxCount } from '../../extension/useUplinkInboxCount';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { IntelItemUI } from '../../types/intel/IntelItemUI';
import styles from './UplinkPanel.module.css';
import { fill, useMessages } from '../../i18n/app/i18n';

const NO_CASE = '';

/** The workspace's cases, items and reports, kept current. */
function useWorkspace() {
  const [snapshot, setSnapshot] = useState<{ ready: boolean; cases: IntelCaseUI[]; items: IntelItemUI[]; cited: string[] }>(
    { ready: false, cases: [], items: [], cited: [] },
  );
  useEffect(() => {
    let live = true;
    const read = () => {
      if (!live) return;
      setSnapshot({
        ready: true,
        cases: intelWorkspaceManager.getCases(),
        items: intelWorkspaceManager.getIntelItems(),
        cited: intelWorkspaceManager.getReports().flatMap((r) => r.sourceIntel ?? []),
      });
    };
    void intelWorkspaceManager.ensureInitialized().then(read);
    const stop = intelWorkspaceManager.subscribe(read);
    return () => { live = false; stop(); };
  }, []);
  return snapshot;
}

const UplinkPanel: React.FC = () => {
  const uplink = useStarcomUplink();
  // The panel is a Starcom page: it takes what is sent while it is open, with or without a Starcom tab.
  useUplinkCaptures();
  useUplinkInboxCount();
  const { ready, cases, items, cited } = useWorkspace();
  const [caseId, setCaseId] = useState<string | null>(null);

  // Opens with the case it had last, if that case is still here: once, when the workspace is first read.
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const last = lastPanelCase((id) => cases.some((c) => c.id === id));
    setCaseId(last);
    chooseOpenCase(last);
  }, [ready, cases]);

  // Open only while the panel is: let it go when the panel closes.
  useEffect(() => {
    const close = () => releaseOpenCase(caseId);
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, [caseId]);

  const choose = (id: string | null) => {
    setCaseId(id);
    chooseOpenCase(id);
  };

  // In the language chosen (D-ML, L3).
  const { m: words } = useMessages();
  const t = words.panel;
  const open = cases.find((c) => c.id === caseId) ?? null;
  const sent = useMemo(() => (open ? capturesInCase(items, open) : []), [items, open]);
  const waiting = useMemo(() => unfiledCaptures(items, [...cases, { sourceIntelIds: cited }]).length, [items, cases, cited]);
  const { missions } = useCaseMissions(open?.id ?? null);
  const work = useMemo(() => openObjectives(missions), [missions]);

  return (
    <main className={styles.panel} data-testid="uplink-panel-page">
      <header className={styles.head}>
        <Glyph name="action:uplink" size={18} />
        <span className={styles.wordmark}>Starcom</span>
        <span className={styles.status} data-status={uplink.status}>
          {uplink.status === 'connected' ? t.connected : uplink.status === 'absent' ? t.absent : t.looking}
        </span>
      </header>

      <section className={styles.section}>
        <label className={styles.label} htmlFor="panel-case">{t.caseLabel}</label>
        <select
          id="panel-case"
          className={styles.select}
          value={caseId ?? NO_CASE}
          onChange={(e) => choose(e.target.value || null)}
          disabled={!ready}
        >
          <option value={NO_CASE}>{t.noCase}</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{`${c.caseNumber || c.id} · ${c.title}`}</option>)}
        </select>
        <p className={styles.note}>
          {open ? t.toCase : t.toInbox}
        </p>
      </section>

      {open && (
        <section className={styles.section} aria-labelledby="panel-sent">
          <h2 id="panel-sent" className={styles.heading}>{t.sent}</h2>
          {sent.length === 0 ? (
            <p className={styles.note}>{t.nothingSent}</p>
          ) : (
            <ul className={styles.list}>
              {sent.map((i) => (
                <li key={i.id} className={styles.capture} data-testid="panel-capture">
                  <span className={styles.title}>{i.title}</span>
                  <span className={styles.meta}>{i.source} · <UtcTime at={i.collectedAt ?? i.createdAt} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {open && (
        <section className={styles.section} aria-labelledby="panel-work">
          <h2 id="panel-work" className={styles.heading}>{t.missions}</h2>
          {work.length === 0 ? (
            <p className={styles.note}>{t.noMissions}</p>
          ) : work.map((m) => (
            <div key={m.id} className={styles.mission} data-testid="panel-mission">
              <a className={styles.missionTitle} href={recordPath('mission', m.id)} target="_blank" rel="noopener noreferrer">{m.title}</a>
              <ul className={styles.list}>
                {m.objectives.map((o) => (
                  <li key={o.id}>
                    {o.description}
                    {o.limits.length > 0 && <span className={styles.limits}>{fill(t.limits, { limits: o.limits.join('; ') })}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <footer className={styles.foot}>
        {open && <a href={recordPath('case', open.id)} target="_blank" rel="noopener noreferrer">{t.openCase}</a>}
        <a href="/app/cases" target="_blank" rel="noopener noreferrer" data-testid="panel-waiting">{fill(t.waiting, { n: waiting })}</a>
      </footer>
    </main>
  );
};

export default UplinkPanel;
