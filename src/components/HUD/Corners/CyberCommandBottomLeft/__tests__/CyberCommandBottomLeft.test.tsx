/**
 * The temporal badge (LIVE or SCRUB) lives in the bottom-left dock.
 *
 * The layout used to place it by percentage, outside the dock, so the dock's
 * own items could land on it, and did: the camera controls covered it once
 * the work area cleared the left rail. In the dock, the corner arranges both.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DockHost } from '../../../../Dock/DockHost';
import { TemporalProvider } from '../../../../../context/TemporalContext';
import CyberCommandBottomLeft from '../CyberCommandBottomLeft';

describe('CyberCommandBottomLeft', () => {
  it('docks its badge in the bottom-left corner', () => {
    render(
      <DockHost>
        <TemporalProvider>
          <CyberCommandBottomLeft />
        </TemporalProvider>
      </DockHost>,
    );
    const corner = document.querySelector('[data-dock="bottom-left"]');
    const badge = document.querySelector('[data-testid="globe-temporal-position"]');
    expect(badge?.textContent).toMatch(/LIVE|SCRUB/);
    expect(corner?.contains(badge)).toBe(true);
  });

  it('renders nothing, and takes no dock slot, without a temporal context', () => {
    render(<DockHost><CyberCommandBottomLeft /></DockHost>);
    expect(document.querySelector('[data-testid="globe-temporal-position"]')).toBeNull();
    expect(document.querySelector('[data-dock="bottom-left"]')?.children.length).toBe(0);
  });
});
