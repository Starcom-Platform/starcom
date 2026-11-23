/**
 * The two states that matter are "no host" and "host answered".
 *
 * The first is the one worth guarding: the web build is the front door and
 * always will be, so a panel that renders a control it cannot honour — or that
 * throws — is the failure mode this component exists to avoid. It must say what
 * is missing and why, and offer nothing that would not work.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ScannerPanel from '../ScannerPanel';

const tlsResult = {
  host: 'example.com',
  port: 443,
  protocol: 'TLSv1.3',
  cipher: { name: 'TLS_AES_256_GCM_SHA384', version: 'TLSv1.3' },
  chain: [
    {
      subject: { CN: 'example.com' },
      issuer: { O: 'DigiCert Inc' },
      validFrom: 'Jan 1 00:00:00 2026 GMT',
      validTo: 'Oct 27 23:59:59 2026 GMT',
      subjectAltNames: ['DNS:example.com', 'DNS:*.example.com'],
      serialNumber: 'ABC123',
      fingerprint256: '61:53:A9:6F:D1:AA',
      daysUntilExpiry: 55,
    },
  ],
  authorized: true,
  elapsedMs: 120,
};

function installHost(overrides: Record<string, unknown> = {}) {
  const host = {
    isNative: true,
    tcpProbe: vi.fn().mockResolvedValue({
      host: 'example.com',
      results: [
        { port: 80, open: true, outcome: 'open', elapsedMs: 12 },
        { port: 443, open: true, outcome: 'open', elapsedMs: 18, banner: 'HTTP/1.1 200 OK' },
        { port: 8080, open: false, outcome: 'refused', elapsedMs: 4 },
        { port: 8443, open: false, outcome: 'timeout', elapsedMs: 4000 },
      ],
    }),
    tlsInspect: vi.fn().mockResolvedValue(tlsResult),
    ...overrides,
  };
  (window as unknown as { starcomNative?: unknown }).starcomNative = host;
  return host;
}

describe('ScannerPanel', () => {
  afterEach(() => {
    delete (window as unknown as { starcomNative?: unknown }).starcomNative;
    vi.restoreAllMocks();
  });

  describe('without the desktop host', () => {
    beforeEach(() => {
      delete (window as unknown as { starcomNative?: unknown }).starcomNative;
    });

    it('explains the absence instead of offering a control that cannot work', () => {
      render(<ScannerPanel />);
      expect(screen.getByText(/needs the Starcom desktop host/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /scan/i })).not.toBeInTheDocument();
    });

    it('names the browser as the reason, not this application', () => {
      render(<ScannerPanel />);
      expect(screen.getByText(/cannot open a TCP socket/i)).toBeInTheDocument();
    });

    it('still offers passive recon, which needs no host and no key', () => {
      render(<ScannerPanel />);
      // The tab used to be a single "needs the desktop host" notice, which told
      // an analyst without one that they could do nothing here. Certificate
      // Transparency, DNS and RDAP answer most of what a paid recon product
      // sells, from a plain tab, for nothing.
      expect(screen.getByText(/PASSIVE_RECON/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /look up/i })).toBeInTheDocument();
      expect(screen.getByText(/nothing is sent to the target/i)).toBeInTheDocument();
    });
  });

  describe('with the desktop host', () => {
    it('reports open ports and preserves refused/timeout as distinct outcomes', async () => {
      installHost();
      render(<ScannerPanel />);

      await userEvent.type(screen.getByLabelText(/host/i), 'example.com');
      await userEvent.click(screen.getByRole('button', { name: /scan/i }));

      await waitFor(() => expect(screen.getByText(/2 OPEN \/ 4 PROBED/i)).toBeInTheDocument());
      // Collapsing these to "closed" would discard the more interesting half.
      expect(screen.getByText('refused')).toBeInTheDocument();
      expect(screen.getByText('timeout')).toBeInTheDocument();
    });

    it('surfaces subjectAltNames, which is the pivot the chain is read for', async () => {
      installHost();
      render(<ScannerPanel />);

      await userEvent.type(screen.getByLabelText(/host/i), 'example.com');
      await userEvent.click(screen.getByRole('button', { name: /scan/i }));

      await waitFor(() => expect(screen.getByText(/SUBJECT ALT NAMES — 2/i)).toBeInTheDocument());
      expect(screen.getByText('*.example.com')).toBeInTheDocument();
    });

    it('strips a scheme rather than probing a host that includes one', async () => {
      const host = installHost();
      render(<ScannerPanel />);

      await userEvent.type(screen.getByLabelText(/host/i), 'https://example.com/path');
      await userEvent.click(screen.getByRole('button', { name: /scan/i }));

      await waitFor(() => expect(host.tcpProbe).toHaveBeenCalled());
      expect(host.tcpProbe.mock.calls[0][0].host).toBe('example.com');
    });

    it('still reports ports when the certificate read fails', async () => {
      installHost({ tlsInspect: vi.fn().mockRejectedValue(new Error('no TLS listener')) });
      render(<ScannerPanel />);

      await userEvent.type(screen.getByLabelText(/host/i), 'example.com');
      await userEvent.click(screen.getByRole('button', { name: /scan/i }));

      // A host with no TLS listener is an ordinary finding, not a failed scan.
      await waitFor(() => expect(screen.getByText(/2 OPEN \/ 4 PROBED/i)).toBeInTheDocument());
      expect(screen.getByText(/no TLS listener/i)).toBeInTheDocument();
    });
  });
});
