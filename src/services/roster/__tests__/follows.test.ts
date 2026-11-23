/**
 * Whom a person follows (decision D-RS, RS4, RS22): their own choice, kept on this device and never posted.
 * Following someone puts what they publish first and marks it; nothing is marked until they do.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const load = async () => import('../follows');

describe('follows', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('follows and unfollows by key, kept across a reload', async () => {
    const f = await load();
    expect(f.isFollowed(A)).toBe(false);
    f.follow(A, Date.parse('2026-10-17T10:00:00Z'));
    f.follow(B, Date.parse('2026-10-17T11:00:00Z'));
    expect(f.followed().map((x) => x.pubkey)).toEqual([B, A]);
    vi.resetModules();
    const again = await load();
    expect(again.isFollowed(A)).toBe(true);
    again.unfollow(A);
    expect(again.followed().map((x) => x.pubkey)).toEqual([B]);
  });

  it('follows only a key, once', async () => {
    const f = await load();
    expect(f.follow('not a key')).toBe(false);
    f.follow(A);
    f.follow(A);
    expect(f.followed()).toHaveLength(1);
  });

  it('tells its listeners, and reads nothing it cannot use', async () => {
    const f = await load();
    const heard = vi.fn();
    f.subscribeFollows(heard);
    f.follow(A);
    f.unfollow(A);
    expect(heard).toHaveBeenCalledTimes(2);
    vi.resetModules();
    localStorage.setItem('starcom.follows.v1', '[{"pubkey":"nope"},{"pubkey":"' + B + '","since":"2026-10-17T10:00:00.000Z"}]');
    expect((await load()).followed().map((x) => x.pubkey)).toEqual([B]);
  });
});
