/**
 * An evidence capture as Starcom keeps it (decision D-EX, E2, W8; EX14, EX15): a custody record that
 * names what was captured, from where, when, and each file's SHA-256, and nothing about the device;
 * the record as an event to sign, never to publish; and an intel item that says all of it in words.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { Capture } from '../protocol';
import { EVIDENCE_TAG, custodyEvent, custodyRecord, evidenceToItem } from '../evidenceItems';
import { CAPTURE_CATEGORY, CAPTURE_TAG } from '../captureItems';
import { APP_KINDS } from '../../services/nostr/kindRegistry';

const capture: Capture = {
  id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z',
  page: { url: 'https://news.example.org/flood', title: 'Floodwater reaches the old town' },
  scaledTo: 1280,
  files: [
    { name: 'screenshot.png', type: 'image/png', size: 1024, sha256: 'a'.repeat(64) },
    { name: 'page.html', type: 'text/html', size: 2048, sha256: 'b'.repeat(64) },
    { name: 'text.txt', type: 'text/plain', size: 512, sha256: 'c'.repeat(64) },
  ],
};

describe('custodyRecord', () => {
  it('names what, where, when and each file\'s hash, and nothing of the device', () => {
    const record = custodyRecord(capture, '0.1.0');
    expect(record).toEqual({
      type: 'starcom-evidence-custody', v: 1,
      url: 'https://news.example.org/flood', title: 'Floodwater reaches the old town',
      capturedAt: '2026-10-12T00:20:00.000Z',
      files: capture.files, scaledTo: 1280, by: 'Starcom Uplink 0.1.0',
      read: 'at the capturer\'s click, with the access that click gave (activeTab)',
    });
    expect(Object.keys(record).sort()).toEqual(['by', 'capturedAt', 'files', 'read', 'scaledTo', 'title', 'type', 'url', 'v']);
  });
});

describe('custodyEvent', () => {
  it('is an event of the custody kind, timed when captured, naming each file\'s hash and the page, to sign and never publish', () => {
    const event = custodyEvent(custodyRecord(capture, '0.1.0'));
    expect(event.kind).toBe(APP_KINDS.EVIDENCE_CUSTODY);
    expect(event.kind).toBeGreaterThanOrEqual(20000);
    expect(event.kind).toBeLessThan(30000);
    expect(event.created_at).toBe(Date.parse(capture.at) / 1000);
    expect(event.tags).toEqual([['t', 'starcom-evidence-custody'], ['r', capture.page.url], ['x', 'a'.repeat(64)], ['x', 'b'.repeat(64)], ['x', 'c'.repeat(64)]]);
    expect(JSON.parse(event.content)).toEqual(custodyRecord(capture, '0.1.0'));
  });
});

describe('evidenceToItem', () => {
  it('is an item waiting to be filed, saying what was kept, the hashes, and whether the record is signed', () => {
    const signed = evidenceToItem(capture, { eventId: 'e'.repeat(64), signer: 'f'.repeat(64) });
    expect(signed).toMatchObject({
      title: 'Evidence: Floodwater reaches the old town', type: 'EVIDENCE', source: 'news.example.org',
      reliability: 'F', verified: false, collectedAt: capture.at,
      tags: [CAPTURE_TAG, EVIDENCE_TAG], categories: [CAPTURE_CATEGORY],
    });
    expect(signed.visibility).toBeUndefined();
    expect(signed.content).toContain('a'.repeat(64));
    expect(signed.content).toContain('scaled to 1280 px wide');
    expect(signed.content).toContain(`Custody record ${'e'.repeat(64)}`);
    expect(signed.content).toContain('kept in this browser beside the case');
    const unsigned = evidenceToItem(capture, {});
    expect(unsigned.content).toContain('not signed yet');
  });

  it('says how the files were timestamped, or why not', () => {
    const stamped = evidenceToItem({ ...capture, timestamps: { calendars: ['https://alice.btc.calendar.opentimestamps.org', 'https://finney.calendar.eternitywall.com'], at: '2026-10-12T00:20:02.000Z', proofs: {} } }, {});
    expect(stamped.content).toContain('Timestamped with OpenTimestamps by alice.btc.calendar.opentimestamps.org and finney.calendar.eternitywall.com');
    expect(stamped.content).toContain('pending until Bitcoin confirms it');
    const unstamped = evidenceToItem({ ...capture, timestampNote: 'Not timestamped: no calendar answered' }, {});
    expect(unstamped.content).toContain('Not timestamped: no calendar answered.');
  });
});

