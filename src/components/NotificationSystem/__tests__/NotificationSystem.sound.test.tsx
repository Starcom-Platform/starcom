/**
 * A notice sounds by its kind as it shows, when sound is on: work done, a
 * warning, an error. An info notice stays quiet.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const playSfx = vi.hoisted(() => vi.fn());
vi.mock('../../../services/audio/sfxLibrary', () => ({ playSfx }));

import NotificationSystem from '../NotificationSystem';
import RealTimeEventSystem from '../../../services/realTimeEventSystem';

const notify = (title: string, type: 'info' | 'success' | 'warning' | 'error') => {
  act(() => {
    RealTimeEventSystem.getInstance().emit({
      type: 'UI_SHOW_NOTIFICATION',
      payload: { title, message: `${type} notice`, type, duration: 60_000 },
      source: 'system',
      timestamp: new Date(),
      priority: 'normal',
    });
  });
};

describe('NotificationSystem sounds', () => {
  beforeEach(() => { playSfx.mockReset(); });

  it('sounds a notice by its kind, and an info notice not at all', async () => {
    render(<NotificationSystem />);
    notify('Saved', 'success');
    await screen.findByText('Saved');
    notify('Relay slow', 'warning');
    await screen.findByText('Relay slow');
    notify('Publish failed', 'error');
    await screen.findByText('Publish failed');
    notify('Note', 'info');
    await screen.findByText('Note');
    expect(playSfx.mock.calls).toEqual([['success'], ['warning'], ['error']]);
  });

  // A quake's ping (D-EQ, EQ20): the alert in place of a warning's sound, and a click opens the quake.
  it("sounds a notice's own sound where it names one, and a click on it runs what it opens", async () => {
    render(<NotificationSystem />);
    const onOpen = vi.fn();
    act(() => {
      RealTimeEventSystem.getInstance().emit({
        type: 'UI_SHOW_NOTIFICATION',
        payload: { title: 'New quake', message: 'M6.4, 80 km SW of Lata', type: 'warning', duration: 60_000, sound: 'alert', glyph: 'layer:EcologicalDisasters', onOpen },
        source: 'system',
        timestamp: new Date(),
        priority: 'high',
      });
    });
    const shown = await screen.findByText('New quake');
    expect(playSfx.mock.calls).toEqual([['alert']]);
    act(() => { shown.click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('New quake')).toBeNull();
  });
});
