/**
 * Which keys are AI agents', as they say themselves (the legal review of 2026-10-17; EU AI Act Art. 50; D-RS,
 * RS42). Starcom detects nothing and is not responsible for detecting: a key is marked when its own profile says
 * `bot: true` (NIP-24) or a post it signed carries an `agent` tag (D-MX, MX14), and is labelled "AI agent" wherever
 * it is named (KeyName). Kept on this device, so the label holds across visits.
 */
import { OPERATOR_STATED_AGENT_KEYS } from '../../config/publicInfrastructure';

const KEY = 'starcom.agent-keys.v1';
const HEX_KEY = /^[0-9a-f]{64}$/;
const listeners = new Set<() => void>();

function load(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string' && HEX_KEY.test(k)) : []);
  } catch {
    return new Set();
  }
}

/**
 * Mecha Jono is an AI agent its operator runs: its configured keys are an agent's from the start, as the operator
 * states, not as anything detected.
 */
const OPERATOR_STATED = (): Set<string> => new Set(OPERATOR_STATED_AGENT_KEYS);

let keys: Set<string> = new Set([...OPERATOR_STATED(), ...(typeof localStorage !== 'undefined' ? load() : [])]);

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify([...keys])); } catch { /* kept for this visit */ }
  listeners.forEach((l) => l());
}

export const isAgentKey = (pubkey: string | null | undefined): boolean => !!pubkey && keys.has(pubkey);

/** Mark a key as one that says it is an AI agent's. */
export function markAgentKey(pubkey: string): void {
  if (!HEX_KEY.test(pubkey) || keys.has(pubkey)) return;
  keys = new Set([...keys, pubkey]);
  persist();
}

/** Whether an event carries the `agent` tag its signer adds when it is an agent's (MX14). */
export const agentTagged = (event: { tags: string[][] }): boolean => event.tags.some((t) => t[0] === 'agent');

export function subscribeAgentKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam. */
export function resetAgentKeys(): void {
  keys = OPERATOR_STATED();
  persist();
}
