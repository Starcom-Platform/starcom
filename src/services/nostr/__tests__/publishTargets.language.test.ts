/**
 * Where a Mission Package goes, beneath the button that publishes it, in the language chosen (decision
 * D-ML, L3): counted by each language's plural rules, its adjectives agreeing with the count, the kinds
 * joined as the language joins a list.
 */
import { afterEach, describe, it, expect } from 'vitest';
import { destinationLine } from '../publishTargets';
import { messagesNow, setLanguage } from '../../../i18n/app/i18n';

afterEach(async () => { await setLanguage('en', false); });

const PUBLIC = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://a.example', 'wss://b.example', 'wss://c.example'];

describe('destinationLine, in another language', () => {
  it('says it in German, the kinds agreeing with their counts', async () => {
    await setLanguage('de', false);
    const words = messagesNow().missions;
    expect(destinationLine(['wss://nos.lol', 'wss://relay.damus.io', 'ws://127.0.0.1:7447'], 'de', words)).toBe('Geht an Navcom: 3 Relays, 2 öffentliche und 1 lokales');
    expect(destinationLine(['ws://127.0.0.1:7447'], 'de', words)).toBe('Geht an Navcom: 1 lokales Relay');
  });

  it("counts in Ukrainian by its own plural rules: a few, and many", async () => {
    await setLanguage('uk', false);
    const words = messagesNow().missions;
    expect(destinationLine(PUBLIC.slice(0, 3), 'uk', words)).toBe('Іде до Navcom: 3 публічні релеї');
    expect(destinationLine(PUBLIC, 'uk', words)).toBe('Іде до Navcom: 5 публічних релеїв');
  });

  it('reads as it always has in English', () => {
    expect(destinationLine(PUBLIC)).toBe('Goes to Navcom: 5 public relays');
    expect(destinationLine(['wss://nos.lol', 'ws://127.0.0.1:7447'])).toBe('Goes to Navcom: 2 relays, 1 public and 1 local');
  });
});
