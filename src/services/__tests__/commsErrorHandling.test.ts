// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ChatError,
  NetworkError,
  EncryptionError,
  AuthError,
  SecurityError,
  wrapChatError,
  isChatError,
  isNetworkError,
  isEncryptionError,
} from '../../lib/chat/errors/ChatErrors';

describe('ChatErrors — structured error types', () => {
  it('ChatError carries code, message, context, and timestamp', () => {
    const err = new ChatError('MESSAGE_SEND_FAILED', 'relay timeout', { relay: 'wss://r1' });
    expect(err.code).toBe('MESSAGE_SEND_FAILED');
    expect(err.message).toBe('relay timeout');
    expect(err.context).toEqual({ relay: 'wss://r1' });
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.name).toBe('ChatError');
    expect(err instanceof Error).toBe(true);
  });

  it('NetworkError extends ChatError', () => {
    const err = new NetworkError('RELAY_UNREACHABLE', 'ws closed');
    expect(err instanceof NetworkError).toBe(true);
    expect(err instanceof ChatError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe('NetworkError');
  });

  it('EncryptionError extends ChatError', () => {
    const err = new EncryptionError('KEY_ROTATION_FAILED', 'KEM error');
    expect(err.name).toBe('EncryptionError');
    expect(err instanceof EncryptionError).toBe(true);
    expect(err instanceof ChatError).toBe(true);
  });

  it('AuthError extends ChatError', () => {
    const err = new AuthError('IDENTITY_VERIFICATION_FAILED', 'bad identity');
    expect(err.name).toBe('AuthError');
    expect(err instanceof AuthError).toBe(true);
  });

  it('SecurityError extends ChatError', () => {
    const err = new SecurityError('EMERGENCY_ACTIVATION_FAILED', 'oops');
    expect(err.name).toBe('SecurityError');
    expect(err instanceof SecurityError).toBe(true);
  });

  it('wrapChatError dispatches to correct subclass from code', () => {
    const net = wrapChatError('MESSAGE_SEND_FAILED', new Error('timeout'));
    expect(net instanceof NetworkError).toBe(true);

    const enc = wrapChatError('SIGNATURE_FAILED', new Error('bad key'));
    expect(enc instanceof EncryptionError).toBe(true);

    const auth = wrapChatError('ADAPTER_INIT_FAILED', new Error('no key'));
    expect(auth instanceof AuthError).toBe(true);

    const sec = wrapChatError('SECURE_DELETE_FAILED', new Error('disk'));
    expect(sec instanceof SecurityError).toBe(true);

    const gen = wrapChatError('UNKNOWN', 'string error');
    expect(gen instanceof ChatError).toBe(true);
    expect(gen instanceof NetworkError).toBe(false);
  });

  it('wrapChatError preserves cause', () => {
    const cause = new Error('root cause');
    const wrapped = wrapChatError('RELAY_UNREACHABLE', cause);
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.message).toBe('root cause');
  });

  it('isChatError type guard works', () => {
    expect(isChatError(new ChatError('UNKNOWN', 'x'))).toBe(true);
    expect(isChatError(new NetworkError('RELAY_UNREACHABLE', 'x'))).toBe(true);
    expect(isChatError(new Error('plain'))).toBe(false);
    expect(isChatError('string')).toBe(false);
  });

  it('isNetworkError type guard works', () => {
    expect(isNetworkError(new NetworkError('RELAY_UNREACHABLE', 'x'))).toBe(true);
    expect(isNetworkError(new EncryptionError('SIGNATURE_FAILED', 'x'))).toBe(false);
    expect(isNetworkError(new Error('plain'))).toBe(false);
  });

  it('isEncryptionError type guard works', () => {
    expect(isEncryptionError(new EncryptionError('KEY_ROTATION_FAILED', 'x'))).toBe(true);
    expect(isEncryptionError(new NetworkError('RELAY_UNREACHABLE', 'x'))).toBe(false);
  });
});
