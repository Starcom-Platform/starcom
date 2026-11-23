/**
 * Whose a record is, from what the record itself shows (BD19, BD21; decided
 * 2026-10-05), for the frame every screen draws around it (ProvenanceFrame):
 *
 *   own            written here under your key, made in this workspace (a
 *                  record naming no author), or a bundle you signed
 *   peer           in a bundle a peer signed, or read from a relay, where the
 *                  author is the key that signed the event
 *   unknown        it names a key not yours that nothing here was signed by,
 *                  names no key at all, or is a sample a seed wrote
 *   impersonation  it names one key, and another key signed it
 *
 * Nothing is an impersonation on a guess. A bundle whose manifest names a
 * sender other than its signer is refused at import (bundle.ts), so no case or
 * report in the workspace can be one; the state is for a record that carries
 * its own signature beside the author it claims.
 */
import { nip19 } from 'nostr-tools';
import { fromRelayFeed } from '../bundles/bundleDistribution';

export type Whose = 'own' | 'peer' | 'unknown' | 'impersonation';

export interface Provenance {
  whose: Whose;
  /** How that is known. */
  how: 'written-here' | 'made-here' | 'bundle' | 'relay' | 'signed' | 'unsigned' | 'unconfirmed' | 'no-author' | 'sample' | 'mismatch';
  /** The key it is from: a peer's, or the key that signed an impersonation. */
  from?: string;
  /** The key, or name, it says it is by, where nothing shows that one wrote it. */
  claims?: string;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

interface Received {
  receivedFrom?: { pubkey: string };
  /** Demo material (plan item 0.9): nobody's work. */
  sample?: boolean;
}

function fromBundle(record: Received, isOwn: (key: string) => boolean): Provenance | null {
  const sender = record.receivedFrom?.pubkey;
  if (!sender) return null;
  return isOwn(sender) ? { whose: 'own', how: 'bundle' } : { whose: 'peer', how: 'bundle', from: sender };
}

/** A report, which names its author. */
export function reportProvenance(
  report: Received & {
    author?: string;
    history?: ReadonlyArray<{ action?: string; user?: string }>;
    /** A record carrying its own signature: the key it names, and the key that signed it. */
    signed?: { claims: string; by: string };
  },
  isOwn: (key: string) => boolean,
): Provenance {
  const { signed } = report;
  if (signed && HEX_KEY.test(signed.claims) && HEX_KEY.test(signed.by) && signed.claims !== signed.by) {
    return { whose: 'impersonation', how: 'mismatch', claims: signed.claims, from: signed.by };
  }
  const bundled = fromBundle(report, isOwn);
  if (bundled) return bundled;
  if (report.sample) return { whose: 'unknown', how: 'sample' };
  const author = report.author ?? '';
  if (!HEX_KEY.test(author)) return { whose: 'unknown', how: 'no-author' };
  if (fromRelayFeed(report)) return isOwn(author) ? { whose: 'own', how: 'relay' } : { whose: 'peer', how: 'relay', from: author };
  return isOwn(author) ? { whose: 'own', how: 'written-here' } : { whose: 'unknown', how: 'unsigned', claims: author };
}

/** A case or an intel item, which name no author: made here, or received in a bundle. */
export function recordProvenance(record: Received, isOwn: (key: string) => boolean): Provenance {
  const bundled = fromBundle(record, isOwn);
  if (bundled) return bundled;
  return record.sample ? { whose: 'unknown', how: 'sample' } : { whose: 'own', how: 'made-here' };
}

/** A claimed author as a key, from hex or npub; null when it is a name. */
function asKey(claim: string): string | null {
  if (HEX_KEY.test(claim)) return claim;
  if (!claim.startsWith('npub1')) return null;
  try {
    const decoded = nip19.decode(claim);
    return decoded.type === 'npub' ? decoded.data : null;
  } catch {
    return null;
  }
}

/**
 * A received package (BD25): it says who it is from, a string its publisher
 * chose, beside the key that signed it, which is the verified fact. The claim
 * is an impersonation when it is another key, or a name already known for
 * another key (keysNamed); a name nobody here knows is unconfirmed.
 */
export function packageProvenance(
  pkg: { claims?: string; signedBy: string },
  isOwn: (key: string) => boolean,
  keysNamed: (name: string) => string[],
): Provenance {
  const signer = pkg.signedBy;
  if (isOwn(signer)) return { whose: 'own', how: 'signed' };
  const theirs: Provenance = { whose: 'peer', how: 'signed', from: signer };
  const claim = pkg.claims?.trim() ?? '';
  if (!claim) return theirs;
  const key = asKey(claim);
  if (key) return key === signer ? theirs : { whose: 'impersonation', how: 'mismatch', claims: key, from: signer };
  const keys = keysNamed(claim);
  if (keys.includes(signer)) return theirs;
  if (keys.length > 0) return { whose: 'impersonation', how: 'mismatch', claims: claim, from: signer };
  return { whose: 'unknown', how: 'unconfirmed', claims: claim, from: signer };
}

/** What the frame says in its hover; `label` names a key (keyLabel). */
export function provenanceWords(p: Provenance, label: (key: string) => string): string {
  const name = (key: string | undefined) => (key ? label(key) : 'someone');
  switch (p.how) {
    case 'written-here': return 'Yours: written under your key.';
    case 'made-here': return 'Yours: made in this workspace.';
    case 'sample': return 'Sample: demo material, written by no one.';
    case 'bundle': return p.whose === 'own' ? 'Yours: from a bundle you signed.' : `From ${name(p.from)}: in a bundle they signed.`;
    case 'relay': return p.whose === 'own' ? 'Yours: published under your key.' : `From ${name(p.from)}: published under their key.`;
    case 'signed': return p.whose === 'own' ? 'Yours: a package you signed.' : `From ${name(p.from)}: a package they signed.`;
    case 'unsigned': return `Says it is by ${name(p.claims)}, but nothing here was signed by them.`;
    case 'unconfirmed': return `Says it is from ${p.claims ?? 'someone'}, but nothing here ties that name to ${name(p.from)}, who signed it.`;
    case 'no-author': return 'Nobody is recorded as its author.';
    case 'mismatch': return `Says it is from ${name(p.claims)}, but ${name(p.from)} signed it.`;
  }
}
