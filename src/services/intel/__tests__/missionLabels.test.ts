/**
 * NavCom's return path, read (interchange rev 11; D-MX, MX1): NIP-32 labels
 * in `navcom.mission`, as NavCom's section 5 writes them.
 */
import { describe, it, expect } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { readMissionLabel, claimsOn } from '../missionLabels';

const PKG = `30079:${'6'.repeat(64)}:starcom_mission_package_field-heat_relief`;
const OTHER = `30079:${'6'.repeat(64)}:starcom_mission_package_field-other`;
const NOW = 1_800_000_000;

const label = (tags: string[][], o: Partial<NostrEvent> = {}): NostrEvent => ({
  id: o.id ?? 'l1', pubkey: o.pubkey ?? 'a'.repeat(64), created_at: o.created_at ?? NOW - 60, kind: o.kind ?? 1985,
  tags, content: '', sig: 's',
});
const claim = (o: Partial<NostrEvent> = {}, extra: string[][] = []) =>
  label([['L', 'navcom.mission'], ['l', 'claimed', 'navcom.mission'], ['a', PKG], ...extra], o);

describe('readMissionLabel', () => {
  it('reads a claim as NavCom writes it: its package, its signer, its time and its end', () => {
    expect(readMissionLabel(claim({}, [['expiration', String(NOW + 3600)]]), NOW)).toEqual({
      id: 'l1', pubkey: 'a'.repeat(64), value: 'claimed', coordinates: [PKG], createdAt: NOW - 60, expiresAt: NOW + 3600,
    });
  });

  it('reads the report a settlement, a witness or a challenge is about, and an agent that signed one', () => {
    for (const value of ['settled', 'witnessed', 'challenged']) {
      const read = readMissionLabel(label([['L', 'navcom.mission'], ['l', value, 'navcom.mission'], ['a', PKG], ['e', 'r1'], ['agent', 'mecha_jono']]), NOW);
      expect(read).toMatchObject({ value, report: 'r1', agent: 'mecha_jono' });
    }
  });

  it('reads nothing outside navcom.mission, nor a value NavCom never wrote, nor two at once', () => {
    // NIP-32 names the namespace in L: a label without it is in none.
    expect(readMissionLabel(label([['l', 'claimed', 'navcom.mission'], ['a', PKG]]), NOW)).toBeNull();
    expect(readMissionLabel(label([['L', 'ugc'], ['l', 'claimed', 'ugc'], ['a', PKG]]), NOW)).toBeNull();
    expect(readMissionLabel(label([['L', 'navcom.mission'], ['l', 'claimed', 'other'], ['a', PKG]]), NOW)).toBeNull();
    expect(readMissionLabel(label([['L', 'navcom.mission'], ['l', 'approved', 'navcom.mission'], ['a', PKG]]), NOW)).toBeNull();
    expect(readMissionLabel(label([['L', 'navcom.mission'], ['l', 'claimed', 'navcom.mission'], ['l', 'settled', 'navcom.mission'], ['a', PKG]]), NOW)).toBeNull();
  });

  it('reads nothing that names no package, nor another kind', () => {
    expect(readMissionLabel(label([['L', 'navcom.mission'], ['l', 'claimed', 'navcom.mission']]), NOW)).toBeNull();
    expect(readMissionLabel(claim({ kind: 1 }), NOW)).toBeNull();
  });

  it('keeps nothing of a label once it has expired', () => {
    expect(readMissionLabel(claim({}, [['expiration', String(NOW)]]), NOW)).toBeNull();
    expect(readMissionLabel(claim({}, [['expiration', String(NOW + 1)]]), NOW)).not.toBeNull();
  });
});

describe('claimsOn', () => {
  const read = (e: NostrEvent) => readMissionLabel(e, NOW)!;

  it('counts each key once, by its latest claim, on this package only', () => {
    const labels = [
      read(claim({ id: 'c1', pubkey: 'a'.repeat(64), created_at: NOW - 300 })),
      read(claim({ id: 'c2', pubkey: 'a'.repeat(64), created_at: NOW - 100 })),
      read(claim({ id: 'c3', pubkey: 'b'.repeat(64), created_at: NOW - 200 }, [['agent', 'scout']])),
      read(label([['L', 'navcom.mission'], ['l', 'claimed', 'navcom.mission'], ['a', OTHER]], { id: 'c4', pubkey: 'c'.repeat(64) })),
    ];
    expect(claimsOn(labels, PKG, NOW)).toEqual([
      { pubkey: 'b'.repeat(64), at: NOW - 200, agent: 'scout' },
      { pubkey: 'a'.repeat(64), at: NOW - 100 },
    ]);
  });

  it('lets a claim go when its own key releases it, and counts a claim made again after the release (NavCom rev 4, Q11-Q12)', () => {
    const release = (o: Partial<NostrEvent>) => read(label([['L', 'navcom.mission'], ['l', 'released', 'navcom.mission'], ['a', PKG]], o));
    const mine = read(claim({ id: 'c6', pubkey: 'e'.repeat(64), created_at: NOW - 300 }));
    const letGo = release({ id: 'r1', pubkey: 'e'.repeat(64), created_at: NOW - 200 });
    expect(claimsOn([mine, letGo], PKG, NOW)).toEqual([]);
    const again = read(claim({ id: 'c7', pubkey: 'e'.repeat(64), created_at: NOW - 100 }));
    expect(claimsOn([mine, letGo, again], PKG, NOW)).toEqual([{ pubkey: 'e'.repeat(64), at: NOW - 100 }]);
    // Another key's release lets nobody else's claim go, and a release on another package touches none here.
    const theirs = release({ id: 'r2', pubkey: 'f'.repeat(64), created_at: NOW - 50 });
    const elsewhere = read(label([['L', 'navcom.mission'], ['l', 'released', 'navcom.mission'], ['a', OTHER]], { id: 'r3', pubkey: 'e'.repeat(64), created_at: NOW - 10 }));
    expect(claimsOn([mine, letGo, again, theirs, elsewhere], PKG, NOW)).toHaveLength(1);
  });

  it('drops a claim once it expires, though it was read before, and counts no other label as one', () => {
    const lapsing = read(claim({ id: 'c5', pubkey: 'd'.repeat(64) }, [['expiration', String(NOW + 10)]]));
    const witnessed = read(label([['L', 'navcom.mission'], ['l', 'witnessed', 'navcom.mission'], ['a', PKG], ['e', 'r1']], { id: 'w1' }));
    expect(claimsOn([lapsing, witnessed], PKG, NOW)).toHaveLength(1);
    expect(claimsOn([lapsing, witnessed], PKG, NOW + 10)).toEqual([]);
  });
});
