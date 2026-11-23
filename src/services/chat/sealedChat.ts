/**
 * Chat sealed to people (plan item 2.7).
 *
 * A message goes to each recipient as their own inner event, sealed and
 * gift-wrapped (NIP-59): the ML-KEM envelope made for their published
 * prekey bundle, or the text sealed with NIP-44 when they have published
 * none, which the message then says is not post-quantum. Every copy carries
 * the same message id, so a team message is one message wherever it lands.
 * Nothing leaves in plain text: a message that cannot be sealed is not sent.
 *
 * Where: the relays that can reach the recipients (sealedRelaysFor) and,
 * unless this build names internal relays, the chat relays, since everyone's
 * sealed inbox reads those and a direct message must not depend on sharing a
 * team. A relay sees who receives something and roughly when; never who sent
 * it, and never what it is.
 */
import type { SimplePool } from 'nostr-tools';
import { ageAnswer } from '../identity/ageAnswer';
import { createRelayPool } from '../nostr/relayPool';
import { chatProviderRelays, internalRelays } from '../nostr/publishTargets';
import { makeRumor, wrapRumor } from '../nostr/giftWrap';
import { APP_KINDS } from '../nostr/kindRegistry';
import { sealedRelaysFor } from '../team/sealedRelays';

export interface SealedChatMessage {
  id: string;
  senderId: string;
  recipients: string[];
  content: string;
  timestamp: number;
  /** True only when it arrived as an ML-KEM envelope and opened. */
  postQuantum: boolean;
  decryptionFailed: boolean;
  /** The team it was said to, when it was a team message. */
  team?: string;
}

export interface SealedSendResult {
  id: string;
  reached: string[];
  notReached: Array<{ pubkey: string; reason: string }>;
  /** True when every recipient got an ML-KEM envelope. */
  postQuantum: boolean;
}

/** Where a chat message to these people goes. */
export function chatRelaysFor(recipients: readonly string[]): string[] {
  const sealed = sealedRelaysFor(recipients);
  return [...new Set(internalRelays().length > 0 ? sealed : [...sealed, ...chatProviderRelays()])];
}

const messageId = (): string => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Minors: team chats only (D-RS, RS48; rlsh-minors.md, rule 3, from Scouting's no one-on-one contact). Someone who
 * said 13 to 17 sends no one-to-one message and is shown none; for them a team message counts only when it names a
 * team and reaches at least two people besides its sender, so no one is ever alone with them.
 */
export const MINOR_DIRECT_REFUSAL = 'Under 18, Starcom carries no one-to-one messages: team chats only.';
const minorHere = (): boolean => { const b = ageAnswer()?.bracket; return b === '13_15' || b === '16_17'; };
const groupMessage = (m: Pick<SealedChatMessage, 'team' | 'recipients'>): boolean => !!m.team && m.recipients.length >= 2;
/** Whether this device shows the message: every one, except to someone 13 to 17, who is shown group messages only. */
const shownHere = (m: SealedChatMessage): boolean => !minorHere() || groupMessage(m);

export async function sendSealedChat(input: {
  recipients: string[];
  text: string;
  /** Makes the post-quantum envelope for one recipient, or says there is none to make. */
  encryptFor: (recipient: string, text: string) => Promise<{ content: string; postQuantum: boolean }>;
  team?: string;
  relays?: string[];
  pool?: SimplePool;
}): Promise<SealedSendResult> {
  if (minorHere() && !groupMessage({ team: input.team, recipients: input.recipients })) throw new Error(MINOR_DIRECT_REFUSAL);
  const id = messageId();
  const relays = input.relays ?? chatRelaysFor(input.recipients);
  const pool = input.pool ?? createRelayPool();
  const result: SealedSendResult = { id, reached: [], notReached: [], postQuantum: true };
  for (const recipient of input.recipients) {
    try {
      const { content, postQuantum } = await input.encryptFor(recipient, input.text);
      if (!postQuantum) result.postQuantum = false;
      const rumor = await makeRumor({
        kind: APP_KINDS.CHAT_MESSAGE,
        tags: [['p', recipient], ['m', id], ...(postQuantum ? [['enc', 'ml-kem-768']] : []), ...(input.team ? [['team', input.team]] : [])],
        content,
      });
      const wrap = await wrapRumor(rumor, recipient);
      const answers = await Promise.allSettled(pool.publish(relays, wrap));
      if (!answers.some((a) => a.status === 'fulfilled')) throw new Error('No relay took it.');
      result.reached.push(recipient);
    } catch (e) {
      result.notReached.push({ pubkey: recipient, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  if (result.reached.length === 0) result.postQuantum = false;
  return result;
}

// ── History ───────────────────────────────────────────────────────────────
//
// The sealed inbox opens each wrap once and remembers that it did: a
// post-quantum message cannot be opened twice, since opening it spends its
// one-time prekey. So a message is kept when it is opened, and what was sent
// when it was sent, or a reload loses it for good. Kept on this device, as
// the workspace's records are.

const HISTORY_DB = 'starcom-chat-history';
const HISTORY_STORE = 'messages';
const HISTORY_KEPT = 2_000;

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(HISTORY_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(HISTORY_STORE)) req.result.createObjectStore(HISTORY_STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function keep(message: SealedChatMessage): Promise<void> {
  try {
    const db = await openHistory();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      tx.objectStore(HISTORY_STORE).put(message);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // Kept for this session only.
  }
}

async function kept(): Promise<SealedChatMessage[]> {
  try {
    const db = await openHistory();
    return await new Promise((resolve) => {
      const req = db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as SealedChatMessage[]).sort((a, b) => a.timestamp - b.timestamp).slice(-HISTORY_KEPT));
      };
      req.onerror = () => { db.close(); resolve([]); };
    });
  } catch {
    return [];
  }
}

/** `live` is true for a message that arrived while this listener listened; false for what it is told of from before. */
type Listener = (message: SealedChatMessage, live: boolean) => void;
const listeners = new Set<Listener>();
/** What arrived this session: told again, with what was kept before, to each screen that opens. Listeners drop repeats by id. */
const session: SealedChatMessage[] = [];
const SESSION_KEPT = 500;

export function subscribeSealedChat(listener: Listener): () => void {
  listeners.add(listener);
  session.filter(shownHere).forEach((m) => listener(m, false));
  void kept().then((stored) => {
    if (!listeners.has(listener)) return;
    stored.filter((m) => !session.some((s) => s.id === m.id)).filter(shownHere).forEach((m) => listener(m, false));
  });
  return () => { listeners.delete(listener); };
}

/** A message opened: kept, and told to whatever shows chat. */
export function emitSealedChat(message: SealedChatMessage): void {
  if (!shownHere(message)) return;
  session.push(message);
  if (session.length > SESSION_KEPT) session.shift();
  void keep(message);
  listeners.forEach((listener) => listener(message, true));
}

/**
 * A message this person sent: kept, for after a reload, but not told to the
 * screen now, which already shows it. No copy is sealed back to the sender.
 */
export async function rememberSentChat(message: SealedChatMessage): Promise<void> {
  await keep(message);
}
