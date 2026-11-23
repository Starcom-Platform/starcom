/**
 * Settings > Language > translation in the cloud (decision D-ML, T3): a key kept, said plainly where it
 * is kept and where it goes, with how to keep it useless elsewhere; and removed.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CloudKeySettings from '../CloudKeySettings';
import { cloudKey, keepCloudKey } from '../../../services/translation/cloudTranslator';

afterEach(() => keepCloudKey(null));

describe('CloudKeySettings', () => {
  it('keeps a Google key in this browser, says where it goes, and removes it', () => {
    render(<CloudKeySettings />);
    expect(screen.getByTestId('cloud-key-settings').textContent).toContain('No key is kept. Translation stays on this device.');
    fireEvent.change(screen.getByTestId('cloud-provider'), { target: { value: 'google' } });
    expect(screen.getByTestId('cloud-key-settings').textContent).toContain('Restrict the key to starcom.app in Google Cloud');
    fireEvent.change(screen.getByTestId('cloud-key'), { target: { value: 'AIza-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the key' }));
    expect(cloudKey()).toEqual({ provider: 'google', key: 'AIza-test' });
    expect(screen.getByTestId('cloud-key-kept').textContent).toBe('Kept in this browser, on this device, and sent only to Google Cloud Translation.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the key' }));
    expect(cloudKey()).toBeNull();
  });
});
