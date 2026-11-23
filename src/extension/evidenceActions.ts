/**
 * What the person does with kept evidence (decision D-EX, E2, W8; EX15).
 *
 * Check again: each file read back from where Starcom keeps it and hashed, against the hash its
 * custody record names, so the evidence can be shown unchanged, or shown changed.
 *
 * Sign: a record that came in unsigned (this browser had no key then) is signed with the person's own
 * key, at their own click, which may make the key; it is signed once, and the item then says by whom.
 */
import type { Event as NostrToolsEvent } from 'nostr-tools';
import type { UnsignedNostrEvent } from '../services/identity/NostrIdentityService';
import { evidenceToItem } from './evidenceItems';
import type { KeptCustody } from './keepEvidence';
import type { Capture, EvidenceFileName } from './protocol';

export type FileState = 'matches' | 'differs' | 'missing';

export async function recheckEvidence(
  capture: Capture,
  deps: { getFile(sha256: string): Promise<Blob | undefined>; sha256Hex(bytes: Uint8Array): Promise<string> },
): Promise<Array<{ name: EvidenceFileName; state: FileState }>> {
  return Promise.all((capture.files ?? []).map(async (file) => {
    const blob = await deps.getFile(file.sha256);
    if (!blob) return { name: file.name, state: 'missing' as const };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { name: file.name, state: (await deps.sha256Hex(bytes)) === file.sha256 ? 'matches' as const : 'differs' as const };
  }));
}

export async function signEvidence(
  itemId: string,
  deps: {
    getRecord(itemId: string): Promise<KeptCustody | undefined>;
    putRecord(itemId: string, record: KeptCustody): Promise<void>;
    /** Signs as the person, at their click: may make their key. */
    sign(event: UnsignedNostrEvent): Promise<NostrToolsEvent>;
    updateItemContent(itemId: string, content: string): void;
  },
): Promise<NostrToolsEvent> {
  const record = await deps.getRecord(itemId);
  if (!record) throw new Error('No custody record is kept for this evidence');
  if (record.event) throw new Error('This evidence is signed already');
  if (!record.unsigned) throw new Error('This evidence has no record to sign');
  const event = await deps.sign(record.unsigned);
  // Everything else the record holds stays: its completed timestamps among it.
  const { unsigned: _signedNow, ...kept } = record;
  await deps.putRecord(itemId, { ...kept, event });
  deps.updateItemContent(itemId, evidenceToItem(record.capture, { eventId: event.id, signer: event.pubkey }).content);
  return event;
}
