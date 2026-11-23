/**
 * Notes signed after a review that no relay took wait on this device, exactly as signed, and go when a relay
 * answers (W1): newest version of a slot only, oldest signature first, ten tries and then the person decides,
 * nothing sent twice, nothing sent whose signature no longer checks, and the report records it once it went.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools';
import { EventOutbox, slotOf, type WaitingEvent } from '../EventOutbox';
import { MemoryOutboxStore } from '../OutboxStore';
import { cancelKept } from '../keptNotes';
import { isOwnPublishedReport, publishedReport, recordReportPublished } from '../../publishedReports';

const secret = generateSecretKey();
const pubkey = getPublicKey(secret);
const sign = (kind: number, tags: string[][], at: number, content = ''): Event =>
  finalizeEvent({ kind, tags, content, created_at: at }, secret);
const note = (d: string, at: number) => sign(30023, [['d', d], ['title', 'Gate 3'], ['t', 'starcom_intel']], at, 'Trucks queued.');
const address = (d: string) => `30023:${pubkey}:${d}`;
const RELAYS = ['wss://one.example', 'wss://two.example'];
/** Tries before a note waits for the person. */
const MAX_EVENT_ATTEMPTS = 10;

/** What the outbox keeps for a report, as the report panel finds it. */
const keptForReport = (records: readonly WaitingEvent[], report: string) => ({
  publish: records.find((r) => r.after && 'published' in r.after && r.after.published.report === report),
  withdrawal: records.find((r) => r.after && 'withdrawn' in r.after && r.after.withdrawn.report === report),
});

let outbox: EventOutbox;
beforeEach(() => {
  outbox = new EventOutbox(new MemoryOutboxStore());
  localStorage.clear();
});

describe('slotOf', () => {
  it('is kind, author and d for an addressable note; kind and author for a replaceable one; else the event', () => {
    expect(slotOf(note('r1', 100))).toBe(address('r1'));
    expect(slotOf(sign(10050, [], 100))).toBe(`10050:${pubkey}`);
    const deletion = sign(5, [['a', address('r1')]], 100);
    expect(slotOf(deletion)).toBe(deletion.id);
  });
});

describe('EventOutbox', () => {
  it('keeps a note with the relays its review named, and a newer version of the same slot replaces it', async () => {
    const first = note('r1', 100);
    await outbox.keep(first, RELAYS);
    const second = note('r1', 200);
    await outbox.keep(second, RELAYS);
    await outbox.keep(note('r2', 150), RELAYS);
    const waiting = await outbox.waiting();
    expect(waiting.map((r) => r.id)).toEqual([waiting[0].id, second.id]);
    expect(waiting.map((r) => r.slot)).toEqual([address('r2'), address('r1')]);
    expect(waiting[1]).toMatchObject({ relays: RELAYS, attempts: 0, status: 'pending' });
  });

  it('sends oldest signature first, exactly as signed, removes what went and records the report', async () => {
    const deletion = sign(5, [['a', address('r1')], ['k', '30023']], 300);
    const notice = sign(30023, [['d', 'r1'], ['title', 'Withdrawn'], ['t', 'retracted']], 301);
    recordReportPublished('r1', { address: address('r1'), eventId: 'old', firstAt: 1000, at: 1000, relays: 2, reportUpdatedAt: 1000 });
    await outbox.keep(notice, RELAYS, { after: { withdrawn: { report: 'r1', at: 300_000 } } });
    await outbox.keep(deletion, RELAYS);
    const offered: Event[] = [];
    const summary = await outbox.drain(async (event, relays) => { offered.push(event); expect(relays).toEqual(RELAYS); return 1; });
    expect(offered.map((e) => [e.id, e.sig])).toEqual([[deletion.id, deletion.sig], [notice.id, notice.sig]]);
    expect(summary).toEqual({ attempted: 2, sent: 2, stillPending: 0, abandoned: 0 });
    expect(await outbox.waiting()).toEqual([]);
    expect(publishedReport('r1')).toMatchObject({ eventId: notice.id, relays: 1, withdrawnAt: 300_000, firstAt: 1000 });
  });

  it('records a kept publication when it goes, and its copy read back meanwhile is the report\'s own', async () => {
    const published = note('r1', 400);
    await outbox.keep(published, RELAYS, { after: { published: { report: 'r1', address: address('r1'), firstAt: 400_000, reportUpdatedAt: 399_000 } } });
    expect(publishedReport('r1')).toBeNull();
    await outbox.drain(async () => {
      expect(isOwnPublishedReport(address('r1'))).toBe(true);
      return 2;
    });
    expect(publishedReport('r1')).toEqual({ address: address('r1'), eventId: published.id, firstAt: 400_000, at: 400_000, relays: 2, reportUpdatedAt: 399_000 });
  });

  it('counts a failed try, and after ten waits for the person: try again, or cancel', async () => {
    const kept = note('r1', 100);
    await outbox.keep(kept, RELAYS);
    const refuse = async () => { throw new Error('No relay took it: offline'); };
    for (let i = 1; i < MAX_EVENT_ATTEMPTS; i += 1) {
      expect(await outbox.drain(refuse)).toMatchObject({ stillPending: 1 });
    }
    expect(await outbox.drain(refuse)).toMatchObject({ abandoned: 1 });
    const [given] = await outbox.waiting();
    expect(given).toMatchObject({ status: 'abandoned', attempts: MAX_EVENT_ATTEMPTS, lastError: 'No relay took it: offline' });
    expect(await outbox.drain(refuse)).toMatchObject({ attempted: 0 });
    expect(await outbox.retry(kept.id)).toBe(true);
    expect((await outbox.pending())[0]).toMatchObject({ attempts: 0, status: 'pending', lastError: null });
    expect(await outbox.cancel(kept.id)).toBe(true);
    expect(await outbox.waiting()).toEqual([]);
    expect(await outbox.cancel(kept.id)).toBe(false);
  });

  it('waits for the person at once when every relay refuses it for good', async () => {
    await outbox.keep(note('r1', 100), RELAYS);
    const refuse = async () => { throw Object.assign(new Error('No relay took it: blocked: no'), { said: ['blocked: no', 'invalid: no'] }); };
    expect(await outbox.drain(refuse)).toMatchObject({ abandoned: 1 });
    expect((await outbox.waiting())[0]).toMatchObject({ status: 'abandoned', attempts: 1 });
  });

  it('sends nothing whose signature no longer checks', async () => {
    const kept = note('r1', 100);
    // Changed after signing; the copy also carries the verdict nostr-tools cached on the original.
    await outbox.keep({ ...kept, content: 'Something else.' }, RELAYS);
    let offered = 0;
    expect(await outbox.drain(async () => { offered += 1; return 1; })).toMatchObject({ abandoned: 1 });
    expect(offered).toBe(0);
    expect((await outbox.waiting())[0].lastError).toBe('its signature no longer checks');
  });

  it('sends nothing while held, and never sends a note twice when two drains start together', async () => {
    await outbox.keep(note('r1', 100), RELAYS);
    outbox.hold();
    expect(await outbox.drain(async () => 1)).toMatchObject({ attempted: 0 });
    outbox.resume();
    let offered = 0;
    const resend = async () => { offered += 1; await new Promise((r) => setTimeout(r, 5)); return 1; };
    await Promise.all([outbox.drain(resend), outbox.drain(resend)]);
    expect(offered).toBe(1);
  });
});

describe('when a kept note goes', () => {
  it('tells whoever listens, even when another listener throws, and lets go of what a rule matches', async () => {
    const heard: Array<[string, number]> = [];
    outbox.whenSent(() => { throw new Error('a broken listener'); });
    const stop = outbox.whenSent((record, took) => { heard.push([record.id, took]); });
    const kept = note('r1', 100);
    await outbox.keep(kept, RELAYS, { after: { dispatched: { mission: 'm1' } } });
    await outbox.drain(async () => 3);
    expect(heard).toEqual([[kept.id, 3]]);
    stop();
    await outbox.keep(note('r2', 100), RELAYS, { after: { dispatched: { mission: 'm2' } } });
    await outbox.keep(note('r3', 100), RELAYS, { after: { dispatched: { mission: 'm3' } } });
    expect(await outbox.cancelWhere((r) => !!r.after && 'dispatched' in r.after && r.after.dispatched.mission === 'm2')).toBe(1);
    expect((await outbox.waiting()).map((r) => r.slot)).toEqual([address('r3')]);
  });
});

describe('kept notes on a report', () => {
  it('finds a report\'s kept note and its withdrawal, and cancelling the withdrawal takes its deletion request too', async () => {
    const published = note('r1', 100);
    const deletion = sign(5, [['a', address('r1')], ['k', '30023']], 300);
    const other = sign(5, [['a', address('r2')]], 300);
    const notice = sign(30023, [['d', 'r1'], ['title', 'Withdrawn'], ['t', 'retracted']], 301);
    await outbox.keep(published, RELAYS, { after: { published: { report: 'r1', address: address('r1'), firstAt: 1, reportUpdatedAt: 1 } } });
    expect(keptForReport(await outbox.waiting(), 'r1').publish?.id).toBe(published.id);
    await outbox.keep(deletion, RELAYS);
    await outbox.keep(other, RELAYS);
    await outbox.keep(notice, RELAYS, { after: { withdrawn: { report: 'r1', at: 300_000 } } });
    const kept = keptForReport(await outbox.waiting(), 'r1');
    // The notice is the report's newest version: the publication it replaces no longer waits.
    expect(kept.publish).toBeUndefined();
    expect(kept.withdrawal?.id).toBe(notice.id);
    await cancelKept(kept.withdrawal!, outbox);
    expect((await outbox.waiting()).map((r) => r.id)).toEqual([other.id]);
  });
});
