/**
 * The job rail (BD13, BD14; interface-upgrade.md, "A job rail", after EVA's
 * build rail): a tile for each job a person waits on, in the bar on every
 * screen. Each says what it is with its glyph and name, its state in a word,
 * how many more of it wait, and its progress, swept where the total is not
 * known. Opened, its detail, and Hold, Resume or Cancel only where its work
 * really can. Nothing shows when nothing runs.
 */
import React, { useState, useSyncExternalStore } from 'react';
import { jobs, type Job, type JobKind, type JobState } from '../../services/jobs/jobRegistry';
import { Glyph } from '../../symbols/Glyph';
import type { GlyphName } from '../../symbols/uiSymbols';
import styles from './JobRail.module.css';

const JOB_GLYPH: Record<JobKind, GlyphName> = {
  'findings-publish': 'job:findings-publish',
  // The same outbox mark: notes kept when no relay took them (W1).
  'notes-publish': 'job:findings-publish',
  publish: 'job:publish',
  'bundle-import': 'job:bundle-import',
  'layer-load': 'job:layer-load',
};

const STATE_WORD: Record<JobState, string> = { running: 'running', held: 'held', done: 'done', failed: 'failed' };

const Progress: React.FC<{ job: Job }> = ({ job }) => {
  if (job.progress) {
    const { done, total } = job.progress;
    return (
      <span className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total}`}>
        <span className={styles.fill} style={{ width: `${total > 0 ? (100 * done) / total : 0}%` }} />
      </span>
    );
  }
  return <span className={`${styles.track} ${job.state === 'running' ? styles.sweep : ''}`} aria-hidden="true" />;
};

/** The tiles alone, for the bar and for the phone's More sheet. */
export const JobRail: React.FC<{ className?: string }> = ({ className }) => {
  const list = useSyncExternalStore(jobs.subscribe, jobs.snapshot, jobs.snapshot);
  const [open, setOpen] = useState<string | null>(null);
  if (list.length === 0) return null;

  return (
    <ul className={`${styles.rail} ${className ?? ''}`} aria-label="Jobs">
      {list.map((job) => (
        <li key={job.id} className={styles.tile} data-state={job.state}>
          <button
            type="button"
            className={styles.head}
            aria-label={`${job.label}: ${STATE_WORD[job.state]}`}
            aria-expanded={open === job.id}
            onClick={() => setOpen((was) => (was === job.id ? null : job.id))}
            title={job.detail ? `${job.label}: ${job.detail}` : job.label}
          >
            <Glyph name={JOB_GLYPH[job.kind]} size={14} />
            <span className={styles.label}>{job.label}</span>
            {job.queued ? <span className={styles.queued}>×{job.queued}</span> : null}
            <span className={styles.state}>{STATE_WORD[job.state]}</span>
          </button>
          <Progress job={job} />
          {open === job.id && (
            <div className={styles.detail}>
              {job.detail && <span>{job.detail}</span>}
              <span className={styles.controls}>
                {job.hold && job.state === 'running' && <button type="button" onClick={job.hold}>Hold</button>}
                {job.resume && job.state === 'held' && <button type="button" onClick={job.resume}>Resume</button>}
                {job.cancel && <button type="button" onClick={job.cancel}>Cancel</button>}
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

export default JobRail;
