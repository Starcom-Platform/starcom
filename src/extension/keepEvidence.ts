/**
 * Starcom keeping an evidence capture (decision D-EX, E2, W8; EX14, EX15).
 *
 * Each file is taken from Uplink one at a time, and kept only if its SHA-256 is the one the capture
 * names. All are checked before any is kept: when one did not arrive whole, nothing is kept, Uplink is
 * never told it was, and it still holds them all for the next try.
 *
 * The custody record is signed with the key this browser already has. Taking a capture in happens on
 * its own, and code that runs on its own never makes a key; with none yet, the record is kept unsigned,
 * the item says so, and the person signs it from the evidence.
 */
import type { AnchoredTimestamps } from './completeTimestamps';
import type { Event as NostrToolsEvent } from 'nostr-tools';
import type { UnsignedNostrEvent } from '../services/identity/NostrIdentityService';
import type { CreateIntelItemInput } from '../types/intel/IntelItemUI';
import { base64ToBytes } from './bytes';
import { custodyEvent, custodyRecord, evidenceToItem } from './evidenceItems';
import type { ArgsOf, Capability, Capture, UplinkAnswer } from './protocol';
import { uplinkPurpose } from './purposes';

/** What Starcom keeps of an evidence capture beside its item: the capture, and its record signed or not. */
export interface KeptCustody {
  captureId: string;
  capture: Capture;
  event?: NostrToolsEvent;
  /** The record to sign, while it is not signed. */
  unsigned?: UnsignedNostrEvent;
  /** Its timestamps, completed and checked against Bitcoin (W8c follow-up), beside the signed record, which is never changed. */
  anchored?: AnchoredTimestamps;
}

export interface EvidenceKeeping {
  ask<C extends Capability>(capability: C, purpose: string, args: ArgsOf[C]): Promise<UplinkAnswer<C>>;
  sha256Hex(bytes: Uint8Array): Promise<string>;
  putFile(sha256: string, file: Blob): Promise<void>;
  putRecord(itemId: string, record: KeptCustody): Promise<void>;
  /** Signs with the key this browser has; throws when it has none, making none. */
  sign(event: UnsignedNostrEvent): Promise<NostrToolsEvent>;
  addItem(item: CreateIntelItemInput): { id: string };
  uplinkVersion: string;
}

/** Keeps an evidence capture; its item's id. Throws, keeping nothing, when a file did not arrive whole. */
export async function keepEvidence(capture: Capture, k: EvidenceKeeping): Promise<string> {
  const arrived: Array<{ sha256: string; blob: Blob }> = [];
  for (const file of capture.files ?? []) {
    const answer = await k.ask('captures.file', uplinkPurpose('take').said, { id: capture.id, name: file.name });
    if (answer.ok === false) throw new Error(`${file.name} could not be taken from Uplink: ${answer.reason}`);
    const bytes = base64ToBytes(answer.result.base64);
    if ((await k.sha256Hex(bytes)) !== file.sha256) throw new Error(`${file.name} did not arrive as captured: its SHA-256 differs`);
    arrived.push({ sha256: file.sha256, blob: new Blob([bytes], { type: file.type }) });
  }
  for (const { sha256, blob } of arrived) await k.putFile(sha256, blob);

  const unsigned = custodyEvent(custodyRecord(capture, k.uplinkVersion));
  const event = await k.sign(unsigned).catch(() => null);
  const item = k.addItem(evidenceToItem(capture, event ? { eventId: event.id, signer: event.pubkey } : {}));
  await k.putRecord(item.id, event ? { captureId: capture.id, capture, event } : { captureId: capture.id, capture, unsigned });
  return item.id;
}
