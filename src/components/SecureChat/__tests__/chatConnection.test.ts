/**
 * What the chat's connection mark says (decision D-F, step 3.2).
 *
 * The chat's warning, "No relay or IPFS connection", floated over the strip under
 * the header while that strip said the intel ingest's relays were up. The two read
 * different connections, and nothing on the warning said it was the chat's. The words
 * now name the chat, and which half is down.
 *
 * "Chat", not "Secure chat" (plan item 0.2): team messages cross the relays as plain
 * text, so the name claimed what the chat does not do.
 */
import { describe, it, expect } from 'vitest';
import { chatConnection } from '../chatConnection';
import { setLanguage } from '../../../i18n/app/i18n';
import uk from '../../../i18n/app/locales/uk';

const status = (relayNodes: number, ipfsNodes: number, isConnected = false) =>
  ({ relayNodes, ipfsNodes, isConnected, lastHeartbeat: null });

describe('chatConnection', () => {
  it('says the chat is connected when it is', () => {
    expect(chatConnection(status(5, 1, true))).toEqual({ level: 'connected', words: 'Chat: connected' });
  });

  it('names which half is down when relays are up and IPFS is not', () => {
    expect(chatConnection(status(5, 0))).toEqual({ level: 'partial', words: 'Chat: IPFS unavailable, 5 relays connected' });
    expect(chatConnection(status(1, 0)).words).toBe('Chat: IPFS unavailable, 1 relay connected');
  });

  it('says messaging is offline with no relay', () => {
    expect(chatConnection(status(0, 1))).toEqual({ level: 'offline', words: 'Chat: no relay connection, messaging is offline' });
  });

  it('counts relays by the plural rules of the language shown (D-ML, L3)', async () => {
    await setLanguage('uk', false);
    try {
      expect(chatConnection(status(3, 0), uk.header.chat).words).toBe('Чат: IPFS недоступний, під’єднано 3 релеї');
      expect(chatConnection(status(5, 0), uk.header.chat).words).toBe('Чат: IPFS недоступний, під’єднано 5 релеїв');
      expect(chatConnection(status(21, 0), uk.header.chat).words).toBe('Чат: IPFS недоступний, під’єднано 21 релей');
    } finally {
      await setLanguage('en', false);
    }
  });

  it('says so when neither is connected', () => {
    expect(chatConnection(status(0, 0))).toEqual({ level: 'offline', words: 'Chat: no relay or IPFS connection' });
  });
});
