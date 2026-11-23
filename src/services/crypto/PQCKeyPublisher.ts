/**
 * PQCKeyPublisher — Publishes ML-KEM-768 public keys as Nostr events.
 *
 * Uses Kind 10002-range (replaceable) or Kind 30078 (application-specific)
 * to announce the user's current PQC public key to relays,
 * enabling contacts to encrypt DMs using post-quantum KEM.
 */

import nostrService from '../nostrService';
import { logger } from '../../utils';
import type { StoredKEMKey, PQCKeyStore } from './PQCKeyStore';
import type { PrekeyBundle } from './ForwardSecrecyService';
// Static, not the dynamic `await import('nostr-tools')` this file previously
// used in two places (nominally "to avoid circular deps" — but nostr-tools
// is a third-party package with no path back into this app's own modules,
// so no such cycle is actually possible). The dynamic import was also the
// root cause of a real bug: under Vitest's dev-server module transform,
// `await import('nostr-tools')` resolved through a different module
// instance than the one this file's Uint8Array values were constructed
// against, so nostr-tools' own bundled @noble/hashes rejected genuine
// Uint8Arrays with "expected Uint8Array, got object" — an
// `instanceof Uint8Array` check failing across the split realm. A static
// import shares the same module graph as everything else, closing the gap.
import { finalizeEvent } from 'nostr-tools';

/** Nostr event kind for PQC key announcements (application-specific data, NIP-78) */
const PQC_KEY_EVENT_KIND = 30078;
const PQC_KEY_D_TAG = 'pqc-kem-pubkey';
const PREKEY_BUNDLE_D_TAG = 'pqc-prekey-bundle';
/*
 * Each device publishes its bundle at its own address, `pqc-prekey-bundle:<device>`
 * (plan item 9.11, decision G2). At one shared address the newest won, and each
 * device of a person broke the other's post-quantum messages. A sender now seals
 * to every device; the shared address is read only from someone none of whose
 * devices has published at its own yet.
 */
const DEVICE_BUNDLE_PREFIX = `${PREKEY_BUNDLE_D_TAG}:`;
/** A device not seen for this long is taken as gone: nothing is sealed to it. */
const DEVICE_STALE_S = 90 * 24 * 60 * 60;
/** At most this many devices, the most recently seen: a sealed message must fit one wrap. */
const MOST_DEVICES = 5;

/**
 * Publish the current PQC public key as a Nostr event.
 * The event is a tagged replaceable event (kind 30078 + d-tag)
 * so only the latest key is visible per relay.
 *
 * @returns The Nostr event ID, or null if publishing failed.
 */
export async function publishPQCPublicKey(
  keyStore: PQCKeyStore,
): Promise<string | null> {
  try {
    const current = await keyStore.get('current');
    if (!current) {
      logger.warn('[PQCKeyPublisher] No current key to publish');
      return null;
    }

    // Access nostrService internals for signing + publishing
    /*
     * Refuses when there is no identity, and says so — it does not create one. This is
     * reached without anyone asking (the one-time-prekey refresh runs on incoming
     * traffic), and an identity is made only by a person's action. The old "not ready"
     * warning below lumped this case in with a relay pool still connecting, which read
     * as transient when it is not: there is nobody to publish for.
     */
    if (!nostrService.hasIdentity()) {
      logger.info('[PQCKeyPublisher] No identity in this browser yet — no key to publish');
      return null;
    }
    // Reached without anyone asking, so nobody is asked for a passphrase: it waits for the unlock (D-KL).
    if (nostrService.isLocked()) {
      logger.info('[PQCKeyPublisher] The key is locked — the PQC key is published once it is unlocked');
      return null;
    }
    const secretKey = (nostrService as any).secretKey as Uint8Array | null;
    const pool = nostrService.pool;
    const relays = (nostrService as any).relays as string[];

    if (!secretKey || !pool || !relays?.length) {
      logger.warn('[PQCKeyPublisher] nostrService not ready for key publication');
      return null;
    }

    const pubkeyHex = Array.from(current.publicKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const event = finalizeEvent({
      kind: PQC_KEY_EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', PQC_KEY_D_TAG],
        ['algorithm', 'ML-KEM-768'],
        ['expires', String(Math.floor(current.expiresAt / 1000))],
      ],
      content: pubkeyHex,
    }, secretKey);

    const results = pool.publish(relays, event);
    await Promise.any(results);

    // Store the Nostr event ID back in the keyStore record
    current.nostrEventId = event.id;
    await keyStore.put(current);

    logger.info(`[PQCKeyPublisher] Published PQC public key, event: ${event.id}`);
    return event.id;
  } catch (error) {
    logger.error('[PQCKeyPublisher] Failed to publish PQC key:', error);
    return null;
  }
}

/**
 * Publish a prekey bundle for forward secrecy as a Nostr Kind 30078 event.
 *
 * Content is JSON with:
 *  - identityKey (hex)
 *  - signedPrekey (hex)
 *  - signedPrekeySignature (hex)
 *  - signedPrekeyCreatedAt (ms timestamp)
 *  - oneTimePrekeys (hex[])
 */
export async function publishPrekeyBundle(
  bundle: PrekeyBundle,
  deviceId: string,
): Promise<string | null> {
  try {
    /*
     * Refuses when there is no identity, and says so — it does not create one. This is
     * reached without anyone asking (the one-time-prekey refresh runs on incoming
     * traffic), and an identity is made only by a person's action. The old "not ready"
     * warning below lumped this case in with a relay pool still connecting, which read
     * as transient when it is not: there is nobody to publish for.
     */
    if (!nostrService.hasIdentity()) {
      logger.info('[PQCKeyPublisher] No identity in this browser yet — no prekey bundle to publish');
      return null;
    }
    // Reached without anyone asking (start-up, incoming traffic), so nobody is asked for a passphrase. The chat
    // service announces the bundle again on the unlock (D-KL).
    if (nostrService.isLocked()) {
      logger.info('[PQCKeyPublisher] The key is locked — the prekey bundle is published once it is unlocked');
      return null;
    }
    const secretKey = (nostrService as any).secretKey as Uint8Array | null;
    const pool = nostrService.pool;
    const relays = (nostrService as any).relays as string[];

    if (!secretKey || !pool || !relays?.length) {
      logger.warn('[PQCKeyPublisher] nostrService not ready for prekey bundle publication');
      return null;
    }

    const toHex = (buf: Uint8Array) =>
      Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

    const content = JSON.stringify({
      identityKey: toHex(bundle.identityKey),
      signedPrekey: toHex(bundle.signedPrekey),
      signedPrekeySignature: toHex(bundle.signedPrekeySignature),
      signedPrekeyCreatedAt: bundle.signedPrekeyCreatedAt,
      oneTimePrekeys: bundle.oneTimePrekeys.map(toHex),
    });

    const event = finalizeEvent({
      kind: PQC_KEY_EVENT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${DEVICE_BUNDLE_PREFIX}${deviceId}`],
        ['device', deviceId],
        ['algorithm', 'ML-KEM-768'],
        ['prekey-count', String(bundle.oneTimePrekeys.length)],
      ],
      content,
    }, secretKey);

    const results = pool.publish(relays, event);
    await Promise.any(results);

    logger.info(`[PQCKeyPublisher] Published prekey bundle, event: ${event.id}, OTKs: ${bundle.oneTimePrekeys.length}`);
    return event.id;
  } catch (error) {
    logger.error('[PQCKeyPublisher] Failed to publish prekey bundle:', error);
    return null;
  }
}

/** A bundle's JSON content, as published, into the bundle a session is made against. */
function bundleFrom(peerPubkeyHex: string, content: string): PrekeyBundle {
  const parsed = JSON.parse(content) as {
    identityKey: string; signedPrekey: string; signedPrekeySignature: string;
    signedPrekeyCreatedAt: number; oneTimePrekeys: string[];
  };
  const fromHex = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  };
  return {
    identity: peerPubkeyHex,
    identityKey: fromHex(parsed.identityKey),
    signedPrekey: fromHex(parsed.signedPrekey),
    signedPrekeyCreatedAt: parsed.signedPrekeyCreatedAt,
    signedPrekeySignature: fromHex(parsed.signedPrekeySignature),
    oneTimePrekeys: parsed.oneTimePrekeys.map(fromHex),
  };
}

/**
 * Every device's bundle for a person, to seal to each (plan item 9.11): the
 * newest from each device's own address, dropping a device not seen for ninety
 * days, at most five, the most recently seen. From someone none of whose
 * devices has published at its own address yet, the shared address, as before;
 * `device` is then null. Empty when they published none.
 */
export async function fetchPrekeyBundles(
  peerPubkeyHex: string,
): Promise<Array<{ device: string | null; bundle: PrekeyBundle }>> {
  try {
    const pool = nostrService.pool;
    const relays = (nostrService as any).relays as string[];
    if (!pool || !relays?.length) {
      logger.warn('[PQCKeyPublisher] nostrService not ready for prekey bundle fetch');
      return [];
    }
    // A d-tag cannot be asked for by prefix, so all of the person's app data is read and sorted here.
    const events = await pool.querySync(relays, { kinds: [PQC_KEY_EVENT_KIND], authors: [peerPubkeyHex] });
    const dOf = (e: { tags: string[][] }) => e.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const newest = new Map<string, (typeof events)[number]>();
    for (const e of events) {
      if (e.pubkey !== peerPubkeyHex) continue;
      const d = dOf(e);
      const held = newest.get(d);
      if (!held || e.created_at > held.created_at) newest.set(d, e);
    }
    const seenSince = Math.floor(Date.now() / 1000) - DEVICE_STALE_S;
    const devices = [...newest.entries()]
      .filter(([d, e]) => d.startsWith(DEVICE_BUNDLE_PREFIX) && e.created_at >= seenSince)
      .sort((a, b) => b[1].created_at - a[1].created_at)
      .slice(0, MOST_DEVICES);
    const chosen: Array<[string | null, (typeof events)[number]]> = devices.length > 0
      ? devices.map(([d, e]) => [d.slice(DEVICE_BUNDLE_PREFIX.length), e])
      : newest.has(PREKEY_BUNDLE_D_TAG) ? [[null, newest.get(PREKEY_BUNDLE_D_TAG)!]] : [];
    const bundles: Array<{ device: string | null; bundle: PrekeyBundle }> = [];
    for (const [device, e] of chosen) {
      try {
        bundles.push({ device, bundle: bundleFrom(peerPubkeyHex, e.content) });
      } catch {
        logger.warn(`[PQCKeyPublisher] A malformed prekey bundle from ${peerPubkeyHex} was left out`);
      }
    }
    return bundles;
  } catch (error) {
    logger.error(`[PQCKeyPublisher] Failed to fetch prekey bundles for ${peerPubkeyHex}:`, error);
    return [];
  }
}
