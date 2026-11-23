/**
 * Every dialog sounds as it opens and as it closes (when sound is on), from the
 * popup layer itself, so no dialog has to ask.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../../services/audio/sfxLibrary', () => ({ playSfx }));

import { PopupProvider, usePopup } from '../PopupManager';

const Body: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <button type="button" onClick={onClose}>Done</button>
);

const Harness: React.FC = () => {
  const { showPopup } = usePopup();
  return <button type="button" onClick={() => showPopup({ component: Body, label: 'A dialog' })}>Open</button>;
};

describe('PopupManager sounds', () => {
  beforeEach(() => { playSfx.mockReset(); });

  it('opens with the opening sound and closes with the closing one', () => {
    render(<PopupProvider><Harness /></PopupProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(playSfx.mock.calls).toEqual([['open']]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(playSfx.mock.calls).toEqual([['open'], ['close']]);
  });

  it('closes with the closing sound on Escape too', () => {
    render(<PopupProvider><Harness /></PopupProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(playSfx).toHaveBeenLastCalledWith('close');
  });
});
