/**
 * The no-host path is the one most people meet.
 *
 * The web build is the front door and always will be, so a pane that offers a
 * URL bar it cannot honour is worse than one that explains itself. It must also
 * not reach for `window.starcomNative` and throw — absence is the normal case,
 * not an error condition.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BrowsePane from '../BrowsePane';

const NATIVE = 'starcomNative';

function installHost() {
  const host = {
    isNative: true,
    browse: {
      open: vi.fn().mockResolvedValue({ viewId: 'v1', partition: 'inv-ephemeral-v1' }),
      navigate: vi.fn().mockResolvedValue(true),
      setBounds: vi.fn().mockResolvedValue(true),
      snapshot: vi.fn().mockResolvedValue({ url: 'https://example.com', title: 'Example Domain', text: '', html: '', capturedAt: '' }),
      observations: vi.fn().mockResolvedValue([
        { url: 'https://example.com/', method: 'GET', resourceType: 'mainFrame', statusCode: 200, thirdParty: false },
        { url: 'https://cdn.other.test/a.js', method: 'GET', resourceType: 'script', statusCode: 200, thirdParty: true },
      ]),
      capture: vi.fn().mockResolvedValue({
        recordId: 'a'.repeat(64),
        url: 'https://example.com',
        title: 'Example Domain',
        artifacts: { html: 'b'.repeat(64), text: 'c'.repeat(64), screenshot: 'd'.repeat(64) },
        observationCount: 2,
        thirdPartyHosts: ['cdn.other.test'],
      }),
      close: vi.fn().mockResolvedValue(true),
    },
    evidence: {
      read: vi.fn(),
      verify: vi.fn().mockResolvedValue({ found: true, recordIntact: true, bodyIntact: true }),
      list: vi.fn().mockResolvedValue(['a'.repeat(64)]),
    },
  };
  (window as unknown as Record<string, unknown>)[NATIVE] = host;
  return host;
}

describe('BrowsePane', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[NATIVE];
    vi.restoreAllMocks();
  });

  it('explains the absence rather than offering a URL bar that cannot work', () => {
    render(<BrowsePane />);
    expect(screen.getByText(/needs the Starcom desktop host/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/url/i)).not.toBeInTheDocument();
  });

  it('says why an iframe is not the same thing', () => {
    render(<BrowsePane />);
    expect(screen.getByText(/iframe would do none of those/i)).toBeInTheDocument();
  });

  it('opens a view and reports its position to the host', async () => {
    const host = installHost();
    render(<BrowsePane initialUrl="https://example.com" />);

    await waitFor(() => expect(host.browse.open).toHaveBeenCalled());
    expect(host.browse.open.mock.calls[0][0].url).toBe('https://example.com');
    // The native view is composited over a hole in this document; without a
    // position pushed to the host it floats over the wrong part of the screen.
    await waitFor(() => expect(host.browse.setBounds).toHaveBeenCalled());
  });

  it('counts third-party hosts, which is what the interception is for', async () => {
    installHost();
    render(<BrowsePane initialUrl="https://example.com" />);
    await waitFor(() =>
      expect(screen.getByText(/2 requests · 1 third-party host/i)).toBeInTheDocument(),
    );
  });

  it('turns a page into a citable record, naming each artifact separately', async () => {
    installHost();
    render(<BrowsePane initialUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /capture/i })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: /capture/i }));

    await waitFor(() => expect(screen.getByText(/EVIDENCE aaaaaaaa/i)).toBeInTheDocument());
    // Three claims about one moment; a single fused digest would hide a page
    // that shows one thing and encodes another.
    expect(screen.getByText(/^html/m)).toBeInTheDocument();
    expect(screen.getByText(/^text/m)).toBeInTheDocument();
    expect(screen.getByText(/^screenshot/m)).toBeInTheDocument();
  });

  it('verifies as a reader would, on a separate action from capturing', async () => {
    const host = installHost();
    render(<BrowsePane initialUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /capture/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /capture/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument());

    // Capturing must not silently vouch for itself.
    expect(host.evidence.verify).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(screen.getByText('INTACT')).toBeInTheDocument());
  });

  it('keeps the record when the screenshot could not be taken', async () => {
    const host = installHost();
    host.browse.capture.mockResolvedValue({
      recordId: 'e'.repeat(64),
      url: 'https://example.com',
      title: 'Example Domain',
      artifacts: { html: 'b'.repeat(64), text: 'c'.repeat(64) },
      observationCount: 1,
      thirdPartyHosts: [],
      screenshotError: 'UnknownVizError',
    });
    render(<BrowsePane initialUrl="https://example.com" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /capture/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /capture/i }));

    // Corroborating, not primary: losing html and text because a picture failed
    // would be a bad trade.
    await waitFor(() => expect(screen.getByText(/html and text still stand/i)).toBeInTheDocument());
    expect(screen.getByText(/EVIDENCE eeeeeeee/i)).toBeInTheDocument();
  });

  it('closes the view on unmount, since the host owns it and it outlives us', async () => {
    const host = installHost();
    const { unmount } = render(<BrowsePane initialUrl="https://example.com" />);
    await waitFor(() => expect(host.browse.open).toHaveBeenCalled());

    unmount();
    await waitFor(() => expect(host.browse.close).toHaveBeenCalledWith('v1'));
  });
});
