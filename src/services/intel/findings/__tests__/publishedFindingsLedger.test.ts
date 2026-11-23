import { describe, it, expect, beforeEach } from 'vitest';
import {
  BrowserPublishedFindingsStore,
  PublishedFindingsLedger, MemoryPublishedFindingsStore,
} from '../PublishedFindingsLedger';
import type { FindingAttestation } from '../attestation';

const content = (subject: string, publishedAt = '2026-01-01T00:00:00Z'): FindingAttestation => ({
  schemaVersion: 2,
  claim: { subjectRef: subject, subjectKind: 'object', attribute: 'location', value: { lat: 1, lon: 2 } },
  publishedAt,
  method: {
    algorithm: 'location-corroboration', algorithmVersion: 1, criteria: 'x', sourceCount: 3,
    observedFrom: publishedAt, observedTo: publishedAt, timePrecisionMs: 3_600_000,
    parameters: { windowHours: 24, distanceThresholdKm: 5 },
  },
} as FindingAttestation);

let store: MemoryPublishedFindingsStore;
beforeEach(() => { store = new MemoryPublishedFindingsStore(); });

describe('PublishedFindingsLedger', () => {
  it('records what was published, so the instance can enumerate its own claims', () => {
    const l = new PublishedFindingsLedger(store);
    l.record(content('MV Northwind'), { eventId: 'evt1', relaysOk: 3 });
    expect(l.live()).toHaveLength(1);
    expect(l.live()[0].eventId).toBe('evt1');
  });

  it('keeps the Nostr key that signed it, the other half of its address (plan item 5.1)', () => {
    const l = new PublishedFindingsLedger(store);
    l.record(content('MV Northwind'), { eventId: 'evt1', relaysOk: 1, nostrPubkey: 'f'.repeat(64) });
    expect(l.live()[0].nostrPubkey).toBe('f'.repeat(64));
  });

  it('keeps ONE entry per slot, matching replaceable-event semantics', () => {
    // Republishing about the same subject replaces the claim on the relay, so
    // a ledger that appended would disagree with what is actually being served.
    const l = new PublishedFindingsLedger(store);
    l.record(content('MV Northwind', '2026-01-01T00:00:00Z'), {});
    l.record(content('MV Northwind', '2026-06-01T00:00:00Z'), {});
    expect(l.all()).toHaveLength(1);
    expect(l.all()[0].publishedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('survives the session', () => {
    new PublishedFindingsLedger(store).record(content('MV Northwind'), {});
    expect(new PublishedFindingsLedger(store).live()).toHaveLength(1);
  });

  it('marks a slot retracted without forgetting it was ever published', () => {
    // "I retracted this" is itself a fact worth keeping — deleting the row
    // would make the instance unable to answer for what it once asserted.
    const l = new PublishedFindingsLedger(store);
    const rec = l.record(content('MV Northwind'), {});
    expect(l.markRetracted(rec.slot)).toBe(true);
    expect(l.live()).toEqual([]);
    expect(l.all()).toHaveLength(1);
    expect(l.all()[0].retractedAt).toBeTruthy();
  });

  it('refuses to retract something never published', () => {
    expect(new PublishedFindingsLedger(store).markRetracted('starcom_finding_nobody_location')).toBe(false);
  });

  it('treats a republished slot as live again', () => {
    // A retraction withdraws a claim; republishing asserts a NEW one. Carrying
    // retractedAt forward would mark a standing claim as withdrawn.
    const l = new PublishedFindingsLedger(store);
    const rec = l.record(content('MV Northwind', '2026-01-01T00:00:00Z'), {});
    l.markRetracted(rec.slot);
    l.record(content('MV Northwind', '2026-06-01T00:00:00Z'), {});
    expect(l.live()).toHaveLength(1);
    expect(l.get(rec.slot)?.retractedAt).toBeUndefined();
  });

  it('separates distinct subjects into distinct slots', () => {
    const l = new PublishedFindingsLedger(store);
    l.record(content('MV Northwind'), {});
    l.record(content('MV Southgate'), {});
    expect(l.all()).toHaveLength(2);
  });
});
describe('records written under the previous d-tag format', () => {
  /**
   * The slot IS the claim's identity, and its derivation changed — from
   * `starcom_finding_${subject}_${attribute}`, which collapsed every non-Latin
   * subject into one slot, to percent-encoded components joined by a colon.
   *
   * An old record is worse than an absent one: retraction targets a slot
   * computed from (subjectRef, attribute), so nothing built today can ever
   * match it. The ledger would show a standing claim that cannot be withdrawn.
   */
  it('discards them on load rather than reporting an unwithdrawable claim', () => {
    localStorage.setItem('starcom_published_findings_v1', JSON.stringify([
      { slot: 'starcom_finding_acme_corp_location', content: { claim: {} }, eventId: 'a', relaysOk: 1 },
      { slot: 'Acme%20Corp:location', content: { claim: {} }, eventId: 'b', relaysOk: 1 },
    ]));

    const kept = new BrowserPublishedFindingsStore().load();

    expect(kept).toHaveLength(1);
    expect(kept[0].slot).toBe('Acme%20Corp:location');
  });

  it('keeps a current-format slot even for a non-Latin subject', () => {
    // The subjects the old format destroyed are exactly the ones that must
    // survive now.
    localStorage.setItem('starcom_published_findings_v1', JSON.stringify([
      { slot: '%E5%8C%97%E4%BA%AC:location', content: { claim: {} }, eventId: 'c', relaysOk: 1 },
    ]));

    expect(new BrowserPublishedFindingsStore().load()).toHaveLength(1);
  });
});

describe('PublishedFindingsLedger — telling those who show it (review of plan item 5.1)', () => {
  it('says when a claim is recorded or withdrawn, and stops saying once asked', () => {
    const l = new PublishedFindingsLedger(store);
    let told = 0;
    const off = l.subscribe(() => { told += 1; });
    l.record(content('MV Northwind'), { eventId: 'evt1', relaysOk: 1 });
    l.markRetracted(l.live()[0].slot);
    expect(told).toBe(2);
    off();
    l.record(content('MV Southwind'), { eventId: 'evt2', relaysOk: 1 });
    expect(told).toBe(2);
  });
});
