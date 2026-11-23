/**
 * Grant builders that sign with a RAW SECRET KEY.
 *
 * They live here, in the test tree, because that is the only place a raw secret
 * key exists. Production signs through a `GrantSigner` — `mintRootGrantSigned`
 * and `delegateGrantSigned` — so the application never holds key material it
 * could sign with directly, which is the same BYOK property `signEvent` has on
 * the findings side.
 *
 * They were exported from missionCapability.ts, used by nothing but these
 * tests, and their presence there left a signing path that takes a secret key
 * available to production code by import. Moving them is not tidying: it
 * removes that path.
 *
 * Not named *.test.ts, so vitest does not collect it as a suite.
 */
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { buildGrantEvent, readGrant } from '../missionCapability';

/** Mint a root grant. Only meaningful when `secretKey` belongs to the creator. */
export function mintRootGrant(
  resource: string,
  holder: string,
  secretKey: Uint8Array,
  issuedAt: Date = new Date(),
): NostrEvent {
  const unsigned = buildGrantEvent({ resource, action: 'dispatch', holder, issuedAt: issuedAt.toISOString() });
  return finalizeEvent(unsigned as Parameters<typeof finalizeEvent>[0], secretKey);
}

/** Delegate what you hold to another operator, attenuating from `parent`. */
export function delegateGrant(
  parent: NostrEvent,
  holder: string,
  secretKey: Uint8Array,
  issuedAt: Date = new Date(),
): NostrEvent {
  const parentGrant = readGrant(parent);
  if (!parentGrant) throw new Error('Cannot delegate from an event that is not a capability grant.');
  const unsigned = buildGrantEvent({
    resource: parentGrant.resource,
    action: parentGrant.action,
    holder,
    parentId: parent.id,
    issuedAt: issuedAt.toISOString(),
  });
  return finalizeEvent(unsigned as Parameters<typeof finalizeEvent>[0], secretKey);
}
