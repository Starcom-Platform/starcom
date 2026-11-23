/**
 * Add a report to a case, from the report (plan item 1.3, story S10); and a capture, from the
 * Captures inbox (decision D-EX, E2): the same choice, said of what is being added.
 *
 * A report reached a case only from the case's side: open the case, search for
 * the report, attach it. From here, pick a case and say whether the report
 * supports it or argues against it, or start a new case from the report. A
 * report already on one of a case's lists cannot go on the other, and the
 * reason is shown rather than the choice quietly missing.
 */
import React, { useEffect, useState } from 'react';
import {
  caseManagerAdapter, EVIDENCE_BLOCKED, CONTRADICTION_BLOCKED, type CaseItem,
} from '../../core/intel/adapters/caseManagerAdapter';
import { recordPath } from '../../routes/recordLink';
import styles from './ReportDetailPanel.module.css';

type Role = 'evidence' | 'contradiction';
const NEW_CASE = '__new';

const AddToCase: React.FC<{
  recordId: string;
  recordTitle: string;
  /** What is being added, in words: a report, or a capture. */
  noun?: 'report' | 'capture';
  onClose: () => void;
}> = ({ recordId, recordTitle, noun = 'report', onClose }) => {
  const [cases, setCases] = useState<CaseItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [choice, setChoice] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ caseId: string; title: string; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    caseManagerAdapter.getCases()
      .then((all) => { if (live) setCases(all); })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, []);

  const creating = choice === NEW_CASE;
  const chosen = cases?.find((c) => c.id === choice) ?? null;
  // Already on one list of this case: the other is closed to it, and so is this one.
  const alreadyThere = chosen?.contradictedBy?.includes(recordId)
    ? EVIDENCE_BLOCKED
    : chosen?.relatedEntities.includes(recordId)
      ? CONTRADICTION_BLOCKED
      : null;
  // A new case starts from this report: it is its evidence.
  const effectiveRole: Role | null = creating ? 'evidence' : role;
  const canAdd = !busy && (creating || (chosen !== null && effectiveRole !== null && alreadyThere === null));

  const add = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      let caseId = choice;
      if (creating) {
        const id = await caseManagerAdapter.addCase({
          title: recordTitle,
          description: `Started from the ${noun} "${recordTitle}".`,
        });
        if (!id) throw new Error('The case could not be created.');
        caseId = id;
      }
      if (effectiveRole === 'contradiction') await caseManagerAdapter.linkContradictionsToCase(caseId, [recordId]);
      else await caseManagerAdapter.linkEntitiesToCase(caseId, [recordId]);
      setAdded({ caseId, title: creating ? recordTitle : chosen?.title ?? caseId, isNew: creating });
    } catch (e) {
      setError(e instanceof Error ? e.message : `The ${noun} could not be added to the case.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section} data-testid="add-to-case">
      <h4>Add to case</h4>
      {loadFailed && <div className={styles.small}>{`Cases could not be loaded, so the ${noun} cannot be added to one.`}</div>}
      {cases === null && !loadFailed && <div className={styles.small}>Loading cases…</div>}
      {cases !== null && !added && (
        <>
          <label htmlFor="add-to-case-select" className={styles.small}>Case</label>
          <select
            id="add-to-case-select"
            className={styles.input}
            value={choice}
            onChange={(e) => { setChoice(e.target.value); setRole(null); setError(null); }}
          >
            <option value="">Choose a case…</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{`${c.caseNumber || c.id} · ${c.title}`}</option>
            ))}
            <option value={NEW_CASE}>{`New case: "${recordTitle}"`}</option>
          </select>
          {chosen && (
            <fieldset className={styles.small}>
              <legend>{`How does the ${noun} bear on it?`}</legend>
              <label>
                <input type="radio" name="add-to-case-role" checked={role === 'evidence'} disabled={alreadyThere !== null} onChange={() => setRole('evidence')} />
                {' '}Supports it (evidence)
              </label>
              <label>
                <input type="radio" name="add-to-case-role" checked={role === 'contradiction'} disabled={alreadyThere !== null} onChange={() => setRole('contradiction')} />
                {' '}Argues against it (contradiction)
              </label>
            </fieldset>
          )}
          {alreadyThere && <div className={styles.small}>{alreadyThere}</div>}
          {creating && (
            <div className={styles.small}>
              {`A new case with this ${noun} as its evidence. Say who may receive it on the case's page.`}
            </div>
          )}
          {error && <div className={styles.small} role="alert">{error}</div>}
          <div>
            <button className={styles.button} onClick={() => { void add(); }} disabled={!canAdd}>Add</button>
            <button className={styles.button} onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
      {added && (
        <div className={styles.small}>
          {`Added to "${added.title}"${added.isNew ? ', a new case' : ''}. `}
          <a href={recordPath('case', added.caseId)}>Open the case</a>
        </div>
      )}
    </div>
  );
};

export default AddToCase;
