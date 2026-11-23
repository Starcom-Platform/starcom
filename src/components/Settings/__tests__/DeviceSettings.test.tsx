/**
 * Settings > This device (decision D-CS): one confirmation in place, then everything Starcom keeps in this browser is
 * cleared and the page reloads; when the browser cannot list its databases, it says how to finish instead.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DeviceSettings from '../DeviceSettings';

const done = { databases: 3, databasesListed: true, caches: 1, workers: 1 };

describe('DeviceSettings', () => {
  it('asks once, warns that the key goes too, then clears and reloads', async () => {
    const clear = vi.fn(async () => done);
    const reload = vi.fn();
    render(<DeviceSettings clear={clear} reload={reload} />);
    fireEvent.click(screen.getByTestId('clear-device'));
    expect(screen.getByRole('alert').textContent).toContain('your signing key too');
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('clear-device-confirm'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps everything when the person changes their mind', () => {
    const clear = vi.fn(async () => done);
    render(<DeviceSettings clear={clear} reload={vi.fn()} />);
    fireEvent.click(screen.getByTestId('clear-device'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByTestId('clear-device')).toBeTruthy();
    expect(clear).not.toHaveBeenCalled();
  });

  it("says how to finish when the browser cannot list its databases", async () => {
    const reload = vi.fn();
    render(<DeviceSettings clear={async () => ({ ...done, databasesListed: false })} reload={reload} />);
    fireEvent.click(screen.getByTestId('clear-device'));
    fireEvent.click(screen.getByTestId('clear-device-confirm'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain("clear this site's data"));
    expect(reload).not.toHaveBeenCalled();
  });
});
