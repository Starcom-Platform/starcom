/**
 * "How old are you?" (decision D-RS, RS37, RS39). Asked neutrally, as COPPA's guidance asks: four brackets, no
 * default, never "are you over 13?". Kept on this device with how it was given, and locked: not asked again to pick
 * another. The brackets are California's AB 1043 and Google's age signal, so a real check can replace the asking:
 * `method` says which gave it. Never posted, never put on a relay.
 *
 * Under 13, Starcom makes no key and signs nothing, so nothing is posted; everything kept on the device still
 * works (RS39). It is asked the first time a key would be made, or before a field adventure, whichever comes first,
 * by whatever on screen registered to ask. Where nothing can ask (a test, a script), nothing waits on it.
 */
import { setPublishesAsAgent } from './callsign';

export type AgeBracket = 'under_13' | '13_15' | '16_17' | '18_plus';
/** A bracket, or an AI agent's honest answer (RS42): not a minor, and it does not go out. */
export type AgeAnswerKind = AgeBracket | 'ai_agent';

export const AGE_BRACKETS: ReadonlyArray<{ bracket: AgeBracket; label: string; said: string }> = [
  { bracket: 'under_13', label: 'Under 13', said: 'under 13' },
  { bracket: '13_15', label: '13 to 15', said: '13 to 15' },
  { bracket: '16_17', label: '16 to 17', said: '16 to 17' },
  { bracket: '18_plus', label: '18 or over', said: '18 or over' },
];

/**
 * What may be answered: the brackets, and "I am an AI agent" (RS42). An agent's key then says it is an agent's
 * (MX14), so what it signs says so: an honest answer, and no way round the under-13 rule.
 */
export const AGE_CHOICES: ReadonlyArray<{ bracket: AgeAnswerKind; label: string; said: string }> = [
  ...AGE_BRACKETS,
  { bracket: 'ai_agent', label: 'I am an AI agent', said: 'an AI agent' },
];

export interface AgeAnswer {
  bracket: AgeAnswerKind;
  /** How it was given. Only asked, so far: a verified way would say so here. */
  method: 'self_declared';
  at: string;
}

export const UNDER_13_REFUSAL = 'Starcom makes no key for anyone under 13, so nothing is posted. Everything kept on this device still works.';
export const AGE_NEEDED = 'Say how old you are first, then try again.';

/** Thrown where a key would be made or used for someone who said under 13. */
export class UnderThirteenError extends Error {
  constructor() { super(UNDER_13_REFUSAL); this.name = 'UnderThirteenError'; }
}

/** Thrown where a first key would be made before the question was answered; the question is open on screen. */
export class AgeNeededError extends Error {
  constructor() { super(AGE_NEEDED); this.name = 'AgeNeededError'; }
}

const KEY = 'starcom.age.v1';
const BRACKETS = AGE_CHOICES.map((b) => b.bracket);
const listeners = new Set<() => void>();

function load(): AgeAnswer | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AgeAnswer | null;
    return raw && BRACKETS.includes(raw.bracket) && raw.method === 'self_declared' && typeof raw.at === 'string' ? raw : null;
  } catch {
    return null;
  }
}

let kept: AgeAnswer | null = typeof localStorage !== 'undefined' ? load() : null;

function persist(next: AgeAnswer | null): void {
  kept = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch { /* kept for this visit */ }
  listeners.forEach((l) => l());
}

/** The answer given here, or null. The same object until it changes. */
export const ageAnswer = (): AgeAnswer | null => kept;

/** Keep the answer, once: false when one is kept already, which is not asked again to pick another. */
export function setAgeAnswer(bracket: AgeAnswerKind, now: number = Date.now()): boolean {
  if (kept) return false;
  if (bracket === 'ai_agent') setPublishesAsAgent(true);
  persist({ bracket, method: 'self_declared', at: new Date(now).toISOString() });
  return true;
}

export const isUnder13 = (): boolean => kept?.bracket === 'under_13';

export function subscribeAge(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: forget the answer. */
export function resetAge(): void {
  persist(null);
}

/* ── Asking, through whatever on screen can ─────────────────────────────── */

type Asker = () => Promise<AgeAnswer | null>;
let asker: Asker | null = null;

/** What on screen asks the question (AgeQuestionRoot); null when it goes. */
export function registerAgeAsker(next: Asker | null): void {
  asker = next;
}

/** Whether something on screen can ask. */
export const ageAskable = (): boolean => asker !== null;

/** Refuse, for someone who said under 13. */
export function refuseUnder13(): void {
  if (isUnder13()) throw new UnderThirteenError();
}

/**
 * Before a first key is made, where nothing can wait on an answer: refused under 13; unanswered where something can
 * ask, the question is opened and this throws, to be tried again once it is answered.
 */
export function ageBeforeFirstKey(): void {
  refuseUnder13();
  if (!kept && asker) {
    void asker();
    throw new AgeNeededError();
  }
}

/** The answer kept, or one asked for now; null when it was not given, or nothing can ask. */
export async function askAge(): Promise<AgeAnswer | null> {
  if (kept) return kept;
  return asker ? asker() : null;
}

/**
 * Before signing: refused under 13; before a first key, asked first, stopping when no answer is given. Where
 * nothing can ask, signing goes on as before.
 */
export async function ageBeforeSigning(firstKey: boolean): Promise<{ ok: true } | { ok: false; reason: string } | { ok: false; cancelled: true }> {
  if (isUnder13()) return { ok: false, reason: UNDER_13_REFUSAL };
  if (!firstKey || kept || !asker) return { ok: true };
  const answer = await asker();
  if (!answer) return { ok: false, cancelled: true };
  return answer.bracket === 'under_13' ? { ok: false, reason: UNDER_13_REFUSAL } : { ok: true };
}
