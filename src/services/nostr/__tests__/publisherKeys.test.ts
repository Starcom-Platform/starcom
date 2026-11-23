/**
 * One publisher across its keys (decision D-HW: Mecha Jono's key changes in early November 2026, and
 * they send the new key before signing with it). A note signed under the old key and again under the
 * new one is one note, so nothing shows twice while both stand on The Record.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { exposedSince, noteIdentity, retiredKey, sameNote, sealTargetOf, signerIdentity, speaksFor } from '../publisherKeys';
import { HERO_WATCH_PUBLISHERS, MECHA_JONO_KEYS, RAVER_WATCH_PUBLISHERS, WAR_CONFLICT_PUBLISHERS } from '../../../config/publicInfrastructure';

const OLD = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const NEW = 'a'.repeat(64);
const STRANGER = 'b'.repeat(64);

describe('Mecha Jono\'s keys', () => {
  it('are one list, read by every desk of theirs', () => {
    expect(MECHA_JONO_KEYS).toContain(OLD);
    expect(RAVER_WATCH_PUBLISHERS).toEqual(MECHA_JONO_KEYS);
    expect(HERO_WATCH_PUBLISHERS).toEqual(MECHA_JONO_KEYS);
    expect(WAR_CONFLICT_PUBLISHERS).toEqual(MECHA_JONO_KEYS);
  });
});

describe('a note across a publisher\'s keys', () => {
  const keys = [NEW, OLD];

  it('is one note under either key, and two publishers\' notes stay two', () => {
    expect(signerIdentity(OLD, [{ name: 'mecha-jono', keys }])).toBe('mecha-jono');
    expect(signerIdentity(NEW.toUpperCase(), [{ name: 'mecha-jono', keys }])).toBe('mecha-jono');
    expect(signerIdentity(STRANGER, [{ name: 'mecha-jono', keys }])).toBe(STRANGER);
    const rotating = [{ name: 'mecha-jono', keys }];
    expect(noteIdentity(`30023:${OLD}:hero-watch-station-dover`, rotating)).toBe('30023:mecha-jono:hero-watch-station-dover');
    expect(sameNote(`30023:${OLD}:hero-watch-station-dover`, `30023:${NEW}:hero-watch-station-dover`, rotating)).toBe(true);
    expect(sameNote(`30023:${OLD}:hero-watch-station-dover`, `30023:${STRANGER}:hero-watch-station-dover`, rotating)).toBe(false);
    expect(sameNote(`30023:${OLD}:a`, `30079:${OLD}:a`, rotating)).toBe(false);
  });

  it('keeps a name with colons in it whole', () => {
    expect(noteIdentity(`30078:${OLD}:mecha-jono:interchange`, [{ name: 'mecha-jono', keys }])).toBe('30078:mecha-jono:mecha-jono:interchange');
    expect(noteIdentity('not an address', [{ name: 'mecha-jono', keys }])).toBe('not an address');
  });
});

describe('exposedSince', () => {
  it('names the day a key\'s secret went out, in any case, and nothing for any other key', () => {
    expect(exposedSince(OLD)).toBe('2026-09-28');
    expect(exposedSince(OLD.toUpperCase())).toBe('2026-09-28');
    expect(exposedSince(MECHA_JONO_KEYS[0])).toBeNull();
    expect(exposedSince(STRANGER)).toBeNull();
    expect(exposedSince(NEW, { [NEW]: '2027-01-02' })).toBe('2027-01-02');
  });
});

describe('who speaks for a publisher, and where sealed work goes (NavCom trust.ts, speaks and sealTargetOf)', () => {
  const START = Date.parse('2026-11-12T00:00:00Z') / 1000;
  const records = {
    publishers: [{ name: 'mecha-jono', keys: [NEW, OLD] }],
    starts: { [OLD]: '2025-01-01T00:00:00Z', [NEW]: '2026-11-12T00:00:00Z' },
    exposed: { [OLD]: '2026-09-28' },
  };

  it('a rotating publisher\'s key speaks from its start and never once exposed; anyone else\'s for itself', () => {
    expect(speaksFor(NEW, START - 1, records)).toBe(false);
    expect(speaksFor(NEW, START, records)).toBe(true);
    expect(speaksFor(OLD, START, records)).toBe(false);
    expect(speaksFor(STRANGER, 0, records)).toBe(true);
    expect(speaksFor(STRANGER, 0, { ...records, exposed: { [STRANGER]: '2027-01-02' } })).toBe(false);
  });

  it('sends work on an old key\'s mission to the publisher\'s newest key that speaks, and nothing while none does', () => {
    expect(sealTargetOf(OLD, START - 1, records)).toEqual({ key: null, exposedOn: '2026-09-28' });
    expect(sealTargetOf(OLD, START, records)).toEqual({ key: NEW, exposedOn: null });
    expect(sealTargetOf(NEW.toUpperCase(), START, records)).toEqual({ key: NEW, exposedOn: null });
    expect(sealTargetOf(STRANGER, 0, records)).toEqual({ key: STRANGER, exposedOn: null });
    expect(sealTargetOf(OLD, START, { ...records, starts: {}, exposed: {} })).toEqual({ key: null, exposedOn: null });
  });

  it('stops reading an exposed key from the day its publisher\'s next key speaks, and no other key (MX31)', () => {
    expect(retiredKey(OLD, START - 1, records)).toBe(false);
    expect(retiredKey(OLD, START, records)).toBe(true);
    expect(retiredKey(OLD.toUpperCase(), START, records)).toBe(true);
    expect(retiredKey(NEW, START, records)).toBe(false);
    // An old key whose secret is safe is read on; an exposed key with no newer one is read until there is one.
    expect(retiredKey(OLD, START, { ...records, exposed: {} })).toBe(false);
    expect(retiredKey(STRANGER, START, { ...records, exposed: { [STRANGER]: '2026-09-28' } })).toBe(false);
    // Mecha Jono's today: its next key has no start yet, so its first is still read.
    expect(retiredKey(OLD, Date.parse('2026-10-19T00:00:00Z') / 1000)).toBe(false);
  });

  it('pauses Mecha Jono today: its first key exposed, its next not started yet', () => {
    expect(sealTargetOf(OLD, Date.parse('2026-10-19T00:00:00Z') / 1000)).toEqual({ key: null, exposedOn: '2026-09-28' });
  });
});

