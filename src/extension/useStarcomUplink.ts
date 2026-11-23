/**
 * Whether Starcom Uplink is here, as React reads it (decision D-EX, E0). One client for the page,
 * one state every reader shares: checking, absent, or connected with what it can do.
 *
 * It asks again when the page gains focus or comes back into view, and the moment the bridge announces
 * itself, so a person who installs Uplink from the store and comes back sees it connected, with no
 * reload.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { ArgsOf, Capability, HelloAnswer, UplinkAnswer } from './protocol';
import { createUplinkClient, type UplinkClient } from './uplinkClient';
import { languageNow, onLanguageChange } from '../i18n/app/i18n';

export type UplinkState =
  | { status: 'checking' }
  | { status: 'absent' }
  | { status: 'connected'; hello: HelloAnswer };

let client: UplinkClient | null = null;
let state: UplinkState = { status: 'checking' };
let checking: Promise<void> | null = null;
const listeners = new Set<() => void>();
const stopWatching: Array<() => void> = [];

const publish = (next: UplinkState) => {
  state = next;
  for (const listener of listeners) listener();
};

/** Asks whether Uplink is here, once at a time. */
export function checkUplink(): Promise<void> {
  const c = uplinkClient();
  if (!c) return Promise.resolve();
  // Each hello tells Uplink the language shown, so its own pages follow it (D-ML, ML8).
  checking ??= c.hello(undefined, languageNow())
    // Heard only while `c` is still the page's client: a hello settling after it was put away says nothing.
    .then((hello) => { if (client === c) publish(hello ? { status: 'connected', hello } : { status: 'absent' }); })
    .finally(() => { if (client === c) checking = null; });
  return checking;
}

/** The page's one client, made on first use, watching for an install. */
export function uplinkClient(): UplinkClient | null {
  if (client || typeof window === 'undefined') return client;
  client = createUplinkClient(window);
  stopWatching.push(client.onPresent(() => void checkUplink()));
  // A new language is told at once, while Uplink is here: after any hello still out, which may have
  // carried the language before (the page's own loads as Starcom opens, while the first hello goes).
  stopWatching.push(onLanguageChange(() => {
    void (checking ?? Promise.resolve()).then(() => { if (state.status === 'connected') void checkUplink(); });
  }));
  const again = () => { if (state.status !== 'connected') void checkUplink(); };
  const visible = () => { if (document.visibilityState === 'visible') again(); };
  window.addEventListener('focus', again);
  document.addEventListener('visibilitychange', visible);
  stopWatching.push(() => window.removeEventListener('focus', again), () => document.removeEventListener('visibilitychange', visible));
  return client;
}

/**
 * Asks Uplink to do something, with its purpose; "could not reach" when it is not here. A purpose said in
 * another language comes with its English, which Uplink shows beneath it where it asks (D-ML, ML9).
 */
export function askUplink<C extends Capability>(capability: C, purpose: string, args: ArgsOf[C], waitMs?: number, purposeInEnglish?: string): Promise<UplinkAnswer<C>> {
  const c = uplinkClient();
  if (!c) return Promise.resolve({ kind: 'answer', id: 'none', ok: false, refusal: 'unreachable', reason: 'Uplink is not here' } as UplinkAnswer<C>);
  return c.request(capability, purpose, args, waitMs, purposeInEnglish);
}

/** Whether Uplink is here, as last asked, for code outside React. */
export const uplinkNow = (): UplinkState => state;

/** Calls `listener` each time whether Uplink is here changes, for code outside React; returns how to stop. */
export function onUplinkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useStarcomUplink(): UplinkState {
  useEffect(() => {
    if (state.status === 'checking') void checkUplink();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Tests only: forget the client and its state. */
export function resetUplinkForTests(): void {
  for (const stop of stopWatching.splice(0)) stop();
  client?.dispose();
  client = null;
  checking = null;
  state = { status: 'checking' };
  listeners.clear();
}
