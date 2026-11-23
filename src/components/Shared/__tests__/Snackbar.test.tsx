/**
 * The snackbar NetRunner shows when a report goes out (K16).
 *
 * It sat fixed at the bottom centre, 32px up, on the shell's bottom bar, in
 * colours of its own. What is checked here is that it docks with the other
 * corner notes, and that its kind is said in words and tokens, not by colour alone.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockHost } from '../../Dock/DockHost';
import Snackbar from '../Snackbar';

describe('Snackbar', () => {
  it('docks in the bottom-right corner rather than over the bottom bar', () => {
    render(<DockHost><Snackbar open message="Report published" onClose={() => {}} /></DockHost>);
    const slot = screen.getByRole('status').closest('[data-dock-slot]');
    expect(slot?.getAttribute('data-dock-slot')).toBe('snackbar');
    expect(slot?.parentElement?.getAttribute('data-dock')).toBe('bottom-right');
  });

  it('places itself by no fixed position of its own', () => {
    render(<Snackbar open message="Report published" onClose={() => {}} />);
    const box = screen.getByRole('status');
    expect(box.style.position).toBe('');
    expect(box.style.bottom).toBe('');
    expect(box.style.zIndex).toBe('');
  });

  it('says its kind in a word as well as a colour', () => {
    render(<Snackbar open type="error" message="Not sent" onClose={() => {}} />);
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('error');
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });

  it('closes, and runs its action once', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(<Snackbar open message="Report published" onClose={onClose} actionLabel="View" onAction={onAction} />);
    fireEvent.click(screen.getByTestId('snackbar-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('snackbar-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
