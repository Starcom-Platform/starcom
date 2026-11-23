/**
 * One ticker (K4). The Globe had a second strip under the main one, its own
 * marquee of energy categories with a Settings button, and for any visitor
 * without an EIA key every item in it read "needs an EIA key". The main ticker
 * now carries the Globe's energy readings, only those the visitor has, and the
 * Globe's Settings beside STATUS.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const marquee = vi.hoisted(() => ({
  data: {
    title: 'Globe',
    signals: [{ id: 'nostr-relays', label: 'NOSTR RELAYS', value: '4/5 UP' }],
    allSignals: [] as unknown[],
    onGlobe: true,
    section: 'situation' as string | null,
  },
}));
vi.mock('../usePrimaryMarqueeData', () => ({ usePrimaryMarqueeData: () => marquee.data }));
const showPopup = vi.fn();
vi.mock('../../Popup/PopupManager', () => ({ usePopup: () => ({ showPopup }) }));
const energy = vi.hoisted(() => ({
  points: [] as Array<{ id: string; label: string; value: string; isLoading: boolean; hasError: boolean }>,
}));
vi.mock('../../HUD/Bars/CyberCommandTopBar/useTopBarDataPoints', () => ({
  useTopBarDataPoints: () => ({
    dataPoints: energy.points,
    preferences: { enabledCategories: {}, version: 3 },
    setCategoryEnabled: vi.fn(),
    error: null,
  }),
}));

import MainMarqueeTopBar from '../MainMarqueeTopBar';

beforeEach(() => {
  showPopup.mockReset();
  marquee.data = { ...marquee.data, onGlobe: true };
  energy.points = [
    { id: 'power-grid', label: 'Power Grid', value: 'Nuclear 64.2 TWh', isLoading: false, hasError: false },
    { id: 'energy-security', label: 'Energy Security', value: 'needs an EIA key', isLoading: false, hasError: false },
  ];
});

describe('the one ticker, on the Globe', () => {
  it('carries the screen\'s readouts and the energy readings the visitor has, and none it lacks', () => {
    const { container } = render(<MainMarqueeTopBar />);
    // A new readout joins when the strip's loop ends, so the strip never jumps mid-scroll.
    fireEvent.animationIteration(container.querySelector('[class*="marqueeContent"]')!);
    expect(screen.getAllByText('NOSTR RELAYS:').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POWER GRID:').length).toBeGreaterThan(0);
    expect(screen.queryByText(/needs an EIA key/)).toBeNull();
    expect(screen.queryByText('ENERGY SECURITY:')).toBeNull();
  });

  it('holds the Globe\'s Settings beside STATUS, which open the Globe settings', () => {
    render(<MainMarqueeTopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Globe settings' }));
    expect(showPopup).toHaveBeenCalledTimes(1);
    expect(showPopup.mock.calls[0][0].label).toBe('Globe settings');
  });

  it('on any other screen, no energy readings and no Globe settings', () => {
    marquee.data = { ...marquee.data, onGlobe: false };
    render(<MainMarqueeTopBar />);
    expect(screen.queryByText('POWER GRID:')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Globe settings' })).toBeNull();
  });

  // On a phone the two words left the ticker about 90 px (K2); there each shows
  // its icon, and keeps its name for a screen reader.
  it('gives each button an icon for a phone, and keeps its name', () => {
    render(<MainMarqueeTopBar />);
    for (const name of ['Globe settings', 'Open system status']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.querySelector('[class*="buttonLabel"]')?.textContent).toMatch(/^(SETTINGS|STATUS)$/);
    }
  });

  // BD10: the screen's name and the rule under the ticker wear its section's tint.
  it("wears the open screen's section tint in its frame", () => {
    marquee.data = { ...marquee.data, section: 'situation' } as typeof marquee.data;
    render(<MainMarqueeTopBar />);
    const bar = screen.getByRole('banner', { name: 'Status Information' });
    expect(bar.getAttribute('data-section')).toBe('situation');
    expect(bar.style.getPropertyValue('--section-tint')).toBe('var(--sc-tint-situation)');
  });
});

