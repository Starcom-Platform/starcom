/**
 * The roster on the device first (decision D-RS, RS13): an item is kept in this browser until its author posts it,
 * and keeps where it went once posted. Saved only as the spec would read it, so a draft can always be posted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RosterItem } from '../rosterItem';

const KEY = 'starcom.roster.drafts.v1';
const item = (over: Partial<RosterItem> = {}): RosterItem => ({
  d: 'epic-1', kind: 'epic', title: 'Every venue in the Bay Area checked', limits: [], places: [], toward: [], counts: [], text: '', ...over,
});
const load = async () => import('../rosterDrafts');

describe('rosterDrafts', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('keeps an item on the device, and lists the newest first', async () => {
    const drafts = await load();
    expect(drafts.saveDraft(item(), Date.parse('2026-10-17T10:00:00Z'))).toEqual({ ok: true });
    drafts.saveDraft(item({ d: 'quest-1', kind: 'quest', title: 'Learn to read an alert' }), Date.parse('2026-10-17T11:00:00Z'));
    expect(drafts.listDrafts().map((x) => x.d)).toEqual(['quest-1', 'epic-1']);
    expect(drafts.getDraft('epic-1')).toMatchObject({ title: 'Every venue in the Bay Area checked', updatedAt: '2026-10-17T10:00:00.000Z', posts: [] });
    // Still there after a reload.
    vi.resetModules();
    expect((await load()).listDrafts().map((x) => x.d)).toEqual(['quest-1', 'epic-1']);
  });

  it('refuses what the spec would refuse, saying why, and keeps nothing of it', async () => {
    const drafts = await load();
    expect(drafts.saveDraft(item({ title: '  ' }))).toEqual({ ok: false, reason: 'no title' });
    expect(drafts.saveDraft(item({ title: 'x'.repeat(201) }))).toEqual({ ok: false, reason: 'title over 200 characters' });
    expect(drafts.listDrafts()).toEqual([]);
  });

  it('edits an item in place, keeping where it was posted', async () => {
    const drafts = await load();
    drafts.saveDraft(item());
    drafts.recordPost('epic-1', { visibility: 'sealed', at: '2026-10-17T12:00:00.000Z', relays: 3, to: 2 });
    drafts.saveDraft(item({ title: 'Every venue in the Bay Area, checked by May' }));
    expect(drafts.getDraft('epic-1')).toMatchObject({ title: 'Every venue in the Bay Area, checked by May', posts: [{ visibility: 'sealed', relays: 3, to: 2 }] });
  });

  it('removes an item from the device', async () => {
    const drafts = await load();
    drafts.saveDraft(item());
    drafts.removeDraft('epic-1');
    expect(drafts.listDrafts()).toEqual([]);
  });

  it('tells its listeners of each change', async () => {
    const drafts = await load();
    const heard = vi.fn();
    const stop = drafts.subscribeDrafts(heard);
    drafts.saveDraft(item());
    drafts.removeDraft('epic-1');
    stop();
    drafts.saveDraft(item());
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('reads nothing it cannot use from storage, and starts empty', async () => {
    localStorage.setItem(KEY, '{not json');
    expect((await load()).listDrafts()).toEqual([]);
    vi.resetModules();
    // Whole but for its kind, which the spec would refuse: left out, not shown half-read.
    const stored = { ...item(), updatedAt: '2026-10-17T10:00:00.000Z', posts: [] };
    localStorage.setItem(KEY, JSON.stringify([{ ...stored, d: 'x', kind: 'crusade' }, stored]));
    expect((await load()).listDrafts().map((x) => x.d)).toEqual(['epic-1']);
  });

  it('gives each new item an address of its kind no other has', async () => {
    const drafts = await load();
    const a = drafts.newRosterId('directive');
    const b = drafts.newRosterId('directive');
    expect(a).toMatch(/^directive-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
