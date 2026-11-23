/**
 * Telling the operator what a path costs BEFORE they take it.
 *
 * Measured from the operator's side in a real browser: an OSINT scan spends
 * about 31 seconds trying three public CORS proxies and then reports that all
 * of them failed. The error is honest and arrives far too late — the dependency
 * is knowable before the click, and discovering it by waiting, every time, is
 * the wrong shape.
 *
 * It was kept from being a refusal while the proxies sometimes answered. On
 * 2026-10-01 they did not (two hung past 15 s, the third redirected to a demo),
 * and each attempt told an anonymous third party what was being investigated.
 * So in a browser the page scan says it needs the desktop app (decision B9),
 * points to recon, and is not offered (plan item 7, block C).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NetRunnerCenterView from '../NetRunnerCenterView';
import * as uplink from '../../../../../extension/useStarcomUplink';

vi.mock('../../../services/WebsiteScanner', () => ({
  WebsiteScannerService: class { scanWebsite() { return new Promise(() => {}); } },
}));

describe('OSINT tab, without the desktop host or Starcom Uplink', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).starcomNative;
    vi.restoreAllMocks();
  });

  it('says before anything is clicked that page scans need Uplink or the desktop app', () => {
    render(<NetRunnerCenterView width="100%" height="100%" />);
    expect(screen.getByText(/Page scans need Starcom Uplink or the Starcom desktop app/i)).toBeInTheDocument();
    expect(screen.queryByText(/CORS prox/i)).not.toBeInTheDocument();
    // And where to get it (decision B12).
    expect(screen.getByRole('link', { name: /Get the desktop app/i }).getAttribute('href'))
      .toBe('https://github.com/Jthora/starcom-desktop-releases/releases');
  });

  it('offers the path that needs no proxy, rather than only complaining', async () => {
    render(<NetRunnerCenterView width="100%" height="100%" />);
    const link = screen.getByRole('button', { name: /use passive recon instead/i });

    await userEvent.click(link);
    // The alternative has to be reachable, not merely mentioned.
    expect(await screen.findByText(/PASSIVE_RECON/i)).toBeInTheDocument();
  });

  it('does not offer a scan that nothing in a browser can run', async () => {
    render(<NetRunnerCenterView width="100%" height="100%" />);
    // An empty target disables it on its own, so give it one first.
    await userEvent.type(screen.getByLabelText(/TARGET/i), 'example.com');
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeDisabled();
  });

  it('offers the scan with the desktop host', async () => {
    (window as unknown as Record<string, unknown>).starcomNative = { isNative: true };
    render(<NetRunnerCenterView width="100%" height="100%" />);
    await userEvent.type(screen.getByLabelText(/TARGET/i), 'example.com');
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeEnabled();
  });

  it('says nothing when the host is present, since the dependency is gone', () => {
    (window as unknown as Record<string, unknown>).starcomNative = { isNative: true };
    render(<NetRunnerCenterView width="100%" height="100%" />);
    expect(screen.queryByText(/Page scans need/i)).not.toBeInTheDocument();
  });

  it('offers the scan through Starcom Uplink in a plain browser, saying it asks for each site (EX32)', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue({
      status: 'connected', hello: { kind: 'hello', id: 'h', extensionVersion: '0.2.0', protocol: 1, capabilities: [{ id: 'site.fetch', ready: true }] },
    });
    render(<NetRunnerCenterView width="100%" height="100%" />);
    await userEvent.type(screen.getByLabelText(/TARGET/i), 'example.com');
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeEnabled();
    expect(screen.getByText(/Page scans read through Starcom Uplink\. It asks you once for each site/)).toBeInTheDocument();
    expect(screen.queryByText(/Page scans need/i)).not.toBeInTheDocument();
  });

  it('does not offer it through an Uplink too old to read sites', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue({
      status: 'connected', hello: { kind: 'hello', id: 'h', extensionVersion: '0.1.0', protocol: 1, capabilities: [{ id: 'captures.read', ready: true }] },
    });
    render(<NetRunnerCenterView width="100%" height="100%" />);
    await userEvent.type(screen.getByLabelText(/TARGET/i), 'example.com');
    expect(screen.getByRole('button', { name: /^scan$/i })).toBeDisabled();
  });
});
