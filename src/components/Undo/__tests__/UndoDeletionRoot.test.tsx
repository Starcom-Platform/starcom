/**
 * The Undo bar (plan item 0.6, stories S14 and S23): one for the whole app,
 * so every delete path offers the same ten seconds to take it back.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UndoDeletionRoot from '../UndoDeletionRoot';
import { holdDeletion, UNDO_WINDOW_MS } from '../../../services/intel/deletionHolding';

afterEach(() => { vi.useRealTimers(); });

describe('UndoDeletionRoot', () => {
  it('shows nothing while nothing is held', () => {
    render(<UndoDeletionRoot />);
    expect(screen.queryByTestId('undo-deletions')).toBeNull();
  });

  it('names what was deleted, and Undo puts it back', async () => {
    render(<UndoDeletionRoot />);
    const undo = vi.fn(async () => {});
    const finalize = vi.fn();
    act(() => { holdDeletion({ label: 'Case "Newark food banks"', undo, finalize }); });

    expect(await screen.findByText('Case "Newark food banks" deleted.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/Newark food banks/)).toBeNull());
    expect(finalize).not.toHaveBeenCalled();
  });

  it('counts down the real time left, and goes when the deletion is final', () => {
    vi.useFakeTimers();
    render(<UndoDeletionRoot />);
    const finalize = vi.fn();
    act(() => { holdDeletion({ label: 'Mission "Paterson"', undo: async () => {}, finalize }); });

    expect(screen.getByText('10 s')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(screen.getByText('6 s')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(UNDO_WINDOW_MS - 4_000); });
    expect(screen.queryByText(/Mission "Paterson" deleted/)).toBeNull();
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it('says so when Undo fails, instead of vanishing as if it worked', async () => {
    render(<UndoDeletionRoot />);
    act(() => {
      holdDeletion({ label: 'Report "Bridge"', undo: async () => { throw new Error('storage is full'); }, finalize: () => {} });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Report "Bridge" could not be brought back: storage is full/);
  });

  // A dialog's focus trap keeps Tab away from the bar, so the keyboard has its own way back.
  it('undoes the newest deletion with Ctrl+Z, but not while typing in a field', async () => {
    render(<><input aria-label="Notes" /><UndoDeletionRoot /></>);
    const first = vi.fn(async () => {});
    const newest = vi.fn(async () => {});
    act(() => {
      holdDeletion({ label: 'Case "First"', undo: first, finalize: () => {} });
      holdDeletion({ label: 'Case "Newest"', undo: newest, finalize: () => {} });
    });

    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'z', ctrlKey: true });
    expect(newest).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(newest).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
  });

  // Found running the app: the count's clock only ticks while something is
  // held, so the first frame of a new bar showed the time since the last one.
  it('shows the real time left from the first frame, not a clock left over from earlier', () => {
    vi.useFakeTimers();
    render(<UndoDeletionRoot />);
    act(() => { vi.advanceTimersByTime(10_000); });

    const shown: string[] = [];
    const watch = new MutationObserver(() => {});
    watch.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    act(() => { holdDeletion({ label: 'Case "Stale clock"', undo: async () => {}, finalize: () => {} }); });
    for (const record of watch.takeRecords()) {
      if (record.type === 'characterData' && record.oldValue) shown.push(record.oldValue);
    }
    watch.disconnect();

    expect(shown).not.toContain('20');
    expect(screen.getByText('10 s')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(UNDO_WINDOW_MS); });
  });

  // Found running the app: over the mission dialog, the bar covered the
  // dialog's own buttons for ten seconds.
  it("moves to the top while a dialog is open, clear of the dialog's buttons, and sits at the foot otherwise", async () => {
    const { rerender } = render(<><div role="dialog" aria-modal="true">A dialog</div><UndoDeletionRoot /></>);
    act(() => { holdDeletion({ label: 'Objective "Placement"', undo: async () => {}, finalize: () => {} }); });
    expect(screen.getByTestId('undo-deletions').dataset.placement).toBe('top');

    rerender(<><UndoDeletionRoot /></>);
    await waitFor(() => expect(screen.getByTestId('undo-deletions').dataset.placement).toBe('bottom'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  });
});
