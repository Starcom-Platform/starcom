/**
 * Extraction has to be right about two things: what it finds, and what it
 * refuses to claim. The second is the harder half — a fabricated entity enters
 * a pipeline whose whole premise is that weight derives from method.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { extractByPattern, extractByModel, extractEntities } from '../entityExtraction';

const NATIVE = 'starcomNative';
const clearHost = () => { delete (window as unknown as Record<string, unknown>)[NATIVE]; };

describe('extractByPattern', () => {
  it('finds emails, urls, ipv4 and the domains implied by them', () => {
    const found = extractByPattern(
      'Contact ops@example.com or see https://cdn.example.org/a?b=1 — resolver 8.8.4.4.',
    );
    const value = (kind: string) => found.filter((e) => e.kind === kind).map((e) => e.value);

    expect(value('email')).toContain('ops@example.com');
    expect(value('url')).toContain('https://cdn.example.org/a?b=1');
    expect(value('ipv4')).toContain('8.8.4.4');
    // A url and an email each imply a domain; extracting them is free recall.
    expect(value('domain')).toEqual(expect.arrayContaining(['example.com', 'cdn.example.org']));
  });

  it('validates octets rather than counting dots', () => {
    const found = extractByPattern('build 10.15.7.1999 and host 127.0.0.256 and real 192.168.1.1');
    const ips = found.filter((e) => e.kind === 'ipv4').map((e) => e.value);
    expect(ips).toContain('192.168.1.1');
    // Version numbers and out-of-range octets are not addresses.
    expect(ips).not.toContain('127.0.0.256');
    expect(ips.some((v) => v.startsWith('10.15.7.19'))).toBe(false);
  });

  it('does not swallow trailing sentence punctuation into a url', () => {
    const [url] = extractByPattern('See https://example.com/page.').filter((e) => e.kind === 'url');
    expect(url.value).toBe('https://example.com/page');
  });

  it('reports every entity as pattern-matched, never as verified', () => {
    const found = extractByPattern('a@b.co');
    expect(found.every((e) => e.method === 'pattern')).toBe(true);
    expect(found.every((e) => e.derivation === undefined)).toBe(true);
  });
});

describe('extractByModel', () => {
  afterEach(() => { clearHost(); vi.restoreAllMocks(); });

  it('says why it could not run instead of returning an empty result', async () => {
    clearHost();
    const outcome = await extractByModel('anything');
    // An unattempted read and a read that found nothing are different claims.
    expect(outcome.entities).toHaveLength(0);
    expect(outcome.unavailable).toMatch(/desktop host/i);
  });

  it('reports an absent runtime with the host guidance, not silence', async () => {
    (window as unknown as Record<string, unknown>)[NATIVE] = {
      isNative: true,
      inference: { status: vi.fn().mockResolvedValue({ available: false, endpoint: 'http://127.0.0.1:11434', models: [], detail: 'Install Ollama' }) },
    };
    const outcome = await extractByModel('anything');
    expect(outcome.unavailable).toBe('Install Ollama');
  });

  it('drops entities the model returned that are not in the text', async () => {
    (window as unknown as Record<string, unknown>)[NATIVE] = {
      isNative: true,
      inference: {
        status: vi.fn().mockResolvedValue({ available: true, endpoint: 'http://127.0.0.1:11434', models: ['m'] }),
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({ entities: [
            { kind: 'organization', value: 'Acme Corp' },
            { kind: 'person', value: 'Someone Who Was Never Mentioned' },
          ] }),
          model: 'm',
          elapsedMs: 10,
          derivation: { promptDigest: 'f'.repeat(64) },
        }),
      },
    };
    const outcome = await extractByModel('A filing by Acme Corp was published.');
    // The guard against a model inventing a plausible name.
    expect(outcome.entities.map((e) => e.value)).toEqual(['Acme Corp']);
    expect(outcome.entities[0].derivation).toEqual({ model: 'm', promptDigest: 'f'.repeat(64) });
  });

  it('treats unparseable output as unavailable rather than as no entities', async () => {
    (window as unknown as Record<string, unknown>)[NATIVE] = {
      isNative: true,
      inference: {
        status: vi.fn().mockResolvedValue({ available: true, endpoint: 'http://127.0.0.1:11434', models: ['m'] }),
        generate: vi.fn().mockResolvedValue({ text: 'not json', model: 'm', elapsedMs: 1, derivation: { promptDigest: 'a'.repeat(64) }, jsonParseError: 'Unexpected token' }),
      },
    };
    const outcome = await extractByModel('text');
    expect(outcome.entities).toHaveLength(0);
    expect(outcome.unavailable).toMatch(/did not return JSON/i);
  });
});

describe('extractEntities', () => {
  afterEach(clearHost);

  it('works with no host at all, which is the case that has to work', async () => {
    clearHost();
    const { entities, modelUnavailable } = await extractEntities('mail ops@example.com', { useModel: true });
    expect(entities.map((e) => e.value)).toContain('ops@example.com');
    expect(modelUnavailable).toMatch(/desktop host/i);
  });

  it('prefers the grammar match when both methods name the same thing', async () => {
    (window as unknown as Record<string, unknown>)[NATIVE] = {
      isNative: true,
      inference: {
        status: vi.fn().mockResolvedValue({ available: true, endpoint: 'http://127.0.0.1:11434', models: ['m'] }),
        generate: vi.fn().mockResolvedValue({
          text: JSON.stringify({ entities: [{ kind: 'domain', value: 'example.com' }] }),
          model: 'm', elapsedMs: 5, derivation: { promptDigest: 'b'.repeat(64) },
        }),
      },
    };
    const { entities } = await extractEntities('see https://example.com/x', { useModel: true });
    const domain = entities.find((e) => e.kind === 'domain' && e.value === 'example.com');
    // Not because it is more useful — because it rests on a grammar rather than
    // a reading, and recording the stronger method keeps weight honest.
    expect(domain?.method).toBe('pattern');
  });

  it('keeps the pattern results when the model THROWS, not merely when it is absent', async () => {
    (window as unknown as Record<string, unknown>)[NATIVE] = {
      isNative: true,
      inference: {
        status: vi.fn().mockResolvedValue({ available: true, endpoint: 'http://127.0.0.1:11434', models: ['m'] }),
        // The host's IPC rejects on a bad response from the runtime. A
        // live-but-unhappy model must cost its own results and nothing else.
        generate: vi.fn().mockRejectedValue(new Error('Local runtime returned 500')),
      },
    };
    const { entities, modelUnavailable } = await extractEntities('mail ops@example.com', { useModel: true });
    expect(entities.map((e) => e.value)).toContain('ops@example.com');
    expect(modelUnavailable).toMatch(/500/);
  });
});
