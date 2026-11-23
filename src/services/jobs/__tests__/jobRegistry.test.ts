/**
 * The job registry (BD13): every job a person waits on, in one place the job
 * rail reads. There was none; each screen kept its job's state to itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { jobs, runJob, JOB_LINGER_MS } from '../jobRegistry';

afterEach(() => {
  vi.useRealTimers();
  jobs.clearForTest();
});

describe('jobs', () => {
  it('lists a job from when it starts, with its kind, its words and its progress', () => {
    const job = jobs.start({ kind: 'publish', label: 'Publishing case 7' });
    job.update({ progress: { done: 1, total: 3 }, detail: 'two relays to go' });
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'publish', label: 'Publishing case 7', state: 'running', progress: { done: 1, total: 3 }, detail: 'two relays to go' })]);
  });

  it('keeps a finished job a moment, saying how it ended, then lets it go', () => {
    vi.useFakeTimers();
    const ok = jobs.start({ kind: 'bundle-import', label: 'Importing a bundle' });
    const bad = jobs.start({ kind: 'publish', label: 'Dispatching a mission' });
    ok.done('3 records');
    bad.fail('no relay accepted it');
    expect(jobs.list().map((j) => [j.state, j.detail])).toEqual([['done', '3 records'], ['failed', 'no relay accepted it']]);
    expect(JOB_LINGER_MS).toBe(6_000);
    vi.advanceTimersByTime(5_999);
    expect(jobs.list()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(jobs.list()).toEqual([]);
  });

  it('tells its listeners when anything changes, and stops when asked', () => {
    const heard = vi.fn();
    const off = jobs.subscribe(heard);
    const job = jobs.start({ kind: 'publish', label: 'x' });
    job.update({ detail: 'y' });
    off();
    job.done();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('offers cancel and hold only where the job gave them', () => {
    const cancel = vi.fn();
    jobs.start({ kind: 'findings-publish', label: 'a', cancel });
    jobs.start({ kind: 'publish', label: 'b' });
    const [a, b] = jobs.list();
    expect(a.cancel).toBeTypeOf('function');
    expect(b.cancel).toBeUndefined();
    a.cancel!();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('takes the controls away once a job ends: nothing is left to cancel or hold', () => {
    const job = jobs.start({ kind: 'findings-publish', label: 'a', cancel: vi.fn(), hold: vi.fn(), resume: vi.fn() });
    job.done();
    const [ended] = jobs.list();
    expect([ended.cancel, ended.hold, ended.resume]).toEqual([undefined, undefined, undefined]);
  });
});

describe('runJob', () => {
  it('lists the job while the work runs and marks it done with what it returned', async () => {
    let finish!: (v: string) => void;
    const p = runJob({ kind: 'bundle-import', label: 'Importing' }, () => new Promise<string>((r) => { finish = r; }), (v) => `${v} imported`);
    expect(jobs.list()[0].state).toBe('running');
    finish('2 records');
    await expect(p).resolves.toBe('2 records');
    expect(jobs.list()[0]).toMatchObject({ state: 'done', detail: '2 records imported' });
  });

  it('marks it failed with the reason, and still throws', async () => {
    await expect(runJob({ kind: 'publish', label: 'Publishing' }, async () => { throw new Error('relays refused'); })).rejects.toThrow('relays refused');
    expect(jobs.list()[0]).toMatchObject({ state: 'failed', detail: 'relays refused' });
  });
});
