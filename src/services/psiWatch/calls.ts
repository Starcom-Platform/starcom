/**
 * Sealed calls (decision D-PW, PW40, PW44, PW56, PW72, PW75): an operative's call names a window, a Zone and what is
 * expected there, a kind of event with the operative's own words. Before the window opens only its fingerprint
 * goes out: a signed note carrying the SHA-256 of a random salt and the call's exact text, so the text cannot be
 * guessed, to the team relay the operative picks. After the window closes the call is revealed, the exact text and
 * the salt in a second note that anyone can hash and check against the first; or kept private, its text and salt
 * staying only on the operative's device, the relay holding the fingerprint alone. No score is kept (PW36).
 *
 * The notes take Mecha Jono's `psi_call` shape (their draft of 27 Oct on the handoff doc's Psi thread, entering the
 * vocabulary with Interchange 3.29), one family for operatives' calls and their machine's daily forecasts: the seal,
 * `d psi-call-<id>`, never replaced; the reveal, `d psi-call-<id>-reveal`, an `e` tag to the seal. As the owner asked
 * of them (PW75), the seal carries the fingerprint alone: the window's start and end wait for the reveal too. Until
 * the Interchange names it, the kind is their families' own and the hash is salt then text; both are asked of them
 * (Starcom's note of 28 Oct) and live only in the constants and `fingerprintOf` below.
 */
import { useSyncExternalStore } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { stableStringify } from '../exchange/signing';

/** Mecha Jono's `psi_` families' kind, until their Interchange 3.29 gives `psi_call` its own. */
export const PSI_CALL_KIND = 30023;
export const PSI_CALL_FAMILY = 'psi_call';
const SCHEMA_VERSION = '0';
const STORE_KEY = 'starcom:psi-calls';

/** The family's tags, as every `psi_` note carries them (kit `schemas_psi.md`). */
const FAMILY_TAGS: string[][] = [
  ['t', 'psi_watch'], ['t', PSI_CALL_FAMILY], ['t', 'experimental'], ['t', 'role:context'],
  ['t', 'category:psi'], ['t', 'category:psi.call'], ['schema_version', SCHEMA_VERSION],
];

/** What a call expects (PW56): a kind of event, matched afterwards to what happened. */
export const CALL_KINDS = ['conflict', 'quakes', 'storm', 'unrest', 'intel', 'archetype'] as const;
export type CallKind = (typeof CALL_KINDS)[number];

/** The call as it is revealed: these fields, their keys sorted (stableStringify), are its exact text. */
export interface CallText {
  /** The window the call is made on: its address and title, and when it opens and closes, unix seconds. */
  window: { address: string; title: string; start: number; end: number };
  /** The Zone picked, by its ZSP code and name. */
  place: { zone: string; name: string };
  /** What is expected there; an Intel Report category or a lexicon archetype for those kinds. */
  expects: { kind: CallKind; detail?: string };
  words: string;
}

export interface PsiCall {
  /** The call's id, its `d` tags' own: random, so it tells nothing of the call. */
  id: string;
  text: CallText;
  /** 16 random bytes, hex: the fingerprint's salt, kept here until the reveal. */
  salt: string;
  createdAt: number;
  /** Where its fingerprint went, once sealed. */
  seal?: { eventId: string; relay: string; at: number };
  /** Once revealed, the reveal's note; once kept private, the moment that was chosen. */
  reveal?: { eventId: string; at: number };
  keptPrivate?: number;
}

/** When a call's window opens and closes, ms. */
export const windowMs = (text: CallText): { fromMs: number; untilMs: number } => ({ fromMs: text.window.start * 1000, untilMs: text.window.end * 1000 });

/** The call's exact text, the one string hashed and revealed. */
export const callContent = (text: CallText): string => stableStringify(text);
/** Its fingerprint: the SHA-256 of the salt and then the text, in hex. */
export const fingerprintOf = (text: CallText, salt: string): string => bytesToHex(sha256(utf8ToBytes(salt + callContent(text))));

/** A new call, with a random id and a salt of 16 random bytes. */
export function newCall(text: CallText, createdAt: number, random: (n: number) => Uint8Array = randomBytes): PsiCall {
  return { id: bytesToHex(random(8)), text, salt: bytesToHex(random(16)), createdAt };
}

export const sealAddress = (id: string): string => `psi-call-${id}`;
export const revealAddress = (id: string): string => `psi-call-${id}-reveal`;

/** The seal's note: the fingerprint and nothing else, not even the window's times (PW44, PW75). */
export const sealTemplate = (call: PsiCall) => ({
  kind: PSI_CALL_KIND,
  tags: [['d', sealAddress(call.id)], ['x', fingerprintOf(call.text, call.salt)], ...FAMILY_TAGS, ['alt', 'Psi Watch call (Experimental): its fingerprint.']],
  content: '',
});
/** The reveal's note: the exact text and the salt, pointing to its seal. */
export const revealTemplate = (call: PsiCall, seal: { eventId: string; relay: string }) => ({
  kind: PSI_CALL_KIND,
  tags: [
    ['d', revealAddress(call.id)], ['e', seal.eventId, seal.relay], ['x', fingerprintOf(call.text, call.salt)], ['salt', call.salt],
    ...FAMILY_TAGS, ['alt', 'Psi Watch call (Experimental), revealed.'],
  ],
  content: callContent(call.text),
});

interface NoteLike { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string }
const tagOf = (note: NoteLike, name: string) => note.tags.find((t) => t[0] === name)?.[1];
const isCallNote = (note: NoteLike) => note.kind === PSI_CALL_KIND
  && note.tags.some((t) => t[0] === 't' && t[1] === 'psi_watch') && note.tags.some((t) => t[0] === 't' && t[1] === PSI_CALL_FAMILY);

/** A call's text read back, or null where it is not one. */
export function readCallText(content: string): CallText | null {
  let text: CallText;
  try { text = JSON.parse(content) as CallText; } catch { return null; }
  const { window: win, place, expects } = text ?? {};
  if (!win || typeof win.start !== 'number' || typeof win.end !== 'number' || win.end < win.start) return null;
  if (!place || typeof place.zone !== 'string' || !expects || !CALL_KINDS.includes(expects.kind) || typeof text.words !== 'string') return null;
  return text;
}

/**
 * Whether a reveal holds to its seal: one author, the same call's two addresses, the salt and text hashing to the
 * seal's fingerprint, and the seal made before the window it calls opened; refused, with the reason, where it does not.
 */
export function checkReveal(seal: NoteLike, reveal: NoteLike): { text: CallText } | { refused: string } {
  const sealD = tagOf(seal, 'd') ?? '';
  if (!isCallNote(seal) || !isCallNote(reveal) || !sealD.startsWith('psi-call-') || tagOf(reveal, 'd') !== `${sealD}-reveal`) {
    return { refused: 'not a seal and its reveal' };
  }
  if (seal.pubkey !== reveal.pubkey) return { refused: 'sealed and revealed by different keys' };
  if (tagOf(reveal, 'e') !== seal.id) return { refused: 'the reveal names another seal' };
  const salt = tagOf(reveal, 'salt') ?? '';
  if (bytesToHex(sha256(utf8ToBytes(salt + reveal.content))) !== tagOf(seal, 'x')) return { refused: 'the text does not hash to the fingerprint' };
  const text = readCallText(reveal.content);
  if (!text) return { refused: 'the text is not a call' };
  if (seal.created_at >= text.window.start) return { refused: 'sealed after its window opened' };
  return { text };
}

/** Where a call stands at a moment: waiting for its window, in it, or past it and to be revealed or kept. */
export type CallState = 'unsealed' | 'sealed' | 'open' | 'closed' | 'revealed' | 'private';
export function callState(call: PsiCall, now: number): CallState {
  if (call.reveal) return 'revealed';
  if (call.keptPrivate) return 'private';
  if (!call.seal) return 'unsealed';
  const { fromMs, untilMs } = windowMs(call.text);
  if (now < fromMs) return 'sealed';
  if (now <= untilMs) return 'open';
  return 'closed';
}

// The operative's calls, on this device only: a private call's text and salt never leave it.
let calls: PsiCall[] = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as unknown;
    return Array.isArray(saved)
      ? (saved as PsiCall[]).filter((c) => c && typeof c.id === 'string' && typeof c.salt === 'string' && readCallText(JSON.stringify(c.text)) !== null)
      : [];
  } catch { return []; }
})();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const keep = (next: PsiCall[]) => {
  calls = next;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
};

export const getCalls = (): readonly PsiCall[] => calls;
export const useCalls = (): readonly PsiCall[] => useSyncExternalStore(subscribe, getCalls, getCalls);
export const getCall = (id: string): PsiCall | undefined => calls.find((c) => c.id === id);
export function addCall(call: PsiCall): void { keep([...calls.filter((c) => c.id !== call.id), call]); }
export function updateCall(id: string, change: Partial<Pick<PsiCall, 'seal' | 'reveal' | 'keptPrivate'>>): void {
  keep(calls.map((c) => (c.id === id ? { ...c, ...change } : c)));
}
export function removeCall(id: string): void { keep(calls.filter((c) => c.id !== id)); }
/** Test-only: forget every call. */
export function resetCallsForTests(): void { keep([]); }
