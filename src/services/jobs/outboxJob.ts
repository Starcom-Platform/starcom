/**
 * An outbox as a job on the rail (BD13): one job while records wait to send, its
 * queue the number waiting. It is a job the rail can hold, since it is a queue
 * that drains by itself; cancel cancels every record still waiting. It ends when
 * nothing waits. The findings outbox is one; the notes kept when no relay took
 * them (EventOutbox, W1) are another.
 */
import { publishOutbox } from '../intel/outbox/PublishOutbox';
import { eventOutbox } from '../intel/outbox/EventOutbox';
import { jobs, type JobHandle, type JobKind } from './jobRegistry';

/** What the rail needs of a queue. */
interface WatchedQueue {
  pending(): Promise<ReadonlyArray<{ id: string }>>;
  isHeld(): boolean;
  hold(): void;
  resume(): void;
  cancel(id: string): Promise<boolean>;
  onChange(listener: () => void): () => void;
}

interface QueueJob {
  id: string;
  kind: JobKind;
  label: string;
  /** What one record is called, and more than one. */
  one: string;
  many: string;
}

const FINDINGS_JOB: QueueJob = { id: 'findings-outbox', kind: 'findings-publish', label: 'Publishing findings', one: 'finding', many: 'findings' };
const NOTES_JOB: QueueJob = { id: 'notes-outbox', kind: 'notes-publish', label: 'Publishing kept notes', one: 'note', many: 'notes' };

export function watchOutbox(outbox: WatchedQueue = publishOutbox, spec: QueueJob = FINDINGS_JOB): () => void {
  let job: JobHandle | null = null;
  let cancelled = false;
  let stopped = false;

  const read = async () => {
    const waiting = (await outbox.pending()).length;
    if (stopped) return;
    if (waiting === 0) {
      if (job) job.done(cancelled ? 'cancelled before sending' : 'sent');
      job = null;
      cancelled = false;
      return;
    }
    const patch = {
      queued: waiting,
      detail: `${waiting} ${waiting === 1 ? spec.one : spec.many} waiting to send`,
      state: outbox.isHeld() ? 'held' as const : 'running' as const,
    };
    if (!job) {
      job = jobs.start({
        id: spec.id,
        kind: spec.kind,
        label: spec.label,
        hold: () => outbox.hold(),
        resume: () => outbox.resume(),
        cancel: () => {
          cancelled = true;
          void outbox.pending().then((records) => Promise.all(records.map((r) => outbox.cancel(r.id))));
        },
        ...patch,
      });
    } else {
      job.update(patch);
    }
  };

  const off = outbox.onChange(() => { void read(); });
  void read();
  return () => { stopped = true; off(); };
}

/** The notes kept when no relay took them, on the rail. */
export const watchKeptNotes = (outbox: WatchedQueue = eventOutbox): (() => void) => watchOutbox(outbox, NOTES_JOB);
