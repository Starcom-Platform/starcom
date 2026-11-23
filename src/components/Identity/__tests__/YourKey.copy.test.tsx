/**
 * Export all my work, beside the key it is sealed to (plan item 9.13b,
 * decision G8d): every case, mission, report and item kept here, Private
 * included, in one file only this key can open. Without the key backed up,
 * the copy is lost with it, so that is said first.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import YourKey from '../YourKey';
import nostrService from '../../../services/nostrService';
import { recordKeyBackedUp } from '../../../services/identity/identityNotice';
import { setLanguage } from '../../../i18n/app/i18n';

const makeWorkCopy = vi.hoisted(() => vi.fn());
vi.mock('../../../services/intel/copy/workCopy', () => ({ COPY_FORMAT: 'starcom.copy', makeWorkCopy, openWorkCopy: vi.fn() }));

let clicked: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  nostrService.forgetIdentity();
  makeWorkCopy.mockReset();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:copy'), revokeObjectURL: vi.fn() });
  clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { nostrService.forgetIdentity(); vi.restoreAllMocks(); });

const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Your key' }));
  return screen.findByTestId('your-key');
};

describe('Your key: a copy of your work', () => {
  it('saves one file sealed to this key, and says what it holds and what it left out', async () => {
    nostrService.ensureIdentity('writing a report');
    makeWorkCopy.mockResolvedValue({
      file: { format: 'starcom.copy', version: 1 },
      holds: { case: 3, mission: 1, report: 14, item: 5 },
      leftOut: { fromRelays: 120, sample: 2, unreadable: ['Night loading'] },
    });
    render(<YourKey />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Export all my work' }));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect((clicked.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/^starcom-work-\d{4}-\d{2}-\d{2}\.starcom-copy\.json$/);
    expect((await within(panel).findByTestId('your-work-saved')).textContent).toBe(
      'Saved, sealed to this key: 3 cases, 1 mission, 14 reports and 5 intel items. '
      + 'Left out: 120 reports others published, which stay on their relays; 2 sample records; '
      + '1 protected record whose key this browser no longer holds: "Night loading".',
    );
  });

  it('says it in the language chosen, each count by that language\'s own forms (D-ML, L3)', async () => {
    nostrService.ensureIdentity('writing a report');
    makeWorkCopy.mockResolvedValue({
      file: { format: 'starcom.copy', version: 1 },
      holds: { case: 3, mission: 1, report: 14, item: 5 },
      leftOut: { fromRelays: 21, sample: 0, unreadable: ['Нічне завантаження', 'Міст'] },
    });
    await setLanguage('uk', false);
    try {
      render(<YourKey />);
      fireEvent.click(screen.getByRole('button', { name: 'Ваш ключ' }));
      const panel = await screen.findByTestId('your-key');
      fireEvent.click(within(panel).getByRole('button', { name: 'Експортувати всю мою роботу' }));
      expect((await within(panel).findByTestId('your-work-saved')).textContent).toBe(
        'Збережено, запечатано цим ключем: 3 справи, 1 місія, 14 звітів і 5 розвідувальних елементів. '
        + 'Не ввійшло: 21 звіт, які опублікували інші й які лишаються на своїх релеях; '
        + '2 захищені записи, ключа до яких цей браузер більше не має: «Нічне завантаження» і «Міст».',
      );
    } finally {
      await setLanguage('en', false);
    }
  });

  it('says first that a key never backed up takes the copy with it', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    const panel = await open();
    expect(within(panel).getByTestId('your-work').textContent).toMatch(/This key has not been backed up\. A copy sealed to it is lost with it: back up the key first\./);
  });

  it('says nothing of backing up once the key has been', async () => {
    nostrService.ensureIdentity('writing a report');
    recordKeyBackedUp();
    render(<YourKey />);
    const panel = await open();
    expect(within(panel).getByTestId('your-work').textContent).not.toMatch(/not been backed up/);
  });

  it('says why a copy could not be made', async () => {
    nostrService.ensureIdentity('writing a report');
    makeWorkCopy.mockRejectedValue(new Error('Your signer extension cannot encrypt (NIP-44).'));
    render(<YourKey />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Export all my work' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe('No copy was made: Your signer extension cannot encrypt (NIP-44).');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('opens a copy in the import, as a copy of your own work', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Open a copy of my work' }));
    const dialog = await screen.findByTestId('import-bundle-dialog');
    expect(within(dialog).getByText('Open a copy of your work')).toBeTruthy();
  });

  it('offers nothing to copy while there is no key', async () => {
    render(<YourKey />);
    const panel = await open();
    expect(within(panel).queryByTestId('your-work')).toBeNull();
  });
});
