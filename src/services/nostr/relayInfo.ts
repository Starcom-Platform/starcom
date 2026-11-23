/**
 * What a relay says about itself (NIP-11), read before trusting it with a
 * sign-in or a join request (plan item 2.3).
 *
 * `self` is the relay's own key, which signs its NIP-43 member list; `pubkey`
 * is its operator's contact. The supported NIPs say whether it takes sign-ins
 * (42), access requests (43) and remote management (86).
 */
import { fetchRelayInformation } from 'nostr-tools/nip11';

export interface RelayInfo {
  url: string;
  name?: string;
  /** The relay's own key (NIP-11 `self`): what signs its member list. */
  relayPubkey?: string;
  /** The operator's contact key (NIP-11 `pubkey`). */
  operatorPubkey?: string;
  signIn: boolean;
  accessRequests: boolean;
  management: boolean;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

export async function readRelayInfo(url: string, timeoutMs = 8_000): Promise<RelayInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${url} did not describe itself within ${timeoutMs / 1000} s.`)), timeoutMs);
  });
  try {
    const info = await Promise.race([fetchRelayInformation(url), timeout]) as unknown as Record<string, unknown>;
    const nips = Array.isArray(info.supported_nips) ? info.supported_nips.map(Number) : [];
    const key = (value: unknown) => (typeof value === 'string' && HEX_KEY.test(value) ? value : undefined);
    return {
      url,
      name: typeof info.name === 'string' ? info.name : undefined,
      relayPubkey: key(info.self),
      operatorPubkey: key(info.pubkey),
      signIn: nips.includes(42),
      accessRequests: nips.includes(43),
      management: nips.includes(86),
    };
  } catch (e) {
    throw new Error(e instanceof Error && e.message.includes('describe itself') ? e.message : `${url} did not answer with a description of itself (NIP-11).`);
  } finally {
    clearTimeout(timer);
  }
}
