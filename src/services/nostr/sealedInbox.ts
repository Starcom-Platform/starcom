/**
 * Everything sealed to this person (plan items 2.4 and 2.7): one listener for
 * the gift wraps addressed to their key, on the relays they can be reached on.
 *
 * Each wrap is opened as it arrives, through the signer (an extension may
 * ask), and handed to whoever handles what is inside, by the inner event's
 * kind: a bundle's parts are kept, still sealed, for "Received"; a chat
 * message goes to chat. A wrap addressed to anyone else is not kept, whatever
 * a relay hands over.
 *
 * What was opened is remembered by the wrap's id, never its content. A relay
 * sends the same wraps again after a reload, and opening a post-quantum chat
 * message twice cannot work: the first opening spent its one-time prekey.
 *
 * It listens only with a key it already has: listening never creates one.
 */
import type { Event, SimplePool } from 'nostr-tools';
import { createRelayPool } from './relayPool';
import { chatProviderRelays, internalRelays } from './publishTargets';
import { joinedRelays } from './joinedRelays';
import { onAccessChange } from './accessChanges';
import { unwrapGift, type Rumor } from './giftWrap';
import { PROTOCOL_KINDS } from './kindRegistry';
import { nostrIdentityService } from '../identity/NostrIdentityService';

export interface OpenedWrap { wrap: Event; rumor: Rumor; sender: string }
export type SealedHandlers = Partial<Record<number, (opened: OpenedWrap) => Promise<void> | void>>;

const DAY_S = 24 * 60 * 60;
/**
 * How far back a read reaches (plan 9.2). NIP-59 dates a wrap up to two days
 * before it was sent, and reads reached only three days back, so a wrap sent to
 * someone offline for more than about a day fell outside every later read, for
 * good. A read now starts from where this device last read to, less those two
 * days, and never more than fourteen days back.
 */
const BACKDATED_S = 2 * DAY_S;
const RECENT_S = 3 * DAY_S;
const FURTHEST_S = 14 * DAY_S;
const READ_TO_KEY = 'starcom.sealedReadTo.v1';
const HANDLED_KEY = 'starcom.sealedHandled.v1';
const HANDLED_KEPT = 5_000;

/** Where this device has read to, for each key, in seconds: set once the relays have sent everything they hold. */
function readTo(me: string): number | null {
  try {
    const value = (JSON.parse(globalThis.localStorage?.getItem(READ_TO_KEY) ?? '{}') as Record<string, unknown>)[me];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
function setReadTo(me: string, at: number): void {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(READ_TO_KEY) ?? '{}') as Record<string, number>;
    globalThis.localStorage?.setItem(READ_TO_KEY, JSON.stringify({ ...all, [me]: at }));
  } catch {
    // Storage refused: the next read reaches the furthest back, which loses nothing.
  }
}
/** The earliest wrap a read now must ask for, in seconds. */
function readFrom(me: string, now: number = Math.floor(Date.now() / 1000)): number {
  const last = readTo(me);
  const from = last === null ? now - FURTHEST_S : Math.min(now - RECENT_S, last - BACKDATED_S);
  return Math.max(from, now - FURTHEST_S);
}

function handled(): string[] {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(HANDLED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
const opening = new Set<string>();
function markHandled(id: string): void {
  try {
    globalThis.localStorage?.setItem(HANDLED_KEY, JSON.stringify([...handled().filter((h) => h !== id), id].slice(-HANDLED_KEPT)));
  } catch {
    // Storage refused: a relay's second copy is opened again, and a spent one fails to decrypt, which is said.
  }
}

/** Where a sealed message can reach this person: the internal relays, each team relay joined, and the chat relays. */
export function sealedInboxRelays(): string[] {
  return [...new Set([...internalRelays(), ...joinedRelays().map((r) => r.url), ...chatProviderRelays()])];
}

/** What could not be opened this session, and why: an extension without NIP-44, a changed wrap. */
const unreadable: string[] = [];
export function unreadableWraps(): readonly string[] {
  return unreadable;
}

/**
 * Opens a wrap addressed to `me`, once, and hands it on. True when it was
 * opened and handled now; false when it was not for `me`, was opened before,
 * or could not be opened.
 */
export async function acceptWrap(wrap: Event, me: string, handlers: SealedHandlers): Promise<boolean> {
  if (wrap.kind !== PROTOCOL_KINDS.NIP59_GIFT_WRAP || !wrap.tags.some((t) => t[0] === 'p' && t[1] === me)) return false;
  if (opening.has(wrap.id) || handled().includes(wrap.id)) return false;
  opening.add(wrap.id);
  try {
    const opened = await unwrapGift(wrap);
    if ('refused' in opened) {
      // A locked key is no verdict on the wrap: it is opened after the unlock (D-KL).
      if (!('locked' in opened)) unreadable.push(opened.refused);
      return false;
    }
    await handlers[opened.rumor.kind]?.({ wrap, rumor: opened.rumor, sender: opened.sender });
    markHandled(wrap.id);
    return true;
  } finally {
    opening.delete(wrap.id);
  }
}

/**
 * How long before a relay is read again after it drops the inbox (plan 0.3; the cohort audit of 2026-10-19): a
 * tunnel restart, a Wi-Fi drop or a laptop's sleep closed the read, nothing opened it again, and messages stopped
 * arriving until a reload. Sooner first, then once a minute; a read that reaches the end starts the wait over.
 */
export const INBOX_RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** A relay's own refusal, not a dropped connection: reading it again would only be refused again. */
const REFUSED = /^(restricted|blocked):/;

/**
 * Listens for wraps addressed to the signer, if one is known, each relay on its own, so one dropped is read again
 * without waiting on the rest. A read again reaches as far back as any read does (readFrom), and a wrap opened
 * before is not opened twice (acceptWrap). Returns a stop function.
 */
export function startSealedInbox(handlers: SealedHandlers, options: { relays?: string[]; pool?: SimplePool } = {}): () => void {
  const me = nostrIdentityService.signerPubkey();
  const relays = options.relays ?? sealedInboxRelays();
  if (!me || relays.length === 0) return () => {};
  // Locked (D-KL): nothing could be opened, and a read that reached the end would move the read position past what
  // it could not open. It waits, and starts on the unlock (startSealedInboxAtBoot, through onAccessChange).
  if (nostrIdentityService.isLocked()) return () => {};
  const pool = options.pool ?? createRelayPool();
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const reads = new Map<string, { close: () => void }>();
  const read = (relay: string, failed: number) => {
    const startedAt = Math.floor(Date.now() / 1000);
    let reachedEnd = false;
    const sub = pool.subscribeMany([relay], { kinds: [PROTOCOL_KINDS.NIP59_GIFT_WRAP], '#p': [me], since: readFrom(me, startedAt) }, {
      onevent: (wrap) => { void acceptWrap(wrap, me, handlers); },
      // Everything stored up to when this read began has been sent: the next read starts from there.
      oneose: () => { reachedEnd = true; setReadTo(me, startedAt); },
      onclose: (reasons) => {
        // The pool says each relay's reason as `{ url, reason }` (relayPool.ts).
        if (stopped || reasons.some((r) => REFUSED.test(r.reason))) return;
        const next = reachedEnd ? 0 : failed + 1;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!stopped) read(relay, next);
        }, INBOX_RETRY_MS[Math.min(reachedEnd ? 0 : failed, INBOX_RETRY_MS.length - 1)]);
        timers.add(timer);
      },
    });
    reads.set(relay, sub);
  };
  for (const relay of relays) read(relay, 0);
  return () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    for (const sub of reads.values()) sub.close();
  };
}

/**
 * The inbox for the whole session: started with whatever key is known, and
 * again whenever that changes (an extension answering, a key made or imported
 * here) or a team relay is joined, so each is listened for at once.
 */
export function startSealedInboxAtBoot(handlers: SealedHandlers, start: () => () => void = () => startSealedInbox(handlers)): () => void {
  let stop = start();
  const stopWatching = onAccessChange(() => { stop(); stop = start(); });
  return () => { stopWatching(); stop(); };
}
