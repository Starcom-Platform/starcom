/**
 * The strip under the header shows the screen's title and what bears on that screen,
 * and opens the status panel that holds the rest (decision D-F, step 3.4).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const marquee = vi.hoisted(() => ({
  data: {
    title: 'Cases',
    signals: [] as Array<{ id: string; label: string; value: string }>,
    allSignals: [
      { id: 'timestamp', label: 'MISSION TIME', value: '17:04:12Z' },
      { id: 'network-telemetry', label: 'CHAIN TELEMETRY', value: '138 TPS | BLK 486' },
      { id: 'nostr-relays', label: 'NOSTR RELAYS', value: '4/5 UP' },
    ],
  },
}));
vi.mock('../usePrimaryMarqueeData', () => ({
  usePrimaryMarqueeData: () => marquee.data,
}));

const showPopup = vi.fn();
vi.mock('../../Popup/PopupManager', () => ({ usePopup: () => ({ showPopup }) }));

import MainMarqueeTopBar from '../MainMarqueeTopBar';

beforeEach(() => {
  showPopup.mockReset();
  marquee.data = { ...marquee.data, title: 'Cases', signals: [] };
});

describe('MainMarqueeTopBar', () => {
  it('names the screen', () => {
    render(<MainMarqueeTopBar />);
    expect(screen.getByRole('heading', { name: 'Cases' })).toBeTruthy();
  });

  it('shows the readouts the screen was given, and no others', () => {
    marquee.data = {
      ...marquee.data,
      title: 'Globe',
      signals: [{ id: 'nostr-relays', label: 'NOSTR RELAYS', value: '4/5 UP' }],
    };
    render(<MainMarqueeTopBar />);

    expect(screen.getAllByText('NOSTR RELAYS:').length).toBeGreaterThan(0);
    expect(screen.queryByText('CHAIN TELEMETRY:')).toBeNull();
  });

  it('shows no readouts at all on a screen that has none', () => {
    render(<MainMarqueeTopBar />);
    expect(screen.queryByText('MISSION TIME:')).toBeNull();
    expect(screen.queryByText('CHAIN TELEMETRY:')).toBeNull();
  });

  it('opens the status panel, which holds every readout', () => {
    render(<MainMarqueeTopBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Open system status' }));

    expect(showPopup).toHaveBeenCalledTimes(1);
    const asked = showPopup.mock.calls[0][0];
    expect(asked.label).toBe('System status');
    expect(typeof asked.component).toBe('function');
  });
});
