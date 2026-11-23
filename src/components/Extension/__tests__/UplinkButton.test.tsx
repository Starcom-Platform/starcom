/**
 * Starcom Uplink in the header (decision D-EX, E0): a dot that says connected, and a panel that says
 * what Uplink does now, or what it is when it is not installed, never claiming a feature not built.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BRIDGE_CHANNEL, CAPABILITY_MEANS, type ToUplink } from '../../../extension/protocol';
import { resetUplinkForTests } from '../../../extension/useStarcomUplink';
import UplinkButton from '../UplinkButton';

function bridge(installed: boolean) {
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
    const { body, direction } = message as { body: ToUplink; direction: string };
    if (direction !== 'to-uplink' || !installed) return;
    const reply = body.kind === 'hello'
      ? { kind: 'hello', id: body.id, extensionVersion: '0.1.0', protocol: 1, capabilities: [{ id: 'activity.read', ready: true }, { id: 'permissions.status', ready: true }] }
      : { kind: 'answer', id: body.id, ok: true, result: { granted: ['https://example.com/*'], allSites: false } };
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: reply }, origin: window.location.origin, source: window,
    })));
  });
}

afterEach(() => { resetUplinkForTests(); vi.restoreAllMocks(); });

describe('Uplink in the header', () => {
  it('says connected, and lists what it does now and which sites it may reach', async () => {
    bridge(true);
    render(<UplinkButton />);
    await waitFor(() => expect(screen.getByTestId('uplink-button').getAttribute('aria-label')).toBe('Starcom Uplink: connected'));
    fireEvent.click(screen.getByTestId('uplink-button'));
    const panel = screen.getByTestId('uplink-panel');
    expect(panel.textContent).toContain('Version 0.1.0 is connected');
    expect(panel.textContent).toContain(CAPABILITY_MEANS['activity.read']);
    await waitFor(() => expect(panel.textContent).toContain('https://example.com'));
  });

  it('says not installed, what Uplink is and when it comes, and offers no store link before it is listed', async () => {
    bridge(false);
    render(<UplinkButton />);
    await waitFor(() => expect(screen.getByTestId('uplink-button').getAttribute('aria-label')).toBe('Starcom Uplink: not installed'), { timeout: 2000 });
    fireEvent.click(screen.getByTestId('uplink-button'));
    const panel = screen.getByTestId('uplink-panel');
    expect(panel.textContent).toContain('It is not installed in this browser.');
    expect(panel.textContent).toContain('asks before it touches any site');
    expect(panel.textContent).toContain('goes to the Chrome Web Store in November');
    expect(panel.querySelector('a')).toBeNull();
  });
});
