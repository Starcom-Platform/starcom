/**
 * This corner widget used to be pure display (pointer-events: none) — the only
 * way to reach the Layers panel was the hidden Cmd/Ctrl+K shortcut. It's now a
 * real button that opens the panel.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CyberCommandBottomRight from '../CyberCommandBottomRight';
import { DockHost } from '../../../../Dock/DockHost';

vi.mock('../../../../Globe/Hooks/useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [
      { id: 'IntelReports', isActive: true },
      { id: 'CyberThreats', isActive: false }
    ],
    pinnedCount: 2
  })
}));

describe('CyberCommandBottomRight', () => {
  it('renders the active layer count and pinned badge', () => {
    render(<CyberCommandBottomRight />);
    expect(screen.getByText(/1 LAYER/)).toBeInTheDocument();
    expect(screen.getByText('+2 PIN')).toBeInTheDocument();
  });

  it('calls onOpenLayers when clicked', () => {
    const onOpenLayers = vi.fn();
    render(<CyberCommandBottomRight onOpenLayers={onOpenLayers} />);

    fireEvent.click(screen.getByRole('button', { name: /Open Globe Layers panel/i }));

    expect(onOpenLayers).toHaveBeenCalledTimes(1);
  });

  it('docks the button in the bottom-right corner, where only the button takes the pointer', () => {
    // It sat in an invisible corner box a fifth of the layout in each direction,
    // which took clicks and drags meant for the globe wherever the button was not.
    render(<DockHost><CyberCommandBottomRight /></DockHost>);
    const corner = document.querySelector('[data-dock="bottom-right"]');
    expect(corner?.contains(screen.getByRole('button', { name: /Open Globe Layers panel/i }))).toBe(true);
  });
});
