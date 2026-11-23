import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { resetWarConflictOverlayForTests } from '../../../../../services/globe/warConflictOverlay';
import CyberCommandRightSideRail from '../CyberCommandRightSideRail';
import NOAAStatusPopup from '../../../Popups/NOAAStatusPopup';
import GeopoliticalLayersPopup from '../../../Popups/GeopoliticalLayersPopup';
import { vi } from 'vitest';

const setPrimaryMode = vi.fn();
const showPopup = vi.fn();
const toggleNationalTerritoriesOverlay = vi.fn();
const setNationalTerritoriesOverlayEnabled = vi.fn();
const toggleCursorTrailIndicator = vi.fn();
const toggleResourceZonesOverlay = vi.fn();
const toggleDiplomaticEventsOverlay = vi.fn();
const toggleConflictZonesOverlay = vi.fn();
const addActiveFeature = vi.fn();

vi.mock('../../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setPrimaryMode
  })
}));

vi.mock('../../../../../hooks/useVisualizationOverlay', () => ({
  useVisualizationOverlay: () => ({
    nationalTerritoriesOverlayEnabled: true,
    toggleNationalTerritoriesOverlay,
    setNationalTerritoriesOverlayEnabled,
    cursorTrailIndicatorEnabled: true,
    toggleCursorTrailIndicator,
    resourceZonesOverlayEnabled: false,
    toggleResourceZonesOverlay,
    diplomaticEventsOverlayEnabled: false,
    toggleDiplomaticEventsOverlay,
    conflictZonesOverlayEnabled: false,
    toggleConflictZonesOverlay
  })
}));

vi.mock('../../../../Popup/PopupManager', () => ({
  usePopup: () => ({ showPopup })
}));

vi.mock('../../../FloatingPanels/FloatingPanelContext', () => ({
  useFloatingPanels: () => ({ addActiveFeature })
}));

describe('CyberCommandRightSideRail', () => {
  beforeEach(() => {
    setPrimaryMode.mockClear();
    showPopup.mockClear();
    toggleNationalTerritoriesOverlay.mockClear();
    setNationalTerritoriesOverlayEnabled.mockClear();
    toggleCursorTrailIndicator.mockClear();
    toggleResourceZonesOverlay.mockClear();
    toggleDiplomaticEventsOverlay.mockClear();
    toggleConflictZonesOverlay.mockClear();
    addActiveFeature.mockClear();
  });

  it('renders primary controls with aria labels and selected state', () => {
    render(<CyberCommandRightSideRail />);

    const cyber = screen.getByTestId('cyber-right-rail-mode-CyberCommand');
    const geo = screen.getByTestId('cyber-right-rail-mode-GeoPolitical');
    const eco = screen.getByTestId('cyber-right-rail-mode-EcoNatural');

    expect(cyber).toHaveAttribute('aria-label', 'Intel Watch primary mode');
    expect(geo).toHaveAttribute('aria-label', 'Geo Political primary mode');
    expect(eco).toHaveAttribute('aria-label', 'Eco Natural primary mode');

    expect(cyber).toHaveAttribute('aria-pressed', 'true');
    expect(geo).toHaveAttribute('aria-pressed', 'false');
    expect(eco).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes primary mode only when mode buttons are clicked', () => {
    render(<CyberCommandRightSideRail />);

    fireEvent.click(screen.getByTestId('cyber-right-rail-mode-GeoPolitical'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-mode-EcoNatural'));

    expect(setPrimaryMode).toHaveBeenCalledTimes(2);
    expect(setPrimaryMode).toHaveBeenNthCalledWith(1, 'GeoPolitical');
    expect(setPrimaryMode).toHaveBeenNthCalledWith(2, 'EcoNatural');
  });

  it('supports arrow key navigation across primary mode controls', () => {
    render(<CyberCommandRightSideRail />);

    const cyber = screen.getByTestId('cyber-right-rail-mode-CyberCommand');
    const geo = screen.getByTestId('cyber-right-rail-mode-GeoPolitical');

    cyber.focus();
    fireEvent.keyDown(cyber, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(geo);
  });

  it('routes deep interactions to popup launch points', () => {
    render(<CyberCommandRightSideRail />);

    fireEvent.click(screen.getByTestId('cyber-right-rail-status-popup'));

    expect(showPopup).toHaveBeenCalledTimes(1);
    expect(showPopup).toHaveBeenCalledWith(expect.objectContaining({ component: NOAAStatusPopup }));
    expect(setPrimaryMode).not.toHaveBeenCalled();
  });

  it('no longer opens the Cyber Investigation Hub, which is retired (plan item 4.2)', () => {
    // Its counts read a store nothing writes, and "package" means a Mission
    // Package now. Investigations are Cases.
    render(<CyberCommandRightSideRail />);
    expect(screen.queryByTestId('cyber-right-rail-intel-popup')).toBeNull();
    expect(screen.queryByLabelText(/investigation workflow/i)).toBeNull();
  });

  it('shows what the globe is divided by on one button, its picker in place of the old three (D-ZR, ZR12)', () => {
    render(<CyberCommandRightSideRail />);
    expect(screen.queryByTestId('cyber-right-rail-toggle-national-territories')).toBeNull();
    expect(screen.queryByTestId('cyber-right-rail-toggle-zones')).toBeNull();
    expect(screen.queryByTestId('cyber-right-rail-toggle-spheres')).toBeNull();
    const button = screen.getByTestId('cyber-right-rail-divisions');
    expect(button).toHaveAttribute('aria-label', 'The globe divided by: Nation States');
    fireEvent.click(button);
    expect(screen.getByTestId('cyber-right-rail-divisions-menu')).toBeInTheDocument();
    expect(setPrimaryMode).not.toHaveBeenCalled();
    expect(showPopup).not.toHaveBeenCalled();
  });

  it('toggles resource zones overlay independently', () => {
    render(<CyberCommandRightSideRail />);

    const overlayToggle = screen.getByTestId('cyber-right-rail-toggle-resource-zones');

    expect(overlayToggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(overlayToggle);

    expect(toggleResourceZonesOverlay).toHaveBeenCalledTimes(1);
    expect(toggleNationalTerritoriesOverlay).not.toHaveBeenCalled();
    expect(setPrimaryMode).not.toHaveBeenCalled();
    expect(showPopup).not.toHaveBeenCalled();
  });

  it('toggles diplomatic events overlay independently', () => {
    render(<CyberCommandRightSideRail />);

    const overlayToggle = screen.getByTestId('cyber-right-rail-toggle-diplomatic-events');

    expect(overlayToggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(overlayToggle);

    expect(toggleDiplomaticEventsOverlay).toHaveBeenCalledTimes(1);
    expect(toggleResourceZonesOverlay).not.toHaveBeenCalled();
    expect(toggleNationalTerritoriesOverlay).not.toHaveBeenCalled();
    expect(setPrimaryMode).not.toHaveBeenCalled();
    expect(showPopup).not.toHaveBeenCalled();
  });

  it('toggles War & Conflict over any mode, where the Conflict Zones toggle was (owner, 1 Nov)', () => {
    localStorage.clear();
    resetWarConflictOverlayForTests();
    render(<CyberCommandRightSideRail />);

    expect(screen.queryByTestId('cyber-right-rail-toggle-conflict-zones')).toBeNull();
    const overlayToggle = screen.getByTestId('cyber-right-rail-toggle-war-conflict');

    expect(overlayToggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(overlayToggle);

    expect(overlayToggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('starcom:war-conflict-overlay')).toBe('1');
    expect(toggleConflictZonesOverlay).not.toHaveBeenCalled();
    expect(toggleDiplomaticEventsOverlay).not.toHaveBeenCalled();
    expect(toggleResourceZonesOverlay).not.toHaveBeenCalled();
    expect(toggleNationalTerritoriesOverlay).not.toHaveBeenCalled();
    expect(setPrimaryMode).not.toHaveBeenCalled();
    expect(showPopup).not.toHaveBeenCalled();
  });

  it('opens the geopolitical layers settings popup, reachable regardless of primary mode', () => {
    render(<CyberCommandRightSideRail />);

    fireEvent.click(screen.getByTestId('cyber-right-rail-geopolitical-layers-popup'));

    expect(showPopup).toHaveBeenCalledTimes(1);
    expect(showPopup).toHaveBeenCalledWith(
      expect.objectContaining({ component: GeopoliticalLayersPopup, backdrop: true })
    );
    expect(setPrimaryMode).not.toHaveBeenCalled();
  });

  it('toggles cursor trail indicator independently', () => {
    render(<CyberCommandRightSideRail />);

    fireEvent.click(screen.getByTestId('cyber-right-rail-toggle-cursor-trail'));

    expect(toggleCursorTrailIndicator).toHaveBeenCalledTimes(1);
    expect(setPrimaryMode).not.toHaveBeenCalled();
    expect(showPopup).not.toHaveBeenCalled();
  });

  it('no longer opens the Intelligence Dashboard, which is retired (plan item 4.3)', () => {
    // Its analysis found nothing and its report was canned. What was real, a
    // summary of what pinned reports rest on, is in the board's Export draft.
    render(<CyberCommandRightSideRail />);
    expect(screen.queryByTestId('cyber-right-rail-intelligence-dashboard')).toBeNull();
    expect(addActiveFeature).not.toHaveBeenCalledWith('intelligence-dashboard');
  });

  it('does not render secondary or tertiary rail controls', () => {
    render(<CyberCommandRightSideRail />);

    expect(screen.queryByTestId('cyber-left-rail-mode-IntelReports')).toBeNull();
    expect(screen.queryByTestId('cyber-left-side-sub-rail')).toBeNull();
    expect(screen.queryByText('Status Content')).toBeNull();
    expect(screen.queryByText('Intel Content')).toBeNull();
  });
});
