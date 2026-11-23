/**
 * What a review is addressed to, and what is said of whoever wrote it (plan
 * item 5.1).
 */
import { describe, it, expect, vi } from 'vitest';

const known = vi.hoisted(() => ({ own: 'me', team: ['aisha'], named: ['marcus'] }));
vi.mock('../../identity/names', () => ({
  isOwnKey: (k: string) => k === known.own,
  nameOf: (k: string) => (known.named.includes(k) ? { name: 'Marcus', source: 'collaborator' } : null),
}));
vi.mock('../../RealTimeTeamService', () => ({
  realTimeTeamService: { getTeams: () => [{ members: known.team.map((pubkey) => ({ pubkey })) }] },
}));

import { missionReviewTarget, provenanceOf } from '../reviewTargets';

describe('missionReviewTarget', () => {
  const coordinate = `30079:${'f'.repeat(64)}:starcom_mission_package_m1`;
  it('addresses a dispatched package by where it was published and the version the relays took', () => {
    expect(missionReviewTarget({ publishedAs: coordinate, dispatchReceipt: { eventId: 'e1', relaysAccepted: 1, relaysTried: 1, at: '' } }))
      .toEqual({ kind: 30079, author: 'f'.repeat(64), coordinate, eventId: 'e1' });
  });
  it('addresses nothing until both are recorded, or an address that is not a package', () => {
    expect(missionReviewTarget({ publishedAs: coordinate })).toBeNull();
    expect(missionReviewTarget({ dispatchReceipt: { eventId: 'e1', relaysAccepted: 1, relaysTried: 1, at: '' } })).toBeNull();
    expect(missionReviewTarget({ publishedAs: `30023:${'f'.repeat(64)}:x`, dispatchReceipt: { eventId: 'e1', relaysAccepted: 1, relaysTried: 1, at: '' } })).toBeNull();
  });
});

describe('provenanceOf', () => {
  it('says whether a key is yours, on your team now, known by name, or unknown', () => {
    expect(['me', 'aisha', 'marcus', 'stranger'].map(provenanceOf)).toEqual(['you', 'teammate', 'known', 'unknown']);
  });
});

describe('receivedPackageReviewTarget', () => {
  it('addresses a received package by its d tag and the version received, and nothing without one', async () => {
    const { receivedPackageReviewTarget } = await import('../reviewTargets');
    const event = { id: 'e1', pubkey: 'p1', kind: 30079, tags: [['d', 'pkg']], created_at: 1, content: '', sig: '' };
    expect(receivedPackageReviewTarget({ event, relay: 'wss://r' })).toEqual({ kind: 30079, author: 'p1', coordinate: '30079:p1:pkg', eventId: 'e1', relay: 'wss://r' });
    expect(receivedPackageReviewTarget({ event: { ...event, tags: [] }, relay: 'wss://r' })).toBeNull();
  });
});

describe('reportReviewTarget', () => {
  const author = 'a'.repeat(64);
  it('addresses a report read from a relay by its address and the version read, with where it was read', async () => {
    const { reportReviewTarget } = await import('../reviewTargets');
    expect(reportReviewTarget({ id: `30023:${author}:intel-1`, nostrEventId: 'v2', nostrKind: 30023, tags: ['nostr', 'relay:wss://r.example'] }))
      .toEqual({ kind: 30023, author, coordinate: `30023:${author}:intel-1`, eventId: 'v2', relay: 'wss://r.example' });
  });
  it('addresses a note by its event alone, and a report never read from a relay not at all', async () => {
    const { reportReviewTarget } = await import('../reviewTargets');
    expect(reportReviewTarget({ id: 'n1', nostrEventId: 'n1', nostrKind: 1, author, tags: [] }))
      .toEqual({ kind: 1, author, eventId: 'n1' });
    expect(reportReviewTarget({ id: 'intel-local', author, tags: [] })).toBeNull();
  });
});

describe('findingReviewTarget', () => {
  const key = 'f'.repeat(64);
  it('addresses a published finding by the key that signed it and its slot, at the version the relays took', async () => {
    const { findingReviewTarget } = await import('../reviewTargets');
    expect(findingReviewTarget({ slot: 'MV%20Northwind:location', eventId: 'e1', nostrPubkey: key }))
      .toEqual({ kind: 30082, author: key, coordinate: `30082:${key}:MV%20Northwind:location`, eventId: 'e1' });
  });
  it('addresses nothing withdrawn, or recorded before the key was kept', async () => {
    const { findingReviewTarget } = await import('../reviewTargets');
    expect(findingReviewTarget({ slot: 's', eventId: 'e1', nostrPubkey: key, retractedAt: '2026-09-27T00:00:00Z' })).toBeNull();
    expect(findingReviewTarget({ slot: 's', eventId: 'e1' })).toBeNull();
  });
});

describe('review addresses, as the review found them wrong', () => {
  it('addresses a report from one of several features of an event at the event\'s address, not the feature\'s', async () => {
    const { reportReviewTarget } = await import('../reviewTargets');
    const author = 'a'.repeat(64);
    expect(reportReviewTarget({ id: `30023:${author}:intel-1#1`, nostrEventId: 'v', nostrKind: 30023, tags: [] })?.coordinate)
      .toBe(`30023:${author}:intel-1`);
  });

  it('addresses a case\'s live position, the latest, not one withdrawn or older', async () => {
    const { casePositionReviewTarget } = await import('../reviewTargets');
    const { publishedFindingsLedger } = await import('../../intel/findings/PublishedFindingsLedger');
    const attribute = 'case-adjudication:CASE-2026-TEST-0001';
    const key = 'f'.repeat(64);
    publishedFindingsLedger.record({ claim: { subjectRef: 'Berth 3', attribute }, publishedAt: '2026-09-27T00:00:00Z' } as never, { eventId: 'e-old', relaysOk: 1, nostrPubkey: key }, '2026-09-27T00:00:00Z');
    publishedFindingsLedger.markRetracted(`${encodeURIComponent('Berth 3')}:${encodeURIComponent(attribute)}`);
    publishedFindingsLedger.record({ claim: { subjectRef: 'Berth 4', attribute }, publishedAt: '2026-09-28T00:00:00Z' } as never, { eventId: 'e-new', relaysOk: 1, nostrPubkey: key }, '2026-09-28T00:00:00Z');
    expect(casePositionReviewTarget('CASE-2026-TEST-0001')?.eventId).toBe('e-new');
  });

  it('addresses the live position when the newest one was withdrawn', async () => {
    const { casePositionReviewTarget } = await import('../reviewTargets');
    const { publishedFindingsLedger } = await import('../../intel/findings/PublishedFindingsLedger');
    const attribute = 'case-adjudication:CASE-2026-TEST-0002';
    const key = 'f'.repeat(64);
    publishedFindingsLedger.record({ claim: { subjectRef: 'Pier 1', attribute }, publishedAt: '2026-09-27T00:00:00Z' } as never, { eventId: 'e-standing', relaysOk: 1, nostrPubkey: key }, '2026-09-27T00:00:00Z');
    publishedFindingsLedger.record({ claim: { subjectRef: 'Pier 2', attribute }, publishedAt: '2026-09-28T00:00:00Z' } as never, { eventId: 'e-withdrawn', relaysOk: 1, nostrPubkey: key }, '2026-09-28T00:00:00Z');
    publishedFindingsLedger.markRetracted(`${encodeURIComponent('Pier 2')}:${encodeURIComponent(attribute)}`);
    expect(casePositionReviewTarget('CASE-2026-TEST-0002')?.eventId).toBe('e-standing');
  });
});
