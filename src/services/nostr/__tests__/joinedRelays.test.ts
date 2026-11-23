/**
 * The relays a person has joined (plan item 2.3, step 1).
 *
 * Sign-in (NIP-42) reveals who is reading, so it goes only to relays the person
 * belongs to. That was the build's internal set alone; a team's own relay joins
 * it once the person has joined the team. Joining is not a destination by
 * itself: a Limited mission goes to a joined team's relay only when its author
 * picked that team (LW1), so joining a second team cannot send the first
 * team's work to it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { joinedRelays, joinRelay, leaveRelay, subscribeJoinedRelays } from '../joinedRelays';
import { hasJoined, readRelays, relayReach, relaysFor, whereItGoes } from '../publishTargets';

const TEAM = 'wss://relay.newark-desk.example';
const SECOND = 'wss://relay.second-team.example';
const RELAY_KEY = '9'.repeat(64);

beforeEach(() => {
  for (const r of joinedRelays()) leaveRelay(r.url);
});

describe('joined relays', () => {
  it('are none to begin with, and a relay nobody joined is not signed in to', () => {
    expect(joinedRelays()).toEqual([]);
    expect(hasJoined(TEAM)).toBe(false);
  });

  it("keep the team's relay, its key and its name, and sign in there once joined", () => {
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    expect(joinedRelays()).toMatchObject([{ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' }]);
    expect(hasJoined(TEAM)).toBe(true);
    expect(hasJoined(`${TEAM}/`)).toBe(true);
  });

  it('call a joined relay internal, not public, where the app says how far something reaches', () => {
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    expect(relayReach(TEAM)).toBe('internal');
  });

  it("are not where Limited work goes unless its author picked the team (LW1)", () => {
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    joinRelay({ url: SECOND, relayPubkey: RELAY_KEY, team: 'Second team' });
    expect(relaysFor('MISSION', 'limited')).not.toContain(TEAM);
    expect(relaysFor('MISSION', 'limited', [TEAM])).toEqual([TEAM]);
    expect(relaysFor('FINDING', 'limited', [`${TEAM}/`, TEAM])).toEqual([`${TEAM}/`]);
    // Picked teams mean nothing outside Limited.
    expect(relaysFor('MISSION', 'private', [TEAM])).toEqual([]);
    expect(relaysFor('MISSION', 'public', [TEAM])).not.toContain(TEAM);
    expect(whereItGoes('MISSION', 'limited', 'mission', undefined, [TEAM])).toEqual({ relays: [TEAM], refusal: null });
  });

  it('send nothing to a picked team once its relay is left, or to one never joined here', () => {
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    leaveRelay(TEAM);
    expect(relaysFor('MISSION', 'limited', [TEAM, 'wss://never-joined.example'])).toEqual([]);
  });

  it('are read for missions and findings, so a team receives what was sent to it; the globe stays public', () => {
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    expect(readRelays('MISSION')).toContain(TEAM);
    expect(readRelays('FINDING')).toContain(TEAM);
    expect(readRelays('INTEL')).not.toContain(TEAM);
  });

  it('forget a relay once left, and tell listeners', () => {
    const heard = vi.fn();
    const stop = subscribeJoinedRelays(heard);
    joinRelay({ url: TEAM, relayPubkey: RELAY_KEY, team: 'Newark desk' });
    leaveRelay(TEAM);
    stop();
    expect(hasJoined(TEAM)).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('refuse an address that is not a secure relay address', () => {
    expect(() => joinRelay({ url: 'http://relay.example', relayPubkey: RELAY_KEY, team: 'x' })).toThrow(/wss:/);
  });
});
