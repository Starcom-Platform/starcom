import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveCredential, setUserCredential, clearUserCredential,
  listConfiguredProviders, mayHoldClientSide,
} from '../userCredentialStore';

beforeEach(() => localStorage.clear());

describe('a user-supplied key takes precedence over the baked-in one', () => {
  it('prefers the user credential', () => {
    // Someone who supplied their own key should get their own quota and rate
    // limit, not silently ride on an operator's.
    setUserCredential('openweathermap', 'user-key');
    expect(resolveCredential('openweathermap', 'build-key'))
      .toEqual({ value: 'user-key', source: 'user' });
  });

  it('falls back to the build-time value', () => {
    expect(resolveCredential('openweathermap', 'build-key'))
      .toEqual({ value: 'build-key', source: 'build' });
  });

  it('reports none rather than an empty string', () => {
    // A caller must be able to distinguish "no credential" from "a blank one",
    // because only the first should disable a feature rather than fail a call.
    expect(resolveCredential('openweathermap')).toEqual({ value: null, source: 'none' });
    expect(resolveCredential('openweathermap', '   ')).toEqual({ value: null, source: 'none' });
  });

  it('always says where the value came from', () => {
    // Same rule as mock data and derived weight: never a value without its
    // provenance.
    for (const r of [
      resolveCredential('x', 'b'),
      resolveCredential('x'),
    ]) expect(['user', 'build', 'none']).toContain(r.source);
  });
});

describe('control-granting credentials are refused, not stored', () => {
  it('refuses a bot token', () => {
    // Moving these from one baked-in value to one-per-user multiplies the
    // exposure instead of removing it: many published secrets instead of one,
    // each pasted in by someone told it was safe.
    expect(setUserCredential('telegram', 'bot-token')).toBe(false);
    expect(setUserCredential('discord', 'bot-token')).toBe(false);
    expect(setUserCredential('web3storage', 'write-token')).toBe(false);
  });

  it('stores nothing when it refuses', () => {
    setUserCredential('telegram', 'bot-token');
    expect(resolveCredential('telegram').value).toBeNull();
    expect(listConfiguredProviders()).toEqual([]);
  });

  it('says so in advance, so a UI need not offer the field at all', () => {
    expect(mayHoldClientSide('telegram')).toBe(false);
    expect(mayHoldClientSide('TELEGRAM')).toBe(false);
    expect(mayHoldClientSide('openweathermap')).toBe(true);
  });

  it('accepts read-only providers', () => {
    expect(setUserCredential('virustotal', 'k')).toBe(true);
  });
});

describe('storage hygiene', () => {
  it('clears a credential', () => {
    setUserCredential('censys', 'k');
    clearUserCredential('censys');
    expect(resolveCredential('censys').value).toBeNull();
  });

  it('treats an empty value as a removal', () => {
    setUserCredential('censys', 'k');
    setUserCredential('censys', '   ');
    expect(resolveCredential('censys').value).toBeNull();
  });

  it('lists provider ids but never the values', () => {
    setUserCredential('censys', 'secret-value');
    expect(listConfiguredProviders()).toEqual(['censys']);
    expect(JSON.stringify(listConfiguredProviders())).not.toContain('secret-value');
  });

  it('survives corrupt storage instead of throwing', () => {
    localStorage.setItem('starcom_user_api_credentials_v1', '{not json');
    expect(resolveCredential('censys', 'b')).toEqual({ value: 'b', source: 'build' });
  });

  it('ignores non-string entries a hand-edited store might contain', () => {
    localStorage.setItem('starcom_user_api_credentials_v1', JSON.stringify({ censys: 42, hunter: 'ok' }));
    expect(resolveCredential('censys').value).toBeNull();
    expect(resolveCredential('hunter').value).toBe('ok');
  });
});
