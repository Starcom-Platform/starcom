import { en, type Messages } from '../../i18n/app/en';
import { counted } from '../../i18n/app/i18n';

export type ChatConnectionLevel = 'connected' | 'partial' | 'offline';

export interface ChatNetworkStatus {
  relayNodes: number;
  ipfsNodes: number;
  isConnected: boolean;
}

/**
 * What the chat's connection mark says (decision D-F, step 3.2).
 *
 * The words name the chat. The strip under the header reports the intel ingest's
 * relays, a different set of connections, and the chat's own warning, floating over
 * that strip, read as a contradiction of it. They also name which half is down:
 * relays and IPFS fail independently, for different reasons.
 *
 * "Chat", not "Secure chat" (plan item 0.2): team messages cross the relays as plain
 * text, so the name claimed what the chat does not do.
 */
export function chatConnection({ relayNodes, ipfsNodes, isConnected }: ChatNetworkStatus, said: Messages['header']['chat'] = en.header.chat): {
  level: ChatConnectionLevel;
  words: string;
} {
  if (isConnected) return { level: 'connected', words: said.connected };
  if (relayNodes === 0 && ipfsNodes === 0) {
    return { level: 'offline', words: said.none };
  }
  if (relayNodes === 0) {
    return { level: 'offline', words: said.noRelay };
  }
  return { level: 'partial', words: counted(said.partial, relayNodes) };
}
