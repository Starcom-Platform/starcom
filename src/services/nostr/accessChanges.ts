/**
 * When what this browser can read changes (plan 0.3; the cohort audit of 2026-10-19): a key made or imported here,
 * an extension answering with its key, or a team relay joined. A read started before is refused by a relay that
 * requires sign-in, and stays refused until it starts again; the mission ingest's first connection to the team
 * relay was seen so, live. So each long read starts again on this: the sealed inbox, received packages, mission
 * labels and replies.
 */
import { useEffect, useState } from 'react';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { subscribeIdentityNotice } from '../identity/identityNotice';
import { subscribeJoinedRelays } from './joinedRelays';

/** Told after each change, never on subscribing. Returns the function that stops it. */
export function onAccessChange(listener: () => void): () => void {
  const stopSigner = nostrIdentityService.subscribeSigner(listener);
  // The notice tells a new listener the current one at once: not a change.
  let listening = false;
  const stopKey = subscribeIdentityNotice(() => { if (listening) listener(); });
  listening = true;
  const stopRelays = subscribeJoinedRelays(listener);
  return () => { stopSigner(); stopKey(); stopRelays(); };
}

/** A number that changes with each change of access: put it in an effect's dependencies to start its read again. */
export function useAccessVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onAccessChange(() => setVersion((v) => v + 1)), []);
  return version;
}
