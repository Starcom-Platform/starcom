/**
 * The forecast strip in Earth Weather's key (decision D-W, WX12): now, +6 h,
 * +12 h, +1 d, +3 d, +7 d, each moving the one shared time cursor (D-E).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemporalProvider, useTemporalState } from '../../../context/TemporalContext';
import { ForecastStrip } from '../ForecastStrip';

const HOUR = 3_600_000;
let cursor: { currentTime: number; isLive: boolean } = { currentTime: 0, isLive: true };
const Probe: React.FC = () => {
  const { currentTime, isLive } = useTemporalState();
  cursor = { currentTime, isLive };
  return null;
};
const mount = () => render(<TemporalProvider><ForecastStrip /><Probe /></TemporalProvider>);
const button = (label: string) => screen.getByRole('button', { name: label });

beforeEach(() => localStorage.clear());

describe('ForecastStrip', () => {
  it('offers now and the forecast hours WX12 names, now chosen while live', () => {
    mount();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Now', '+6 h', '+12 h', '+1 d', '+3 d', '+7 d']);
    expect(button('Now')).toHaveAttribute('aria-pressed', 'true');
    expect(cursor.isLive).toBe(true);
  });

  it('moves the shared cursor that many hours from now, and says the moment in UTC', () => {
    mount();
    const before = Date.now();
    expect(button('+1 d').getAttribute('title')).toMatch(/\d{2}:\d{2}Z, as forecast$/);
    fireEvent.click(button('+1 d'));
    expect(cursor.isLive).toBe(false);
    expect(cursor.currentTime - before).toBeGreaterThanOrEqual(24 * HOUR - 2000);
    expect(cursor.currentTime - before).toBeLessThanOrEqual(24 * HOUR + 2000);
    expect(button('+1 d')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Now')).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves each step its own hours ahead: 6, 12, 24, 72 and 168', () => {
    mount();
    for (const [label, hours] of [['+6 h', 6], ['+12 h', 12], ['+1 d', 24], ['+3 d', 72], ['+7 d', 168]] as const) {
      const before = Date.now();
      fireEvent.click(button(label));
      expect(Math.round((cursor.currentTime - before) / HOUR)).toBe(hours);
    }
  });

  it('chooses Now only while live, not for a cursor paused at this moment', () => {
    localStorage.setItem('starcom.temporalCursor.v1', JSON.stringify({ at: Date.now(), savedAt: Date.now() }));
    mount();
    expect(cursor.isLive).toBe(false);
    expect(button('Now')).toHaveAttribute('aria-pressed', 'false');
    localStorage.clear();
  });

  it('gives a step it no longer chooses the same border as the rest', () => {
    mount();
    fireEvent.click(button('+6 h'));
    // Found in the running app: Now kept a default border once unchosen.
    expect(button('Now').style.borderColor).toBe(button('+12 h').style.borderColor);
    expect(button('Now').style.borderColor).toBe('var(--sc-divider)');
  });

  it('returns to live from Now', () => {
    mount();
    fireEvent.click(button('+7 d'));
    expect(cursor.isLive).toBe(false);
    fireEvent.click(button('Now'));
    expect(cursor.isLive).toBe(true);
    expect(button('Now')).toHaveAttribute('aria-pressed', 'true');
  });

  it('chooses no step for a moment the strip did not set, a past one or one between steps', () => {
    localStorage.setItem('starcom.temporalCursor.v1', JSON.stringify({ at: Date.now() - 48 * HOUR, savedAt: Date.now() }));
    mount();
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([]);
    localStorage.clear();
  });

  it('chooses a step only while the cursor is within 45 minutes of its hour', () => {
    localStorage.setItem('starcom.temporalCursor.v1', JSON.stringify({ at: Date.now() + 6 * HOUR + 50 * 60_000, savedAt: Date.now() }));
    mount();
    expect(button('+6 h')).toHaveAttribute('aria-pressed', 'false');
    localStorage.clear();
  });
});
