/**
 * An evidence capture as Starcom keeps it (decision D-EX, E2, W8; EX14, EX15, EX21, EX22).
 *
 * The custody record names what was captured, from where, when, by which Uplink, and each file's
 * SHA-256, and nothing about the device: no browser, screen, language or address (EX15). As an event
 * it is of the custody kind, timed when captured, to be signed by whoever captured it and never
 * published (APP_KINDS.EVIDENCE_CUSTODY is ephemeral, so a relay it ever reached would keep nothing).
 *
 * The item says the same in words, waits in the inbox to be filed like any capture, and is graded and
 * handled as one: F, unverified, no distribution until someone decides.
 */
import { APP_KINDS } from '../services/nostr/kindRegistry';
import type { UnsignedNostrEvent } from '../services/identity/NostrIdentityService';
import type { CreateIntelItemInput } from '../types/intel/IntelItemUI';
import { formatUtcDateTime } from '../utils/utcTime';
import { CAPTURE_CATEGORY, CAPTURE_TAG, literal } from './captureItems';
import type { Capture, EvidenceFile } from './protocol';

/** The tag an evidence capture's item carries, beside the capture tag. */
export const EVIDENCE_TAG = 'evidence';

export interface CustodyRecord {
  type: 'starcom-evidence-custody';
  v: 1;
  url: string;
  title?: string;
  /** UTC, ISO 8601 ending Z. */
  capturedAt: string;
  files: EvidenceFile[];
  scaledTo?: number;
  by: string;
  read: string;
}

export function custodyRecord(capture: Capture, uplinkVersion: string): CustodyRecord {
  return {
    type: 'starcom-evidence-custody', v: 1,
    url: capture.page.url,
    ...(capture.page.title ? { title: capture.page.title } : {}),
    capturedAt: capture.at,
    files: capture.files ?? [],
    ...(capture.scaledTo ? { scaledTo: capture.scaledTo } : {}),
    by: `Starcom Uplink ${uplinkVersion}`,
    read: 'at the capturer\'s click, with the access that click gave (activeTab)',
  };
}

/** The record as an event to sign: timed when captured, naming the page and each file's hash. */
export function custodyEvent(record: CustodyRecord): UnsignedNostrEvent {
  return {
    kind: APP_KINDS.EVIDENCE_CUSTODY,
    created_at: Math.floor(Date.parse(record.capturedAt) / 1000),
    tags: [['t', 'starcom-evidence-custody'], ['r', record.url], ...record.files.map((f) => ['x', f.sha256])],
    content: JSON.stringify(record),
  };
}

const FILE_WORDS: Record<string, string> = { 'screenshot.png': 'Picture', 'page.html': 'Page HTML', 'text.txt': 'Page text' };
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const kilobytes = (size: number) => (size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`);

/** The item for an evidence capture, with its custody record's id and signer when it is signed. */
export function evidenceToItem(capture: Capture, custody: { eventId?: string; signer?: string }): CreateIntelItemInput {
  const name = capture.page.title ?? hostOf(capture.page.url);
  const files = (capture.files ?? []).map((f) => `- ${FILE_WORDS[f.name] ?? f.name}${f.name === 'screenshot.png' && capture.scaledTo ? `, scaled to ${capture.scaledTo} px wide` : ''}: ${kilobytes(f.size)}, SHA-256 \`${f.sha256}\``);
  const from = capture.page.title ? `[${literal(capture.page.title)}](<${capture.page.url}>)` : `<${capture.page.url}>`;
  const hosts = (capture.timestamps?.calendars ?? []).map(hostOf);
  const timestampLine = hosts.length
    ? `Timestamped with OpenTimestamps by ${hosts.join(' and ')}: each file's proof is pending until Bitcoin confirms it, usually within hours, and any OpenTimestamps client can complete and check it.`
    : `${(capture.timestampNote ?? 'Not timestamped').replace(/\.$/, '')}.`;
  const custodyLine = custody.eventId
    ? `Custody record ${custody.eventId}, signed by ${custody.signer}.`
    : 'The custody record is not signed yet: this browser had no Starcom key when it came in. Sign it from the evidence, with your key.';
  return {
    title: `Evidence: ${name}`.slice(0, 80),
    type: 'EVIDENCE',
    source: hostOf(capture.page.url),
    // Admiralty grades the source, and an unassessed page cannot be graded.
    reliability: 'F',
    // That the page looked and read so at that moment is checked; whether what it says is so is not.
    confidence: 0.9,
    tags: [CAPTURE_TAG, EVIDENCE_TAG],
    categories: [CAPTURE_CATEGORY],
    content: [
      `Captured as evidence from ${from} on ${formatUtcDateTime(Date.parse(capture.at), { year: true, seconds: true })}, through Starcom Uplink.`,
      files.join('\n'),
      timestampLine,
      custodyLine,
      'The files are kept in this browser beside the case, checked against these hashes when they came in; they are not published.',
    ].join('\n\n'),
    collectedAt: capture.at,
    verified: false,
  };
}
