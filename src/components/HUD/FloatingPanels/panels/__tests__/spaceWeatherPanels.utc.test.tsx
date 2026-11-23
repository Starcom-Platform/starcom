/**
 * The aurora and solar flare panels give NOAA's times in UTC, with the date and
 * the local time on hover (decision D-E, settled 2026-09-14 for step 9). They gave
 * the browser's local time of day, so a flare from yesterday read as today's.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { localTimeTitle } from '../../../../../utils/utcTime';

const { fetchLiveKpSnapshot, fetchData } = vi.hoisted(() => ({ fetchLiveKpSnapshot: vi.fn(), fetchData: vi.fn() }));
vi.mock('../../../../../services/SpaceWeatherLive', () => ({ fetchLiveKpSnapshot }));
vi.mock('../../../../../services/data-management/providers/NOAADataProvider', () => ({
  NOAADataProvider: class { fetchData = fetchData; },
}));
vi.mock('../../../../Popup/PopupManager', () => ({ usePopup: () => ({ showPopup: () => {} }) }));
vi.mock('../../../Popups/NOAAStatusPopup', () => ({ default: () => null }));

import AuroraPanel from '../AuroraPanel';
import SolarFlarePanel from '../SolarFlarePanel';

const MINUTE = 60_000;

describe('AuroraPanel: when NOAA last updated', () => {
  it('gives it in UTC, with the date and the local time on hover', async () => {
    const updated = Date.UTC(2026, 8, 13, 19, 33);
    fetchLiveKpSnapshot.mockResolvedValue({ snapshot: { kp: 3, timestamp: new Date(updated).toISOString() }, quality: 'live' });

    render(<AuroraPanel />);

    expect(await screen.findByText('13 Sep 19:33Z')).toHaveAttribute('title', localTimeTitle(updated));
  });
});

describe('SolarFlarePanel: when the flare peaked, and when NOAA last updated', () => {
  it('gives both in UTC, with the date and the local time on hover', async () => {
    const peak = Date.UTC(2026, 8, 13, 19, 33);
    const updated = peak + 17 * MINUTE;
    fetchData.mockResolvedValue({
      class_type: 'M1.2', location: 'N10E20', status: 'ended',
      begin_time: new Date(peak - 10 * MINUTE).toISOString(), max_time: new Date(peak).toISOString(),
      end_time: new Date(peak + 20 * MINUTE).toISOString(), time_tag: new Date(updated).toISOString(),
    });

    render(<SolarFlarePanel />);

    expect(await screen.findByText('13 Sep 19:33Z')).toHaveAttribute('title', localTimeTitle(peak));
    expect(screen.getByText('13 Sep 19:50Z')).toHaveAttribute('title', localTimeTitle(updated));
  });

  it('shows a dash when NOAA gives no peak time', async () => {
    fetchData.mockResolvedValue({ class_type: 'C3.1', location: null, status: 'ongoing', time_tag: new Date(Date.UTC(2026, 8, 13, 19, 50)).toISOString() });

    render(<SolarFlarePanel />);

    const label = await screen.findByText('Peak Time');
    expect(label.nextElementSibling).toHaveTextContent(/^—$/);
  });
});
