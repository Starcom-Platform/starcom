import { describe, it, expect, beforeEach } from 'vitest';
import { secureStorage } from './SecureStorageManager';

describe('SecureStorageManager — real AES-256-GCM (regression: used to be a reversible XOR cipher)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips data through real encryption', async () => {
    await secureStorage.setItem('test-key', { secret: 'classified-payload-12345' });
    const result = await secureStorage.getItem<{ secret: string }>('test-key');
    expect(result?.secret).toBe('classified-payload-12345');
  });

  it('stores ciphertext that does not contain the plaintext (regression: XOR cipher used to leak plaintext structure)', async () => {
    const plaintext = 'super-secret-value-that-should-not-appear-in-storage';
    await secureStorage.setItem('leak-test', plaintext);

    const rawStored = sessionStorage.getItem('starcom_secure_leak-test');
    expect(rawStored).toBeTruthy();
    expect(rawStored).not.toContain(plaintext);
  });

  it('produces different ciphertext for the same plaintext on repeated calls (real random IV per encryption)', async () => {
    await secureStorage.setItem('iv-test-1', 'identical-payload');
    const first = sessionStorage.getItem('starcom_secure_iv-test-1');

    await secureStorage.setItem('iv-test-1', 'identical-payload');
    const second = sessionStorage.getItem('starcom_secure_iv-test-1');

    expect(first).not.toBe(second);
  });

  it('does not store the encryption secret in plaintext next to the ciphertext under the same key', async () => {
    await secureStorage.setItem('secret-adjacency-test', 'some-value');
    const secret = sessionStorage.getItem('starcom_enc_secret');
    const ciphertext = sessionStorage.getItem('starcom_secure_secret-adjacency-test');
    expect(secret).toBeTruthy();
    expect(ciphertext).not.toContain(secret!);
  });

  it('returns null for a missing key', async () => {
    const result = await secureStorage.getItem('does-not-exist');
    expect(result).toBeNull();
  });

  it('respects TTL expiry', async () => {
    await secureStorage.setItem('ttl-test', 'expiring-value', { ttl: -1 });
    const result = await secureStorage.getItem('ttl-test');
    expect(result).toBeNull();
  });

  it('removeItem deletes the stored item', async () => {
    await secureStorage.setItem('remove-test', 'value');
    secureStorage.removeItem('remove-test');
    const result = await secureStorage.getItem('remove-test');
    expect(result).toBeNull();
  });

  it('getEncryptionContext reports real AES-256-GCM and honestly reports isQuantumSafe: false (regression: used to claim ML-KEM/HYBRID-PQC)', () => {
    const defaultCtx = secureStorage.getEncryptionContext('default');
    const quantumCtx = secureStorage.getEncryptionContext('quantum');

    expect(defaultCtx?.algorithm).toBe('AES-256-GCM');
    expect(defaultCtx?.isQuantumSafe).toBe(false);
    expect(quantumCtx?.algorithm).toBe('AES-256-GCM');
    expect(quantumCtx?.isQuantumSafe).toBe(false);
  });

  it('rotateEncryptionKeys makes previously-encrypted items undecryptable', async () => {
    await secureStorage.setItem('rotate-test', 'value-before-rotation');
    secureStorage.rotateEncryptionKeys();
    const result = await secureStorage.getItem('rotate-test');
    expect(result).toBeNull();
  });
});
