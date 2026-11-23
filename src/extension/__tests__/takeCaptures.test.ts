/**
 * Starcom taking what waits in Uplink (decision D-EX, E2, W5; EX16): each capture kept once, filed to
 * the case open in the side panel when there is one, else left to file; Uplink told to let go only of
 * what was read, and only once it is kept. Two Starcom pages (a tab and the side panel) never keep the
 * same capture twice.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ArgsOf, Capability, Capture, UplinkAnswer } from '../protocol';
import { takeCaptures, takenMemory, type CaptureTaking } from '../takeCaptures';
import { en } from '../../i18n/app/en';

const capture = (id: string): Capture => ({ id, kind: 'page', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/' } });

function setup(waiting: Capture[], over: Partial<CaptureTaking> = {}) {
  const queue = [...waiting];
  const asked: Array<{ capability: Capability; purpose: string; args: unknown }> = [];
  const kept: string[] = [];
  const filed: Array<{ caseId: string; ids: string[] }> = [];
  const store = new Map<string, string>();
  const ask = vi.fn(async <C extends Capability>(capability: C, purpose: string, args: ArgsOf[C]): Promise<UplinkAnswer<C>> => {
    asked.push({ capability, purpose, args });
    if (capability === 'captures.read') return { kind: 'answer', id: 'a', ok: true, result: { captures: [...queue] } } as UplinkAnswer<C>;
    const ids = (args as { ids: string[] }).ids;
    const before = queue.length;
    queue.splice(0, queue.length, ...queue.filter((c) => !ids.includes(c.id)));
    return { kind: 'answer', id: 'a', ok: true, result: { released: before - queue.length } } as UplinkAnswer<C>;
  });
  const taking: CaptureTaking = {
    ask,
    keep: async (c) => { kept.push(c.id); return `item-${c.id}`; },
    fileTo: async (caseId, ids) => { filed.push({ caseId, ids }); return true; },
    openCaseId: () => null,
    taken: takenMemory({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } }),
    oneAtATime: (work) => work(),
    ...over,
  };
  return { taking, queue, asked, kept, filed };
}

describe('takeCaptures', () => {
  it('keeps each capture, leaves it to file with no case open, and then lets Uplink let go of it', async () => {
    const t = setup([capture('a'), capture('b')]);
    expect(await takeCaptures(t.taking)).toEqual({ kept: 2, filedTo: null });
    expect(t.kept).toEqual(['a', 'b']);
    expect(t.filed).toEqual([]);
    expect(t.queue).toEqual([]);
    expect(t.asked.map((a) => a.capability)).toEqual(['captures.read', 'captures.kept']);
    expect(t.asked.every((a) => a.purpose === en.uplinkAsks.take)).toBe(true);
  });

  it('files what it keeps to the case open in the side panel', async () => {
    const t = setup([capture('a'), capture('b')], { openCaseId: () => 'case-7' });
    expect(await takeCaptures(t.taking)).toEqual({ kept: 2, filedTo: 'case-7' });
    expect(t.filed).toEqual([{ caseId: 'case-7', ids: ['item-a', 'item-b'] }]);
  });

  it('leaves a capture to file when its case cannot take it', async () => {
    const t = setup([capture('a')], { openCaseId: () => 'gone', fileTo: async () => false });
    expect(await takeCaptures(t.taking)).toEqual({ kept: 1, filedTo: null });
  });

  it('never keeps a capture twice: one taken before is let go without a second copy', async () => {
    const t = setup([capture('a'), capture('b')]);
    t.taking.taken.add('a');
    expect(await takeCaptures(t.taking)).toEqual({ kept: 1, filedTo: null });
    expect(t.kept).toEqual(['b']);
    expect(t.queue).toEqual([]);
  });

  it('lets go of nothing when keeping fails, so nothing is lost; what was kept is not kept again', async () => {
    let calls = 0;
    const t = setup([capture('a'), capture('b')], {
      keep: async (c) => { calls += 1; if (c.id === 'b' && calls === 2) throw new Error('quota'); return `item-${c.id}`; },
    });
    await expect(takeCaptures(t.taking)).rejects.toThrow('quota');
    expect(t.queue.map((c) => c.id)).toEqual(['a', 'b']);
    expect(await takeCaptures(t.taking)).toEqual({ kept: 1, filedTo: null });
    expect(calls).toBe(3);
    expect(t.queue).toEqual([]);
  });

  it('asks nothing more when nothing waits, and says why when Uplink refuses', async () => {
    const empty = setup([]);
    expect(await takeCaptures(empty.taking)).toEqual({ kept: 0, filedTo: null });
    expect(empty.asked.map((a) => a.capability)).toEqual(['captures.read']);
    const refused = setup([capture('a')], {
      ask: (async () => ({ kind: 'answer', id: 'a', ok: false, refusal: 'unreachable', reason: 'Uplink did not answer' })) as CaptureTaking['ask'],
    });
    expect(await takeCaptures(refused.taking)).toEqual({ kept: 0, filedTo: null, refusal: 'Uplink did not answer' });
  });

  it('two Starcom pages taking at once keep each capture once', async () => {
    const t = setup([capture('a'), capture('b')]);
    let tail: Promise<unknown> = Promise.resolve();
    const oneAtATime: CaptureTaking['oneAtATime'] = (work) => {
      const run = tail.then(work);
      tail = run.catch(() => undefined);
      return run;
    };
    const both = await Promise.all([takeCaptures({ ...t.taking, oneAtATime }), takeCaptures({ ...t.taking, oneAtATime })]);
    expect(both.map((r) => r.kept).sort()).toEqual([0, 2]);
    expect(t.kept).toEqual(['a', 'b']);
  });
});

describe('takenMemory', () => {
  it('remembers the newest thousand, and survives a store that cannot be read', () => {
    const store = new Map<string, string>();
    const memory = takenMemory({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } });
    for (let i = 0; i < 1005; i++) memory.add(`c${i}`);
    expect(memory.has('c1004')).toBe(true);
    expect(memory.has('c0')).toBe(false);
    const broken = takenMemory({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    broken.add('x');
    expect(broken.has('x')).toBe(true);
  });
});
