/**
 * Recon that ends on screen is a dead end.
 *
 * The panel produced genuinely useful intelligence — names from certificate
 * logs, mail infrastructure, registration dates — and nothing flowed onward:
 * no evidence, no entities, nothing a Case could link. That is the defect this
 * codebase has a guard and a pipeline module for, in a panel written the same
 * week as both.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { previous, remember } = vi.hoisted(() => ({ previous: vi.fn(), remember: vi.fn() }));
vi.mock('../../../../../services/intel/recon/reconSnapshotStore', () => ({
  reconSnapshotStore: { previous, remember },
}));

const { storeExtractedEntities, recon } = vi.hoisted(() => ({
  storeExtractedEntities: vi.fn(),
  recon: {
    certificateTransparency: vi.fn(),
    mailPosture: vi.fn(),
    registration: vi.fn(),
    dnsAcrossResolvers: vi.fn(),
  },
}));

vi.mock('../../../../../services/intel/extraction/storeExtractedEntities', () => ({ storeExtractedEntities }));
vi.mock('../../../../../services/intel/recon/keylessRecon', () => recon);

import ReconPanel from '../ReconPanel';

/**
 * Armed per test, not once in the factory.
 *
 * setupVitest.ts runs vi.restoreAllMocks() after each test, which strips an
 * implementation set inside a vi.mock factory: the first test passes and every
 * one after it sees a mock resolving undefined, which reads as a broken
 * component rather than a broken fixture. setupVitest documents this same trap
 * for global.fetch.
 */
beforeEach(() => {
  previous.mockReset().mockResolvedValue(null);
  remember.mockReset().mockResolvedValue(true);
  storeExtractedEntities.mockReset().mockResolvedValue({ itemIds: ['a', 'b'], items: [], failures: [] });
  recon.certificateTransparency.mockReset().mockResolvedValue([
    { name: 'a.example.com', certificates: 2 },
    { name: 'b.example.com', certificates: 1 },
  ]);
  recon.mailPosture.mockReset().mockResolvedValue({
    mx: ['10 mail.example.com.'], spf: 'v=spf1 -all', dmarc: undefined, notes: ['No DMARC record.'],
  });
  recon.registration.mockReset().mockResolvedValue({
    status: [], nameservers: ['ns1.example.net'], registered: '1995-01-01',
  });
  recon.dnsAcrossResolvers.mockReset().mockResolvedValue({
    answers: [
      { resolver: 'google', records: ['1.2.3.4'], status: 0 },
      { resolver: 'cloudflare', records: ['1.2.3.4'], status: 0 },
    ],
    agree: true, failures: [],
  });
});

async function lookup() {
  render(<ReconPanel />);
  // fireEvent rather than userEvent.type: eleven keystrokes at the default
  // per-key delay overran the test timeout, and that latency is not the subject.
  fireEvent.change(screen.getByLabelText(/DOMAIN/i), { target: { value: 'example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /LOOK UP/i }));
  await waitFor(() => expect(screen.getByText(/NAMES IN CERTIFICATE LOGS/i)).toBeInTheDocument(), { timeout: 5000 });
}

describe('ReconPanel', () => {
  it('names the registry that answered and shows its own notices, links included (EX33)', async () => {
    recon.registration.mockResolvedValue({
      status: [], nameservers: ['ns1.example.net'], registered: '1995-01-01', registry: 'rdap.verisign.com',
      notices: [{ title: 'Terms of Service', text: 'Service subject to Terms of Use.', links: ['https://www.verisign.com/terms'] }],
    });
    await lookup();
    expect(screen.getByText('rdap.verisign.com')).toBeInTheDocument();
    expect(screen.getByText(/Terms of Service: Service subject to Terms of Use\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'www.verisign.com' }).getAttribute('href')).toBe('https://www.verisign.com/terms');
  });

  it('offers to file what it found, rather than only displaying it', async () => {
    await lookup();
    expect(screen.getByRole('button', { name: /FILE \d+ ENTITIES/i })).toBeInTheDocument();
  });

  it('files every kind of name it observed, not just subdomains', async () => {
    await lookup();
    fireEvent.click(screen.getByRole('button', { name: /FILE \d+ ENTITIES/i }));
    await waitFor(() => expect(storeExtractedEntities).toHaveBeenCalled(), { timeout: 5000 });

    const filed = storeExtractedEntities.mock.calls[0][0] as Array<{ value: string; kind: string; method: string }>;
    const byValue = Object.fromEntries(filed.map((v) => [v.value, v]));

    expect(byValue['a.example.com']).toBeTruthy();      // certificate log
    expect(byValue['mail.example.com']).toBeTruthy();   // MX, priority stripped
    expect(byValue['ns1.example.net']).toBeTruthy();    // registry nameserver
    expect(byValue['1.2.3.4']?.kind).toBe('ipv4');      // resolver answer
    // Grammar-level facts about a response, not a reading of one.
    expect(filed.every((v) => v.method === 'pattern')).toBe(true);
  });

  it('does not file until asked, since looking and asserting are different acts', async () => {
    await lookup();
    expect(storeExtractedEntities).not.toHaveBeenCalled();
  });

  it('reports what could not be stored rather than claiming a clean file', async () => {
    storeExtractedEntities.mockResolvedValue({ itemIds: ['a'], items: [], failures: [{ value: 'b', error: 'nope' }] });
    await lookup();
    fireEvent.click(screen.getByRole('button', { name: /FILE \d+ ENTITIES/i }));
    await waitFor(() => expect(screen.getByText(/could not be stored/i)).toBeInTheDocument(), { timeout: 5000 });
  });

  it('carries the evidence a lookup captured into what it files', async () => {
    // The sources push into a sink the panel owns; whatever lands there is what
    // the filed entities rest on. Simulated here by the mocked sources.
    recon.certificateTransparency.mockImplementation(async (_d: string, sink?: string[]) => {
      sink?.push('a'.repeat(64));
      return [{ name: 'a.example.com', certificates: 1 }];
    });
    recon.registration.mockImplementation(async (_d: string, sink?: string[]) => {
      sink?.push('b'.repeat(64));
      return { status: [], nameservers: [], registered: '1995-01-01' };
    });

    await lookup();
    fireEvent.click(screen.getByRole('button', { name: /FILE \d+ ENTITIES/i }));
    await waitFor(() => expect(storeExtractedEntities).toHaveBeenCalled(), { timeout: 5000 });

    const context = storeExtractedEntities.mock.calls[0][1] as { evidenceRecordIds?: string[] };
    expect(context.evidenceRecordIds).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
  }, 20000);

  it('files with no evidence ids in a browser, which is the truthful answer', async () => {
    // Nothing pushes to the sink because nothing captured — no host, no
    // evidence. The entities are still worth filing; they simply rest on
    // nothing recorded, and must not imply otherwise.
    await lookup();
    fireEvent.click(screen.getByRole('button', { name: /FILE \d+ ENTITIES/i }));
    await waitFor(() => expect(storeExtractedEntities).toHaveBeenCalled(), { timeout: 5000 });

    const context = storeExtractedEntities.mock.calls[0][1] as { evidenceRecordIds?: string[] };
    expect(context.evidenceRecordIds).toEqual([]);
  }, 20000);

  it('says it is a first look when there is nothing to compare against', async () => {
    previous.mockResolvedValue(null);
    await lookup();
    // "Nothing to compare" and "nothing changed" are different claims and the
    // panel must not let the first read as the second.
    expect(await screen.findByText(/First look at this target/i)).toBeInTheDocument();
  }, 20000);

  it('reports a nameserver change as a change of control', async () => {
    previous.mockResolvedValue({
      target: 'example.com',
      observedAt: '2026-08-01T00:00:00.000Z',
      certificateNames: ['a.example.com', 'b.example.com'],
      mx: ['10 mail.example.com.'],
      nameservers: ['ns-OLD.example.net'],
      addresses: ['1.2.3.4'],
      registrationExpires: undefined,
    });
    await lookup();

    expect(await screen.findByText(/CHANGED SINCE 2026-08-01/i)).toBeInTheDocument();
    expect(screen.getByText(/change of control/i)).toBeInTheDocument();
  }, 20000);

  it('never calls a missing certificate name a removal', async () => {
    previous.mockResolvedValue({
      target: 'example.com',
      observedAt: '2026-08-01T00:00:00.000Z',
      // Two names before, and the mocked lookup returns only these two plus
      // nothing new — but with an extra one that will not come back.
      certificateNames: ['a.example.com', 'b.example.com', 'vanished.example.com'],
      mx: ['10 mail.example.com.'],
      nameservers: ['ns1.example.net'],
      addresses: ['1.2.3.4'],
      registrationExpires: undefined,
    });
    await lookup();

    // Certificate logs are append-only, so a name that did not come back is a
    // property of the query. It must never be presented as an event.
    expect(screen.queryByText(/removed/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/No change since 2026-08-01/i)).toBeInTheDocument();
  }, 20000);

  it('remembers only after comparing, or every target looks unchanged forever', async () => {
    previous.mockResolvedValue(null);
    await lookup();
    await waitFor(() => expect(remember).toHaveBeenCalled(), { timeout: 5000 });
    expect(previous.mock.invocationCallOrder[0]).toBeLessThan(remember.mock.invocationCallOrder[0]);
  }, 20000);
});
