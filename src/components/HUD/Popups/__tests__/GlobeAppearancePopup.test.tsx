import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GlobeAppearancePopup from '../GlobeAppearancePopup';
import {
  getGlobeQuality, reportFrameWindow, resetGlobeQualityForTests,
} from '../../../../services/globe/globeQuality';

const radio = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const status = () => screen.getByTestId('globe-quality-status').textContent;

describe('GlobeAppearancePopup — quality', () => {
  beforeEach(() => {
    localStorage.clear();
    resetGlobeQualityForTests();
  });

  it('starts on Auto and says what Auto is doing, as it changes', () => {
    render(<GlobeAppearancePopup onClose={() => {}} />);
    expect(radio('globe-quality-auto').checked).toBe(true);
    expect(status()).toMatch(/^Full detail\./);

    act(() => {
      reportFrameWindow({ medianMs: 40, frames: 60, at: 2000 }, 2);
      reportFrameWindow({ medianMs: 40, frames: 60, at: 4000 }, 2);
    });
    expect(status()).toBe('Drawing softer edges: frames took 40 ms each, fewer than 40 a second.');
  });

  it('pins the choice a viewer makes, and says what it means', () => {
    render(<GlobeAppearancePopup onClose={() => {}} />);
    fireEvent.click(radio('globe-quality-low'));

    expect(getGlobeQuality().setting).toBe('low');
    expect(radio('globe-quality-low').checked).toBe(true);
    expect(status()).toMatch(/never reduced/);
  });
});
