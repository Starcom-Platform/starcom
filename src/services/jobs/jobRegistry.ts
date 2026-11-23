/**
 * The job registry (BD13; interface-upgrade.md, "A job rail"): every job a
 * person waits on, in one place the job rail reads. There was none: a case's
 * publish, a mission's dispatch and a bundle's import each kept their state in
 * their own screen, and the findings outbox only in its panel.
 *
 * A job is listed from its start. When it ends it stays a moment, saying how it
 * ended (EVA's "READY"), then goes. It offers cancel and hold only where its
 * work can really stop or wait; the registry never pretends.
 */

/**
 * `findings-publish`: the findings outbox, a queue. `notes-publish`: the notes
 * kept when no relay took them (EventOutbox), a queue too. `publish`: any send the
 * person confirmed in the publish review (a case position, a Mission Package,
 * a finding, a refutation, a withdrawal), named by its act. `bundle-import`:
 * opening a received bundle into the workspace.
 */
export type JobKind = 'findings-publish' | 'notes-publish' | 'publish' | 'bundle-import' | 'layer-load';
export type JobState = 'running' | 'held' | 'done' | 'failed';

export interface Job {
  id: string;
  kind: JobKind;
  label: string;
  state: JobState;
  startedAt: number;
  endedAt?: number;
  progress?: { done: number; total: number };
  /** How many more of this kind wait behind it. */
  queued?: number;
  detail?: string;
  cancel?: () => void;
  hold?: () => void;
  resume?: () => void;
}

export interface JobHandle {
  id: string;
  update(patch: Partial<Pick<Job, 'label' | 'progress' | 'queued' | 'detail' | 'state'>>): void;
  done(detail?: string): void;
  fail(detail: string): void;
}

/** How long a finished job stays on the rail, saying how it ended. */
export const JOB_LINGER_MS = 6_000;

type StartInit = Pick<Job, 'kind' | 'label'> & Partial<Pick<Job, 'cancel' | 'hold' | 'resume' | 'queued' | 'detail'>> & { id?: string };

const all = new Map<string, Job>();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let next = 1;

// One array a change, so a React subscriber gets the same snapshot until something changes.
let snap: Job[] = [];
const changed = () => {
  snap = [...all.values()];
  listeners.forEach((fn) => fn());
};

const end = (id: string, state: 'done' | 'failed', detail?: string) => {
  const job = all.get(id);
  if (!job) return;
  all.set(id, { ...job, state, detail: detail ?? job.detail, endedAt: Date.now(), cancel: undefined, hold: undefined, resume: undefined });
  changed();
  timers.set(id, setTimeout(() => { all.delete(id); timers.delete(id); changed(); }, JOB_LINGER_MS));
};

export const jobs = {
  start(init: StartInit): JobHandle {
    const id = init.id ?? `job-${next++}`;
    const prior = timers.get(id);
    if (prior) { clearTimeout(prior); timers.delete(id); }
    all.set(id, { state: 'running', startedAt: Date.now(), ...init, id });
    changed();
    return {
      id,
      update(patch) {
        const job = all.get(id);
        if (!job) return;
        all.set(id, { ...job, ...patch });
        changed();
      },
      done: (detail) => end(id, 'done', detail),
      fail: (detail) => end(id, 'failed', detail),
    };
  },
  /** Running and held jobs, then those that just ended, oldest first. */
  list(): Job[] {
    return [...all.values()];
  },
  /** The same list, the same array until something changes (for useSyncExternalStore). */
  snapshot(): Job[] {
    return snap;
  },
  get(id: string): Job | undefined {
    return all.get(id);
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  clearForTest(): void {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    all.clear();
    snap = [];
    next = 1;
  },
};

/**
 * Runs `work` as a job: listed while it runs, done with what `said` makes of
 * its result, failed with the error's words. The error is thrown on, so the
 * screen that started it handles it as before.
 */
export async function runJob<T>(init: StartInit, work: () => Promise<T>, said?: (result: T) => string | undefined): Promise<T> {
  const job = jobs.start(init);
  try {
    const result = await work();
    job.done(said?.(result));
    return result;
  } catch (error) {
    job.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
