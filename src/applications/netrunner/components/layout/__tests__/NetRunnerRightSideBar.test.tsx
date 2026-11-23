import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const scanWebsite = vi.fn();
vi.mock('../../../services/WebsiteScanner', () => ({
  websiteScanner: {
    scanWebsite: (...args: unknown[]) => scanWebsite(...args)
  }
}));

import NetRunnerRightSideBar from '../NetRunnerRightSideBar';

describe('NetRunnerRightSideBar', () => {
  // A page scan runs through the desktop app or Starcom Uplink (B9, EX32).
  afterEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).starcomNative = { isNative: true };
    scanWebsite.mockReset().mockResolvedValue({
      url: 'https://acme.com',
      title: 'Acme',
      status: 'completed',
      sourceCode: '<html></html>',
      vulnerabilities: [],
      osintData: { emails: [], socialMedia: [], technologies: [], serverInfo: [], subdomains: [], certificates: [], dns: [] },
      metadata: { statusCode: 200, contentType: 'text/html', responseTime: 10, size: 100, headers: {} },
      timestamp: Date.now()
    });
  });

  it('does not scan anything until a real target is submitted — no frozen fake progress', () => {
    render(<NetRunnerRightSideBar open={true} width={320} onToggle={vi.fn()} />);

    expect(screen.getByText(/enter a target above to scan/i)).toBeInTheDocument();
    expect(scanWebsite).not.toHaveBeenCalled();
  });

  it('submitting a target actually triggers the real scanner — this is the bug that was fixed (previously structurally unreachable)', async () => {
    render(<NetRunnerRightSideBar open={true} width={320} onToggle={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByRole('button', { name: /scan/i }));

    await waitFor(() => expect(scanWebsite).toHaveBeenCalledWith('https://acme.com', expect.any(Function)));
  });

  it('pressing Enter in the target field also triggers a scan', async () => {
    render(<NetRunnerRightSideBar open={true} width={320} onToggle={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com{Enter}');

    await waitFor(() => expect(scanWebsite).toHaveBeenCalledWith('https://acme.com', expect.any(Function)));
  });

  it('says a failed scan could not look, rather than showing no results (plan item 7, block C)', async () => {
    scanWebsite.mockRejectedValue(new Error('No answer from acme.com'));
    render(<NetRunnerRightSideBar open={true} width={320} onToggle={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByRole('button', { name: 'SCAN' }));
    expect(await screen.findByText('Could not scan: No answer from acme.com')).toBeInTheDocument();
  });

  it('in a browser with neither, says page scans need Uplink or the desktop app, and does not offer one', async () => {
    delete (window as unknown as Record<string, unknown>).starcomNative;
    render(<NetRunnerRightSideBar open={true} width={320} onToggle={vi.fn()} />);
    const user = userEvent.setup();
    expect(screen.getByText(/Page scans need Starcom Uplink or the Starcom desktop app/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get the desktop app/i }).getAttribute('href'))
      .toBe('https://github.com/Jthora/starcom-desktop-releases/releases');
    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    expect(screen.getByRole('button', { name: 'SCAN' })).toBeDisabled();
  });
});
