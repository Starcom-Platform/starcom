/**
 * Which keys here have used chat (decision D-MF, MF15).
 *
 * Chat announces a key's prekeys, the public key material others need to write to it post-quantum, only once
 * the person has used chat with it: sent a message, or opened a conversation or made a channel. A key
 * made for something else (a report, a publish) announces nothing, so a relay never sees a new key's chat
 * material arrive beside the first thing it signed. Kept per key, so a key brought here decides for itself.
 */
const STORAGE_KEY = 'starcom.chatUsed.v1';

function read(): string[] {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** True once a person has used chat with this key, here. */
export function chatUsedBy(pubkey: string): boolean {
  return read().includes(pubkey);
}

/** A person's own act in chat, with this key. */
export function rememberChatUse(pubkey: string): void {
  const used = read();
  if (used.includes(pubkey)) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...used, pubkey]));
  } catch {
    // Not kept: chat is used again on the next send, and announces then.
  }
}

/** For tests, and for forgetting this browser's keys. */
export function forgetChatUse(): void {
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* nothing kept */ }
}
