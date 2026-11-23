/**
 * A notification gives its time in UTC, with the date and the local time on hover
 * (decision D-E, settled 2026-09-14 for step 9). It gave the browser's local time
 * of day, so a notification from another day read as today's.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import NotificationSystem from '../NotificationSystem';
import RealTimeEventSystem from '../../../services/realTimeEventSystem';
import { localTimeTitle } from '../../../utils/utcTime';

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationSystem: when a notification arrived', () => {
  it('gives it in UTC, with the date and the local time on hover', async () => {
    const arrived = Date.UTC(2026, 8, 14, 19, 33);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(arrived);

    render(<NotificationSystem />);
    act(() => {
      RealTimeEventSystem.getInstance().emit({
        type: 'UI_SHOW_NOTIFICATION',
        payload: { title: 'Relay down', message: 'A relay stopped answering.', type: 'warning', duration: 60_000 },
        source: 'system',
        timestamp: new Date(),
        priority: 'normal',
      });
    });

    expect(await screen.findByText('14 Sep 19:33Z')).toHaveAttribute('title', localTimeTitle(arrived));
  });
});
