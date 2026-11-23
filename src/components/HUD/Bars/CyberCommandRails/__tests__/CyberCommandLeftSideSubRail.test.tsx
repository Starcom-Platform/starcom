import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CyberCommandLeftSideSubRail from '../CyberCommandLeftSideSubRail';
import IntelReportsSettingsPopup from '../../../Popups/IntelReportsSettingsPopup';
import { vi } from 'vitest';

const modeState = {
  visualizationMode: { mode: 'EcoNatural' as const, subMode: 'SpaceWeather' as const }
};

const updateSettings = vi.fn();
const showPopup = vi.fn();

const contextState = {
  settings: {
    showElectricFields: true,
    showMagnetopause: false,
    showSolarWind: false,
    showAuroralOval: false
  },
  updateSettings
};

const layoutState = {
  isSpaceWeatherActive: true,
  layerId: 'geomagneticIndex',
  layer: { label: 'Geomagnetic Index' },
  interactive: { layerId: 'geomagneticIndex', layer: { label: 'Geomagnetic Index' } },
  passive: { telemetry: {}, telemetryHistory: [] }
};

/*
 * vi.hoisted, because vi.mock factories are hoisted above ordinary top-level
 * consts — without it the factory throws "Cannot access 'setStatusFilter'
 * before initialization" and the whole suite fails to load, reporting "no
 * tests" rather than a failure. Which is how it slipped past me once: running
 * the directory showed "16 passed" from the sibling files while this one
 * loaded not at all.
 */
const { setStatusFilter, setRoleFilter, statusBreakdown } = vi.hoisted(() => ({
  setStatusFilter: vi.fn(),
  setRoleFilter: vi.fn(),
  statusBreakdown: vi.fn(),
}));
vi.mock('../../../../../services/RLSHVisualizationService', () => ({
  rlshVisualizationService: {
    setStatusFilter,
    setRoleFilter,
    statusBreakdown,
    getRoleFilter: () => 'hero',
  },
}));

vi.mock('../../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => modeState
}));

vi.mock('../../../../../context/SpaceWeatherContext', () => ({
  useSpaceWeatherContext: () => contextState
}));

vi.mock('../../../../Popup/PopupManager', () => ({
  usePopup: () => ({ showPopup })
}));

vi.mock('../../../Popups/SpaceWeatherSubRailSettingsPopup', () => ({ default: () => null }));
// The layer kits have their own test (RailKits.test.tsx); here the sub-rail's own buttons are the subject.
vi.mock('../RailKits', () => ({ default: () => null }));

vi.mock('../../../../SpaceWeather/SpaceWeatherSidebarLayout', () => ({
  useSpaceWeatherSidebarLayout: () => layoutState
}));

describe('CyberCommandLeftSideSubRail', () => {
  beforeEach(() => {
    updateSettings.mockClear();
    showPopup.mockClear();
    contextState.settings = {
      showElectricFields: true,
      showMagnetopause: false,
      showSolarWind: false,
      showAuroralOval: false
    };
  });

  it('is visible for EcoNatural -> SpaceWeather context with toggle controls', () => {
    render(<CyberCommandLeftSideSubRail />);

    expect(screen.getByTestId('cyber-left-side-sub-rail')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-toggle-electric-fields')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-toggle-magnetopause')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-toggle-bow-shock')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-toggle-aurora')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-open-settings')).toBeInTheDocument();
  });

  it('is hidden outside tertiary-eligible contexts', () => {
    // Intel Reports has its settings here since BA4: a mode with none.
    modeState.visualizationMode = { mode: 'CyberCommand', subMode: 'CyberThreats' } as any;

    const { queryByTestId } = render(<CyberCommandLeftSideSubRail />);

    expect(queryByTestId('cyber-left-side-sub-rail')).toBeNull();

    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'SpaceWeather' };
  });

  it('restores sub-rail on context re-entry', () => {
    const { rerender, queryByTestId } = render(<CyberCommandLeftSideSubRail />);
    expect(queryByTestId('cyber-left-side-sub-rail')).toBeInTheDocument();

    // EarthWeather is a real, intentionally-visible case too (real EcoNatural
    // settings popup), just without the SpaceWeather-specific toggle buttons —
    // this is not "hidden", so use a genuinely non-eligible context instead
    // (CyberCommand/CyberThreats; Intel Reports has its settings here since BA4)
    // to exercise the same re-entry behavior.
    modeState.visualizationMode = { mode: 'CyberCommand', subMode: 'CyberThreats' } as any;
    rerender(<CyberCommandLeftSideSubRail />);
    expect(queryByTestId('cyber-left-side-sub-rail')).toBeNull();

    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'SpaceWeather' };
    rerender(<CyberCommandLeftSideSubRail />);
    expect(queryByTestId('cyber-left-side-sub-rail')).toBeInTheDocument();
  });

  it('is visible (settings-only, no toggle buttons) for EcoNatural -> EarthWeather/EcologicalDisasters', () => {
    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'EarthWeather' } as any;
    const { rerender } = render(<CyberCommandLeftSideSubRail />);

    expect(screen.getByTestId('cyber-left-side-sub-rail')).toBeInTheDocument();
    expect(screen.getByTestId('cyber-left-subrail-open-eco-natural-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('cyber-left-subrail-toggle-electric-fields')).toBeNull();

    fireEvent.click(screen.getByTestId('cyber-left-subrail-open-eco-natural-settings'));
    expect(showPopup).toHaveBeenCalledWith(expect.objectContaining({
      props: { subMode: 'EarthWeather' },
      backdrop: true,
      zIndex: 3200
    }));

    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'EcologicalDisasters' } as any;
    rerender(<CyberCommandLeftSideSubRail />);
    expect(screen.getByTestId('cyber-left-subrail-open-eco-natural-settings')).toBeInTheDocument();

    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'SpaceWeather' };
  });

  it('opens the Intel Reports settings for CyberCommand -> IntelReports (BA4)', () => {
    modeState.visualizationMode = { mode: 'CyberCommand', subMode: 'IntelReports' } as any;
    render(<CyberCommandLeftSideSubRail />);
    fireEvent.click(screen.getByTestId('cyber-left-subrail-open-intel-reports-settings'));
    expect(showPopup).toHaveBeenCalledWith(expect.objectContaining({ component: IntelReportsSettingsPopup, backdrop: true }));
    modeState.visualizationMode = { mode: 'EcoNatural', subMode: 'SpaceWeather' };
  });

  it('toggles visualization settings directly from sub-rail', () => {
    render(<CyberCommandLeftSideSubRail />);

    fireEvent.click(screen.getByTestId('cyber-left-subrail-toggle-magnetopause'));
    fireEvent.click(screen.getByTestId('cyber-left-subrail-toggle-bow-shock'));
    fireEvent.click(screen.getByTestId('cyber-left-subrail-toggle-aurora'));

    expect(updateSettings).toHaveBeenNthCalledWith(1, { showMagnetopause: true });
    expect(updateSettings).toHaveBeenNthCalledWith(2, { showSolarWind: true });
    expect(updateSettings).toHaveBeenNthCalledWith(3, { showAuroralOval: true });
  });

  it('opens settings popup from bottom settings button', () => {
    render(<CyberCommandLeftSideSubRail />);

    fireEvent.click(screen.getByTestId('cyber-left-subrail-open-settings'));

    expect(showPopup).toHaveBeenCalledTimes(1);
    expect(showPopup).toHaveBeenCalledWith(expect.objectContaining({
      backdrop: true,
      zIndex: 3200
    }));
  });

  describe('the RLSH roster, and asking it what is current', () => {
    beforeEach(() => {
      // setupVitest runs restoreAllMocks after each test, which strips
      // implementations set in a vi.mock factory — so they are re-armed here.
      setStatusFilter.mockReset().mockResolvedValue(undefined);
      setRoleFilter.mockReset().mockResolvedValue(undefined);
      statusBreakdown.mockReset().mockResolvedValue({ total: 197, operating: 44, byStatus: {} });
      // RLSH is Hero Watch's now (D-HW, HW1).
      modeState.visualizationMode = { mode: 'HeroWatch', subMode: 'RLSH' } as never;
    });

    it('offers a control to narrow the globe to people currently operating', async () => {
      /*
       * Built as a service capability with no caller — the wiring-stub pattern
       * this codebase keeps producing. The service could answer and nothing
       * asked, so the globe went on showing 197 pins where 40 are current.
       */
      render(<CyberCommandLeftSideSubRail />);
      const toggle = await screen.findByTestId('cyber-left-subrail-rlsh-current-only');
      fireEvent.click(toggle);
      expect(setStatusFilter).toHaveBeenCalledWith('active');
    });

    it('widens back out on a second press rather than sticking', async () => {
      render(<CyberCommandLeftSideSubRail />);
      const toggle = await screen.findByTestId('cyber-left-subrail-rlsh-current-only');
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      expect(setStatusFilter).toHaveBeenLastCalledWith('all');
    });

    it('states how much of the roster is current, rather than implying all of it', async () => {
      /*
       * 40 Active, 121 Inactive, 19 Retired, 9 Unknown, 4 Semi-Active, 4
       * Deceased — all drawing the same pin. A viewer counts markers and reads
       * the movement as five times its size unless the interface says otherwise.
       */
      render(<CyberCommandLeftSideSubRail />);
      expect(await screen.findByTestId('cyber-left-subrail-rlsh-roster')).toHaveTextContent('44/197');
    });

    it('shows everyone by default, because the history is not noise', async () => {
      render(<CyberCommandLeftSideSubRail />);
      const toggle = await screen.findByTestId('cyber-left-subrail-rlsh-current-only');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(setStatusFilter).not.toHaveBeenCalled();
    });
  });
});
