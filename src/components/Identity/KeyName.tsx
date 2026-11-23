import React, { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { isOwnKey, keyLabel, nameOf, subscribeNames } from '../../services/identity/names';
import { isAgentKey, subscribeAgentKeys } from '../../services/identity/agentKeys';
import { unattributedActor } from '../../services/epistemic/epistemicLanguage';

/**
 * A person, by name (plan item 2.1, story S2), wherever a 64-character key
 * used to show.
 *
 * - A key someone has been named for shows that name: your own name for your
 *   own keys, marked "(you)", or the name learned from a team, a collaborator
 *   or a bundle for anyone else.
 * - A key nobody has named shows as a short npub, the form other Nostr apps
 *   and a relay's registration ask for.
 * - The whole npub is always on hover, so a name never hides whose key it is:
 *   anyone can call themselves anything, and the key is what was signed.
 * - An empty actor says nobody is recorded, never a placeholder.
 * - Anything that is not a key (a bot's id, an old record's author) shows as
 *   it was written.
 */
const HEX_KEY = /^[0-9a-f]{64}$/;

const toNpub = (pubkey: string): string | null => {
  try { return nip19.npubEncode(pubkey); } catch { return null; }
};

/** Redraws when any name changes: learned, set, or forgotten. */
function useNamesVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeNames(() => setVersion((n) => n + 1)), []);
  useEffect(() => subscribeAgentKeys(() => setVersion((n) => n + 1)), []);
  return version;
}

interface KeyNameProps {
  pubkey: string | null | undefined;
  /** A name this screen already holds for the key (a collaborator's), used when none has been learned. */
  hint?: string;
  /** Shows the short npub beside the name, where which key it is matters: who signs a publish. */
  showKey?: boolean;
  className?: string;
}

const KeyName: React.FC<KeyNameProps> = ({ pubkey, hint, showKey = false, className }) => {
  useNamesVersion();

  if (!pubkey) {
    return <span className={className} data-testid="key-name">{unattributedActor()}</span>;
  }
  const npub = HEX_KEY.test(pubkey) ? toNpub(pubkey) : null;
  if (!npub) {
    return <span className={className} data-testid="key-name">{pubkey}</span>;
  }

  const known = nameOf(pubkey);
  const shortNpub = `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  const named = hint?.trim() && hint.trim() !== pubkey ? hint.trim() : null;
  // A learned name, or yours, before a name this screen holds; the short npub last (keyLabel).
  const shown = !known && !isOwnKey(pubkey) && named ? named : keyLabel(pubkey);
  const where = !known || known.source === 'you' ? ''
    : known.source === 'nip05' ? ` (the name its own profile gives; ${known.domain} lists this key)`
      : ` (name from ${known.source === 'team' ? 'a team roster' : known.source === 'collaborator' ? 'a collaborator entry' : 'a bundle'})`;
  // A name a key gives itself counts only where a domain lists the key (NIP-05, D-MF MF4): marked so.
  const verified = known?.source === 'nip05' ? ' ✓' : '';
  const withKey = showKey && shown !== shortNpub ? `${shown} · ${shortNpub}` : shown;

  // An AI agent's key, as its own posts or profile say: labelled at every first sight (the legal review, 2026-10-17).
  const agent = isAgentKey(pubkey)
    ? <span data-testid="key-name-agent" title="Its own posts or profile say this key is an AI agent's. Starcom does not detect it.">{' · AI agent'}</span>
    : null;
  return (
    <span className={className} title={`${npub}${where}`} data-testid="key-name">{withKey}{verified}{agent}</span>
  );
};

export default KeyName;
