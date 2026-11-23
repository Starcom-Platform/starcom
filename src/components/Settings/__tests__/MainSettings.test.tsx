/**
 * Settings, the app's own (asked for 2026-10-05): opened from anywhere as a named
 * dialog, with Sound as its first section.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { PopupProvider } from '../../Popup/PopupManager';
import MainSettingsRoot from '../MainSettingsRoot';
import { MainSettings } from '../MainSettings';
import { openMainSettings } from '../settingsEvents';
import { getSoundSettings, resetSoundSettingsForTests, setSoundSettings } from '../../../services/audio/soundSettings';
import { clearSfx } from '../../../services/audio/sfxLibrary';

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
    clearSfx();
  });
  afterEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  it('opens as a dialog named Settings when anything asks, and closes on its button', () => {
    render(<PopupProvider><MainSettingsRoot /></PopupProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => openMainSettings());
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('heading', { name: 'Settings' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape, as every dialog of the popup layer does', () => {
    render(<PopupProvider><MainSettingsRoot /></PopupProvider>);
    act(() => openMainSettings());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('Sound', () => {
    const renderSettings = () => render(<MainSettings onClose={() => {}} />);

    it('starts with sound off, the volume and the kinds waiting on it', () => {
      renderSettings();
      expect((screen.getByRole('switch', { name: /^Sound/ }) as HTMLInputElement).checked).toBe(false);
      expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByRole('group', { name: 'What plays' }) as HTMLFieldSetElement).disabled).toBe(true);
    });

    it('turns sound on, and with it the volume and the kinds', () => {
      renderSettings();
      fireEvent.click(screen.getByRole('switch', { name: /^Sound/ }));
      expect(getSoundSettings().enabled).toBe(true);
      expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).disabled).toBe(false);
      expect((screen.getByRole('group', { name: 'What plays' }) as HTMLFieldSetElement).disabled).toBe(false);
    });

    it('sets the volume, and says it as a percentage', () => {
      setSoundSettings({ enabled: true });
      renderSettings();
      fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '35' } });
      expect(getSoundSettings().volume).toBeCloseTo(0.35);
      expect(screen.getByText('35%')).toBeTruthy();
    });

    it('keeps or silences each kind of sound on its own switch', () => {
      setSoundSettings({ enabled: true });
      renderSettings();
      const kinds = within(screen.getByRole('group', { name: 'What plays' })).getAllByRole('switch');
      expect(kinds.map((k) => k.closest('label')!.textContent)).toEqual([
        expect.stringContaining('Interface'),
        expect.stringContaining('Pointer over a control'),
        expect.stringContaining('Globe'),
        expect.stringContaining('Alerts and messages'),
      ]);
      fireEvent.click(kinds[1]);
      expect(getSoundSettings().categories.hover).toBe(false);
      expect(getSoundSettings().categories.interface).toBe(true);
      fireEvent.click(kinds[1]);
      expect(getSoundSettings().categories.hover).toBe(true);
    });

    it('lets its own switches play their own sounds, outside the interface layer', () => {
      renderSettings();
      for (const control of screen.getAllByRole('switch')) {
        expect(control.getAttribute('data-sfx')).toBe('none');
      }
    });
  });
});
