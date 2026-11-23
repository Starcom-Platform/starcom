/**
 * The clock, the mode and the orientation minimap live in the top-left dock.
 *
 * The layout used to place them at its own top-left corner, outside the dock:
 * the left rail's buttons covered the minimap's edge and the top bar covered
 * the clock. In the dock, the work area places them clear of both. TinyGlobe
 * is stubbed: this is about where the corner goes, not about WebGL.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DockHost } from '../../../../Dock/DockHost';
import { VisualizationModeProvider } from '../../../../../context/VisualizationModeContext';
import CyberCommandTopLeft from '../CyberCommandTopLeft';

vi.mock('../../../../TinyGlobe/TinyGlobe', () => ({ default: () => <div data-testid="tiny-globe-stub" /> }));

describe('CyberCommandTopLeft', () => {
  it('docks the clock, the mode and the minimap in the top-left corner', () => {
    render(
      <DockHost>
        <VisualizationModeProvider>
          <CyberCommandTopLeft />
        </VisualizationModeProvider>
      </DockHost>,
    );
    const corner = document.querySelector('[data-dock="top-left"]');
    const orientation = document.querySelector('[data-testid="globe-orientation"]');
    expect(orientation?.textContent).toMatch(/\d{2}:\d{2}:\d{2}Z/);
    // The view and the layer by the names a person reads, not the internal ids: the view's old name, shown here
    // as the id in capitals, was a US combatant command's (renamed Intel Watch by the operator, 7 Nov 2026).
    expect(orientation?.textContent).toContain('Intel Watch / Intel Reports');
    expect(orientation?.textContent).not.toMatch(/cyber ?command/i);
    expect(corner?.contains(orientation)).toBe(true);
  });
});
