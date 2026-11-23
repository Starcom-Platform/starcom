/**
 * One notification is listed once. The event system delivered each notification to
 * this component twice: through its subscription, and again through a window event
 * the component also listened for.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import NotificationSystem from '../NotificationSystem';
import RealTimeEventSystem from '../../../services/realTimeEventSystem';

describe('NotificationSystem: one notification', () => {
  it('is listed once', async () => {
    render(<NotificationSystem />);
    act(() => {
      RealTimeEventSystem.getInstance().emit({
        type: 'UI_SHOW_NOTIFICATION',
        payload: { title: 'Team Member Joined', message: 'Aisha Knight joined Night Watch', type: 'success', duration: 60_000 },
        source: 'system',
        timestamp: new Date(),
        priority: 'normal',
      });
    });

    await screen.findByText('Team Member Joined');
    // Give a second delivery every chance to arrive before counting.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
    expect(screen.getAllByText('Team Member Joined')).toHaveLength(1);
  });
});
