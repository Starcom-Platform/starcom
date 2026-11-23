/**
 * The hint on how to move the globe (K16, K2).
 *
 * It sat at the globe's top centre, which on a phone is where the clock is, and
 * told a phone to right-click. It docks with the corner notes now, and on a phone
 * says only what a finger can do.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DockHost } from '../../Dock/DockHost';
import { GlobeNavHint } from '../GlobeNavHint';

const onPhone = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches, media: '', addEventListener: () => {}, removeEventListener: () => {},
})));

afterEach(() => vi.unstubAllGlobals());

describe('GlobeNavHint', () => {
  // Under the minimap, at the HUD's tier: in the top-right dock it drew over a dialog.
  it('docks in the top-left corner, under the minimap', () => {
    onPhone(false);
    render(<DockHost><GlobeNavHint visible /></DockHost>);
    const slot = screen.getByTestId('globe-nav-hint').closest('[data-dock-slot]');
    expect(slot?.getAttribute('data-dock-slot')).toBe('globeNavHint');
    expect(slot?.parentElement?.getAttribute('data-dock')).toBe('top-left');
  });

  it('names the mouse on a wider window', () => {
    onPhone(false);
    render(<GlobeNavHint visible />);
    expect(screen.getByTestId('globe-nav-hint').textContent).toBe('Drag to rotate • Scroll to zoom • Right-click for actions');
  });

  it('names only what a finger can do on a phone', () => {
    onPhone(true);
    render(<GlobeNavHint visible />);
    expect(screen.getByTestId('globe-nav-hint').textContent).toBe('Drag to rotate • Pinch to zoom');
  });

  it('is gone when not wanted', () => {
    onPhone(false);
    const { container } = render(<GlobeNavHint visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
