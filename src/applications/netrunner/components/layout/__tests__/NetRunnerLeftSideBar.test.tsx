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

const executeScript = vi.fn();
const getUIState = vi.fn();
const getDefaultScripts = vi.fn();
const addEventListener = vi.fn();
const removeEventListener = vi.fn();

vi.mock('@netrunnerEngine', () => ({
  NetRunnerScriptsUIService: {
    getInstance: () => ({
      getUIState,
      getDefaultScripts,
      addEventListener,
      removeEventListener,
      executeScript: (...args: unknown[]) => executeScript(...args)
    })
  }
}));

import NetRunnerLeftSideBar from '../NetRunnerLeftSideBar';

function makeScript(id: string, name: string) {
  return { metadata: { id, name } } as unknown as ReturnType<typeof getDefaultScripts>[number];
}

describe('NetRunnerLeftSideBar — script execution', () => {
  // Scripts run on a scanned page, which the desktop app or Starcom Uplink fetches (B9, EX32).
  afterEach(() => { delete (window as unknown as Record<string, unknown>).starcomNative; });
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).starcomNative = { isNative: true, inference: { status: async () => ({ available: false, models: [] }) } };
    getUIState.mockReset().mockReturnValue({ availableScripts: [], executingScripts: new Set() });
    getDefaultScripts.mockReset().mockReturnValue([makeScript('email-extractor-v1', 'Email Extractor')]);
    executeScript.mockReset().mockResolvedValue({ success: true, data: {} });
    scanWebsite.mockReset().mockResolvedValue({
      url: 'https://acme.com',
      title: 'Acme',
      status: 'completed',
      sourceCode: '<html><body><p>Write to real@acme.com</p></body></html>',
      vulnerabilities: [],
      osintData: { emails: ['real@acme.com'], socialMedia: [], technologies: [], serverInfo: [], subdomains: [], certificates: [], dns: [] },
      metadata: { statusCode: 200, contentType: 'text/html', responseTime: 5, size: 10, headers: { server: 'nginx' } },
      timestamp: Date.now()
    });
  });

  it('a script cannot be run without a real target entered', async () => {
    render(<NetRunnerLeftSideBar open={true} width={280} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Email Extractor'));

    expect(scanWebsite).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('running a script scans the real target first and passes real OSINT data through — no hardcoded mock target/data', async () => {
    render(<NetRunnerLeftSideBar open={true} width={280} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByText('Email Extractor'));

    await waitFor(() => expect(scanWebsite).toHaveBeenCalledWith('https://acme.com'));
    await waitFor(() => expect(executeScript).toHaveBeenCalledWith({
      scriptId: 'email-extractor-v1',
      targetUrl: 'https://acme.com',
      osintData: expect.objectContaining({ emails: ['real@acme.com'] }),
      // The page itself (plan item 7, block C): the scripts read html, text and
      // headers, and were handed only the scanner's extracted lists.
      page: { html: '<html><body><p>Write to real@acme.com</p></body></html>', text: 'Write to real@acme.com', headers: { server: 'nginx' }, url: 'https://acme.com' },
      configuration: {}
    }));
  });

  it('shows what a script found, which went only to the console', async () => {
    executeScript.mockResolvedValue({ success: true, data: { data: { emails: ['real@acme.com'], domains: ['acme.com', 'mail.acme.com'] } } });
    render(<NetRunnerLeftSideBar open={true} width={280} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByText('Email Extractor'));
    expect(await screen.findByText('Email Extractor: emails 1, domains 2')).toBeInTheDocument();
  });

  it('shows why a script failed', async () => {
    scanWebsite.mockRejectedValue(new Error('No answer from acme.com'));
    render(<NetRunnerLeftSideBar open={true} width={280} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByText('Email Extractor'));
    expect(await screen.findByText('Email Extractor failed: No answer from acme.com')).toBeInTheDocument();
  });

  it('in a browser with neither, says the scripts need Uplink or the desktop app, and does not run them', async () => {
    delete (window as unknown as Record<string, unknown>).starcomNative;
    render(<NetRunnerLeftSideBar open={true} width={280} />);
    const user = userEvent.setup();
    expect(screen.getByText(/Scripts run on a scanned page, which needs Starcom Uplink or the Starcom desktop app/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get the desktop app/i }).getAttribute('href'))
      .toBe('https://github.com/Jthora/starcom-desktop-releases/releases');
    await user.type(screen.getByPlaceholderText('domain.com'), 'acme.com');
    await user.click(screen.getByText('Email Extractor'));
    expect(scanWebsite).not.toHaveBeenCalled();
  });
});
