/**
 * The header's sound button: off until pressed (decision N12), and it shows the
 * state it is in.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoundToggle } from '../SoundToggle';
import { getSoundSettings, resetSoundSettingsForTests } from '../../../services/audio/soundSettings';
import { clearSfx } from '../../../services/audio/sfxLibrary';

describe('SoundToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
    clearSfx();
  });
  afterEach(() => {
    localStorage.clear();
    resetSoundSettingsForTests();
  });

  it('starts off, showing a struck-out speaker', () => {
    render(<SoundToggle />);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('title')).toBe('Sound off. Press to turn it on.');
    expect(button.querySelector('svg')!.getAttribute('data-symbol')).toBe('action:soundOff');
  });

  it('turns every sound on and off, and remembers it in this browser', () => {
    render(<SoundToggle />);
    const button = screen.getByRole('button', { name: 'Sound' });
    fireEvent.click(button);
    expect(getSoundSettings().enabled).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('svg')!.getAttribute('data-symbol')).toBe('action:soundOn');
    expect(JSON.parse(localStorage.getItem('starcom.sound')!).enabled).toBe(true);
    fireEvent.click(button);
    expect(getSoundSettings().enabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it("plays its own sound, so the interface's click stays out of it", () => {
    render(<SoundToggle />);
    expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('data-sfx')).toBe('none');
  });
});
