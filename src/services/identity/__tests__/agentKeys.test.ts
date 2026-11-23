/**
 * Which keys are AI agents', as they say themselves (the legal review of 2026-10-17; EU AI Act Art. 50; RS42).
 * Starcom detects nothing: a key is marked when its own profile says `bot: true` (NIP-24) or a post it signed
 * carries an `agent` tag (D-MX, MX14). Kept on this device, so the label holds across visits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isAgentKey, markAgentKey, resetAgentKeys, subscribeAgentKeys, agentTagged } from '../agentKeys';
import { profileFromEvent } from '../signerProfiles';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';

const KEY = 'a'.repeat(64);

beforeEach(() => resetAgentKeys());

describe('agent keys', () => {
  it('marks a key as an agent\'s, keeps it on the device, and tells who listens', () => {
    let told = 0;
    const stop = subscribeAgentKeys(() => { told += 1; });
    expect(isAgentKey(KEY)).toBe(false);
    markAgentKey(KEY);
    markAgentKey(KEY);
    expect(isAgentKey(KEY)).toBe(true);
    expect(told).toBe(1);
    expect(JSON.parse(localStorage.getItem('starcom.agent-keys.v1') ?? '[]')).toEqual(expect.arrayContaining([KEY]));
    stop();
  });

  // Mecha Jono is an AI agent its operator runs: its keys, as configured, are an agent's from the start.
  it('knows Mecha Jono\'s configured keys as an agent\'s, before any of its posts is read', () => {
    for (const k of MECHA_JONO_KEYS) expect(isAgentKey(k)).toBe(true);
  });

  it('marks only a key, never anything else', () => {
    markAgentKey('mecha_jono');
    expect(isAgentKey('mecha_jono')).toBe(false);
  });

  it('reads an agent tag on an event, as MX14 writes it', () => {
    expect(agentTagged({ tags: [['agent', 'mecha_jono']] })).toBe(true);
    expect(agentTagged({ tags: [['t', 'agent']] })).toBe(false);
  });
});

describe('a profile that says it is a bot (NIP-24)', () => {
  it('is read as an agent\'s', () => {
    expect(profileFromEvent({ content: JSON.stringify({ name: 'Mecha Jono', bot: true }) })).toEqual({ name: 'Mecha Jono', bot: true });
    expect(profileFromEvent({ content: JSON.stringify({ name: 'A person', bot: false }) })).toEqual({ name: 'A person' });
    expect(profileFromEvent({ content: JSON.stringify({ name: 'A person', bot: 'yes' }) })).toEqual({ name: 'A person' });
  });
});
