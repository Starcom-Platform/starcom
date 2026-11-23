/**
 * What chat is unread, and the notice a new message raises (plan item 9.12,
 * decision G5).
 *
 * A message said to a team, or to you, while you were on another screen was
 * announced nowhere, and the header's badge counted open windows. Now each
 * message that arrives while nobody is looking at its conversation raises one
 * notice, naming who wrote and where, never what they wrote, and counts as
 * unread until its conversation is looked at: a direct message's window, open
 * and not minimized, or the team's chat. What is unread is kept, so a reload
 * does not forget it.
 */
import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { subscribeSealedChat, type SealedChatMessage } from './sealedChat';
import { nameOf } from '../identity/names';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { realTimeTeamService } from '../RealTimeTeamService';
import { relayAddress } from '../nostr/joinedRelays';
import { hudInfo } from '../../utils/hudNotifications';

const STORAGE_KEY = 'starcom.chatUnread.v1';
/** Enough to count what a busy team says in a long absence, and no more. */
const KEPT_PER_CONVERSATION = 200;

type Unread = Record<string, string[]>;
const listeners = new Set<() => void>();
/** Conversations on screen now, each with how many views show it. */
const looking = new Map<string, number>();

/** A conversation: a team, by its relay's address, or a person, by key. */
export function conversationOf(message: Pick<SealedChatMessage, 'team' | 'senderId'>): string {
  return message.team ? `team:${relayAddress(message.team)}` : `dm:${message.senderId}`;
}

function read(): Unread {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Unread : {};
  } catch {
    return {};
  }
}

function write(unread: Unread): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(unread));
  } catch {
    // Storage refused: the count lasts this session.
  }
  listeners.forEach((listener) => listener());
}

/** How many messages are unread, across every conversation. */
export function unreadCount(): number {
  return Object.values(read()).reduce((sum, ids) => sum + (Array.isArray(ids) ? ids.length : 0), 0);
}

/**
 * Marks a conversation as on screen until the returned function is called.
 * What was unread there is read now, and what arrives meanwhile is not counted.
 */
export function lookAt(conversation: string): () => void {
  looking.set(conversation, (looking.get(conversation) ?? 0) + 1);
  const unread = read();
  if (unread[conversation]?.length) {
    delete unread[conversation];
    write(unread);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (looking.get(conversation) ?? 1) - 1;
    if (left > 0) looking.set(conversation, left);
    else looking.delete(conversation);
  };
}

function whoWrote(pubkey: string): string {
  const known = nameOf(pubkey)?.name;
  if (known) return known;
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return 'Someone';
  }
}

function teamName(team: string): string {
  const address = relayAddress(team);
  return realTimeTeamService.getTeams().find((t) => t.relayUrl && relayAddress(t.relayUrl) === address)?.name ?? team;
}

/**
 * Listens for messages as they arrive, from now on. What it is told of from
 * before (a reload's history) raises nothing. Returns the function that stops it.
 */
export function startChatNotices(): () => void {
  const told = new Set<string>();
  return subscribeSealedChat((message, live) => {
    // Every screen that shows chat hears the same message after this: nothing
    // here may throw, or they would not.
    try {
      if (!live || told.has(message.id)) return;
      told.add(message.id);
      if (message.senderId === nostrIdentityService.signerPubkey()) return;
      const conversation = conversationOf(message);
      if (looking.has(conversation)) return;
      const unread = read();
      const ids = unread[conversation] ?? [];
      if (ids.includes(message.id)) return;
      unread[conversation] = [...ids, message.id].slice(-KEPT_PER_CONVERSATION);
      write(unread);
      hudInfo('New message', `${whoWrote(message.senderId)} wrote to ${message.team ? teamName(message.team) : 'you'}.`);
    } catch {
      // A notice missed is better than a message not shown.
    }
  });
}

/** How many messages are unread, kept up to date. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(unreadCount);
  useEffect(() => {
    const listener = () => setCount(unreadCount());
    listeners.add(listener);
    listener();
    return () => { listeners.delete(listener); };
  }, []);
  return count;
}
