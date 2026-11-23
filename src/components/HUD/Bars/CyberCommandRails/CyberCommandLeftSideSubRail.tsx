import React from 'react';
import { Glyph } from '../../../../symbols/Glyph';
import type { GlyphName } from '../../../../symbols/uiSymbols';
import { useSpaceWeatherSidebarLayout } from '../../../SpaceWeather/SpaceWeatherSidebarLayout';
import { useVisualizationMode } from '../../../../context/VisualizationModeContext';
import { useSpaceWeatherContext } from '../../../../context/SpaceWeatherContext';
import { usePopup } from '../../../Popup/PopupManager';
import SpaceWeatherSubRailSettingsPopup from '../../Popups/SpaceWeatherSubRailSettingsPopup';
import EcoNaturalSettingsPopup, { type EcoNaturalSettingsSubMode } from '../../Popups/EcoNaturalSettingsPopup';
import IntelReportsSettingsPopup from '../../Popups/IntelReportsSettingsPopup';
import { leftSubRailShown } from './railModeConfig';
import { SlidersHorizontal } from 'lucide-react';
import { rlshVisualizationService } from '../../../../services/RLSHVisualizationService';
import { availableRLSHRoleClasses } from '../../../../services/rlshVisualizationTypes';
import { openRlshPanel } from '../../../../features/rlsh/rlshPanel';
import { useMessages } from '../../../../i18n/app/i18n';
import RailKits from './RailKits';
import { hasRailSpec } from '../../../../features/globe/rail/railSpecs';
import styles from './CyberCommandLeftSideSubRail.module.css';

/**
 * 'all' is a real option and the DEFAULT, which it was not.
 *
 * The rail defaulted to 'hero', and isMarkerIncludedByRoleFilter matches
 * roleClass exactly — so the only two people in the dataset who actually
 * REGISTERED, with consent and review, were excluded from the globe: their
 * roles are zone_guardian and rescue_ranger. Gating those two classes behind a
 * feature flag then removed the only buttons that could have revealed them, so
 * registering made a person permanently invisible.
 *
 * That is exactly backwards. Registration is the one thing on this globe that
 * should make somebody MORE visible, and the same reasoning applies as to the
 * status filter: showing everyone is the honest default, and a filter is for
 * narrowing when asked.
 */
type RLSHRoleFilter = 'all' | 'hero' | 'zone_guardian' | 'rescue_ranger';

const ALL_RLSH_ROLE_BUTTONS: Array<{ role: RLSHRoleFilter; glyph: GlyphName; title: string }> = [
  { role: 'all', glyph: 'rlsh:all', title: 'Everyone on record' },
  { role: 'hero', glyph: 'rlsh:hero', title: 'Heroes' },
  { role: 'zone_guardian', glyph: 'rlsh:zone_guardian', title: 'Zone Guardians' },
  { role: 'rescue_ranger', glyph: 'rlsh:rescue_ranger', title: 'Rescue Rangers' }
];

/**
 * Only the roles that have anything behind them.
 *
 * Every marker resolves to `hero`, so the Zone Guardian and Rescue Ranger
 * buttons emptied the globe — which an operator reads as lost data, not as an
 * unfinished feature. They come back when
 * VITE_RLSH_ROLE_CLASSES_ENABLED=true and there is something to show.
 */
const RLSH_ROLE_BUTTONS = ALL_RLSH_ROLE_BUTTONS.filter((b) =>
  // 'all' is never gated: it is the escape hatch that keeps a gated role's
  // members reachable, which is the whole reason the flag is survivable.
  b.role === 'all' || availableRLSHRoleClasses().includes(b.role as never));

export const CyberCommandLeftSideSubRail: React.FC = () => {
  const { visualizationMode } = useVisualizationMode();
  const layout = useSpaceWeatherSidebarLayout();
  const { settings, updateSettings } = useSpaceWeatherContext();
  const { showPopup } = usePopup();
  const { m } = useMessages();
  const [rlshRoleFilter, setRlshRoleFilter] = React.useState<RLSHRoleFilter>('all');
  /**
   * Whether the globe shows only people currently operating.
   *
   * Defaults to showing everyone, because hiding 121 of 197 would be its own
   * distortion — they are the movement's history, not noise. What was missing
   * is the ABILITY to ask, and a count: the embedded set is 40 Active, 121
   * Inactive, 19 Retired, 9 Unknown, 4 Semi-Active and 4 Deceased, and every
   * one of them draws the same pin. A viewer counts markers and reads the
   * movement as five times its current size.
   */
  const [rlshCurrentOnly, setRlshCurrentOnly] = React.useState(false);
  const [rlshRoster, setRlshRoster] = React.useState<{ total: number; operating: number } | null>(null);

  const showSpaceWeatherRail =
    visualizationMode.mode === 'EcoNatural' && visualizationMode.subMode === 'SpaceWeather' && layout.isSpaceWeatherActive;
  const showRlshRail = visualizationMode.mode === 'HeroWatch' && visualizationMode.subMode === 'RLSH';
  // EarthWeather/EcologicalDisasters settings (weatherLayers toggles, colorMode,
  // disaster-type/severity filters, radius opacity, etc.) previously had no
  // reachable UI anywhere in the app — see EcoNaturalSettingsPopup's own header
  // comment. Mirrors the real showSpaceWeatherRail pattern just above.
  const ecoNaturalSettingsSubMode: EcoNaturalSettingsSubMode | null =
    visualizationMode.mode === 'EcoNatural' && visualizationMode.subMode !== 'SpaceWeather'
      ? visualizationMode.subMode
      : null;

  React.useEffect(() => {
    if (!showRlshRail) {
      return;
    }

    const activeFilter = rlshVisualizationService.getRoleFilter();
    if (activeFilter === 'zone_guardian' || activeFilter === 'rescue_ranger' || activeFilter === 'hero') {
      setRlshRoleFilter(activeFilter);
      return;
    }

    setRlshRoleFilter('all');
  }, [showRlshRail]);

  // The roster's real shape, so the rail can state it rather than imply it.
  React.useEffect(() => {
    if (!showRlshRail) return;
    let mounted = true;
    void rlshVisualizationService.statusBreakdown()
      .then((b) => { if (mounted) setRlshRoster({ total: b.total, operating: b.operating }); })
      .catch(() => { if (mounted) setRlshRoster(null); });
    return () => { mounted = false; };
  }, [showRlshRail]);

  // The Intel Reports settings: the report cap, chosen before anything is cut (BA4).
  const showIntelReportsSettings = visualizationMode.mode === 'CyberCommand' && visualizationMode.subMode === 'IntelReports';

  // The same gate the layout mounts this by (railModeConfig): one, not two kept in step.
  if (!leftSubRailShown(visualizationMode, layout.isSpaceWeatherActive)) {
    return null;
  }

  const openIntelReportsSettingsPopup = () => {
    showPopup({
      component: IntelReportsSettingsPopup as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
      backdrop: true,
      zIndex: 3200,
    });
  };

  const toggle = (key: 'showElectricFields' | 'showMagnetopause' | 'showSolarWind' | 'showAuroralOval') => {
    updateSettings({ [key]: !settings[key] });
  };

  const openSettingsPopup = () => {
    showPopup({
      component: SpaceWeatherSubRailSettingsPopup,
      backdrop: true,
      zIndex: 3200
    });
  };

  const openEcoNaturalSettingsPopup = () => {
    if (!ecoNaturalSettingsSubMode) return;
    showPopup({
      // PopupManager's own `component` type only guarantees `onClose` plus an
      // untyped index signature — it has no existing precedent for a popup
      // with its own required prop beyond that. `props` below genuinely does
      // pass `subMode` through at runtime (PopupManager spreads `popup.props`
      // onto the rendered component); this cast just bridges that real gap in
      // the shared type rather than loosening EcoNaturalSettingsPopup's own
      // (correctly required) props to work around it.
      component: EcoNaturalSettingsPopup as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
      props: { subMode: ecoNaturalSettingsSubMode },
      backdrop: true,
      zIndex: 3200
    });
  };

  const handleRlshRoleFilterChange = (role: RLSHRoleFilter) => {
    setRlshRoleFilter(role);
    void rlshVisualizationService.setRoleFilter(role);
  };

  const handleRlshCurrentOnlyToggle = () => {
    const next = !rlshCurrentOnly;
    setRlshCurrentOnly(next);
    void rlshVisualizationService.setStatusFilter(next ? 'active' : 'all');
  };

  // A hero's own card, made in the RLSH panel and published through the review (D-RF): no form elsewhere.
  const openRegistrationForm = () => {
    openRlshPanel('mine');
  };

  return (
    <aside className={styles.rail} data-testid="cyber-left-side-sub-rail" aria-label="Left side sub rail">
      {/* The kits (critique-2026-11-01, OR1; plan A2): the layers drawn with controls, and the chosen one's. */}
      {hasRailSpec(visualizationMode.subMode) && <RailKits subMode={visualizationMode.subMode} />}
      {showSpaceWeatherRail && (
        <>
          <div className={styles.toggleList}>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.showElectricFields ? styles.toggleButtonActive : ''}`}
              onClick={() => toggle('showElectricFields')}
              aria-pressed={settings.showElectricFields}
              data-testid="cyber-left-subrail-toggle-electric-fields"
              title="Toggle electric field vectors"
            >
              <Glyph name="sw:electricField" />
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.showMagnetopause ? styles.toggleButtonActive : ''}`}
              onClick={() => toggle('showMagnetopause')}
              aria-pressed={settings.showMagnetopause}
              data-testid="cyber-left-subrail-toggle-magnetopause"
              title="Toggle magnetopause shell"
            >
              <Glyph name="sw:magnetopause" />
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.showSolarWind ? styles.toggleButtonActive : ''}`}
              onClick={() => toggle('showSolarWind')}
              aria-pressed={settings.showSolarWind}
              data-testid="cyber-left-subrail-toggle-bow-shock"
              title="Toggle bow shock shell"
            >
              <Glyph name="sw:bowShock" />
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${settings.showAuroralOval ? styles.toggleButtonActive : ''}`}
              onClick={() => toggle('showAuroralOval')}
              aria-pressed={settings.showAuroralOval}
              data-testid="cyber-left-subrail-toggle-aurora"
              title="Toggle aurora boundary"
            >
              <Glyph name="sw:aurora" />
            </button>
          </div>

          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.settingsButton}
              onClick={openSettingsPopup}
              data-testid="cyber-left-subrail-open-settings"
              aria-label="Open space weather settings"
              title="Open space weather settings"
            >
              <Glyph name="action:settings" />
            </button>
          </div>
        </>
      )}

      {showRlshRail && (
        <>
          <div className={styles.toggleList}>
            {RLSH_ROLE_BUTTONS.map(({ role, glyph, title }) => (
              <button
                key={role}
                type="button"
                className={`${styles.toggleButton} ${rlshRoleFilter === role ? styles.toggleButtonActive : ''}`}
                onClick={() => handleRlshRoleFilterChange(role)}
                aria-pressed={rlshRoleFilter === role}
                aria-label={title}
                data-testid={`cyber-left-subrail-rlsh-role-${role}`}
                title={title}
              >
                <Glyph name={glyph} />
              </button>
            ))}
          </div>

          <div className={styles.toggleList}>
            <button
              type="button"
              className={`${styles.toggleButton} ${rlshCurrentOnly ? styles.toggleButtonActive : ''}`}
              onClick={handleRlshCurrentOnlyToggle}
              aria-pressed={rlshCurrentOnly}
              data-testid="cyber-left-subrail-rlsh-current-only"
              aria-label={rlshRoster
                ? `Show only currently operating — ${rlshRoster.operating} of ${rlshRoster.total}`
                : 'Show only currently operating'}
              title={rlshRoster
                ? `${rlshRoster.operating} of ${rlshRoster.total} are currently operating. `
                  + 'The rest are inactive, retired, deceased or unrecorded — shown by default '
                  + 'because they are the movement\'s history, not noise.'
                : 'Show only currently operating'}
            >
              <Glyph name="rlsh:operating" />
            </button>
          </div>

          {rlshRoster && (
            <div
              className={styles.footerActions}
              data-testid="cyber-left-subrail-rlsh-roster"
              title={`${rlshRoster.operating} currently operating of ${rlshRoster.total} on record`}
              aria-label={`${rlshRoster.operating} of ${rlshRoster.total} currently operating`}
              style={{ fontSize: '0.6rem', textAlign: 'center', opacity: 0.85 }}
            >
              {rlshRoster.operating}/{rlshRoster.total}
            </div>
          )}

          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.settingsButton}
              onClick={openRegistrationForm}
              data-testid="cyber-left-subrail-rlsh-register"
              aria-label={m.rlsh.register}
              title={m.rlsh.register}
            >
              <Glyph name="rlsh:register" />
            </button>
          </div>
        </>
      )}

      {showIntelReportsSettings && (
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.settingsButton}
            onClick={openIntelReportsSettingsPopup}
            data-testid="cyber-left-subrail-open-intel-reports-settings"
            aria-label="Open Intel Reports settings"
            title="Intel Reports settings: how many reports the globe draws, and which lenses"
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
        </div>
      )}

      {ecoNaturalSettingsSubMode && (
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.settingsButton}
            onClick={openEcoNaturalSettingsPopup}
            data-testid="cyber-left-subrail-open-eco-natural-settings"
            aria-label={`Open ${ecoNaturalSettingsSubMode === 'EarthWeather' ? 'earth weather' : 'ecological disasters'} settings`}
            title={ecoNaturalSettingsSubMode === 'EarthWeather' ? 'Open Earth Weather settings' : 'Open Ecological Disasters settings'}
          >
            <Glyph name={ecoNaturalSettingsSubMode === 'EarthWeather' ? 'layer:EarthWeather' : 'layer:EcologicalDisasters'} />
          </button>
        </div>
      )}
    </aside>
  );
};

export default CyberCommandLeftSideSubRail;
