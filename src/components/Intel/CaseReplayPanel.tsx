import React, { useEffect, useMemo, useState } from 'react';
import KeyName from '../Identity/KeyName';
import { intelCaseService } from '../../services/intel/IntelCaseService';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import { replayTimeline, exportReplay } from '../../services/intel/replay/replayCase';
import { UNRECORDED_CASE_ACTIONS, describeAction } from '../../services/intel/replay/activityCoverage';
import { blindTo, unattributedActor } from '../../services/epistemic/epistemicLanguage';

/**
 * Walk an investigation forward, one recorded action at a time.
 *
 * IV.D's premise is that output has to be usable by a journalist or a court
 * rather than merely persuasive — which means someone who was not there has to
 * be able to see how a case reached its present state, and, just as
 * importantly, where the record cannot tell them.
 *
 * So this panel is built to make the GAPS as visible as the events. A replay
 * view that renders a tidy sequence of steps is more dangerous than no replay
 * view at all: it reads as a complete account, and the reader has no way to
 * tell a full record from a convincing one. Every gap the reducer reports is
 * rendered inline, at the point it occurred, in the reader's path rather than
 * behind a toggle.
 */

const box: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
  padding: 12, margin: '12px 0', background: 'rgba(10,16,26,0.6)',
};
const mono: React.CSSProperties = { fontFamily: 'var(--sc-font-data)', fontSize: 12 };
const gapStyle: React.CSSProperties = {
  ...mono, color: '#ffd9a0', background: 'rgba(120,60,0,0.35)',
  border: '1px solid rgba(255,170,60,0.45)', borderRadius: 3, padding: '4px 8px', margin: '4px 0',
};

/** A state row's label: one style, not the same colour written on every row. */
const ROW_LABEL: React.CSSProperties = { color: '#9aa7b4' };

const CaseReplayPanel: React.FC = () => {
  const [cases, setCases] = useState<IntelCaseUI[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [step, setStep] = useState<number>(-1);

  useEffect(() => {
    let alive = true;
    intelCaseService.listCases().then((c) => { if (alive) setCases(c); }).catch(() => { /* nothing to replay */ });
    const off = intelCaseService.onChange(setCases);
    return () => { alive = false; off(); };
  }, []);

  const selected = cases.find((c) => c.id === selectedId) ?? null;
  const log = useMemo(() => selected?.activityLog ?? [], [selected]);
  const timeline = useMemo(() => replayTimeline(log as never), [log]);

  useEffect(() => { setStep(timeline.length - 1); }, [timeline.length]);

  if (cases.length === 0) return null;

  const current = step >= 0 && step < timeline.length ? timeline[step] : null;
  const state = current?.state;

  return (
    <div style={box} data-testid="case-replay">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Replay a case</strong>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} aria-label="Case to replay">
          <option value="">Select a case…</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {/* What a replay is blind to, stated before anything is reconstructed.
          replayCase reports gaps it can SEE — a log referencing a state it
          never recorded reaching. It cannot report an action nobody ever wrote,
          because there is nothing in the log to be inconsistent with. So an
          entire category of event can be missing and the reconstruction looks
          complete, which is the failure this panel's own header calls more
          dangerous than having no panel at all.

          The list is build-enforced against real producers by
          scripts/guard-activity-action-coverage.mjs — wiring a producer without
          moving it out of UNRECORDED_CASE_ACTIONS fails the build, so this
          cannot drift into understating coverage either. */}
      {selected && UNRECORDED_CASE_ACTIONS.length > 0 && (
        <p style={gapStyle} data-testid="replay-coverage">
          {blindTo('this replay', UNRECORDED_CASE_ACTIONS.map(describeAction)).text}
        </p>
      )}

      {selected && log.length === 0 && (
        <p style={{ ...mono, color: '#ffd9a0' }}>
          No history recorded for this case. That does not mean nothing happened.
        </p>
      )}

      {selected && timeline.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step <= 0}>← Back</button>
            <span style={mono}>{step + 1} / {timeline.length}</span>
            <button onClick={() => setStep((s) => Math.min(timeline.length - 1, s + 1))} disabled={step >= timeline.length - 1}>Forward →</button>
            <button
              onClick={() => {
                const artifact = exportReplay(selected.title, log as never);
                // Printed rather than downloaded: the viewer sandbox blocks
                // script-initiated downloads, and an export button that
                // silently does nothing is worse than one that is honest
                // about where the artifact went.
                // eslint-disable-next-line no-console
                console.log(JSON.stringify(artifact, null, 2));
                window.alert('Replay artifact written to the browser console, including its own stated limits.');
              }}
            >Export artifact</button>
          </div>

          {current && (
            <div style={mono}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#8fd3ff' }}>{String(current.entry.action)}</span>{' '}
                <span style={{ color: '#9aa7b4' }}>{current.entry.timestamp}</span>{' '}
                {/* Never a name where none was recorded. */}
                {current.entry.userId
                  ? <span>by <KeyName pubkey={current.entry.userId} /></span>
                  : <span style={{ color: '#ffd9a0' }}>by <strong>{unattributedActor()}</strong></span>}
              </div>

              {state && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr><td style={ROW_LABEL}>Status</td><td>{state.status ?? '(not yet created)'}</td></tr>
                    <tr><td style={ROW_LABEL}>Linked records</td><td>{state.linkedEntities.length || '—'}</td></tr>
                    {/* The articles the case rests on (D-DP, DP7). */}
                    <tr><td style={ROW_LABEL}>Sources</td><td>{state.sources.length || '—'}</td></tr>
                    <tr><td style={ROW_LABEL}>Collaborators</td><td>{state.collaborators.length || '—'}</td></tr>
                    <tr><td style={ROW_LABEL}>Comments</td><td>{state.commentCount || '—'}</td></tr>
                  </tbody>
                </table>
              )}

              {/* Gaps in the reader's path, not behind a toggle. A tidy
                  sequence of steps reads as a complete account. */}
              {state?.gaps.map((g, i) => (
                <div key={i} style={gapStyle}>GAP · {g.kind} · {g.detail}</div>
              ))}

              {state && state.unattributed.length > 0 && (
                <div style={gapStyle}>
                  {state.unattributed.length} {state.unattributed.length === 1 ? 'action has' : 'actions have'} no recorded actor, and
                  stay unattributed. Guessing one would invent a chain of custody.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CaseReplayPanel;
