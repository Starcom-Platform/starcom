/**
 * Starcom's side of the bridge to Starcom Uplink (decision D-EX). It says hello, sends requests with
 * their purpose, and matches each answer to its question by id.
 *
 * No answer to a hello means Uplink is not here, and the app carries on without it: every feature
 * Uplink adds is an addition, found by asking. A request that goes unanswered is "could not reach",
 * never a hang.
 */
import {
  BRIDGE_CHANNEL, UPLINK_PROTOCOL, isBridgeMessage, purposeProblem, refusal,
  type ArgsOf, type Capability, type FromUplink, type HelloAnswer, type ToUplink, type UplinkAnswer,
} from './protocol';

/** How long a hello waits: the bridge is in the page from its start, so it answers at once if it is there. */
export const HELLO_WAIT_MS = 800;
/** How long a request waits before it is "could not reach". */
export const REQUEST_WAIT_MS = 30_000;

export interface UplinkClient {
  /** Uplink's version and what it can do now, or null when it is not installed; tells it the page's language (ML8). */
  hello(waitMs?: number, language?: string): Promise<HelloAnswer | null>;
  /** `purposeInEnglish` when the purpose is said in another language, for Uplink to show beneath it (ML9). */
  request<C extends Capability>(capability: C, purpose: string, args: ArgsOf[C], waitMs?: number, purposeInEnglish?: string): Promise<UplinkAnswer<C>>;
  /** Calls `heard` each time the bridge announces itself; returns how to stop listening. */
  onPresent(heard: () => void): () => void;
  /** Calls `heard` with how many captures wait, each time the bridge says (E2); returns how to stop. */
  onCaptured(heard: (waiting: number) => void): () => void;
  dispose(): void;
}

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createUplinkClient(win: Window = window): UplinkClient {
  const waiting = new Map<string, (answer: FromUplink) => void>();
  const presentListeners = new Set<() => void>();
  const capturedListeners = new Set<(waiting: number) => void>();

  const listen = (event: MessageEvent) => {
    // Only this page's own window, and only messages on our channel coming back from Uplink.
    if (event.source !== win || event.origin !== win.location.origin) return;
    if (!isBridgeMessage(event.data, 'from-uplink')) return;
    if (event.data.body.kind === 'present') {
      for (const heard of presentListeners) heard();
      return;
    }
    if (event.data.body.kind === 'captured') {
      for (const heard of capturedListeners) heard(event.data.body.waiting);
      return;
    }
    const settle = waiting.get(event.data.body.id);
    if (settle) settle(event.data.body);
  };
  win.addEventListener('message', listen);

  const send = (body: ToUplink, waitMs: number) => new Promise<FromUplink | null>((resolve) => {
    const timer = setTimeout(() => { waiting.delete(body.id); resolve(null); }, waitMs);
    waiting.set(body.id, (answer) => { clearTimeout(timer); waiting.delete(body.id); resolve(answer); });
    win.postMessage({ channel: BRIDGE_CHANNEL, direction: 'to-uplink', body }, win.location.origin);
  });

  return {
    async hello(waitMs = HELLO_WAIT_MS, language?: string) {
      const answer = await send({ kind: 'hello', id: nextId(), protocol: UPLINK_PROTOCOL, ...(language ? { language } : {}) }, waitMs);
      return answer?.kind === 'hello' ? answer : null;
    },
    async request(capability, purpose, args, waitMs = REQUEST_WAIT_MS, purposeInEnglish?: string) {
      const id = nextId();
      const problem = purposeProblem(purpose);
      if (problem) return refusal(id, 'refused', problem) as UplinkAnswer<typeof capability>;
      const english = purposeInEnglish?.trim();
      const answer = await send({
        kind: 'request', id, capability, purpose: purpose.trim(), args,
        ...(english && english !== purpose.trim() ? { purposeInEnglish: english } : {}),
      }, waitMs);
      if (!answer) return refusal(id, 'unreachable', 'Uplink did not answer') as UplinkAnswer<typeof capability>;
      if (answer.kind !== 'answer') return refusal(id, 'refused', 'Uplink answered something else') as UplinkAnswer<typeof capability>;
      return answer as UplinkAnswer<typeof capability>;
    },
    onPresent(heard) {
      presentListeners.add(heard);
      return () => { presentListeners.delete(heard); };
    },
    onCaptured(heard) {
      capturedListeners.add(heard);
      return () => { capturedListeners.delete(heard); };
    },
    dispose() {
      win.removeEventListener('message', listen);
      waiting.clear();
      presentListeners.clear();
      capturedListeners.clear();
    },
  };
}
